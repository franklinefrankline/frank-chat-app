import urllib.request
import urllib.error
import json
import os
import time

def run_feature_test(base_url, env_name):
    print(f"\n==================================================")
    print(f"AUDITING {env_name}: {base_url}")
    print(f"==================================================")

    results = {}

    def post_json(path, data, token=None):
        headers = {"Content-Type": "application/json"}
        if token: headers["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(f"{base_url}{path}", data=json.dumps(data).encode(), headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status, json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            try:
                body = json.loads(e.read().decode())
            except:
                body = str(e)
            return e.code, body
        except Exception as e:
            return 0, str(e)

    def get_json(path, token=None):
        headers = {}
        if token: headers["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(f"{base_url}{path}", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status, json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            try:
                body = json.loads(e.read().decode())
            except:
                body = str(e)
            return e.code, body
        except Exception as e:
            return 0, str(e)

    def upload_file(filename, mime_type, content_bytes, token):
        boundary = "----AuditBoundary" + os.urandom(8).hex()
        lines = [
            f"--{boundary}".encode(),
            f'Content-Disposition: form-data; name="file"; filename="{filename}"'.encode(),
            f"Content-Type: {mime_type}".encode(),
            b"",
            content_bytes,
            f"--{boundary}--".encode(),
            b""
        ]
        body = b"\r\n".join(lines)
        req = urllib.request.Request(
            f"{base_url}/api/files/upload",
            data=body,
            headers={
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Authorization": f"Bearer {token}"
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return resp.status, json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            try:
                body = json.loads(e.read().decode())
            except:
                body = str(e)
            return e.code, body
        except Exception as e:
            return 0, str(e)

    # 1. AUTHENTICATION: Register
    unique = f"{int(time.time())}_{os.urandom(4).hex()}"
    reg_username = f"aud_{unique}"
    reg_email = f"aud_{unique}@frankchat.test"
    reg_pass = "AuditPass2026!"
    status, reg_res = post_json("/api/auth/register", {
        "username": reg_username,
        "email": reg_email,
        "full_name": "Audit Test User",
        "password": reg_pass
    })
    results["AUTH: Register"] = "PASS" if status in (200, 201) and "access_token" in reg_res else f"FAIL ({status}: {reg_res})"
    token_a = reg_res.get("access_token") if status in (200, 201) else None
    user_a = reg_res.get("user", {}) if status in (200, 201) else {}
    results["AUTH: FRANK ID Format"] = "PASS" if (user_a.get("frank_id") and len(user_a["frank_id"]) == 6) else "FAIL"

    # Register User B for 2-user chat testing
    status_b, reg_b = post_json("/api/auth/register", {
        "username": f"aud_b_{unique}",
        "email": f"aud_b_{unique}@frankchat.test",
        "full_name": "Audit User B",
        "password": reg_pass
    })
    token_b = reg_b.get("access_token") if status_b in (200, 201) else None
    user_b = reg_b.get("user", {}) if status_b in (200, 201) else {}

    # 2. AUTHENTICATION: Login (Existing-user login)
    status_login, login_res = post_json("/api/auth/login", {
        "username": reg_username,
        "password": reg_pass
    })
    results["AUTH: Login"] = "PASS" if status_login == 200 and "access_token" in login_res else f"FAIL ({status_login}: {login_res})"
    results["AUTH: Existing-user login"] = "PASS" if status_login == 200 else "FAIL"

    # 3. AUTHENTICATION: Profile (/api/users/me or /api/auth/me)
    status_me, me_res = get_json("/api/users/me", token_a)
    if status_me != 200:
        status_me, me_res = get_json("/api/auth/me", token_a)
    results["AUTH: Profile / Me"] = "PASS" if status_me == 200 and me_res.get("username") == reg_username else f"FAIL ({status_me}: {me_res})"

    # 4. CHAT: Conversation List
    status_conv, conv_res = get_json("/api/users/conversations", token_a)
    results["CHAT: Conversation list"] = "PASS" if status_conv == 200 and isinstance(conv_res, list) else f"FAIL ({status_conv})"

    # 5. CHAT: Message Sending & Receiving (1-to-1)
    msg_id = None
    if token_a and user_b.get("id"):
        status_msg, msg_res = post_json("/api/messages", {
            "recipient_id": user_b["id"],
            "content": "Hello from audit test",
            "message_type": "text"
        }, token_a)
        results["CHAT: Message sending"] = "PASS" if status_msg == 201 and msg_res.get("id") else f"FAIL ({status_msg}: {msg_res})"
        msg_id = msg_res.get("id") if status_msg == 201 else None

        # Verify User B sees message in history
        status_hist, hist_res = get_json(f"/api/messages/direct/{user_a['id']}", token_b)
        has_msg = any(m.get("id") == msg_id for m in hist_res) if status_hist == 200 and isinstance(hist_res, list) else False
        results["CHAT: Message receiving / history"] = "PASS" if has_msg else f"FAIL (history status {status_hist})"
    else:
        results["CHAT: Message sending"] = f"FAIL (No token/user: a={bool(token_a)}, b_id={user_b.get('id')})"
        results["CHAT: Message receiving / history"] = "FAIL"

    # 6. CHAT: Edit Message
    if msg_id and token_a:
        status_edit, edit_res = post_json(f"/api/messages/{msg_id}", {
            "content": "Hello from audit test (EDITED)"
        }, token_a)
        # Note: could be PUT or PATCH
        if status_edit not in (200, 204):
            req_put = urllib.request.Request(f"{base_url}/api/messages/{msg_id}", data=json.dumps({"content": "Hello (EDITED)"}).encode(), headers={"Content-Type": "application/json", "Authorization": f"Bearer {token_a}"}, method="PUT")
            try:
                with urllib.request.urlopen(req_put) as r:
                    status_edit = r.status
            except urllib.error.HTTPError as e:
                status_edit = e.code
        results["CHAT: Edit message"] = "PASS" if status_edit in (200, 204) else f"FAIL ({status_edit})"

    # 7. CHAT: Reaction
    if msg_id and token_b:
        status_react, react_res = post_json(f"/api/messages/{msg_id}/reactions", {
            "emoji": "👍"
        }, token_b)
        results["CHAT: Reactions"] = "PASS" if status_react in (200, 201) else f"FAIL ({status_react})"

    # 8. GROUPS: Create Group & Group Chat
    group_id = None
    if token_a and user_b.get("id"):
        status_grp, grp_res = post_json("/api/groups", {
            "name": f"Audit Group {unique}",
            "member_ids": [user_b["id"]]
        }, token_a)
        results["GROUPS: Create group"] = "PASS" if status_grp in (200, 201) and grp_res.get("id") else f"FAIL ({status_grp})"
        group_id = grp_res.get("id") if status_grp in (200, 201) else None

        if group_id:
            status_grp_msg, grp_msg_res = post_json("/api/messages", {
                "group_id": group_id,
                "content": "Hello group from audit",
                "message_type": "text"
            }, token_a)
            results["GROUPS: Group chat message"] = "PASS" if status_grp_msg == 201 else f"FAIL ({status_grp_msg})"

    # 9. FILES: Photo Upload & Download
    photo_id = None
    if token_a:
        fake_jpg = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 200
        s_photo, photo_res = upload_file("audit_photo.jpg", "image/jpeg", fake_jpg, token_a)
        results["FILES: Photo upload"] = "PASS" if s_photo in (200, 201) and photo_res.get("id") else f"FAIL ({s_photo})"
        photo_id = photo_res.get("id") if s_photo in (200, 201) else None

    # 10. FILES: Document Upload & Open/Download
    doc_id = None
    if token_a:
        doc_bytes = b"%PDF-1.4 test document content for audit verification"
        s_doc, doc_res = upload_file("audit_doc.pdf", "application/pdf", doc_bytes, token_a)
        results["FILES: Document upload"] = "PASS" if s_doc in (200, 201) and doc_res.get("id") else f"FAIL ({s_doc})"
        doc_id = doc_res.get("id") if s_doc in (200, 201) else None

        if doc_id:
            # Check View
            req_v = urllib.request.Request(f"{base_url}/api/files/{doc_id}/view?token={token_a}")
            s_v, body_v = 0, ""
            try:
                with urllib.request.urlopen(req_v, timeout=10) as r:
                    s_v = r.status
            except urllib.error.HTTPError as e:
                s_v = e.code
                try: body_v = e.read().decode()
                except: body_v = str(e)
            results["FILES: Document open/preview"] = "PASS" if s_v == 200 else f"FAIL ({s_v}: {body_v})"

            # Check Download
            req_d = urllib.request.Request(f"{base_url}/api/files/{doc_id}/download?token={token_a}")
            try:
                with urllib.request.urlopen(req_d) as r:
                    s_d = r.status
            except urllib.error.HTTPError as e:
                s_d = e.code
            results["FILES: Document download"] = "PASS" if s_d == 200 else f"FAIL ({s_d})"

    # 11. FILES: Voice recording upload
    if token_a:
        voice_bytes = b"\x1a\x45\xdf\xa3" + b"\x00" * 150
        s_voice, voice_res = upload_file("audit_voice.webm", "audio/webm", voice_bytes, token_a)
        results["FILES: Voice upload"] = "PASS" if s_voice in (200, 201) and voice_res.get("id") else f"FAIL ({s_voice})"

    # 12. ADMIN: Admin Login & Metrics
    status_adm, adm_res = post_json("/api/auth/login", {
        "username": "admin",
        "password": "#Frankline2006"
    })
    results["ADMIN: Admin access / login"] = "PASS" if status_adm == 200 else f"FAIL ({status_adm})"
    adm_token = adm_res.get("access_token") if status_adm == 200 else None

    if adm_token:
        s_met, met_res = get_json("/api/admin/metrics", adm_token)
        results["ADMIN: Metrics"] = "PASS" if s_met == 200 and "total_users" in met_res else f"FAIL ({s_met})"

        s_usr, usr_res = get_json("/api/admin/users", adm_token)
        results["ADMIN: User management"] = "PASS" if s_usr == 200 else f"FAIL ({s_usr})"

        s_aud, aud_res = get_json("/api/admin/audit-logs", adm_token)
        results["ADMIN: Audit logs"] = "PASS" if s_aud == 200 else f"FAIL ({s_aud})"

    # 13. REAL-TIME: WebSocket Handshake Check
    ws_supported = False
    try:
        # Check HTTP upgrade header response
        ws_test_url = f"{base_url}/ws/audit_test_token"
        req_ws = urllib.request.Request(ws_test_url, headers={"Upgrade": "websocket", "Connection": "Upgrade"})
        with urllib.request.urlopen(req_ws, timeout=5) as r:
            ws_supported = (r.status in (101, 200))
    except urllib.error.HTTPError as e:
        # 101 Switching Protocols or 403 (invalid token) means WS endpoint exists! 404 means route does not exist.
        if e.code in (101, 403, 400):
            ws_supported = True
        else:
            ws_supported = False
    except Exception as e:
        ws_supported = False

    results["REAL-TIME: WebSocket endpoint"] = "PASS" if ws_supported else "FAIL (404/Unsupported on Vercel Serverless)"

    for feat, res in results.items():
        print(f" - {feat:35} : {res}")

    return results

if __name__ == "__main__":
    local_res = run_feature_test("http://127.0.0.1:8000", "LOCALHOST")
    prod_res = run_feature_test("https://frank-chat-app.vercel.app", "VERCEL PRODUCTION")
