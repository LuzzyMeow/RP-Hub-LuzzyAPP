"""Generate Android launcher icons from a source PNG with transparent background.

Generates:
- ic_launcher.png (transparent background, full source image scaled and centered)
- ic_launcher_round.png (transparent background, source image cropped to circle then scaled)

Removes adaptive-icon layer (mipmap-anydpi-v26) to keep transparency on all launchers.
"""
from PIL import Image, ImageDraw
import os
import shutil

SRC = r"c:\Users\Administrator\Desktop\RP-Hub\doc\file_00000000665472078e11ecb33acb38de..png"
RES = r"c:\Users\Administrator\Desktop\RP-Hub\android\app\src\main\res"

# Standard launcher icon sizes (dp -> px per density)
LAUNCHER_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def make_circular_mask(size: int) -> Image.Image:
    """Create a circular mask."""
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size, size), fill=255)
    return mask


def main():
    src = Image.open(SRC).convert("RGBA")
    print(f"Source: {src.size} {src.mode}")

    # Generate ic_launcher.png and ic_launcher_round.png
    for density, size in LAUNCHER_SIZES.items():
        out_dir = os.path.join(RES, density)
        os.makedirs(out_dir, exist_ok=True)

        # Square icon: transparent background, source scaled to fit inside size
        square = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        fitted = src.copy()
        # Leave a small padding so the icon doesn't touch the edges
        padding = max(2, size // 24)
        fitted.thumbnail((size - padding * 2, size - padding * 2), Image.LANCZOS)
        offset = ((size - fitted.width) // 2, (size - fitted.height) // 2)
        square.alpha_composite(fitted, offset)
        square.save(os.path.join(out_dir, "ic_launcher.png"))

        # Round icon: transparent background, source cropped to circle
        round_icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        # Create a circular version of the source
        # First scale source so its shorter dimension fills the desired circle diameter
        circle_diameter = size - padding * 2
        scale = max(circle_diameter / src.width, circle_diameter / src.height)
        new_w = int(src.width * scale)
        new_h = int(src.height * scale)
        scaled = src.resize((new_w, new_h), Image.LANCZOS)
        # Center crop to circle_diameter x circle_diameter
        left = (new_w - circle_diameter) // 2
        top = (new_h - circle_diameter) // 2
        cropped = scaled.crop((left, top, left + circle_diameter, top + circle_diameter))
        # Apply circular mask
        circular = Image.new("RGBA", (circle_diameter, circle_diameter), (0, 0, 0, 0))
        circular.paste(cropped, (0, 0), make_circular_mask(circle_diameter))
        offset = ((size - circle_diameter) // 2, (size - circle_diameter) // 2)
        round_icon.alpha_composite(circular, offset)
        round_icon.save(os.path.join(out_dir, "ic_launcher_round.png"))

        print(f"  {density}: ic_launcher.png + ic_launcher_round.png ({size}x{size})")

    # Remove adaptive-icon layer so Android uses transparent PNGs directly
    anydpi = os.path.join(RES, "mipmap-anydpi-v26")
    if os.path.exists(anydpi):
        shutil.rmtree(anydpi)
        print(f"  Removed {anydpi} (adaptive-icon layer)")

    # Remove legacy foreground PNGs that may conflict
    for density in LAUNCHER_SIZES.keys():
        fg_path = os.path.join(RES, density, "ic_launcher_foreground.png")
        if os.path.exists(fg_path):
            os.remove(fg_path)
            print(f"  Removed {density}/ic_launcher_foreground.png")

    # Remove default vector foreground/background if they exist
    for obsolete in [
        os.path.join(RES, "drawable-v24", "ic_launcher_foreground.xml"),
        os.path.join(RES, "drawable", "ic_launcher_background.xml"),
    ]:
        if os.path.exists(obsolete):
            os.remove(obsolete)
            print(f"  Removed {obsolete}")

    print("\nDone. Icons generated with transparent backgrounds.")


if __name__ == "__main__":
    main()
