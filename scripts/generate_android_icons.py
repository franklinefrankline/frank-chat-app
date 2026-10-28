import os
import subprocess
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
res_dir = root / "android" / "app" / "src" / "main" / "res"
svg_path = root / "assets" / "brand" / "frank-icon.svg"

# Create a clean HTML wrapper to render SVG at 512x512
html_file = root / "temp_render_icon.html"
html_content = f"""<!DOCTYPE html>
<html>
<head>
<style>
  * {{ margin: 0; padding: 0; }}
  body {{ background: transparent; overflow: hidden; }}
  img {{ width: 512px; height: 512px; display: block; }}
</style>
</head>
<body>
  <img src="file:///{str(svg_path).replace(chr(92), '/')}" />
</body>
</html>"""

html_file.write_text(html_content, encoding="utf-8")

# Render using Headless Edge
edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
master_png = root / "frank_icon_512.png"

cmd = [
    edge_path,
    "--headless",
    "--disable-gpu",
    "--default-background-color=00000000",
    "--window-size=512,512",
    f"--screenshot={master_png}",
    f"file:///{str(html_file).replace(chr(92), '/')}"
]

print("Rendering high-res master icon...")
subprocess.run(cmd, check=True)

if not master_png.exists():
    raise RuntimeError("Failed to generate master icon PNG")

img = Image.open(master_png).convert("RGBA")
# Crop / ensure exact 512x512
img = img.resize((512, 512), Image.Resampling.LANCZOS)

# Android mipmap densities and sizes
densities = {
    "mipmap-mdpi": (48, 48),
    "mipmap-hdpi": (72, 72),
    "mipmap-xhdpi": (96, 96),
    "mipmap-xxhdpi": (144, 144),
    "mipmap-xxxhdpi": (192, 192),
}

for folder, size in densities.items():
    target_folder = res_dir / folder
    target_folder.mkdir(parents=True, exist_ok=True)
    
    # 1. Standard launcher icon
    resized = img.resize(size, Image.Resampling.LANCZOS)
    resized.save(target_folder / "ic_launcher.png", format="PNG")
    resized.save(target_folder / "ic_launcher_round.png", format="PNG")
    
    # 2. Foreground for adaptive icon (typically slightly padded or full)
    resized.save(target_folder / "ic_launcher_foreground.png", format="PNG")
    print(f"Generated {folder}: {size[0]}x{size[1]}")

# Clean up temporary files
if html_file.exists():
    html_file.unlink()
if master_png.exists():
    master_png.unlink()

print("All Android launcher icons generated successfully!")
