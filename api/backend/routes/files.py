import os
import uuid
import urllib.parse
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
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

MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "25"))
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
    ".csv": ("text/csv", "excel"),
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
    """Verifies that the user is the uploader, recipient, or group member of the document."""
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

    # If direct conversation (partner_id or conversation_id)
    if doc.conversation_id == user.id:
        return True

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
            if msg.conversation_id:
                conv = db.query(models.Conversation).filter(models.Conversation.id == msg.conversation_id).first()
                if conv and (conv.user_a_id == user.id or conv.user_b_id == user.id):
                    return True

    return False


@router.post("/upload", response_model=schemas.DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    partner_id: Optional[int] = Form(None),
    group_id: Optional[int] = Form(None),
    duration: Optional[float] = Form(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file selected.")

    original_name = sanitize_filename(file.filename)
    ext = Path(original_name).suffix.lower()

    if ext in DISALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Executable or script files are strictly prohibited for security."
        )

    # If mime is audio or video and ext is webm, detect audio vs video
    if ext == ".webm" and file.content_type and "audio" in file.content_type:
        expected_mime, file_type = ("audio/webm", "audio")
    elif ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Supported types: PDF, DOC, DOCX, XLS, PPT, TXT, CSV, ZIP, photos, videos, audio."
        )
    else:
        expected_mime, file_type = ALLOWED_EXTENSIONS[ext]

    mime_type = file.content_type or expected_mime

    # Verify conversation target permissions
    if group_id:
        membership = db.query(models.GroupMember).filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id
        ).first()
        if not membership:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group.")

    if partner_id:
        partner = db.query(models.User).filter(models.User.id == partner_id).first()
        if not partner:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found.")

    # Read and validate size safely
    content = await file.read()
    file_size = len(content)

    if file_size == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The selected file is empty.")

    # Configurable limits
    if file_type == "video":
        max_limit = int(os.getenv("MAX_VIDEO_SIZE_MB", "100")) * 1024 * 1024
        max_label = f"{int(os.getenv('MAX_VIDEO_SIZE_MB', '100'))} MB"
    elif file_type == "image":
        max_limit = int(os.getenv("MAX_IMAGE_SIZE_MB", "10")) * 1024 * 1024
        max_label = f"{int(os.getenv('MAX_IMAGE_SIZE_MB', '10'))} MB"
    elif file_type == "audio":
        max_limit = int(os.getenv("MAX_AUDIO_SIZE_MB", "25")) * 1024 * 1024
        max_label = f"{int(os.getenv('MAX_AUDIO_SIZE_MB', '25'))} MB"
    elif file_type == "archive":
        max_limit = int(os.getenv("MAX_ARCHIVE_SIZE_MB", "50")) * 1024 * 1024
        max_label = f"{int(os.getenv('MAX_ARCHIVE_SIZE_MB', '50'))} MB"
    else:
        max_limit = int(os.getenv("MAX_DOC_SIZE_MB", "25")) * 1024 * 1024
        max_label = f"{int(os.getenv('MAX_DOC_SIZE_MB', '25'))} MB"

    if file_size > max_limit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size ({file_size / (1024*1024):.1f} MB) exceeds the allowed limit of {max_label} for {file_type}s."
        )

    # Generate safe unique storage filename
    unique_name = f"{uuid.uuid4().hex}{ext}"
    stored_path = UPLOAD_DIR / unique_name

    try:
        with open(stored_path, "wb") as f:
            f.write(content)
    except Exception as e:
        if not s3_client:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save file on server.")

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

    # Create document record
    doc = models.Document(
        uploader_id=current_user.id,
        conversation_id=partner_id,
        group_id=group_id,
        original_filename=original_name,
        stored_filename=unique_name,
        file_size=file_size,
        mime_type=mime_type,
        file_type=file_type,
        duration=duration
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    return doc


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

    # Inline disposition allows PDFs, videos, and images to render directly in browser tabs
    encoded_filename = urllib.parse.quote(doc.original_filename)
    headers = {
        "Content-Disposition": f"inline; filename*=UTF-8''{encoded_filename}",
        "X-Content-Type-Options": "nosniff",
        "Accept-Ranges": "bytes"
    }

    return FileResponse(
        path=str(file_path),
        media_type=doc.mime_type,
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
