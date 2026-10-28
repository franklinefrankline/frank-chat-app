import sys
from pathlib import Path
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

import hashlib
from starlette.testclient import TestClient
import main

client = TestClient(main.app)

def test_landing():
    r = client.get("/")
    assert r.status_code == 200, f"Status: {r.status_code}"
    # Verify the landing page navbar and buttons route to /download
    assert "Download App" in r.text, "Download App button missing in landing page"
    assert "/download" in r.text, "Link to /download instructions missing in landing page"
    assert "navDownloadAppBtn" in r.text, "Navbar Download App button missing"
    print("PASS: Landing page contains Download App button routing to /download.")

def test_downloads_page():
    for route in ["/downloads/index.html", "/downloads", "/downloads/", "/download"]:
        r = client.get(route)
        assert r.status_code == 200, f"Route {route} returned {r.status_code}"
        ct = r.headers.get("content-type", "")
        assert "text/html" in ct, f"Wrong Content-Type for {route}: {ct}"
        assert "Download FRANK Think" in r.text or "FRANK Think for Android" in r.text, f"Title missing in {route}"
        assert "/downloads/frank-think.apk" in r.text, f"APK download link missing in {route}"
        assert "Back to Home" in r.text, f"Back to Home link missing in {route}"
        assert "Download the App" in r.text, f"Step 1 missing in {route}"
        assert "Allow Installation" in r.text, f"Step 2 missing in {route}"
        assert "Install the App" in r.text, f"Step 3 missing in {route}"
        assert "Open and Start" in r.text, f"Step 4 missing in {route}"
        assert "Safe &amp; Secure" in r.text or "Safe & Secure" in r.text, f"Security section missing in {route}"
    print("PASS: Dedicated /download landing page and all 4 installation steps verified.")

def test_apk_download():
    r = client.get("/downloads/frank-think.apk")
    assert r.status_code == 200, f"APK status: {r.status_code}"
    ct = r.headers.get("content-type", "")
    assert "application/vnd.android.package-archive" in ct, f"Wrong Content-Type: {ct}"
    cd = r.headers.get("content-disposition", "")
    assert "frank-think.apk" in cd, f"Wrong Content-Disposition: {cd}"
    content = r.content
    assert len(content) == 5805623, f"Size mismatch: {len(content)}"
    h = hashlib.sha256(content).hexdigest().upper()
    assert h == "3C7C26BF6A03319C6CCB52C86DDC5F3FCDFB62A62A06932C323B4459A4803322", f"Hash mismatch: {h}"
    print(f"PASS: APK download verified. Size: {len(content)} bytes, Content-Type: {ct}, Disposition: {cd}, SHA-256: {h}")

def test_existing_routes():
    for route in ["/login", "/register", "/privacy"]:
        r = client.get(route)
        assert r.status_code == 200, f"Route {route} returned {r.status_code}"
    print("PASS: Existing routes (/login, /register, /privacy) unaffected and load cleanly.")

if __name__ == "__main__":
    test_landing()
    test_downloads_page()
    test_apk_download()
    test_existing_routes()
    print("ALL TESTS PASSED SUCCESSFULLY!")
