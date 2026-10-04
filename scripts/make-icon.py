"""Build the SoraSleep List app icon from the swan mark."""

import base64
import io
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "swans.jpg"


def swan() -> Image.Image:
    im = Image.open(SRC).convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            luma = r * 0.3 + g * 0.55 + b * 0.15
            if luma < 42:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (r, g, b, min(255, int((luma - 36) * 5)))
    box = im.getbbox()
    if not box:
        raise SystemExit("swan mark is empty")
    return im.crop(box)


def rounded(size: int, mark: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    plate = Image.new("RGBA", (size, size), (10, 10, 11, 255))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.22), fill=255)
    canvas.paste(plate, (0, 0), mask)
    pad = int(size * 0.14)
    box = size - pad * 2
    scale = min(box / mark.width, box * 0.72 / mark.height)
    lw = max(1, int(mark.width * scale))
    lh = max(1, int(mark.height * scale))
    logo = mark.resize((lw, lh), Image.Resampling.LANCZOS)
    canvas.paste(logo, ((size - lw) // 2, (size - lh) // 2), logo)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(canvas, (0, 0), mask)
    return out


def main() -> None:
    mark = swan()
    build = ROOT / "build"
    build.mkdir(exist_ok=True)
    public = ROOT / "public"
    grok = public / "__grok"
    grok.mkdir(exist_ok=True)
    rounded(512, mark).save(build / "icon.png", "PNG")
    rounded(512, mark).save(public / "icon-512.png", "PNG")
    rounded(192, mark).save(public / "icon-192.png", "PNG")
    touch = rounded(180, mark)
    touch.save(public / "icon-180.png", "PNG")
    touch.save(grok / "icon-180.png", "PNG")
    i16, i32, i48 = rounded(16, mark), rounded(32, mark), rounded(48, mark)
    i48.save(public / "favicon.ico", format="ICO", append_images=[i16, i32])
    buf = io.BytesIO()
    rounded(64, mark).save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode()
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="SoraSleep List">\n'
        f'  <image width="32" height="32" href="data:image/png;base64,{encoded}"/>\n'
        "</svg>\n"
    )
    (public / "favicon.svg").write_text(svg)
    print("icons ready")


if __name__ == "__main__":
    main()
