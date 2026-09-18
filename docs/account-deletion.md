# FRANK Chat Application — User Data & Account Deletion Policy and Implementation

## 1. Overview
The FRANK Chat application provides robust, privacy-compliant mechanisms for both **Self-Service Account Deletion** and **Administrative Lifecycle Management**.

The architecture strictly distinguishes between:
1. **User Data Deletion (Content Wipe)**: Erases all messages, reactions, uploaded documents, physical files on disk, and profile details, but preserves the user credentials (`User` row) so the user can continue using their existing login with a completely clean slate.
2. **Permanent Account Deletion**: Transactionally purges the user entity, credentials, verification/reset tokens, messages, conversations, and safely reassigns group ownerships or deletes empty groups.

---

## 2. Distinction: Clear Data vs. Delete Account

| Feature | Delete User Data (`DELETE /api/admin/users/{id}/data`) | Delete Account (`DELETE /api/users/me` or `/api/admin/users/{id}`) |
| :--- | :--- | :--- |
| **Account Login** | Preserved (User can still log in) | Destroyed (Cannot log in again) |
| **User ID & FRANK ID** | Retained | Permanently removed |
| **Direct & Group Messages** | Sent messages wiped | All messages & conversation links purged |
| **Reactions** | Cleared | Cleared |
| **Uploaded Documents** | Deleted from database | Deleted from database |
| **Disk Files** | Physical files safely unlinked from disk | Physical files safely unlinked from disk |
| **Group Ownership** | Preserved | Reassigned to oldest member or deleted if empty |
| **WebSocket Sessions** | Kept active | Forcibly terminated immediately (`code 1008`) |
| **Audit Log Entry** | `action = "delete_user_data"` | `action = "delete_user_account"` |

---

## 3. Endpoints Specification

### A. Self Account Deletion (User Settings)
- **Method**: `DELETE`
- **Endpoint**: `/api/users/me`
- **Authentication**: Bearer JWT (must belong to active user)
- **Request Body**:
  ```json
  {
    "password": "user_current_password",
    "confirmation": "DELETE"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "message": "Your account and all associated data have been permanently deleted."
  }
  ```
- **Security Enforcements**:
  - Re-verifies current password against PBKDF2 / Argon2 hash.
  - Rejects with `400 Bad Request` if password is incorrect.
  - Automatically terminates active WebSockets.

### B. Admin Content Wipe
- **Method**: `DELETE`
- **Endpoint**: `/api/admin/users/{user_id}/data`
- **Authentication**: Bearer JWT (requires `role == 'admin'`)
- **Response**:
  ```json
  {
    "success": true,
    "message": "User content for 'username' successfully wiped. Account credentials remain active.",
    "details": {
      "user_id": 12,
      "username": "sampleuser",
      "messages_deleted": 45,
      "files_deleted": 3,
      "status": "data_cleared"
    }
  }
  ```

### C. Admin Permanent Account Deletion
- **Method**: `DELETE`
- **Endpoint**: `/api/admin/users/{user_id}`
- **Authentication**: Bearer JWT (requires `role == 'admin'`)
- **Response**:
  ```json
  {
    "success": true,
    "message": "User account 'username' has been permanently deleted.",
    "details": {
      "user_id": 12,
      "files_deleted": 3,
      "status": "account_permanently_deleted"
    }
  }
  ```
- **Safety Guards**:
  - An administrator cannot delete their own account via the Admin Portal (`400 Bad Request`).
  - Records an immutable audit log entry in `admin_audit_logs`.

---

## 4. Group Ownership Lifecycle Handling
When an account owning one or more groups is permanently deleted:
1. The system queries `GroupMember` for that group, ordered by `joined_at ASC` excluding the deleting user.
2. If other members exist:
   - Ownership transfers to the oldest member: `group.created_by = next_member.user_id`.
   - The new owner's role is promoted to `admin`.
3. If no other members exist:
   - All group messages, reactions, documents, and the group itself are cascade deleted.

---

## 5. Safe Physical File Cleanup
To prevent orphaned storage consumption and protect against path traversal attacks:
1. Every file referenced by a deleted user or group is extracted.
2. The storage location is verified using `Path.is_relative_to(UPLOAD_DIR.resolve())`.
3. The file is unlinked from storage (`missing_ok=True`).
