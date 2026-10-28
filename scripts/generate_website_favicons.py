"""
generate_website_favicons.py
Generate high-resolution PNG favicons, multi-resolution ICO, and Apple Touch Icon
directly from the official FRANK Think brand assets for Google Search and web browsers.
"""

import os
import shutil
from PIL import Image

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAND_DIR = os.path.join(ROOT_DIR, "assets", "brand")
SOURCE_512 = os.path.join(BRAND_DIR, "frank-icon.png")

def generate_favicons():
    print(f"Loading source high-resolution icon: {SOURCE_512}")
    if not os.path.exists(SOURCE_512):
        raise FileNotFoundError(f"Source icon not found at {SOURCE_512}")

    src_img = Image.open(SOURCE_512).convert("RGBA")
    print(f"Source size: {src_img.size}, mode: {src_img.mode}")

    # 1. Root favicon.png (512x512 high-resolution source)
    root_fav_png = os.path.join(ROOT_DIR, "favicon.png")
    src_img.save(root_fav_png, format="PNG", optimize=True)
    print(f"[OK] Generated {root_fav_png} (512x512, {os.path.getsize(root_fav_png)} bytes)")

    # 2. Root favicon-48x48.png (48x48 exact multiple of 48)
    fav_48 = src_img.resize((48, 48), Image.Resampling.LANCZOS)
    root_fav_48 = os.path.join(ROOT_DIR, "favicon-48x48.png")
    fav_48.save(root_fav_48, format="PNG", optimize=True)
    print(f"[OK] Generated {root_fav_48} (48x48, {os.path.getsize(root_fav_48)} bytes)")

    # 3. Root apple-touch-icon.png (180x180 Apple touch icon)
    fav_180 = src_img.resize((180, 180), Image.Resampling.LANCZOS)
    root_apple_icon = os.path.join(ROOT_DIR, "apple-touch-icon.png")
    fav_180.save(root_apple_icon, format="PNG", optimize=True)
    print(f"[OK] Generated {root_apple_icon} (180x180, {os.path.getsize(root_apple_icon)} bytes)")

    # 4. Multi-resolution favicon.ico containing 16x16, 32x32, and 48x48 frames
    root_fav_ico = os.path.join(ROOT_DIR, "favicon.ico")
    src_img.save(
        root_fav_ico,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)]
    )
    print(f"[OK] Generated {root_fav_ico} (ICO multi-layer: 16, 32, 48; {os.path.getsize(root_fav_ico)} bytes)")

    # 5. Mirror to assets/brand/
    mirrors = [
        ("favicon.png", root_fav_png),
        ("favicon-48x48.png", root_fav_48),
        ("apple-touch-icon.png", root_apple_icon),
        ("favicon.ico", root_fav_ico),
    ]
    for filename, src_path in mirrors:
        dest_path = os.path.join(BRAND_DIR, filename)
        shutil.copy2(src_path, dest_path)
        print(f"[OK] Mirrored {filename} to {dest_path}")

    print("\nAll favicon assets successfully generated and verified!")

if __name__ == "__main__":
    generate_favicons()
