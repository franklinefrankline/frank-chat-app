"""
verify_live_production_favicons.py
Automated live check verifying https://fnk.vercel.app production favicon deployment.
"""

import io
import re
import urllib.request
from PIL import Image

def verify_live():
    print("Verifying live production deployment: https://fnk.vercel.app\n")

    # 1. Homepage HTML
    req = urllib.request.Request("https://fnk.vercel.app/", headers={"User-Agent": "Mozilla/5.0 Googlebot/2.1"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        html = resp.read().decode("utf-8")

    assert '<link rel="icon" type="image/png" href="/favicon.png">' in html, "Missing /favicon.png link"
    assert '<link rel="icon" type="image/x-icon" href="/favicon.ico">' in html, "Missing /favicon.ico link"
    assert '<link rel="apple-touch-icon" href="/apple-touch-icon.png">' in html, "Missing /apple-touch-icon.png link"

    icon_tags = re.findall(r'<link[^>]+rel=[\'"]icon[\'"][^>]*>', html)
    assert len(icon_tags) == 2, f"Expected 2 icon tags, found {len(icon_tags)}: {icon_tags}"
    print("  [PASS] Homepage HTML has canonical non-conflicting favicon tags")

    # 2. Favicon PNG
    req = urllib.request.Request("https://fnk.vercel.app/favicon.png", headers={"User-Agent": "Mozilla/5.0 Googlebot/2.1"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = resp.read()
        assert resp.status == 200, f"Status {resp.status}"
        ct = resp.headers.get("Content-Type", "")
        assert "image/png" in ct, f"MIME {ct}"
        img = Image.open(io.BytesIO(data))
        assert img.size == (512, 512), f"Size {img.size}"
    print(f"  [PASS] /favicon.png is live: 200 OK, {ct}, {img.size}")

    # 3. Favicon ICO
    req = urllib.request.Request("https://fnk.vercel.app/favicon.ico", headers={"User-Agent": "Mozilla/5.0 Googlebot/2.1"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = resp.read()
        assert resp.status == 200, f"Status {resp.status}"
        ct = resp.headers.get("Content-Type", "")
        assert "icon" in ct, f"MIME {ct}"
        img = Image.open(io.BytesIO(data))
        assert img.format == "ICO", f"Format {img.format}"
    print(f"  [PASS] /favicon.ico is live: 200 OK, {ct}, {img.size}")

    # 4. Apple Touch Icon
    req = urllib.request.Request("https://fnk.vercel.app/apple-touch-icon.png", headers={"User-Agent": "Mozilla/5.0 Googlebot/2.1"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = resp.read()
        assert resp.status == 200, f"Status {resp.status}"
        img = Image.open(io.BytesIO(data))
        assert img.size == (180, 180), f"Size {img.size}"
    print(f"  [PASS] /apple-touch-icon.png is live: 200 OK, {img.size}")

    # 5. Dedicated 48x48 PNG
    req = urllib.request.Request("https://fnk.vercel.app/favicon-48x48.png", headers={"User-Agent": "Mozilla/5.0 Googlebot/2.1"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = resp.read()
        assert resp.status == 200, f"Status {resp.status}"
        img = Image.open(io.BytesIO(data))
        assert img.size == (48, 48), f"Size {img.size}"
    print(f"  [PASS] /favicon-48x48.png is live: 200 OK, {img.size}")

    # 6. Robots.txt
    req = urllib.request.Request("https://fnk.vercel.app/robots.txt", headers={"User-Agent": "Mozilla/5.0 Googlebot/2.1"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        robots = resp.read().decode("utf-8")
        assert "Allow: /" in robots
        assert "Disallow: /favicon" not in robots
    print("  [PASS] /robots.txt is crawlable and allows all favicons")

    print("\nALL LIVE PRODUCTION CHECKS PASSED!")

if __name__ == "__main__":
    verify_live()
