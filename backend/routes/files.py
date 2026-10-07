import os
import uuid
import shutil
import base64
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from database import get_db
import models
import schemas
from security import get_current_user, get_user_from_token, oauth2_scheme

router = APIRouter(prefix="/files", tags=["Files & Documents"])

# Upload directory configuration
BASE_DIR = Path(__file__).resolve().parent.parent
if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
    UPLOAD_DIR = Path("/tmp") / os.getenv("UPLOAD_DIRECTORY", "uploads")
else:
    UPLOAD_DIR = BASE_DIR / os.getenv("UPLOAD_DIRECTORY", "uploads")

try:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
except Exception as e:
    print(f"Upload dir init note: {e}")

def _get_int_env(key: str, default: int) -> int:
    val = (os.getenv(key) or "").strip()
    return int(val) if val.isdigit() else default

MAX_FILE_SIZE_MB = _get_int_env("MAX_FILE_SIZE_MB", 100)
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# Allowed extensions and classification
ALLOWED_EXTENSIONS = {
    # Documents
    ".pdf": ("application/pdf", "pdf"),
    ".doc": ("application/msword", "word"),
    ".docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "word"),
    ".xls": ("application/vnd.ms-excel", "excel"),
    ".xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "excel"),
    ".ppt": ("application/vnd.ms-powerpoint", "presentation"),
    ".pptx": ("application/vnd.openxmlformats-officedocument.presentationml.presentation", "presentation"),
    ".txt": ("text/plain", "text"),
    ".csv": ("text/csv", "csv"),
    ".json": ("application/json", "text"),
    ".md": ("text/markdown", "text"),
    # Archives
    ".zip": ("application/zip", "archive"),
    ".rar": ("application/x-rar-compressed", "archive"),
    ".7z": ("application/x-7z-compressed", "archive"),
    ".tar": ("application/x-tar", "archive"),
    ".gz": ("application/gzip", "archive"),
    # Images
    ".png": ("image/png", "image"),
    ".jpg": ("image/jpeg", "image"),
    ".jpeg": ("image/jpeg", "image"),
    ".webp": ("image/webp", "image"),
    ".gif": ("image/gif", "image"),
    ".svg": ("image/svg+xml", "image"),
    # Videos
    ".mp4": ("video/mp4", "video"),
    ".mov": ("video/quicktime", "video"),
    ".webm": ("video/webm", "video"),
    ".mkv": ("video/x-matroska", "video"),
    # Audio / Voice Messages
    ".mp3": ("audio/mpeg", "audio"),
    ".wav": ("audio/wav", "audio"),
    ".ogg": ("audio/ogg", "audio"),
    ".m4a": ("audio/mp4", "audio"),
    ".aac": ("audio/aac", "audio"),
    ".opus": ("audio/opus", "audio"),
    ".weba": ("audio/webm", "audio"),
}

# Optional S3-compatible Object Storage (AWS S3, Cloudflare R2, Supabase)
STORAGE_BUCKET = os.getenv("STORAGE_BUCKET")
STORAGE_ENDPOINT = os.getenv("STORAGE_ENDPOINT")
STORAGE_ACCESS_KEY = os.getenv("STORAGE_ACCESS_KEY")
STORAGE_SECRET_KEY = os.getenv("STORAGE_SECRET_KEY")
STORAGE_REGION = os.getenv("STORAGE_REGION", "us-east-1")

s3_client = None
if STORAGE_BUCKET and STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY:
    try:
        import boto3
        from botocore.config import Config
        s3_client = boto3.client(
            "s3",
            endpoint_url=STORAGE_ENDPOINT,
            aws_access_key_id=STORAGE_ACCESS_KEY,
            aws_secret_access_key=STORAGE_SECRET_KEY,
            region_name=STORAGE_REGION,
            config=Config(signature_version="s3v4")
        )
    except Exception as e:
        print(f"Warning: S3 storage initialization failed ({e}). Falling back to local storage.")
        s3_client = None

DISALLOWED_EXTENSIONS = {
    ".exe", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".dll", ".com",
    ".scr", ".vbs", ".py", ".js", ".php", ".phtml", ".jar", ".app"
}


def sanitize_filename(filename: str) -> str:
    """Strip path traversal characters and normalize filename."""
    clean = Path(filename).name
    # Keep printable safe characters
    clean = "".join(c for c in clean if c.isalnum() or c in "._- ()[]").strip()
    return clean or "document"


def get_user_from_request_or_token(
    token_header: Optional[str] = Depends(oauth2_scheme),
    token_query: Optional[str] = Query(None, alias="token"),
    db: Session = Depends(get_db)
) -> models.User:
    """Allows auth from Authorization header or URL query parameter (for tab preview/downloads)."""
    token = token_header or token_query
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to access documents.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    user = get_user_from_token(token, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    return user


def verify_document_access(doc: models.Document, user: models.User, db: Session) -> bool:
    """Verifies that the user is the uploader, recipient, group member, conversation participant, or admin."""
    if not user:
        return False

    if getattr(user, "role", None) == "admin":
        return True

    if doc.uploader_id == user.id:
        return True

    # If linked to a group, check group membership
    if doc.group_id:
        membership = db.query(models.GroupMember).filter(
            models.GroupMember.group_id == doc.group_id,
            models.GroupMember.user_id == user.id
        ).first()
        if membership:
            return True

    # If direct conversation user ID
    if doc.conversation_id == user.id:
        return True

    # If direct conversation table record
    if doc.conversation_id:
        conv = db.query(models.Conversation).filter(models.Conversation.id == doc.conversation_id).first()
        if conv and (conv.user_a_id == user.id or conv.user_b_id == user.id):
            return True

    # If linked to a message, check message sender/recipient
    if doc.message_id:
        msg = db.query(models.Message).filter(models.Message.id == doc.message_id).first()
        if msg:
            if msg.sender_id == user.id or msg.recipient_id == user.id:
                return True
            if msg.group_id:
                membership = db.query(models.GroupMember).filter(
                    models.GroupMember.group_id == msg.group_id,
                    models.GroupMember.user_id == user.id
                ).first()
                if membership:
                    return True

    # Check any message that references this document
    related_msg = db.query(models.Message).filter(models.Message.file_id == doc.id).first()
    if related_msg:
        if related_msg.sender_id == user.id or related_msg.recipient_id == user.id:
            return True
        if related_msg.group_id:
            membership = db.query(models.GroupMember).filter(
                models.GroupMember.group_id == related_msg.group_id,
                models.GroupMember.user_id == user.id
            ).first()
            if membership:
                return True

    return False


def _process_and_save_file(
    content: bytes,
    original_name: str,
    raw_content_type: Optional[str],
    current_user: models.User,
    target_partner_id: Optional[int],
    group_id: Optional[int],
    duration: Optional[float],
    db: Session
) -> models.Document:
    ext = Path(original_name).suffix.lower()

    if ext in DISALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Executable or script files are strictly prohibited for security."
        )

    # If mime is audio or video and ext is webm, detect audio vs video
    if (ext in [".webm", ".weba"] or original_name.startswith("voice-") or original_name.startswith("audio-")) and (
        (raw_content_type and "audio" in raw_content_type) or original_name.startswith("voice-")
    ):
        expected_mime, file_type = ("audio/webm", "audio")
    elif ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Supported types: PDF, DOC, DOCX, XLS, PPT, TXT, CSV, ZIP, photos, videos, audio."
        )
    else:
        expected_mime, file_type = ALLOWED_EXTENSIONS[ext]

    raw_mime = raw_content_type or expected_mime
    mime_type = raw_mime.split(";")[0].strip()

    # Verify conversation target permissions
    if group_id:
        membership = db.query(models.GroupMember).filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id
        ).first()
        if not membership:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group.")

    if target_partner_id:
        partner = db.query(models.User).filter(models.User.id == target_partner_id).first()
        if not partner:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found.")

    file_size = len(content)
    if file_size == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The selected file is empty.")

    # Configurable limits (100MB across all types)
    if file_type == "video":
        limit_mb = _get_int_env("MAX_VIDEO_SIZE_MB", 100)
    elif file_type == "image":
        limit_mb = _get_int_env("MAX_IMAGE_SIZE_MB", 100)
    elif file_type == "audio":
        limit_mb = _get_int_env("MAX_AUDIO_SIZE_MB", 100)
    elif file_type == "archive":
        limit_mb = _get_int_env("MAX_ARCHIVE_SIZE_MB", 100)
    else:
        limit_mb = _get_int_env("MAX_DOC_SIZE_MB", 100)
    max_limit = limit_mb * 1024 * 1024
    max_label = f"{limit_mb} MB"

    if file_size > max_limit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size ({file_size / (1024*1024):.1f} MB) exceeds the allowed limit of {max_label} for {file_type}s."
        )

    # Generate safe unique storage filename
    unique_name = f"{uuid.uuid4().hex}{ext}"
    stored_path = UPLOAD_DIR / unique_name

    try:
        stored_path.parent.mkdir(parents=True, exist_ok=True)
        with open(stored_path, "wb") as f:
            f.write(content)
    except Exception as e:
        if not s3_client:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to save file on server: {e}")

    # Persistent cloud object storage (S3/R2/Supabase)
    if s3_client and STORAGE_BUCKET:
        try:
            s3_client.put_object(
                Bucket=STORAGE_BUCKET,
                Key=unique_name,
                Body=content,
                ContentType=mime_type
            )
        except Exception as e:
            print(f"S3 upload note: {e}")
            if not stored_path.exists():
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save file to object storage.")

    # Multi-instance serverless resilience: store base64 payload for docs <= 100MB
    b64_data = None
    if file_size <= 100 * 1024 * 1024:
        try:
            b64_data = base64.b64encode(content).decode("ascii")
        except Exception:
            pass

    # Create document record
    doc = models.Document(
        uploader_id=current_user.id,
        conversation_id=target_partner_id,
        group_id=group_id,
        original_filename=original_name,
        stored_filename=unique_name,
        file_size=file_size,
        mime_type=mime_type,
        file_type=file_type,
        duration=duration,
        file_data=b64_data,
        current_version_number=1
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Create initial DocumentVersion (v1)
    try:
        v1 = models.DocumentVersion(
            document_id=doc.id,
            version_number=1,
            stored_filename=unique_name,
            file_size=file_size,
            file_data=b64_data,
            created_by_id=current_user.id,
            change_summary="Initial upload"
        )
        db.add(v1)
        db.commit()
    except Exception as e:
        print(f"Initial DocumentVersion note: {e}")
        db.rollback()

    # Broadcast file count update to admin connections
    try:
        from websocket.chat import manager
        import asyncio
        asyncio.create_task(manager.broadcast_admin({
            "type": "admin_file_count_updated",
            "files": db.query(models.Document).count()
        }))
        asyncio.create_task(manager.broadcast_admin_metrics(db))
    except Exception:
        pass

    return doc


@router.post("/upload", response_model=schemas.DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    partner_id: Optional[int] = Form(None),
    conversation_id: Optional[int] = Form(None),
    group_id: Optional[int] = Form(None),
    duration: Optional[float] = Form(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file selected.")

    target_partner_id = partner_id if partner_id is not None else conversation_id
    original_name = sanitize_filename(file.filename)
    content = await file.read()

    return _process_and_save_file(
        content=content,
        original_name=original_name,
        raw_content_type=file.content_type,
        current_user=current_user,
        target_partner_id=target_partner_id,
        group_id=group_id,
        duration=duration,
        db=db
    )


@router.post("/upload-chunk", status_code=status.HTTP_200_OK)
async def upload_chunk(
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    total_chunks: int = Form(...),
    filename: str = Form(...),
    partner_id: Optional[int] = Form(None),
    conversation_id: Optional[int] = Form(None),
    group_id: Optional[int] = Form(None),
    duration: Optional[float] = Form(None),
    file: Optional[UploadFile] = File(None),
    chunk: Optional[UploadFile] = File(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    upload_file_obj = chunk if chunk is not None else file
    if not upload_file_obj:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No chunk data provided.")

    if total_chunks <= 0 or total_chunks > 60:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid total_chunks value.")

    if chunk_index < 0 or chunk_index >= total_chunks:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid chunk_index value.")

    chunk_bytes = await upload_file_obj.read()
    if len(chunk_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Individual chunk exceeds 5MB limit.")

    # 1. Save chunk to local disk
    chunk_dir = UPLOAD_DIR / "chunks" / upload_id
    try:
        chunk_dir.mkdir(parents=True, exist_ok=True)
        chunk_path = chunk_dir / f"{chunk_index}.part"
        with open(chunk_path, "wb") as f:
            f.write(chunk_bytes)
    except Exception as e:
        print(f"Chunk disk save note: {e}")

    # 2. Store chunk in DB for multi-instance serverless resilience
    chunk_b64 = base64.b64encode(chunk_bytes).decode("ascii")
    existing_chunk = db.query(models.UploadChunk).filter(
        models.UploadChunk.upload_id == upload_id,
        models.UploadChunk.chunk_index == chunk_index
    ).first()
    if existing_chunk:
        existing_chunk.chunk_data = chunk_b64
    else:
        new_chunk = models.UploadChunk(
            upload_id=upload_id,
            chunk_index=chunk_index,
            total_chunks=total_chunks,
            chunk_data=chunk_b64
        )
        db.add(new_chunk)
    db.commit()

    # 3. Check if all chunks have been received
    received_count = db.query(models.UploadChunk).filter(
        models.UploadChunk.upload_id == upload_id
    ).count()

    if received_count < total_chunks:
        return {
            "status": "chunk_received",
            "upload_id": upload_id,
            "chunk_index": chunk_index,
            "total_chunks": total_chunks,
            "received": received_count
        }

    # 4. Assemble complete file
    parts = []
    all_on_disk = True
    for i in range(total_chunks):
        p = chunk_dir / f"{i}.part"
        if p.exists():
            try:
                parts.append(p.read_bytes())
            except Exception:
                all_on_disk = False
                break
        else:
            all_on_disk = False
            break

    if not all_on_disk:
        db_chunks = db.query(models.UploadChunk).filter(
            models.UploadChunk.upload_id == upload_id
        ).order_by(models.UploadChunk.chunk_index.asc()).all()
        if len(db_chunks) != total_chunks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Incomplete upload: expected {total_chunks} chunks, received {len(db_chunks)}"
            )
        parts = [base64.b64decode(c.chunk_data) for c in db_chunks]

    full_content = b"".join(parts)

    # 5. Clean up temporary chunks
    try:
        db.query(models.UploadChunk).filter(models.UploadChunk.upload_id == upload_id).delete()
        db.commit()
    except Exception:
        pass
    try:
        if chunk_dir.exists():
            shutil.rmtree(chunk_dir, ignore_errors=True)
    except Exception:
        pass

    # 6. Process and save the assembled document
    target_partner_id = partner_id if partner_id is not None else conversation_id
    original_name = sanitize_filename(filename)

    doc = _process_and_save_file(
        content=full_content,
        original_name=original_name,
        raw_content_type=upload_file_obj.content_type,
        current_user=current_user,
        target_partner_id=target_partner_id,
        group_id=group_id,
        duration=duration,
        db=db
    )

    return jsonable_encoder(doc)


@router.get("", response_model=List[schemas.DocumentResponse])
@router.get("/documents", response_model=List[schemas.DocumentResponse])
def get_user_documents(
    filter_type: Optional[str] = Query("all", description="all, recent, pdf, word, excel, presentation, text, csv"),
    q: Optional[str] = Query(None, description="Search query"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns real user documents for the Document Browser.
    Retrieves documents owned by current user, sent in direct conversations, or in groups.
    """
    group_ids = [m.group_id for m in db.query(models.GroupMember.group_id).filter(models.GroupMember.user_id == current_user.id).all()]
    
    conv_ids = [c.id for c in db.query(models.Conversation.id).filter(
        or_(models.Conversation.user_a_id == current_user.id, models.Conversation.user_b_id == current_user.id)
    ).all()]

    filter_conditions = [
        models.Document.uploader_id == current_user.id,
        models.Document.conversation_id == current_user.id
    ]
    if conv_ids:
        filter_conditions.append(models.Document.conversation_id.in_(conv_ids))
    if group_ids:
        filter_conditions.append(models.Document.group_id.in_(group_ids))

    query = db.query(models.Document).filter(or_(*filter_conditions))

    # Apply type filter
    ft = (filter_type or "all").lower().strip()
    if ft == "pdf":
        query = query.filter(models.Document.file_type == "pdf")
    elif ft in ("word", "doc", "docx"):
        query = query.filter(models.Document.file_type == "word")
    elif ft in ("excel", "xls", "xlsx"):
        query = query.filter(models.Document.file_type == "excel")
    elif ft in ("presentation", "ppt", "pptx", "powerpoint"):
        query = query.filter(models.Document.file_type.in_(["presentation", "pptx"]))
    elif ft in ("text", "txt", "md"):
        query = query.filter(models.Document.file_type == "text")
    elif ft == "csv":
        query = query.filter(models.Document.file_type == "csv")

    # Apply search query
    if q and q.strip():
        search_str = f"%{q.strip()}%"
        query = query.filter(models.Document.original_filename.ilike(search_str))

    docs = query.order_by(models.Document.created_at.desc()).limit(100).all()
    return docs


@router.get("/{file_id}", response_model=schemas.DocumentResponse)
def get_file_metadata(
    file_id: int,
    current_user: models.User = Depends(get_user_from_request_or_token),
    db: Session = Depends(get_db)
):
    doc = db.query(models.Document).filter(models.Document.id == file_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    if not verify_document_access(doc, current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this document.")

    return doc


@router.get("/{file_id}/view")
def view_file_content(
    file_id: int,
    current_user: models.User = Depends(get_user_from_request_or_token),
    db: Session = Depends(get_db)
):
    doc = db.query(models.Document).filter(models.Document.id == file_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    if not verify_document_access(doc, current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this document.")

    file_path = UPLOAD_DIR / doc.stored_filename
    if not file_path.exists() and getattr(doc, "file_data", None):
        try:
            import base64
            file_path.parent.mkdir(parents=True, exist_ok=True)
            with open(file_path, "wb") as f:
                f.write(base64.b64decode(doc.file_data))
        except Exception as e:
            print(f"Restore from DB note: {e}")
    if not file_path.exists():
        if s3_client and STORAGE_BUCKET:
            try:
                from fastapi.responses import RedirectResponse
                presigned_url = s3_client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": STORAGE_BUCKET, "Key": doc.stored_filename},
                    ExpiresIn=3600
                )
                return RedirectResponse(url=presigned_url)
            except Exception as e:
                print(f"S3 signed URL error: {e}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Physical file not found on server.")

    # Clean media type (strip codec parameters for broad browser audio/video player support)
    raw_mime = doc.mime_type or "application/octet-stream"
    clean_mime = raw_mime.split(";")[0].strip()

    # Inline disposition allows PDFs, videos, audio, and images to render directly in browser
    encoded_filename = urllib.parse.quote(doc.original_filename)
    headers = {
        "Content-Disposition": f"inline; filename*=UTF-8''{encoded_filename}",
        "X-Content-Type-Options": "nosniff",
        "Accept-Ranges": "bytes"
    }

    return FileResponse(
        path=str(file_path),
        media_type=clean_mime,
        headers=headers
    )



@router.get("/{file_id}/download")
def download_file(
    file_id: int,
    current_user: models.User = Depends(get_user_from_request_or_token),
    db: Session = Depends(get_db)
):
    doc = db.query(models.Document).filter(models.Document.id == file_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    if not verify_document_access(doc, current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this document.")

    file_path = UPLOAD_DIR / doc.stored_filename
    if not file_path.exists() and getattr(doc, "file_data", None):
        try:
            import base64
            file_path.parent.mkdir(parents=True, exist_ok=True)
            with open(file_path, "wb") as f:
                f.write(base64.b64decode(doc.file_data))
        except Exception as e:
            print(f"Restore from DB note: {e}")
    if not file_path.exists():
        if s3_client and STORAGE_BUCKET:
            try:
                from fastapi.responses import RedirectResponse
                presigned_url = s3_client.generate_presigned_url(
                    "get_object",
                    Params={
                        "Bucket": STORAGE_BUCKET,
                        "Key": doc.stored_filename,
                        "ResponseContentDisposition": f"attachment; filename=\"{doc.original_filename}\""
                    },
                    ExpiresIn=3600
                )
                return RedirectResponse(url=presigned_url)
            except Exception as e:
                print(f"S3 signed URL error: {e}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Physical file not found on server.")

    encoded_filename = urllib.parse.quote(doc.original_filename)
    headers = {
        "Content-Disposition": f"attachment; filename=\"{doc.original_filename}\"; filename*=UTF-8''{encoded_filename}",
        "X-Content-Type-Options": "nosniff"
    }

    return FileResponse(
        path=str(file_path),
        media_type="application/octet-stream",
        headers=headers,
        filename=doc.original_filename
    )


@router.get("/conversation/{partner_id}", response_model=List[schemas.DocumentResponse])
def get_conversation_documents(
    partner_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    docs = db.query(models.Document).filter(
        models.Document.group_id.is_(None),
        or_(
            and_(models.Document.uploader_id == current_user.id, models.Document.conversation_id == partner_id),
            and_(models.Document.uploader_id == partner_id, models.Document.conversation_id == current_user.id)
        )
    ).order_by(models.Document.created_at.desc()).all()
    return docs


@router.get("/group/{group_id}", response_model=List[schemas.DocumentResponse])
def get_group_documents(
    group_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify group membership
    membership = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == current_user.id
    ).first()
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group.")

    docs = db.query(models.Document).filter(
        models.Document.group_id == group_id
    ).order_by(models.Document.created_at.desc()).all()
    return docs


# ---------------- OFFICE DOCUMENT WORKSPACE & VERSIONING ----------------

@router.get("/{file_id}/versions", response_model=List[schemas.DocumentVersionResponse])
def get_document_versions(
    file_id: int,
    current_user: models.User = Depends(get_user_from_request_or_token),
    db: Session = Depends(get_db)
):
    doc = db.query(models.Document).filter(models.Document.id == file_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    if not verify_document_access(doc, current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this document.")

    versions = db.query(models.DocumentVersion).filter(
        models.DocumentVersion.document_id == file_id
    ).order_by(models.DocumentVersion.version_number.desc()).all()

    # If no versions exist yet, auto-seed version 1 from current document state
    if not versions:
        v1 = models.DocumentVersion(
            document_id=doc.id,
            version_number=1,
            stored_filename=doc.stored_filename,
            file_size=doc.file_size,
            file_data=doc.file_data,
            created_by_id=doc.uploader_id,
            change_summary="Original uploaded file",
            created_at=doc.created_at
        )
        db.add(v1)
        db.commit()
        db.refresh(v1)
        versions = [v1]

    # Populate author names
    user_ids = {v.created_by_id for v in versions}
    users_map = {u.id: (u.full_name or u.username) for u in db.query(models.User).filter(models.User.id.in_(user_ids)).all()}
    
    result = []
    for v in versions:
        vr = schemas.DocumentVersionResponse(
            id=v.id,
            document_id=v.document_id,
            version_number=v.version_number,
            file_size=v.file_size,
            created_by_id=v.created_by_id,
            created_by_name=users_map.get(v.created_by_id, "User"),
            change_summary=v.change_summary or f"Version {v.version_number}",
            created_at=v.created_at
        )
        result.append(vr)
    return result


@router.get("/{file_id}/versions/{version_id}/view")
def view_document_version(
    file_id: int,
    version_id: int,
    current_user: models.User = Depends(get_user_from_request_or_token),
    db: Session = Depends(get_db)
):
    doc = db.query(models.Document).filter(models.Document.id == file_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    if not verify_document_access(doc, current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this document.")

    version = db.query(models.DocumentVersion).filter(
        models.DocumentVersion.id == version_id,
        models.DocumentVersion.document_id == file_id
    ).first()
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document version not found.")

    file_path = UPLOAD_DIR / version.stored_filename
    if not file_path.exists() and getattr(version, "file_data", None):
        try:
            import base64
            file_path.parent.mkdir(parents=True, exist_ok=True)
            with open(file_path, "wb") as f:
                f.write(base64.b64decode(version.file_data))
        except Exception:
            pass

    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version file not found on disk.")

    raw_mime = doc.mime_type or "application/octet-stream"
    clean_mime = raw_mime.split(";")[0].strip()
    encoded_filename = urllib.parse.quote(doc.original_filename)
    headers = {
        "Content-Disposition": f"inline; filename*=UTF-8''{encoded_filename}",
        "X-Content-Type-Options": "nosniff",
        "Accept-Ranges": "bytes"
    }
    return FileResponse(path=str(file_path), media_type=clean_mime, headers=headers)


@router.get("/{file_id}/versions/{version_id}/download")
def download_document_version(
    file_id: int,
    version_id: int,
    current_user: models.User = Depends(get_user_from_request_or_token),
    db: Session = Depends(get_db)
):
    doc = db.query(models.Document).filter(models.Document.id == file_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    if not verify_document_access(doc, current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this document.")

    version = db.query(models.DocumentVersion).filter(
        models.DocumentVersion.id == version_id,
        models.DocumentVersion.document_id == file_id
    ).first()
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document version not found.")

    file_path = UPLOAD_DIR / version.stored_filename
    if not file_path.exists() and getattr(version, "file_data", None):
        try:
            import base64
            file_path.parent.mkdir(parents=True, exist_ok=True)
            with open(file_path, "wb") as f:
                f.write(base64.b64decode(version.file_data))
        except Exception:
            pass

    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version file not found on disk.")

    encoded_filename = urllib.parse.quote(doc.original_filename)
    headers = {
        "Content-Disposition": f"attachment; filename=\"{doc.original_filename}\"; filename*=UTF-8''{encoded_filename}",
        "X-Content-Type-Options": "nosniff"
    }
    return FileResponse(path=str(file_path), media_type="application/octet-stream", headers=headers, filename=doc.original_filename)


@router.post("/{file_id}/versions/{version_id}/restore", response_model=schemas.DocumentVersionResponse)
def restore_document_version(
    file_id: int,
    version_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = db.query(models.Document).filter(models.Document.id == file_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    if not verify_document_access(doc, current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this document.")

    target_v = db.query(models.DocumentVersion).filter(
        models.DocumentVersion.id == version_id,
        models.DocumentVersion.document_id == file_id
    ).first()
    if not target_v:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version to restore not found.")

    latest_v = db.query(models.DocumentVersion).filter(
        models.DocumentVersion.document_id == file_id
    ).order_by(models.DocumentVersion.version_number.desc()).first()
    next_num = (latest_v.version_number + 1) if latest_v else 2

    # Duplicate stored file so version history remains immutable
    ext = Path(doc.original_filename).suffix.lower()
    new_unique = f"{uuid.uuid4().hex}{ext}"
    src_path = UPLOAD_DIR / target_v.stored_filename
    dst_path = UPLOAD_DIR / new_unique

    if src_path.exists():
        shutil.copy2(src_path, dst_path)
    elif target_v.file_data:
        import base64
        dst_path.write_bytes(base64.b64decode(target_v.file_data))

    new_v = models.DocumentVersion(
        document_id=doc.id,
        version_number=next_num,
        stored_filename=new_unique,
        file_size=target_v.file_size,
        file_data=target_v.file_data,
        created_by_id=current_user.id,
        change_summary=f"Restored from version {target_v.version_number}",
        created_at=datetime.now(timezone.utc)
    )
    db.add(new_v)

    # Update document current pointer
    doc.stored_filename = new_unique
    doc.file_size = target_v.file_size
    doc.file_data = target_v.file_data
    doc.current_version_number = next_num

    db.commit()
    db.refresh(new_v)

    return schemas.DocumentVersionResponse(
        id=new_v.id,
        document_id=new_v.document_id,
        version_number=new_v.version_number,
        file_size=new_v.file_size,
        created_by_id=new_v.created_by_id,
        created_by_name=current_user.full_name or current_user.username,
        change_summary=new_v.change_summary,
        created_at=new_v.created_at
    )


@router.get("/{file_id}/workspace")
def get_document_workspace_data(
    file_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from services.office_service import office_service

    doc = db.query(models.Document).filter(models.Document.id == file_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    if not verify_document_access(doc, current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this document.")

    file_path = UPLOAD_DIR / doc.stored_filename
    file_bytes = b""
    if file_path.exists():
        file_bytes = file_path.read_bytes()
    elif getattr(doc, "file_data", None):
        import base64
        try:
            file_bytes = base64.b64decode(doc.file_data)
        except Exception:
            pass

    category = office_service.get_category_from_filename(doc.original_filename)
    parsed_payload = {}

    if category == "word":
        parsed_payload = office_service.parse_docx(file_bytes)
    elif category == "excel":
        parsed_payload = office_service.parse_xlsx(file_bytes)
    elif category == "pptx":
        parsed_payload = office_service.parse_pptx(file_bytes)
    elif category == "csv":
        parsed_payload = office_service.parse_csv(file_bytes)
    elif category == "text":
        parsed_payload = {"text": file_bytes.decode("utf-8", errors="replace")}
    elif category == "zip":
        parsed_payload = office_service.inspect_zip(file_bytes)

    latest_v = db.query(models.DocumentVersion).filter(
        models.DocumentVersion.document_id == file_id
    ).order_by(models.DocumentVersion.version_number.desc()).first()

    return {
        "document": {
            "id": doc.id,
            "original_filename": doc.original_filename,
            "file_size": doc.file_size,
            "mime_type": doc.mime_type,
            "file_type": doc.file_type,
            "category": category,
            "current_version_number": latest_v.version_number if latest_v else (doc.current_version_number or 1),
            "uploader_id": doc.uploader_id,
            "conversation_id": doc.conversation_id,
            "group_id": doc.group_id,
            "created_at": schemas.format_iso_utc(doc.created_at)
        },
        "parsed": parsed_payload
    }


@router.post("/{file_id}/save")
def save_document_content(
    file_id: int,
    req: schemas.DocumentSaveRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from services.office_service import office_service

    doc = db.query(models.Document).filter(models.Document.id == file_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    if not verify_document_access(doc, current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this document.")

    # Ensure baseline v1 exists
    latest_v = db.query(models.DocumentVersion).filter(
        models.DocumentVersion.document_id == file_id
    ).order_by(models.DocumentVersion.version_number.desc()).first()

    if not latest_v:
        latest_v = models.DocumentVersion(
            document_id=doc.id,
            version_number=1,
            stored_filename=doc.stored_filename,
            file_size=doc.file_size,
            file_data=doc.file_data,
            created_by_id=doc.uploader_id,
            change_summary="Original uploaded file",
            created_at=doc.created_at
        )
        db.add(latest_v)
        db.commit()
        db.refresh(latest_v)

    # Conflict check: if client specified base_version_number and server has a newer version
    if req.base_version_number is not None and latest_v.version_number > req.base_version_number:
        author = db.query(models.User).filter(models.User.id == latest_v.created_by_id).first()
        author_name = (author.full_name or author.username) if author else "Another user"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": f"This document has been updated by {author_name} (version {latest_v.version_number}).",
                "current_version": latest_v.version_number,
                "base_version": req.base_version_number
            }
        )

    category = office_service.get_category_from_filename(doc.original_filename)
    new_bytes = None

    if req.structured_data:
        if category == "word" or "html" in req.structured_data:
            new_bytes = office_service.build_docx(req.structured_data.get("html", req.content or ""))
        elif category == "excel" or "sheets" in req.structured_data:
            new_bytes = office_service.build_xlsx(req.structured_data.get("sheets", []))
        elif category == "pptx" or "slides" in req.structured_data:
            new_bytes = office_service.build_pptx(req.structured_data.get("slides", []))
        elif category == "csv" or "rows" in req.structured_data:
            new_bytes = office_service.build_csv(req.structured_data.get("rows", []))
    elif req.content is not None:
        if req.content.startswith("data:") and ";base64," in req.content:
            b64_data = req.content.split(";base64,")[1]
            new_bytes = base64.b64decode(b64_data)
        elif category == "word":
            new_bytes = office_service.build_docx(req.content)
        elif category == "csv":
            new_bytes = office_service.build_csv(req.content)
        elif category in ["text", "json", "md"]:
            new_bytes = req.content.encode("utf-8")
        else:
            try:
                new_bytes = base64.b64decode(req.content)
            except Exception:
                new_bytes = req.content.encode("utf-8")

    if new_bytes is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid content or structured data provided.")

    ext = Path(doc.original_filename).suffix.lower()
    new_unique = f"{uuid.uuid4().hex}{ext}"
    new_path = UPLOAD_DIR / new_unique

    try:
        new_path.parent.mkdir(parents=True, exist_ok=True)
        new_path.write_bytes(new_bytes)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to write file: {e}")

    # Cloud S3/R2 optional mirror
    if s3_client and STORAGE_BUCKET:
        try:
            s3_client.put_object(
                Bucket=STORAGE_BUCKET,
                Key=new_unique,
                Body=new_bytes,
                ContentType=doc.mime_type
            )
        except Exception:
            pass

    new_size = len(new_bytes)
    new_b64 = None
    if new_size <= 100 * 1024 * 1024:
        try:
            new_b64 = base64.b64encode(new_bytes).decode("ascii")
        except Exception:
            pass

    next_num = latest_v.version_number + 1
    new_version = models.DocumentVersion(
        document_id=doc.id,
        version_number=next_num,
        stored_filename=new_unique,
        file_size=new_size,
        file_data=new_b64,
        created_by_id=current_user.id,
        change_summary=req.change_summary or f"Edited by {current_user.full_name or current_user.username}",
        created_at=datetime.now(timezone.utc)
    )
    db.add(new_version)

    # Update document record
    doc.stored_filename = new_unique
    doc.file_size = new_size
    doc.file_data = new_b64
    doc.current_version_number = next_num
    db.commit()
    db.refresh(new_version)

    return {
        "status": "saved",
        "version": {
            "id": new_version.id,
            "document_id": doc.id,
            "version_number": next_num,
            "file_size": new_size,
            "created_by_id": current_user.id,
            "created_by_name": current_user.full_name or current_user.username,
            "change_summary": new_version.change_summary,
            "created_at": schemas.format_iso_utc(new_version.created_at)
        },
        "document": {
            "id": doc.id,
            "original_filename": doc.original_filename,
            "current_version_number": next_num,
            "file_size": new_size
        }
    }


@router.post("/{file_id}/send-to-conversation")
async def send_updated_file_to_conversation(
    file_id: int,
    req: schemas.SendUpdatedFileRequest = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from websocket.chat import manager

    doc = db.query(models.Document).filter(models.Document.id == file_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    if not verify_document_access(doc, current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this document.")

    target_recipient_id = req.recipient_id if req and req.recipient_id else None
    target_group_id = req.group_id if req and req.group_id else None

    if req and req.conversation_id and not target_recipient_id and not target_group_id:
        grp = db.query(models.Group).filter(models.Group.id == req.conversation_id).first()
        if grp:
            target_group_id = grp.id
        else:
            conv = db.query(models.Conversation).filter(models.Conversation.id == req.conversation_id).first()
            if conv:
                target_recipient_id = conv.user_b_id if conv.user_a_id == current_user.id else conv.user_a_id
            else:
                target_recipient_id = req.conversation_id

    if not target_recipient_id and not target_group_id:
        target_recipient_id = doc.conversation_id or current_user.id

    comment = req.comment if req and req.comment else f"Updated: {doc.original_filename} (v{doc.current_version_number or 1})"

    msg = models.Message(
        sender_id=current_user.id,
        recipient_id=target_recipient_id,
        group_id=target_group_id,
        content=comment,
        message_type="document" if doc.file_type in ["word", "excel", "pptx", "pdf", "text", "csv", "archive"] else doc.file_type,
        file_id=doc.id,
        status="sent",
        created_at=datetime.now(timezone.utc)
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    doc_data = {
        "id": doc.id,
        "original_filename": doc.original_filename,
        "file_size": doc.file_size,
        "mime_type": doc.mime_type,
        "file_type": doc.file_type,
        "current_version_number": doc.current_version_number,
        "created_at": schemas.format_iso_utc(doc.created_at)
    }

    # Broadcast via WebSocket so recipient receives it immediately without page refresh
    msg_payload = {
        "type": "message",
        "message": {
            "id": msg.id,
            "message_id": msg.id,
            "sender_id": msg.sender_id,
            "recipient_id": msg.recipient_id,
            "group_id": msg.group_id,
            "content": msg.content,
            "message_type": msg.message_type,
            "file_id": msg.file_id,
            "document": doc_data,
            "status": msg.status,
            "created_at": schemas.format_iso_utc(msg.created_at),
            "sender": {
                "id": current_user.id,
                "username": current_user.username,
                "full_name": current_user.full_name,
                "avatar_url": current_user.avatar_url
            },
            "reactions": []
        }
    }

    try:
        if msg.group_id:
            await manager.broadcast_to_group(msg.group_id, msg_payload, sender_id=current_user.id)
        elif msg.recipient_id:
            await manager.send_to_user(msg.recipient_id, msg_payload)
            if msg.recipient_id != current_user.id:
                await manager.send_to_user(current_user.id, msg_payload)
    except Exception as e:
        print(f"WebSocket broadcast error: {e}")

    return {
        "status": "sent",
        "message_id": msg.id,
        "document": doc_data
    }
