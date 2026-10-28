"""
Verify live production SEO endpoints for FRANK Think at https://fnk.vercel.app/
"""

import urllib.request
import urllib.error
import re

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Googlebot/2.1"
}

ENDPOINTS = [
    ("Homepage", "https://fnk.vercel.app/"),
    ("Downloads Page", "https://fnk.vercel.app/download"),
    ("Login Page", "https://fnk.vercel.app/login"),
    ("Register Page", "https://fnk.vercel.app/register"),
    ("Privacy Page", "https://fnk.vercel.app/privacy"),
    ("Robots.txt", "https://fnk.vercel.app/robots.txt"),
    ("Sitemap.xml", "https://fnk.vercel.app/sitemap.xml")
]

def verify_live():
    print("=== Verifying Live Production SEO Deployments ===")
    all_ok = True
    for label, url in ENDPOINTS:
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as resp:
                status = resp.status
                content = resp.read().decode('utf-8', errors='replace')
                print(f"[200 OK] {label} ({url}) - Bytes: {len(content)}")
                
                if "Homepage" in label:
                    assert "All-in-One Productivity Platform" in content, "Missing key phrase on live homepage"
                    assert "Online Office Suite" in content, "Missing Online Office Suite on live homepage"
                    assert "rel=\"canonical\" href=\"https://fnk.vercel.app/\"" in content
                elif "Downloads" in label:
                    assert "Real-Time Messaging App" in content
                    assert "rel=\"canonical\" href=\"https://fnk.vercel.app/download\"" in content
                elif "Robots.txt" in label:
                    assert "Sitemap: https://fnk.vercel.app/sitemap.xml" in content
                    assert "Allow: /download" in content
                elif "Sitemap.xml" in label:
                    assert "<loc>https://fnk.vercel.app/download</loc>" in content
        except Exception as e:
            print(f"[FAILED] {label} ({url}): {e}")
            all_ok = False

    if all_ok:
        print("\nAll live production SEO endpoints verified successfully!")
    else:
        print("\nSome live verifications failed!")
    return all_ok

if __name__ == "__main__":
    verify_live()
