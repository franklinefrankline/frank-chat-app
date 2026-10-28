"""Generate pixel-perfect Android launcher icons from assets/brand/frank-icon.svg.

Handles:
- Adaptive icon foreground (ic_launcher_foreground.png) at 108dp base density (safe 72dp zone)
- Legacy launcher icon (ic_launcher.png) at 48dp base density
- Legacy round icon (ic_launcher_round.png) at 48dp base density
- All required mipmap densities: mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi
"""

import os
import subprocess
from PIL import Image

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES_DIR = os.path.join(WORKSPACE_ROOT, "android", "app", "src", "main", "res")
CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SCRATCH_DIR = os.path.join(WORKSPACE_ROOT, "scratch", "icon_gen")

os.makedirs(SCRATCH_DIR, exist_ok=True)

# SVG Definitions matching assets/brand/frank-icon.svg
SVG_DEFS = """
    <defs>
        <linearGradient id="frankSpineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#3B82F6" />
            <stop offset="50%" stop-color="#7C3AED" />
            <stop offset="100%" stop-color="#C026D3" />
        </linearGradient>
        <linearGradient id="frankTopBeamGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#2563EB" />
            <stop offset="60%" stop-color="#3B82F6" />
            <stop offset="100%" stop-color="#06B6D4" />
        </linearGradient>
        <linearGradient id="frankMidBeamGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#7C3AED" />
            <stop offset="70%" stop-color="#A855F7" />
            <stop offset="100%" stop-color="#E879F9" />
        </linearGradient>
        <linearGradient id="frankBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0B0F28" />
            <stop offset="100%" stop-color="#141B4D" />
        </linearGradient>
        <filter id="frankGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
    </defs>
"""

LOGO_PATHS = """
    <!-- Top Horizontal Chat Beam (Electric Blue -> Cyan) -->
    <path d="M 12 14 C 12 11.238 14.238 9 17 9 L 34 9 C 36.762 9 39 11.238 39 14 C 39 16.762 36.762 19 34 19 L 17 19 C 14.238 19 12 16.762 12 14 Z" fill="url(#frankTopBeamGrad)" />
    
    <!-- Vertical Communication Spine with Chat Tail (Blue -> Violet -> Magenta) -->
    <path d="M 12 14 L 12 34 C 12 36.762 14.238 39 17 39 C 19.762 39 22 36.762 22 34 L 22 14 Z" fill="url(#frankSpineGrad)" />
    <!-- Speech bubble notch at bottom of spine -->
    <path d="M 12 33 L 7.5 38.5 C 6.8 39.3 7.4 40.5 8.5 40.5 L 14.5 40.5 C 15.5 40.5 16 39.8 15.5 39 L 12 33 Z" fill="#C026D3" />

    <!-- Middle Horizontal Chat Beam (Violet -> Magenta) -->
    <path d="M 17 23 L 28 23 C 30.762 23 33 25.238 33 28 C 33 30.762 30.762 33 28 33 L 17 33 Z" fill="url(#frankMidBeamGrad)" />
    
    <!-- Communication Spark Pulse Dot in Cyan -->
    <circle cx="34.5" cy="14" r="2.2" fill="#22D3EE" filter="url(#frankGlow)" />
"""


def render_html_to_png(html_content, out_png, width, height):
    html_file = os.path.join(SCRATCH_DIR, f"temp_{width}x{height}_{os.path.basename(out_png)}.html")
    with open(html_file, "w", encoding="utf-8") as f:
        f.write(html_content)

    cmd = [
        CHROME_PATH,
        "--headless",
        "--disable-gpu",
        "--hide-scrollbars",
        "--default-background-color=00000000",
        f"--window-size={width},{height}",
        f"--screenshot={out_png}",
        f"file:///{os.path.abspath(html_file)}",
    ]
    subprocess.run(cmd, check=True)
    if os.path.exists(html_file):
        os.remove(html_file)


def create_adaptive_foreground_svg(size):
    # 108dp canvas, safe zone is 72dp diameter centered at (54, 54)
    # Original logo bounds: x=7.5 to 39 (cx=23.25), y=9.0 to 40.5 (cy=24.75), max dim=31.5
    # Target size = 48dp keeps max vertex radius <= 32.9dp, comfortably inside the 36dp mask
    target_size = 48.0
    scale = target_size / 31.5
    tx = 54.0 - 23.25 * scale
    ty = 54.0 - 24.75 * scale

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="{size}" height="{size}" fill="none">
{SVG_DEFS}
    <g transform="translate({tx:.4f}, {ty:.4f}) scale({scale:.4f})">
{LOGO_PATHS}
    </g>
</svg>"""


def create_legacy_launcher_svg(size):
    # 48x48 standard icon with rounded rectangle container
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="{size}" height="{size}" fill="none">
{SVG_DEFS}
    <!-- Background Container Tile -->
    <rect width="48" height="48" rx="12" fill="url(#frankBgGrad)" stroke="rgba(59, 130, 246, 0.3)" stroke-width="1.2" />
{LOGO_PATHS}
</svg>"""


def create_legacy_round_launcher_svg(size):
    # 48x48 circular icon. The circular mask has radius 24 at (24, 24).
    # Logo is scaled slightly (target ~28.5) so notch and top beam fit inside the circle with safe padding
    target_size = 28.5
    scale = target_size / 31.5
    tx = 24.0 - 23.25 * scale
    ty = 24.0 - 24.75 * scale

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="{size}" height="{size}" fill="none">
{SVG_DEFS}
    <!-- Circular Background Container -->
    <circle cx="24" cy="24" r="23.4" fill="url(#frankBgGrad)" stroke="rgba(59, 130, 246, 0.3)" stroke-width="1.2" />
    <g transform="translate({tx:.4f}, {ty:.4f}) scale({scale:.4f})">
{LOGO_PATHS}
    </g>
</svg>"""


def generate_all_icons():
    # Density definitions: (folder_name, legacy_size, adaptive_fg_size)
    densities = [
        ("mipmap-mdpi", 48, 108),
        ("mipmap-hdpi", 72, 162),
        ("mipmap-xhdpi", 96, 216),
        ("mipmap-xxhdpi", 144, 324),
        ("mipmap-xxxhdpi", 192, 432),
    ]

    print("Generating Android launcher icons...")

    for folder, leg_size, fg_size in densities:
        folder_path = os.path.join(RES_DIR, folder)
        os.makedirs(folder_path, exist_ok=True)

        # 1. ic_launcher_foreground.png (transparent background, adaptive)
        fg_svg = create_adaptive_foreground_svg(fg_size)
        fg_html = f"""<!DOCTYPE html><html><head><style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            html, body {{ width: {fg_size}px; height: {fg_size}px; background: transparent; overflow: hidden; }}
            svg {{ width: {fg_size}px; height: {fg_size}px; display: block; }}
        </style></head><body>{fg_svg}</body></html>"""
        fg_out = os.path.join(folder_path, "ic_launcher_foreground.png")
        render_html_to_png(fg_html, fg_out, fg_size, fg_size)
        print(f"  -> Generated {fg_out} ({fg_size}x{fg_size})")

        # 2. ic_launcher.png (legacy rounded square)
        leg_svg = create_legacy_launcher_svg(leg_size)
        leg_html = f"""<!DOCTYPE html><html><head><style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            html, body {{ width: {leg_size}px; height: {leg_size}px; background: transparent; overflow: hidden; }}
            svg {{ width: {leg_size}px; height: {leg_size}px; display: block; }}
        </style></head><body>{leg_svg}</body></html>"""
        leg_out = os.path.join(folder_path, "ic_launcher.png")
        render_html_to_png(leg_html, leg_out, leg_size, leg_size)
        print(f"  -> Generated {leg_out} ({leg_size}x{leg_size})")

        # 3. ic_launcher_round.png (legacy circular)
        rnd_svg = create_legacy_round_launcher_svg(leg_size)
        rnd_html = f"""<!DOCTYPE html><html><head><style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            html, body {{ width: {leg_size}px; height: {leg_size}px; background: transparent; overflow: hidden; }}
            svg {{ width: {leg_size}px; height: {leg_size}px; display: block; }}
        </style></head><body>{rnd_svg}</body></html>"""
        rnd_out = os.path.join(folder_path, "ic_launcher_round.png")
        render_html_to_png(rnd_html, rnd_out, leg_size, leg_size)
        print(f"  -> Generated {rnd_out} ({leg_size}x{leg_size})")

    # Generate Google Play store 512x512 icon in scratch
    play_icon_svg = create_legacy_launcher_svg(512)
    play_html = f"""<!DOCTYPE html><html><head><style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        html, body {{ width: 512px; height: 512px; background: transparent; overflow: hidden; }}
        svg {{ width: 512px; height: 512px; display: block; }}
    </style></head><body>{play_icon_svg}</body></html>"""
    play_out = os.path.join(SCRATCH_DIR, "ic_launcher-playstore.png")
    render_html_to_png(play_html, play_out, 512, 512)
    print(f"  -> Generated Play Store Icon {play_out} (512x512)")

    print("All Android launcher icon PNGs successfully generated!")


if __name__ == "__main__":
    generate_all_icons()
