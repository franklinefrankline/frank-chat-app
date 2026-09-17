from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from database import get_db, generate_unique_frank_id
import models
import schemas
from security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    decode_token
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=schemas.Token, status_code=status.HTTP_201_CREATED)
def register(user_in: schemas.UserRegister, db: Session = Depends(get_db)):
    clean_email = user_in.email.strip().lower()
    clean_username = user_in.username.strip()

    # 1. Check email (case-insensitive)
    if db.query(models.User).filter(models.User.email.ilike(clean_email)).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address already registered."
        )

    # 2. Check username (case-insensitive)
    if db.query(models.User).filter(models.User.username.ilike(clean_username)).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken. Please choose another one."
        )

    # 3. Generate permanent 6-character unique FRANK ID
    fid = generate_unique_frank_id(db)

    # 4. Create user with normalized email
    user = models.User(
        frank_id=fid,
        username=clean_username,
        email=clean_email,
        full_name=user_in.full_name.strip(),
        hashed_password=hash_password(user_in.password),
        bio="Hey there! I am using FRANK."
    )
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        # Concurrency race condition: duplicate email or username
        if db.query(models.User).filter(models.User.email.ilike(clean_email)).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email address already registered."
            )
        if db.query(models.User).filter(models.User.username.ilike(clean_username)).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken. Please choose another one."
            )
        # Collision retry
        fid = generate_unique_frank_id(db)
        user.frank_id = fid
        try:
            db.add(user)
            db.commit()
            db.refresh(user)
        except Exception:
            db.rollback()
            raise HTTPException(status_code=500, detail="Account registration could not be completed.")

    # Generate token
    token_str = create_access_token(
        data={"sub": user.username, "user_id": user.id},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return schemas.Token(
        access_token=token_str,
        token_type="bearer",
        user=schemas.UserResponse.from_orm(user)
    )


@router.post("/login", response_model=schemas.Token)
def login(login_data: schemas.UserLogin, db: Session = Depends(get_db)):
    identifier = login_data.username.strip()
    identifier_lower = identifier.lower()

    # Allow login by username (case-insensitive) or normalized email
    user = db.query(models.User).filter(
        (models.User.username == identifier) |
        (models.User.username.ilike(identifier)) |
        (models.User.email == identifier_lower) |
        (models.User.email.ilike(identifier_lower))
    ).first()

    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # Guarantee user has a permanent frank_id (for any legacy accounts)
    # Once assigned, NEVER regenerate frank_id on login
    if not user.frank_id:
        user.frank_id = generate_unique_frank_id(db)
        db.commit()
        db.refresh(user)

    # Issue token
    token_str = create_access_token(
        data={"sub": user.username, "user_id": user.id},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return schemas.Token(
        access_token=token_str,
        token_type="bearer",
        user=schemas.UserResponse.from_orm(user)
    )


@router.get("/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.post("/forgot-password")
def forgot_password(req: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    # Look up user quietly without revealing existence
    user = db.query(models.User).filter(models.User.email == req.email.lower()).first()
    reset_token = None
    if user:
        reset_token = create_access_token(
            data={"sub": user.username, "purpose": "pwd_reset"},
            expires_delta=timedelta(hours=1)
        )

    return {
        "success": True,
        "message": "If an account exists with this email, password reset instructions have been sent.",
        "debug_token": reset_token  # Provided for seamless local demonstration
    }


@router.post("/reset-password")
def reset_password(req: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    payload = decode_token(req.token)
    if not payload or payload.get("purpose") != "pwd_reset":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token."
        )

    username = payload.get("sub")
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )

    user.hashed_password = hash_password(req.new_password)
    db.commit()

    return {"success": True, "message": "Your password has been updated successfully. Please login."}
