import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Header
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas
from security import get_current_user
from services.smart_service import smart_service

router = APIRouter(prefix="/conversations", tags=["Smart Conversation"])


def _check_simulation_header(simulate_header: Optional[str]):
    if simulate_header == "1" or simulate_header == "true":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Smart Conversation is temporarily unavailable. Please try again."
        )


@router.get("/{conversation_id}/smart", response_model=schemas.SmartFullResponse)
async def get_smart_overview_or_full(
    conversation_id: int,
    conversation_type: str = Query("direct", pattern="^(direct|group)$"),
    message_id: Optional[int] = Query(None),
    attachment_id: Optional[int] = Query(None),
    force_refresh: bool = Query(False),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns full intelligence for the authorized conversation / message / attachment.
    Strict participant access verification enforced.
    """
    return await smart_service.get_full_smart(
        conversation_id=conversation_id,
        conversation_type=conversation_type,
        current_user=current_user,
        db=db,
        message_id=message_id,
        attachment_id=attachment_id,
        force_refresh=force_refresh
    )


# ---------------- 1. SUMMARY (GET and POST) ----------------
@router.get("/{conversation_id}/smart/summary", response_model=schemas.SmartSummaryResponse)
async def get_summary_get(
    conversation_id: int,
    conversation_type: str = Query("direct", pattern="^(direct|group)$"),
    message_id: Optional[int] = Query(None),
    attachment_id: Optional[int] = Query(None),
    force_refresh: bool = Query(False),
    x_simulate_ai_failure: Optional[str] = Header(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_simulation_header(x_simulate_ai_failure)
    return await smart_service.generate_summary(
        conversation_id=conversation_id,
        conversation_type=conversation_type,
        current_user=current_user,
        db=db,
        message_id=message_id,
        attachment_id=attachment_id,
        force_refresh=force_refresh
    )


@router.post("/{conversation_id}/smart/summary", response_model=schemas.SmartSummaryResponse)
async def generate_summary_post(
    conversation_id: int,
    req: Optional[schemas.SmartSummaryRequest] = None,
    conversation_type: Optional[str] = Query(None),
    message_id: Optional[int] = Query(None),
    attachment_id: Optional[int] = Query(None),
    x_simulate_ai_failure: Optional[str] = Header(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_simulation_header(x_simulate_ai_failure)
    conv_type = (req.conversation_type if req and req.conversation_type else conversation_type) or "direct"
    msg_id = (req.message_id if req and req.message_id is not None else message_id)
    att_id = (req.attachment_id if req and req.attachment_id is not None else attachment_id)
    force_refresh = req.force_refresh if req else False

    return await smart_service.generate_summary(
        conversation_id=conversation_id,
        conversation_type=conv_type,
        current_user=current_user,
        db=db,
        message_id=msg_id,
        attachment_id=att_id,
        force_refresh=force_refresh
    )


# ---------------- 2. MISSED (GET and POST) ----------------
@router.get("/{conversation_id}/smart/missed", response_model=schemas.SmartMissedResponse)
async def get_missed_get(
    conversation_id: int,
    conversation_type: str = Query("direct", pattern="^(direct|group)$"),
    period: str = Query("last_read"),
    message_id: Optional[int] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    x_simulate_ai_failure: Optional[str] = Header(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_simulation_header(x_simulate_ai_failure)
    return await smart_service.generate_missed_summary(
        conversation_id=conversation_id,
        conversation_type=conversation_type,
        period=period,
        current_user=current_user,
        db=db,
        message_id=message_id,
        start_date_str=start_date,
        end_date_str=end_date
    )


@router.post("/{conversation_id}/smart/missed", response_model=schemas.SmartMissedResponse)
async def generate_missed_post(
    conversation_id: int,
    req: schemas.SmartMissedRequest,
    x_simulate_ai_failure: Optional[str] = Header(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_simulation_header(x_simulate_ai_failure)
    conv_type = req.conversation_type or "direct"
    return await smart_service.generate_missed_summary(
        conversation_id=conversation_id,
        conversation_type=conv_type,
        period=req.period,
        current_user=current_user,
        db=db,
        message_id=req.message_id,
        start_date_str=req.start_date,
        end_date_str=req.end_date
    )


# ---------------- 3. IMPORTANT MESSAGES ----------------
@router.get("/{conversation_id}/smart/important", response_model=schemas.SmartImportantResponse)
async def get_important_messages(
    conversation_id: int,
    conversation_type: str = Query("direct", pattern="^(direct|group)$"),
    message_id: Optional[int] = Query(None),
    x_simulate_ai_failure: Optional[str] = Header(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_simulation_header(x_simulate_ai_failure)
    return await smart_service.extract_important_messages(
        conversation_id=conversation_id,
        conversation_type=conversation_type,
        current_user=current_user,
        db=db,
        message_id=message_id
    )


# ---------------- 4. ACTION ITEMS (CRUD) ----------------
@router.get("/{conversation_id}/smart/actions", response_model=List[schemas.SmartActionItemResponse])
@router.get("/{conversation_id}/smart/action-items", response_model=List[schemas.SmartActionItemResponse])
@router.get("/{conversation_id}/action-items", response_model=List[schemas.SmartActionItemResponse])
async def get_action_items(
    conversation_id: int,
    conversation_type: str = Query("direct", pattern="^(direct|group)$"),
    message_id: Optional[int] = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return await smart_service.get_or_extract_actions(
        conversation_id=conversation_id,
        conversation_type=conversation_type,
        current_user=current_user,
        db=db,
        message_id=message_id
    )


@router.post("/{conversation_id}/smart/actions", response_model=schemas.SmartActionItemResponse, status_code=status.HTTP_201_CREATED)
@router.post("/{conversation_id}/smart/action-items", response_model=schemas.SmartActionItemResponse, status_code=status.HTTP_201_CREATED)
@router.post("/{conversation_id}/action-items", response_model=schemas.SmartActionItemResponse, status_code=status.HTTP_201_CREATED)
def create_action_item(
    conversation_id: int,
    action_in: schemas.SmartActionItemCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return smart_service.create_action(
        conversation_id=conversation_id,
        action_in=action_in,
        current_user=current_user,
        db=db
    )


@router.patch("/{conversation_id}/smart/actions/{action_id}", response_model=schemas.SmartActionItemResponse)
@router.patch("/{conversation_id}/smart/action-items/{action_id}", response_model=schemas.SmartActionItemResponse)
@router.patch("/{conversation_id}/action-items/{action_id}", response_model=schemas.SmartActionItemResponse)
def update_action_item(
    conversation_id: int,
    action_id: int,
    update_in: schemas.SmartActionItemUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return smart_service.update_action(
        conversation_id=conversation_id,
        action_id=action_id,
        update_in=update_in,
        current_user=current_user,
        db=db
    )


@router.patch("/{conversation_id}/action-items/{action_id}/status", response_model=schemas.SmartActionItemResponse)
def update_action_item_status(
    conversation_id: int,
    action_id: int,
    status_update: schemas.ActionItemStatusUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return smart_service.update_action_status(
        conversation_id=conversation_id,
        action_id=action_id,
        status_str=status_update.status,
        current_user=current_user,
        db=db
    )


@router.put("/{conversation_id}/action-items/{action_id}", response_model=schemas.SmartActionItemResponse)
def update_action_item_full(
    conversation_id: int,
    action_id: int,
    item_in: schemas.ActionItemFullUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return smart_service.update_action_full(
        conversation_id=conversation_id,
        action_id=action_id,
        item_in=item_in,
        current_user=current_user,
        db=db
    )


@router.delete("/{conversation_id}/smart/actions/{action_id}")
@router.delete("/{conversation_id}/smart/action-items/{action_id}")
@router.delete("/{conversation_id}/action-items/{action_id}")
def delete_action_item(
    conversation_id: int,
    action_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return smart_service.delete_action(
        conversation_id=conversation_id,
        action_id=action_id,
        current_user=current_user,
        db=db
    )


# ---------------- 5. DECISIONS ----------------
@router.get("/{conversation_id}/smart/decisions", response_model=schemas.SmartDecisionsResponse)
async def get_decisions(
    conversation_id: int,
    conversation_type: str = Query("direct", pattern="^(direct|group)$"),
    message_id: Optional[int] = Query(None),
    x_simulate_ai_failure: Optional[str] = Header(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_simulation_header(x_simulate_ai_failure)
    return await smart_service.get_or_extract_decisions(
        conversation_id=conversation_id,
        conversation_type=conversation_type,
        current_user=current_user,
        db=db,
        message_id=message_id
    )


# ---------------- 6. DATES & DEADLINES ----------------
@router.get("/{conversation_id}/smart/dates", response_model=schemas.SmartDatesResponse)
async def get_dates(
    conversation_id: int,
    conversation_type: str = Query("direct", pattern="^(direct|group)$"),
    message_id: Optional[int] = Query(None),
    x_simulate_ai_failure: Optional[str] = Header(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_simulation_header(x_simulate_ai_failure)
    return await smart_service.get_or_extract_dates(
        conversation_id=conversation_id,
        conversation_type=conversation_type,
        current_user=current_user,
        db=db,
        message_id=message_id
    )


# ---------------- 7. FILES & ATTACHMENTS ----------------
@router.get("/{conversation_id}/smart/files", response_model=schemas.SmartFilesResponse)
def get_files(
    conversation_id: int,
    conversation_type: str = Query("direct", pattern="^(direct|group)$"),
    message_id: Optional[int] = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return smart_service.get_files(
        conversation_id=conversation_id,
        conversation_type=conversation_type,
        current_user=current_user,
        db=db,
        message_id=message_id
    )


# ---------------- 8. INSIGHTS ----------------
@router.get("/{conversation_id}/smart/insights", response_model=schemas.SmartInsightsResponse)
async def get_insights(
    conversation_id: int,
    conversation_type: str = Query("direct", pattern="^(direct|group)$"),
    message_id: Optional[int] = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return await smart_service.get_insights(
        conversation_id=conversation_id,
        conversation_type=conversation_type,
        current_user=current_user,
        db=db,
        message_id=message_id
    )


# ---------------- MESSAGE-LEVEL & DOCUMENT-LEVEL SMART ANALYSIS ----------------
@router.post("/{conversation_id}/messages/{message_id}/smart/analyze")
@router.get("/{conversation_id}/messages/{message_id}/smart/analyze")
async def analyze_message_smart(
    conversation_id: int,
    message_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Analyze a specific message by conversation_id + message_id with AI."""
    return await smart_service.analyze_specific_message(
        conversation_id=conversation_id,
        message_id=message_id,
        current_user=current_user,
        db=db
    )


@router.post("/{conversation_id}/messages/{message_id}/attachments/{attachment_id}/smart/analyze")
@router.get("/{conversation_id}/messages/{message_id}/attachments/{attachment_id}/smart/analyze")
async def analyze_attachment_smart(
    conversation_id: int,
    message_id: int,
    attachment_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Analyze a specific document attachment by conversation_id + message_id + attachment_id."""
    return await smart_service.analyze_specific_attachment(
        conversation_id=conversation_id,
        message_id=message_id,
        attachment_id=attachment_id,
        current_user=current_user,
        db=db
    )


# ---------------- STANDALONE SMART ANALYSIS COMPATIBILITY ENDPOINTS ----------------
@router.get("/{conversation_id}/smart-analysis")
async def get_smart_analysis_endpoint(
    conversation_id: int,
    conversation_type: str = Query("direct", pattern="^(direct|group)$"),
    message_id: Optional[int] = Query(None),
    attachment_id: Optional[int] = Query(None),
    include_message: Optional[bool] = Query(None),
    include_document: Optional[bool] = Query(None),
    force_refresh: bool = Query(False),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unified Smart Analysis endpoint conforming to standalone contract."""
    return await smart_service.get_standalone_smart_analysis(
        conversation_id=conversation_id,
        conversation_type=conversation_type,
        current_user=current_user,
        db=db,
        message_id=message_id,
        attachment_id=attachment_id,
        include_message=include_message,
        include_document=include_document,
        force_refresh=force_refresh
    )


@router.post("/{conversation_id}/smart-analysis")
async def run_smart_analysis_endpoint(
    conversation_id: int,
    payload: Optional[schemas.SmartAnalysisRequest] = None,
    conversation_type: Optional[str] = Query(None),
    message_id: Optional[int] = Query(None),
    attachment_id: Optional[int] = Query(None),
    force_refresh: Optional[bool] = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Run/refresh Smart Analysis endpoint conforming to standalone contract."""
    conv_type = (payload.conversation_type if payload and payload.conversation_type else conversation_type) or "direct"
    msg_id = (payload.message_id if payload and payload.message_id is not None else message_id)
    att_id = (payload.attachment_id if payload and payload.attachment_id is not None else attachment_id)
    inc_msg = payload.include_message if payload else None
    inc_doc = payload.include_document if payload else None
    refresh = (payload.force_refresh if payload and payload.force_refresh is not None else (force_refresh or False))

    return await smart_service.get_standalone_smart_analysis(
        conversation_id=conversation_id,
        conversation_type=conv_type,
        current_user=current_user,
        db=db,
        message_id=msg_id,
        attachment_id=att_id,
        include_message=inc_msg,
        include_document=inc_doc,
        force_refresh=refresh
    )


@router.get("/ai-status")
async def get_conversations_ai_status():
    """AI health check for Smart Conversations."""
    return await smart_service.test_ai_connectivity()

