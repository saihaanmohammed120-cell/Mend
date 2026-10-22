#!/usr/bin/env python3
"""Build Mend's deterministic, code-drawn social and favicon assets."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / ("dist" if (ROOT / "dist" / "fonts").is_dir() else "public")
FONTS = DIST / "fonts"
SCALE = 3
PAPER = "#F5F2EA"
INK = "#18201B"
CORAL = "#FF5B23"
FOREST = "#183E32"


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size * SCALE)


def draw_share() -> Path:
    image = Image.new("RGB", (1200 * SCALE, 630 * SCALE), PAPER)
    draw = ImageDraw.Draw(image)

    def rectangle(bounds, fill, outline=None, width=1):
        draw.rectangle(
            tuple(round(value * SCALE) for value in bounds),
            fill=fill,
            outline=outline,
            width=width * SCALE,
        )

    def text(position, value, face, fill=INK):
        draw.text(
            tuple(round(value * SCALE) for value in position),
            value,
            font=face,
            fill=fill,
            anchor="lt",
        )

    def line(bounds, fill=INK, width=1):
        draw.line(
            tuple(round(value * SCALE) for value in bounds),
            fill=fill,
            width=width * SCALE,
        )

    serif_wordmark = font("mend-fraunces-600.ttf", 46)
    serif_headline = font("mend-fraunces-600.ttf", 88)
    body = font("mend-archivo-400.ttf", 25)
    label = font("mend-archivo-600.ttf", 17)
    footer = font("mend-archivo-400.ttf", 21)

    rectangle((26, 26, 1183, 613), INK)
    rectangle((16, 16, 1173, 603), PAPER, INK, 2)

    rectangle((71, 69, 103, 101), INK)
    rectangle((65, 63, 97, 95), CORAL, INK, 2)
    text((117, 56), "mend", serif_wordmark)
    text((891, 75), "PAPER AND PROOF", label)
    line((65, 128, 1124, 128), width=2)

    text((65, 182), "Code that runs.", serif_headline)
    text((65, 287), "Proof to keep.", serif_headline)
    text((69, 418), "The CSV-cleaner repair, with checks and a source hash.", body)

    # The square mark is the only illustration: the same simple brand geometry
    # used in the favicon, with no simulated execution data or status badges.
    rectangle((986, 225, 1125, 364), INK)
    rectangle((974, 213, 1113, 352), CORAL, INK, 3)

    rectangle((18, 507, 1171, 601), FOREST)
    text((65, 542), "Captured local example · Live Nebius execution not connected", footer, PAPER)

    destination = DIST / "share" / "mend-proof.png"
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.resize((1200, 630), Image.Resampling.LANCZOS).save(
        destination, format="PNG", optimize=False, compress_level=9
    )
    return destination


def draw_favicons() -> tuple[Path, Path]:
    svg = DIST / "favicon.svg"
    svg.write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">\n'
        '  <title>Mend</title>\n'
        f'  <path fill="{INK}" d="M12 12h46v46H12z"/>\n'
        f'  <path fill="{CORAL}" stroke="{INK}" stroke-width="3" '
        'd="M6 6h46v46H6z"/>\n'
        '</svg>\n',
        encoding="utf-8",
    )
    icon = Image.new("RGBA", (192, 192), (0, 0, 0, 0))
    draw = ImageDraw.Draw(icon)
    draw.rectangle((36, 36, 174, 174), fill=INK)
    draw.rectangle((14, 14, 160, 160), fill=INK)
    draw.rectangle((23, 23, 151, 151), fill=CORAL)
    ico = DIST / "favicon.ico"
    icon.resize((64, 64), Image.Resampling.LANCZOS).save(
        ico, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)]
    )
    return svg, ico


def main() -> None:
    DIST.mkdir(parents=True, exist_ok=True)
    paths = (*draw_favicons(), draw_share())
    for path in paths:
        print(path.relative_to(ROOT))


if __name__ == "__main__":
    main()
