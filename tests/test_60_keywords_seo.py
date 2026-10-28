"""
Comprehensive SEO verification test for FRANK Think website (https://fnk.vercel.app/)
Verifies all 60 keywords, search intent distribution, metadata uniqueness,
sitemap.xml, robots.txt, canonical links, Open Graph, and private route protections.
"""

import os
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

TARGET_KEYWORDS = [
    "FRANK Think",
    "FRANK Think Website",
    "FRANK Think Online Platform",
    "FRANK Think Productivity Suite",
    "FRANK Think Office Suite",
    "Online PDF Editor",
    "Edit PDF Online",
    "PDF Document Editor",
    "PDF Editing Tool",
    "Online PDF Editing Software",
    "PDF File Editor Online",
    "Browser-Based PDF Editor",
    "PDF Document Management",
    "Online Word Editor",
    "Edit Word Documents Online",
    "Online DOCX Editor",
    "Word Document Editing Tool",
    "Online Document Editor",
    "Create Documents Online",
    "Edit Documents in Browser",
    "Online Text Editor",
    "Document Writing Tool",
    "Online Excel Editor",
    "Spreadsheet Editor Online",
    "Online Spreadsheet Tool",
    "Edit Spreadsheets Online",
    "Spreadsheet Management Tool",
    "Online Data Table Editor",
    "Online PowerPoint Editor",
    "PPT Presentation Editor",
    "Create Presentations Online",
    "Online Slide Editor",
    "Presentation Editing Tool",
    "Browser-Based Presentation Editor",
    "Online Office Suite",
    "Office Productivity Software",
    "Online Office Tools",
    "All-in-One Productivity Platform",
    "Document Editing Platform",
    "Online Document Workspace",
    "AI Assistant Online",
    "AI Writing Assistant",
    "AI Paragraph Summarizer",
    "Summarize Paragraph Online",
    "AI Document Summarizer",
    "Text Summary Generator",
    "AI Text Rewriter",
    "AI Content Assistant",
    "AI Text Summarization Tool",
    "AI-Powered Productivity Tools",
    "Online Messaging Platform",
    "Real-Time Messaging App",
    "Group Chat Platform",
    "Private Chat Application",
    "Chat and File Sharing",
    "Online File Sharing Platform",
    "Team Communication Tool",
    "Document Collaboration Platform",
    "Web-Based Productivity Tools",
    "Online Communication and Collaboration"
]

PUBLIC_PAGES = {
    "home": ROOT_DIR / "index.html",
    "downloads": ROOT_DIR / "downloads" / "index.html",
    "login": ROOT_DIR / "login.html",
    "register": ROOT_DIR / "register.html",
    "privacy": ROOT_DIR / "privacy.html"
}

def clean_html_for_text(html_content: str) -> str:
    # Remove script and style elements
    cleaned = re.sub(r'<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>', ' ', html_content, flags=re.IGNORECASE)
    cleaned = re.sub(r'<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>', ' ', cleaned, flags=re.IGNORECASE)
    # Extract visible text and attribute text like alt and title and meta descriptions
    return cleaned

def test_keywords_presence():
    print("=== Testing 60 Keywords Presence across Public Pages ===")
    assert len(TARGET_KEYWORDS) == 60, f"Expected exactly 60 keywords, got {len(TARGET_KEYWORDS)}"

    # Read all public page contents
    page_contents = {}
    for name, path in PUBLIC_PAGES.items():
        assert path.exists(), f"Page {path} does not exist"
        with open(path, "r", encoding="utf-8") as f:
            page_contents[name] = f.read()

    # Also include js/i18n.js for index.html client-rendered strings
    i18n_path = ROOT_DIR / "js" / "i18n.js"
    with open(i18n_path, "r", encoding="utf-8") as f:
        i18n_content = f.read()

    combined_text = " ".join(page_contents.values()) + " " + i18n_content

    found_keywords = {}
    missing_keywords = []

    for kw in TARGET_KEYWORDS:
        pattern = re.compile(re.escape(kw), re.IGNORECASE)
        matches_per_page = {}
        for name, content in page_contents.items():
            count = len(pattern.findall(content))
            if count > 0:
                matches_per_page[name] = count
        if matches_per_page:
            found_keywords[kw] = matches_per_page
        else:
            missing_keywords.append(kw)

    print(f"Total Target Keywords: {len(TARGET_KEYWORDS)}")
    print(f"Found across public pages: {len(found_keywords)} / 60")
    if missing_keywords:
        print(f"Missing Keywords: {missing_keywords}")
    assert len(missing_keywords) == 0, f"Missing {len(missing_keywords)} keywords: {missing_keywords}"
    print("[PASS] All 60 keywords present across public pages!\n")

def test_intent_distribution_and_no_stuffing():
    print("=== Testing Intent Distribution & No Blanket Keyword Stuffing ===")
    # Requirement: "Do not add all 60 keywords to every page."
    for name, path in PUBLIC_PAGES.items():
        if name == "home":
            continue
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        page_kws = [kw for kw in TARGET_KEYWORDS if re.search(re.escape(kw), content, re.IGNORECASE)]
        print(f"Page '{name}': {len(page_kws)} / 60 target keywords present (intent-specific)")
        assert len(page_kws) < 60, f"Page {name} contains all 60 keywords! (Blanket stuffing forbidden)"
        assert len(page_kws) >= 3, f"Page {name} has too few intent keywords ({len(page_kws)})"
    print("[PASS] Keywords are properly distributed by intent without blanket stuffing!\n")

def test_metadata_uniqueness():
    print("=== Testing Metadata Uniqueness (Titles & Descriptions) ===")
    titles = {}
    descriptions = {}
    canonicals = {}

    title_pattern = re.compile(r'<title>([^<]+)<\/title>', re.IGNORECASE)
    desc_pattern = re.compile(r'<meta\s+name=["\']description["\']\s+content=(?:"([^"]+)"|\'([^\']+)\')', re.IGNORECASE)
    canonical_pattern = re.compile(r'<link\s+rel=["\']canonical["\']\s+href=(?:"([^"]+)"|\'([^\']+)\')', re.IGNORECASE)

    for name, path in PUBLIC_PAGES.items():
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        
        t_match = title_pattern.search(content)
        assert t_match, f"Page {name} is missing a <title> tag"
        titles[name] = t_match.group(1).strip()

        d_match = desc_pattern.search(content)
        assert d_match, f"Page {name} is missing a <meta name='description'> tag"
        descriptions[name] = (d_match.group(1) or d_match.group(2)).strip()

        c_match = canonical_pattern.search(content)
        assert c_match, f"Page {name} is missing a canonical link tag"
        canonicals[name] = (c_match.group(1) or c_match.group(2)).strip()

    print("Page Titles:")
    for name, title in titles.items():
        print(f"  - {name}: {title}")
    assert len(set(titles.values())) == len(PUBLIC_PAGES), "Duplicate titles found!"

    print("\nPage Meta Descriptions:")
    for name, desc in descriptions.items():
        print(f"  - {name} ({len(desc)} chars): {desc}")
    assert len(set(descriptions.values())) == len(PUBLIC_PAGES), "Duplicate meta descriptions found!"

    print("\nCanonical URLs:")
    for name, can in canonicals.items():
        print(f"  - {name}: {can}")
    assert len(set(canonicals.values())) == len(PUBLIC_PAGES), "Duplicate canonical URLs found!"

    print("[PASS] All pages have distinct, unique titles, descriptions, and canonical URLs!\n")

def test_no_meta_keywords_tag():
    print("=== Verifying No Reliance on <meta name='keywords'> ===")
    # Requirement: "Do not rely on the meta keywords tag for Google rankings."
    for name, path in PUBLIC_PAGES.items():
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        assert not re.search(r'<meta\s+name=["\']keywords["\']', content, re.IGNORECASE), \
            f"Page {name} unexpectedly contains a <meta name='keywords'> tag!"
    print("[PASS] Verified: No pages rely on <meta name='keywords'> tag.\n")

def test_no_hidden_keywords():
    print("=== Verifying No Hidden Text / Keyword Cloaking ===")
    # Requirement: "Do not use hidden keyword text or keyword stuffing."
    hidden_patterns = [
        re.compile(r'style=["\'][^"\']*(?:display:\s*none|visibility:\s*hidden|font-size:\s*0|opacity:\s*0)', re.IGNORECASE),
        re.compile(r'class=["\'][^"\']*(?:sr-only|visually-hidden|hidden)', re.IGNORECASE)
    ]
    for name, path in PUBLIC_PAGES.items():
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        # Find any elements matching hidden patterns
        for hp in hidden_patterns:
            for match in hp.finditer(content):
                snippet = content[match.start():match.start()+200]
                # Check if this hidden snippet contains any target keyword
                for kw in TARGET_KEYWORDS:
                    if kw.lower() in snippet.lower():
                        raise AssertionError(f"Suspicious hidden keyword text '{kw}' in {name}: {snippet}")
    print("[PASS] Verified: No hidden keyword text found.\n")

def test_sitemap_and_robots():
    print("=== Testing sitemap.xml and robots.txt Compliance ===")
    sitemap_path = ROOT_DIR / "sitemap.xml"
    assert sitemap_path.exists(), "sitemap.xml does not exist"
    
    # Parse XML
    tree = ET.parse(sitemap_path)
    root = tree.getroot()
    namespaces = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    locs = [elem.text for elem in root.findall('.//ns:loc', namespaces)]
    
    print(f"sitemap.xml contains {len(locs)} URLs:")
    for loc in locs:
        print(f"  - {loc}")
    
    expected_urls = [
        "https://fnk.vercel.app/",
        "https://fnk.vercel.app/download",
        "https://fnk.vercel.app/login",
        "https://fnk.vercel.app/register",
        "https://fnk.vercel.app/privacy"
    ]
    for exp in expected_urls:
        assert exp in locs, f"Expected URL {exp} missing from sitemap.xml"

    # Test robots.txt
    robots_path = ROOT_DIR / "robots.txt"
    assert robots_path.exists(), "robots.txt does not exist"
    with open(robots_path, "r", encoding="utf-8") as f:
        robots_content = f.read()

    assert "Sitemap: https://fnk.vercel.app/sitemap.xml" in robots_content, "robots.txt missing Sitemap reference"
    assert "Allow: /download" in robots_content, "robots.txt must allow /download"
    assert "Disallow: /dashboard" in robots_content, "robots.txt must protect /dashboard"
    assert "Disallow: /admin" in robots_content, "robots.txt must protect /admin"
    assert "Disallow: /profile" in robots_content, "robots.txt must protect /profile"
    assert "Disallow: /settings" in robots_content, "robots.txt must protect /settings"
    assert "Disallow: /api/" in robots_content, "robots.txt must protect /api/"
    assert "Disallow: /uploads/" in robots_content, "robots.txt must protect /uploads/"
    assert "Disallow: /ws/" in robots_content, "robots.txt must protect /ws/"

    print("[PASS] sitemap.xml and robots.txt are fully valid and compliant!\n")

def test_vercel_noindex_headers():
    print("=== Testing vercel.json Private Routes Protection ===")
    vercel_path = ROOT_DIR / "vercel.json"
    assert vercel_path.exists(), "vercel.json does not exist"
    with open(vercel_path, "r", encoding="utf-8") as f:
        vercel_content = f.read()

    assert "X-Robots-Tag" in vercel_content, "vercel.json must configure X-Robots-Tag"
    assert "noindex, nofollow" in vercel_content, "vercel.json must set noindex, nofollow for private routes"
    print("[PASS] vercel.json enforces X-Robots-Tag: noindex, nofollow for sensitive paths!\n")

if __name__ == "__main__":
    test_keywords_presence()
    test_intent_distribution_and_no_stuffing()
    test_metadata_uniqueness()
    test_no_meta_keywords_tag()
    test_no_hidden_keywords()
    test_sitemap_and_robots()
    test_vercel_noindex_headers()
    print("All SEO verification tests passed successfully (7/7)!")
