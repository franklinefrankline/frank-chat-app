"""
update_html_favicons.py
Updates all HTML files in root and downloads/ to use the canonical favicon links.
"""

import glob
import os

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

old_block = """    <!-- Favicon & Brand Icons -->
    <link rel="icon" type="image/png" sizes="48x48" href="/assets/brand/favicon-48x48.png">
    <link rel="icon" type="image/png" sizes="96x96" href="/assets/brand/frank-icon.png">
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="shortcut icon" href="/favicon.ico">
    <link rel="apple-touch-icon" sizes="96x96" href="/assets/brand/frank-icon.png">
    <link rel="icon" type="image/svg+xml" href="/assets/brand/frank-icon.svg">"""

new_block = """    <!-- Favicon & Brand Icons -->
    <link rel="icon" type="image/png" href="/favicon.png">
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">"""

count = 0
patterns = [os.path.join(ROOT_DIR, "*.html"), os.path.join(ROOT_DIR, "downloads", "*.html")]
for pat in patterns:
    for f in sorted(glob.glob(pat)):
        with open(f, "r", encoding="utf-8") as fp:
            c = fp.read()
        if old_block in c:
            c = c.replace(old_block, new_block)
            with open(f, "w", encoding="utf-8") as fp:
                fp.write(c)
            print(f"Updated {os.path.relpath(f, ROOT_DIR)}")
            count += 1

print(f"Successfully updated {count} files.")
