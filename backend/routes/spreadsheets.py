"""
FRANK Think — Spreadsheet REST API Route
Provides fully authorized, isolated CRUD and import operations for the
integrated EXCELL Spreadsheet Editor.
"""

import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session

from database import get_db
import models
from security import get_current_user

router = APIRouter(prefix="/spreadsheets", tags=["spreadsheets"])


@router.get("", response_model=None)
@router.get("/", response_model=None)
def list_spreadsheets(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Lists all saved spreadsheets belonging strictly to the authenticated user.
    """
    rows = (
        db.query(models.Spreadsheet)
        .filter(models.Spreadsheet.user_id == current_user.id)
        .order_by(models.Spreadsheet.updated_at.desc())
        .all()
    )

    summaries = []
    for r in rows:
        sheet_count = 1
        try:
            parsed = json.loads(r.data)
            if "sheets" in parsed and isinstance(parsed["sheets"], list):
                sheet_count = len(parsed["sheets"])
        except Exception:
            sheet_count = 1

        created_str = r.created_at.isoformat() if r.created_at else ""
        updated_str = r.updated_at.isoformat() if r.updated_at else ""
        summaries.append({
            "id": r.id,
            "title": r.title,
            "activeSheetId": r.active_sheet_id,
            "sheetCount": sheet_count,
            "createdAt": created_str,
            "updatedAt": updated_str,
        })

    return {"success": True, "spreadsheets": summaries}


@router.get("/{id}")
def get_spreadsheet(
    id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Retrieves a single workbook by ID belonging to the authenticated user.
    Enforces strict user ownership isolation.
    """
    sheet = (
        db.query(models.Spreadsheet)
        .filter(
            models.Spreadsheet.id == id,
            models.Spreadsheet.user_id == current_user.id
        )
        .first()
    )
    if not sheet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Spreadsheet not found or unauthorized access"
        )

    try:
        payload = json.loads(sheet.data)
    except Exception:
        payload = {}

    sheets = payload.get("sheets", [])
    workbook = {
        "id": sheet.id,
        "title": sheet.title,
        "activeSheetId": sheet.active_sheet_id,
        "sheets": sheets,
        "createdAt": sheet.created_at.isoformat() if sheet.created_at else "",
        "updatedAt": sheet.updated_at.isoformat() if sheet.updated_at else "",
    }
    return {"success": True, "workbook": workbook}


@router.post("", response_model=None)
@router.post("/", response_model=None)
def save_spreadsheet(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Creates or updates a spreadsheet belonging to the authenticated user.
    """
    sheet_id = payload.get("id")
    title = (payload.get("title") or "Untitled Spreadsheet").strip()
    sheets = payload.get("sheets")
    active_sheet_id = payload.get("activeSheetId") or (sheets[0].get("id") if sheets and isinstance(sheets, list) else "sheet-1")

    if not sheet_id or not isinstance(sheets, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid spreadsheet payload: 'id' and 'sheets' array are required"
        )

    sheet_data_json = json.dumps({"sheets": sheets})
    now_dt = models.get_utc_now()

    existing = (
        db.query(models.Spreadsheet)
        .filter(models.Spreadsheet.id == sheet_id)
        .first()
    )

    if existing:
        if existing.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to modify this spreadsheet"
            )
        existing.title = title
        existing.active_sheet_id = active_sheet_id
        existing.data = sheet_data_json
        existing.updated_at = now_dt
    else:
        new_record = models.Spreadsheet(
            id=sheet_id,
            user_id=current_user.id,
            title=title,
            active_sheet_id=active_sheet_id,
            data=sheet_data_json,
            created_at=now_dt,
            updated_at=now_dt,
        )
        db.add(new_record)

    db.commit()
    return {"success": True, "id": sheet_id, "message": "Spreadsheet saved successfully"}


@router.put("/{id}")
def update_spreadsheet(
    id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Updates an existing spreadsheet belonging to the authenticated user.
    """
    existing = (
        db.query(models.Spreadsheet)
        .filter(models.Spreadsheet.id == id)
        .first()
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Spreadsheet not found"
        )
    if existing.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to modify this spreadsheet"
        )

    sheets = payload.get("sheets")
    if not sheets or not isinstance(sheets, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sheets must be a non-empty array"
        )

    title = payload.get("title") or existing.title
    active_sheet_id = payload.get("activeSheetId") or existing.active_sheet_id

    existing.title = title.strip()
    existing.active_sheet_id = active_sheet_id
    existing.data = json.dumps({"sheets": sheets})
    existing.updated_at = models.get_utc_now()
    db.commit()

    return {"success": True, "id": id, "message": "Spreadsheet updated successfully"}


@router.patch("/{id}/title")
def rename_spreadsheet(
    id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Renames a spreadsheet belonging to the authenticated user.
    """
    existing = (
        db.query(models.Spreadsheet)
        .filter(models.Spreadsheet.id == id)
        .first()
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Spreadsheet not found"
        )
    if existing.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to rename this spreadsheet"
        )

    new_title = (payload.get("title") or "").strip()
    if not new_title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid title is required"
        )

    existing.title = new_title
    existing.updated_at = models.get_utc_now()
    db.commit()

    return {"success": True, "message": "Spreadsheet renamed successfully", "title": new_title}


@router.delete("/{id}")
def delete_spreadsheet(
    id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Deletes a spreadsheet belonging to the authenticated user.
    """
    existing = (
        db.query(models.Spreadsheet)
        .filter(models.Spreadsheet.id == id)
        .first()
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Spreadsheet not found"
        )
    if existing.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this spreadsheet"
        )

    db.delete(existing)
    db.commit()
    return {"success": True, "message": "Spreadsheet deleted successfully"}

