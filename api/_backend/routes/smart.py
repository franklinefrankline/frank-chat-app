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
    force_refresh: bool = Query(False),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns full intelligence for the authorized conversation:
    summary, missed, important, action items, decisions, dates, files, and insights.
    Strict participant access verification enforced.
    """
    return await smart_service.get_full_smart(
        conversation_id=conversation_id,
        conversation_type=conversation_type,
        current_user=current_user,
        db=db,
        force_refresh=force_refresh
    )


# ---------------- SUMMARY (GET and POST) ----------------
@router.get("/{conversation_id}/smart/summary", response_model=schemas.SmartSummaryResponse)
async def get_summary_get(
    conversation_id: int,
    conversation_type: str = Query("direct", pattern="^(direct|group)$"),
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
        force_refresh=force_refresh
    )


@router.post("/{conversation_id}/smart/summary", response_model=schemas.SmartSummaryResponse)
async def generate_summary_post(
    conversation_id: int,
    req: schemas.SmartSummaryRequest = None,
    conversation_type: Optional[str] = Query(None),
    x_simulate_ai_failure: Optional[str] = Header(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_simulation_header(x_simulate_ai_failure)
    conv_type = (req.conversation_type if req and req.conversation_type else conversation_type) or "direct"
    force_refresh = req.force_refresh if req else False

    return await smart_service.generate_summary(
        conversation_id=conversation_id,
        conversation_type=conv_type,
        current_user=current_user,
        db=db,
        force_refresh=force_refresh
    )


# ---------------- MISSED (GET and POST) ----------------
@router.get("/{conversation_id}/smart/missed", response_model=schemas.SmartMissedResponse)
async def get_missed_get(
    conversation_id: int,
    conversation_type: str = Query("direct", pattern="^(direct|group)$"),
    period: str = Query("last_read"),
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
        start_date_str=req.start_date,
        end_date_str=req.end_date
    )


# ---------------- IMPORTANT MESSAGES ----------------
@router.get("/{conversation_id}/smart/important", response_model=schemas.SmartImportantResponse)
async def get_important_messages(
    conversation_id: int,
    conversation_type: str = Query("direct", pattern="^(direct|group)$"),
    x_simulate_ai_failure: Optional[str] = Header(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_simulation_header(x_simulate_ai_failure)
    return await smart_service.extract_important_messages(
        conversation_id=conversation_id,
        conversation_type=conversation_type,
        current_user=current_user,
        db=db
    )


# ---------------- ACTION ITEMS (both /actions and /action-items) ----------------
@router.get("/{conversation_id}/smart/actions", response_model=List[schemas.SmartActionItemResponse])
@router.get("/{conversation_id}/smart/action-items", response_model=List[schemas.SmartActionItemResponse])
async def get_action_items(
    conversation_id: int,
    conversation_type: str = Query("direct", pattern="^(direct|group)$"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return await smart_service.get_or_extract_actions(
        conversation_id=conversation_id,
        conversation_type=conversation_type,
        current_user=current_user,
        db=db
    )


@router.post("/{conversation_id}/smart/actions", response_model=schemas.SmartActionItemResponse, status_code=status.HTTP_201_CREATED)
@router.post("/{conversation_id}/smart/action-items", response_model=schemas.SmartActionItemResponse, status_code=status.HTTP_201_CREATED)
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


@router.delete("/{conversation_id}/smart/actions/{action_id}")
@router.delete("/{conversation_id}/smart/action-items/{action_id}")
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


# ---------------- DECISIONS ----------------
@router.get("/{conversation_id}/smart/decisions", response_model=schemas.SmartDecisionsResponse)
async def get_decisions(
    conversation_id: int,
    conversation_type: str = Query("direct", pattern="^(direct|group)$"),
    x_simulate_ai_failure: Optional[str] = Header(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_simulation_header(x_simulate_ai_failure)
    return await smart_service.get_or_extract_decisions(
        conversation_id=conversation_id,
        conversation_type=conversation_type,
        current_user=current_user,
        db=db
    )


# ---------------- DATES & DEADLINES ----------------
@router.get("/{conversation_id}/smart/dates", response_model=schemas.SmartDatesResponse)
async def get_dates(
    conversation_id: int,
    conversation_type: str = Query("direct", pattern="^(direct|group)$"),
    x_simulate_ai_failure: Optional[str] = Header(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _check_simulation_header(x_simulate_ai_failure)
    return await smart_service.get_or_extract_dates(
        conversation_id=conversation_id,
        conversation_type=conversation_type,
        current_user=current_user,
        db=db
    )


# ---------------- FILES & ATTACHMENTS ----------------
@router.get("/{conversation_id}/smart/files", response_model=schemas.SmartFilesResponse)
def get_files(
    conversation_id: int,
    conversation_type: str = Query("direct", pattern="^(direct|group)$"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return smart_service.get_files(
        conversation_id=conversation_id,
        conversation_type=conversation_type,
        current_user=current_user,
        db=db
    )


# ---------------- INSIGHTS ----------------
@router.get("/{conversation_id}/smart/insights", response_model=schemas.SmartInsightsResponse)
def get_insights(
    conversation_id: int,
    conversation_type: str = Query("direct", pattern="^(direct|group)$"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return smart_service.get_insights(
        conversation_id=conversation_id,
        conversation_type=conversation_type,
        current_user=current_user,
        db=db
    )
