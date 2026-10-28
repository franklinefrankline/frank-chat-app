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
    assert "Download for Android" in r.text, "Download button missing in landing page"
    assert "/downloads/frank-think.apk" in r.text, "APK download link missing in landing page"
    assert "androidInstallNote" in r.text, "Install note missing in landing page"
    print("PASS: Landing page contains Download for Android button and installation guidance.")

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

def test_downloads_page():
    for route in ["/downloads/index.html", "/downloads", "/downloads/", "/download"]:
        r = client.get(route)
        assert r.status_code == 200, f"Route {route} returned {r.status_code}"
        ct = r.headers.get("content-type", "")
        assert "text/html" in ct, f"Wrong Content-Type for {route}: {ct}"
        assert "FRANK Think for Android" in r.text, f"Title missing in {route}"
        assert "/downloads/frank-think.apk" in r.text, f"APK link missing in {route}"
    print("PASS: Dedicated /downloads and /downloads/index.html landing page verified.")

if __name__ == "__main__":
    test_landing()
    test_apk_download()
    test_downloads_page()
    test_existing_routes()
    print("ALL TESTS PASSED SUCCESSFULLY!")
