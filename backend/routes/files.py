import os
import uuid
import shutil
import base64
import urllib.parse
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
        file_data=b64_data
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

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
