from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

from item_icon_quality import format_primary_reference_summary, validate_project_generated_icons


CANVAS_SIZE = 32
UPSCALE = 8
HD_CANVAS_SIZE = CANVAS_SIZE * UPSCALE
ROOT_DIR = Path(__file__).resolve().parents[3]
ITEMS_DIR = ROOT_DIR / "apps" / "web" / "public" / "assets" / "items"

TRANSPARENT = (0, 0, 0, 0)
SHADOW = (8, 5, 3, 84)
OUTLINE = (24, 15, 11, 255)
OUTLINE_SOFT = (49, 31, 21, 170)

LEATHER_DEEP = (66, 39, 22, 255)
LEATHER_DARK = (96, 57, 31, 255)
LEATHER_MID = (139, 86, 49, 255)
LEATHER_LIGHT = (193, 130, 83, 255)
LEATHER_GLOW = (232, 193, 153, 186)

WOOD_DEEP = (70, 44, 24, 255)
WOOD_DARK = (98, 63, 35, 255)
WOOD_MID = (134, 90, 50, 255)
WOOD_LIGHT = (184, 136, 82, 255)

STEEL_DEEP = (83, 77, 74, 255)
STEEL_DARK = (112, 108, 104, 255)
STEEL_MID = (163, 160, 153, 255)
STEEL_LIGHT = (225, 223, 214, 255)
STEEL_GLOW = (246, 244, 237, 188)

GLASS_DARK = (59, 49, 40, 220)
GLASS_MID = (110, 101, 93, 130)
GLASS_LIGHT = (241, 236, 224, 172)
GLASS_GLOW = (255, 249, 236, 204)

RED_DEEP = (94, 24, 26, 255)
RED_DARK = (137, 36, 38, 255)
RED_MID = (188, 64, 62, 255)
RED_LIGHT = (239, 142, 125, 255)

BLUE_DEEP = (35, 54, 108, 255)
BLUE_DARK = (53, 78, 151, 255)
BLUE_MID = (83, 120, 205, 255)
BLUE_LIGHT = (148, 193, 255, 255)


def hd(value: float) -> int:
    return int(round(value * UPSCALE))


def box(*coords: float) -> tuple[int, int, int, int]:
    return tuple(hd(coord) for coord in coords)


def points(vertices: list[tuple[float, float]]) -> list[tuple[int, int]]:
    return [(hd(x), hd(y)) for x, y in vertices]


def create_canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGBA", (HD_CANVAS_SIZE, HD_CANVAS_SIZE), TRANSPARENT)
    return image, ImageDraw.Draw(image)


def save_image(image: Image.Image, name: str) -> None:
    image.save(ITEMS_DIR / name)
    print(f"Saved apps/web/public/assets/items/{name}")


def copy_icon(source_name: str, target_name: str) -> None:
    source_path = ITEMS_DIR / source_name
    target_path = ITEMS_DIR / target_name

    if not source_path.exists():
        if target_path.exists():
            print(f"Kept existing apps/web/public/assets/items/{target_name}")
            return

        raise FileNotFoundError(source_path)

    shutil.copyfile(source_path, target_path)
    print(f"Copied apps/web/public/assets/items/{source_name} -> {target_name}")


def keep_icon(name: str) -> None:
    target_path = ITEMS_DIR / name

    if not target_path.exists():
        raise FileNotFoundError(target_path)

    print(f"Kept existing apps/web/public/assets/items/{name}")


def add_shadow(item: Image.Image) -> Image.Image:
    alpha = item.getchannel("A").filter(ImageFilter.GaussianBlur(hd(0.42)))
    shifted = Image.new("L", item.size, 0)
    shifted.paste(alpha, (hd(0.55), hd(0.85)))

    shadow_layer = Image.new("RGBA", item.size, SHADOW)
    shadow = Image.composite(shadow_layer, Image.new("RGBA", item.size, TRANSPARENT), shifted)

    composed = Image.new("RGBA", item.size, TRANSPARENT)
    composed.alpha_composite(shadow)
    composed.alpha_composite(item)
    return composed


def finalize(image: Image.Image) -> Image.Image:
    downsampled = add_shadow(image).resize((CANVAS_SIZE, CANVAS_SIZE), Image.Resampling.LANCZOS)
    return downsampled.filter(ImageFilter.UnsharpMask(radius=0.6, percent=130, threshold=2))


def draw_line(draw: ImageDraw.ImageDraw, start: tuple[float, float], end: tuple[float, float], fill: tuple[int, int, int, int], width: float) -> None:
    draw.line((hd(start[0]), hd(start[1]), hd(end[0]), hd(end[1])), fill=fill, width=hd(width))


def draw_circle(draw: ImageDraw.ImageDraw, center: tuple[float, float], radius: float, fill: tuple[int, int, int, int], outline: tuple[int, int, int, int] | None = None, width: float = 0.0) -> None:
    left = center[0] - radius
    top = center[1] - radius
    right = center[0] + radius
    bottom = center[1] + radius
    draw.ellipse(box(left, top, right, bottom), fill=fill, outline=outline, width=hd(width) if outline and width else 0)


def draw_leather_helmet() -> Image.Image:
    image, draw = create_canvas()
    draw.polygon(
        points([(7.2, 12.1), (9.4, 8.5), (15.6, 6.8), (22.4, 8.4), (24.9, 12.3), (24.4, 18.8), (21.8, 23.2), (18.0, 25.6), (13.7, 25.6), (10.2, 23.3), (7.8, 19.1)]),
        fill=LEATHER_DARK,
        outline=OUTLINE,
        width=hd(0.9),
    )
    draw.polygon(
        points([(9.1, 12.0), (10.9, 9.5), (15.7, 8.0), (21.0, 9.2), (22.8, 12.0), (22.4, 17.3), (20.4, 20.8), (17.2, 22.9), (14.2, 22.9), (11.5, 21.1), (9.6, 17.4)]),
        fill=LEATHER_MID,
    )
    draw.rounded_rectangle(box(10.2, 12.4, 22.1, 15.4), radius=hd(0.8), fill=LEATHER_LIGHT, outline=OUTLINE_SOFT, width=hd(0.4))
    draw.rounded_rectangle(box(10.7, 13.0, 21.4, 14.2), radius=hd(0.4), fill=LEATHER_GLOW)
    draw.polygon(points([(13.9, 14.0), (17.0, 14.0), (17.7, 22.1), (13.2, 22.1)]), fill=LEATHER_DEEP, outline=OUTLINE_SOFT, width=hd(0.3))
    draw.polygon(points([(8.8, 14.6), (11.2, 14.3), (12.1, 20.8), (10.0, 23.1), (8.8, 20.4)]), fill=LEATHER_DEEP, outline=OUTLINE_SOFT, width=hd(0.3))
    draw.polygon(points([(20.9, 14.4), (23.1, 14.7), (23.1, 20.1), (21.9, 23.0), (19.9, 20.6)]), fill=LEATHER_DEEP, outline=OUTLINE_SOFT, width=hd(0.3))
    draw_line(draw, (10.9, 10.5), (20.6, 10.3), LEATHER_GLOW, 0.45)
    draw_line(draw, (10.8, 11.4), (12.5, 19.0), LEATHER_LIGHT, 0.35)
    draw_line(draw, (20.7, 11.2), (22.0, 18.5), LEATHER_LIGHT, 0.35)
    for x in (11.5, 13.1, 14.7, 16.3, 17.9, 19.5):
        draw_line(draw, (x, 12.8), (x, 14.7), OUTLINE_SOFT, 0.18)
    draw_circle(draw, (11.0, 14.8), 0.42, LEATHER_GLOW)
    draw_circle(draw, (21.2, 14.9), 0.42, LEATHER_GLOW)
    return finalize(image)


def draw_leather_legs() -> Image.Image:
    image, draw = create_canvas()
    draw.rounded_rectangle(box(9.4, 6.8, 22.8, 10.6), radius=hd(0.8), fill=LEATHER_DARK, outline=OUTLINE, width=hd(0.8))
    draw.rounded_rectangle(box(12.8, 7.6, 17.0, 9.8), radius=hd(0.45), fill=LEATHER_LIGHT, outline=OUTLINE_SOFT, width=hd(0.25))
    draw.rounded_rectangle(box(10.0, 9.8, 15.9, 25.4), radius=hd(1.2), fill=LEATHER_DARK, outline=OUTLINE, width=hd(0.8))
    draw.rounded_rectangle(box(16.1, 9.8, 22.0, 25.4), radius=hd(1.2), fill=LEATHER_DARK, outline=OUTLINE, width=hd(0.8))
    draw.rounded_rectangle(box(10.8, 10.8, 15.0, 23.4), radius=hd(0.9), fill=LEATHER_MID)
    draw.rounded_rectangle(box(17.0, 10.8, 21.2, 23.4), radius=hd(0.9), fill=LEATHER_MID)
    draw.rounded_rectangle(box(11.1, 15.1, 14.7, 18.8), radius=hd(0.55), fill=LEATHER_LIGHT, outline=OUTLINE_SOFT, width=hd(0.18))
    draw.rounded_rectangle(box(17.3, 15.1, 20.9, 18.8), radius=hd(0.55), fill=LEATHER_LIGHT, outline=OUTLINE_SOFT, width=hd(0.18))
    draw.rounded_rectangle(box(10.7, 23.4, 15.1, 25.8), radius=hd(0.5), fill=WOOD_DEEP)
    draw.rounded_rectangle(box(17.0, 23.4, 21.4, 25.8), radius=hd(0.5), fill=WOOD_DEEP)
    draw_line(draw, (12.1, 11.0), (12.0, 22.8), LEATHER_GLOW, 0.36)
    draw_line(draw, (18.5, 11.0), (18.4, 22.8), LEATHER_GLOW, 0.36)
    draw_line(draw, (16.0, 11.0), (16.0, 24.2), OUTLINE_SOFT, 0.34)
    return finalize(image)


def draw_leather_boots() -> Image.Image:
    image, draw = create_canvas()
    draw.rounded_rectangle(box(8.0, 9.3, 13.8, 18.8), radius=hd(0.9), fill=LEATHER_DARK, outline=OUTLINE, width=hd(0.75))
    draw.rounded_rectangle(box(18.2, 10.1, 24.0, 19.6), radius=hd(0.9), fill=LEATHER_DARK, outline=OUTLINE, width=hd(0.75))
    draw.rounded_rectangle(box(8.6, 9.8, 13.2, 12.3), radius=hd(0.5), fill=LEATHER_LIGHT, outline=OUTLINE_SOFT, width=hd(0.2))
    draw.rounded_rectangle(box(18.8, 10.6, 23.4, 13.1), radius=hd(0.5), fill=LEATHER_LIGHT, outline=OUTLINE_SOFT, width=hd(0.2))
    draw.polygon(points([(7.6, 18.0), (13.6, 18.0), (16.6, 21.2), (16.2, 24.1), (13.8, 25.4), (8.0, 25.3), (6.9, 23.0)]), fill=LEATHER_MID, outline=OUTLINE, width=hd(0.75))
    draw.polygon(points([(17.3, 18.6), (23.8, 18.7), (25.4, 20.7), (25.0, 23.7), (22.8, 25.3), (17.7, 25.3), (16.7, 22.7)]), fill=LEATHER_MID, outline=OUTLINE, width=hd(0.75))
    draw.rounded_rectangle(box(8.7, 18.6, 13.2, 23.0), radius=hd(0.75), fill=LEATHER_LIGHT)
    draw.rounded_rectangle(box(18.4, 19.2, 22.8, 23.4), radius=hd(0.75), fill=LEATHER_LIGHT)
    draw_line(draw, (10.1, 12.7), (10.2, 17.8), LEATHER_GLOW, 0.3)
    draw_line(draw, (20.1, 13.4), (20.1, 18.7), LEATHER_GLOW, 0.3)
    draw_line(draw, (7.9, 23.9), (14.0, 23.7), OUTLINE_SOFT, 0.32)
    draw_line(draw, (17.6, 24.0), (23.0, 23.8), OUTLINE_SOFT, 0.32)
    return finalize(image)


def draw_small_axe() -> Image.Image:
    image, draw = create_canvas()
    draw_line(draw, (10.8, 24.6), (20.2, 9.3), OUTLINE, 1.9)
    draw_line(draw, (11.0, 24.4), (20.0, 9.5), WOOD_DARK, 1.25)
    draw_line(draw, (11.4, 23.8), (19.4, 10.2), WOOD_MID, 0.62)
    draw_line(draw, (12.0, 22.8), (18.6, 11.2), WOOD_LIGHT, 0.24)
    draw.rounded_rectangle(box(10.7, 22.3, 13.4, 25.6), radius=hd(0.4), fill=WOOD_DEEP, outline=OUTLINE_SOFT, width=hd(0.18))
    for offset in (16.0, 17.1, 18.2):
        draw_line(draw, (offset, 15.0), (offset - 2.4, 18.8), LEATHER_DEEP, 0.22)
    draw.polygon(points([(15.1, 8.6), (18.6, 5.4), (24.3, 5.4), (25.9, 7.2), (24.4, 11.0), (21.0, 13.6), (17.0, 14.2), (14.7, 11.9)]), fill=STEEL_DARK, outline=OUTLINE, width=hd(0.78))
    draw.polygon(points([(16.3, 8.7), (18.9, 6.1), (23.3, 6.1), (24.0, 7.0), (23.0, 10.0), (20.1, 12.0), (17.4, 12.4), (16.0, 10.8)]), fill=STEEL_MID)
    draw.polygon(points([(17.0, 7.7), (19.0, 6.0), (23.0, 6.2), (21.5, 8.4), (18.6, 10.0)]), fill=STEEL_LIGHT)
    draw_line(draw, (16.2, 9.0), (22.3, 6.8), STEEL_GLOW, 0.24)
    draw_circle(draw, (18.1, 11.2), 0.55, WOOD_DEEP, outline=OUTLINE_SOFT, width=0.15)
    return finalize(image)


def draw_wooden_club() -> Image.Image:
    image, draw = create_canvas()
    draw_line(draw, (10.2, 24.8), (19.1, 10.9), OUTLINE, 2.1)
    draw_line(draw, (10.4, 24.5), (18.9, 11.2), WOOD_DEEP, 1.45)
    draw_line(draw, (10.9, 23.8), (18.1, 12.0), WOOD_MID, 0.7)
    draw_line(draw, (11.5, 22.9), (17.4, 12.8), WOOD_LIGHT, 0.24)
    draw.rounded_rectangle(box(9.9, 22.3, 12.4, 25.5), radius=hd(0.35), fill=WOOD_DEEP, outline=OUTLINE_SOFT, width=hd(0.18))
    draw.polygon(points([(16.4, 6.6), (20.4, 5.6), (24.6, 7.1), (25.8, 11.0), (23.9, 14.2), (19.8, 15.1), (16.5, 13.2), (15.2, 9.7)]), fill=WOOD_DARK, outline=OUTLINE, width=hd(0.82))
    draw.polygon(points([(17.0, 7.3), (20.1, 6.6), (23.1, 7.8), (24.0, 10.5), (22.7, 12.5), (20.0, 13.2), (17.4, 11.9), (16.6, 9.6)]), fill=WOOD_MID)
    draw.polygon(points([(18.0, 7.8), (20.4, 7.2), (22.2, 8.0), (21.6, 9.8), (19.6, 10.6), (17.8, 9.8)]), fill=WOOD_LIGHT)
    draw_circle(draw, (22.3, 9.9), 0.55, WOOD_DEEP)
    draw_circle(draw, (19.0, 12.2), 0.42, WOOD_DEEP)
    for offset in (14.2, 15.2, 16.2):
        draw_line(draw, (offset, 16.0), (offset - 2.0, 19.2), LEATHER_DEEP, 0.22)
    return finalize(image)


def draw_potion(liquid_deep: tuple[int, int, int, int], liquid_dark: tuple[int, int, int, int], liquid_mid: tuple[int, int, int, int], liquid_light: tuple[int, int, int, int]) -> Image.Image:
    image, draw = create_canvas()
    draw.rounded_rectangle(box(13.2, 5.6, 18.7, 8.4), radius=hd(0.45), fill=WOOD_LIGHT, outline=OUTLINE, width=hd(0.45))
    draw.rounded_rectangle(box(12.4, 8.0, 19.5, 10.4), radius=hd(0.45), fill=WOOD_DARK, outline=OUTLINE, width=hd(0.45))
    draw.rounded_rectangle(box(9.0, 10.0, 22.8, 24.8), radius=hd(2.3), fill=GLASS_DARK, outline=OUTLINE, width=hd(0.82))
    draw.rounded_rectangle(box(10.0, 10.9, 21.8, 23.8), radius=hd(1.9), fill=GLASS_MID)
    draw.rounded_rectangle(box(11.1, 15.2, 20.7, 22.6), radius=hd(1.4), fill=liquid_deep)
    draw.rounded_rectangle(box(11.7, 16.0, 20.0, 22.1), radius=hd(1.2), fill=liquid_dark)
    draw.rounded_rectangle(box(12.5, 16.8, 19.3, 21.5), radius=hd(0.9), fill=liquid_mid)
    draw.rounded_rectangle(box(13.6, 17.4, 15.0, 21.0), radius=hd(0.45), fill=liquid_light)
    draw.rounded_rectangle(box(12.0, 11.5, 14.0, 20.7), radius=hd(0.55), fill=GLASS_GLOW)
    draw.rounded_rectangle(box(16.0, 12.0, 17.3, 14.0), radius=hd(0.38), fill=GLASS_LIGHT)
    draw_line(draw, (11.6, 22.4), (20.1, 22.4), GLASS_LIGHT, 0.28)
    draw_line(draw, (11.7, 14.5), (20.0, 14.5), OUTLINE_SOFT, 0.25)
    draw_circle(draw, (17.8, 18.8), 0.52, liquid_light)
    return finalize(image)


def draw_arrow() -> Image.Image:
    image, draw = create_canvas()
    arrow_specs = [
        {"offset": (0.0, 0.0), "fletch_dark": RED_DARK, "fletch_light": RED_LIGHT},
        {"offset": (-2.5, 2.1), "fletch_dark": BLUE_DARK, "fletch_light": BLUE_LIGHT},
        {"offset": (2.3, -1.9), "fletch_dark": LEATHER_DARK, "fletch_light": LEATHER_LIGHT},
    ]

    for spec in arrow_specs:
        ox, oy = spec["offset"]
        draw_line(draw, (7.8 + ox, 24.1 + oy), (22.0 + ox, 10.2 + oy), OUTLINE, 1.86)
        draw_line(draw, (8.2 + ox, 23.7 + oy), (21.6 + ox, 10.6 + oy), WOOD_DEEP, 1.22)
        draw_line(draw, (8.8 + ox, 23.0 + oy), (20.9 + ox, 11.3 + oy), WOOD_MID, 0.62)
        draw_line(draw, (9.8 + ox, 22.0 + oy), (19.9 + ox, 12.3 + oy), WOOD_LIGHT, 0.22)
        draw.polygon(
            points([(20.3 + ox, 7.7 + oy), (26.0 + ox, 10.0 + oy), (22.5 + ox, 14.6 + oy), (18.2 + ox, 12.2 + oy)]),
            fill=STEEL_DARK,
            outline=OUTLINE,
            width=hd(0.44),
        )
        draw.polygon(
            points([(20.9 + ox, 8.8 + oy), (24.5 + ox, 10.2 + oy), (22.2 + ox, 13.1 + oy), (19.5 + ox, 11.7 + oy)]),
            fill=STEEL_LIGHT,
        )
        draw.polygon(
            points([(6.1 + ox, 22.4 + oy), (9.7 + ox, 20.4 + oy), (12.0 + ox, 22.5 + oy), (8.9 + ox, 25.7 + oy)]),
            fill=spec["fletch_dark"],
            outline=OUTLINE_SOFT,
            width=hd(0.2),
        )
        draw.polygon(
            points([(5.0 + ox, 24.0 + oy), (7.8 + ox, 21.5 + oy), (10.0 + ox, 23.3 + oy), (7.2 + ox, 26.1 + oy)]),
            fill=spec["fletch_light"],
            outline=OUTLINE_SOFT,
            width=hd(0.18),
        )

    draw.rounded_rectangle(box(12.5, 14.7, 18.6, 18.8), radius=hd(0.6), fill=LEATHER_DARK, outline=OUTLINE_SOFT, width=hd(0.22))
    draw.rounded_rectangle(box(13.2, 15.4, 17.8, 18.0), radius=hd(0.38), fill=LEATHER_LIGHT)
    draw_line(draw, (13.3, 16.1), (17.8, 17.5), LEATHER_MID, 0.18)
    return finalize(image)


def draw_bolt() -> Image.Image:
    image, draw = create_canvas()
    bolt_specs = [
        {"offset": (0.0, 0.0), "tail_dark": BLUE_DARK, "tail_light": BLUE_LIGHT},
        {"offset": (-2.3, 1.9), "tail_dark": RED_DARK, "tail_light": RED_LIGHT},
        {"offset": (2.2, -1.5), "tail_dark": LEATHER_DARK, "tail_light": LEATHER_LIGHT},
    ]

    for spec in bolt_specs:
        ox, oy = spec["offset"]
        draw_line(draw, (8.7 + ox, 23.1 + oy), (22.3 + ox, 10.5 + oy), OUTLINE, 2.06)
        draw_line(draw, (9.0 + ox, 22.8 + oy), (22.0 + ox, 10.8 + oy), WOOD_DEEP, 1.34)
        draw_line(draw, (9.6 + ox, 22.1 + oy), (21.3 + ox, 11.4 + oy), WOOD_MID, 0.56)
        draw.polygon(
            points([(19.7 + ox, 7.8 + oy), (26.1 + ox, 10.4 + oy), (22.6 + ox, 15.1 + oy), (17.9 + ox, 12.4 + oy)]),
            fill=STEEL_DARK,
            outline=OUTLINE,
            width=hd(0.44),
        )
        draw.polygon(
            points([(20.5 + ox, 8.8 + oy), (24.4 + ox, 10.4 + oy), (22.1 + ox, 13.3 + oy), (19.3 + ox, 11.7 + oy)]),
            fill=STEEL_LIGHT,
        )
        draw.polygon(
            points([(6.7 + ox, 21.5 + oy), (10.5 + ox, 20.1 + oy), (12.1 + ox, 22.1 + oy), (9.2 + ox, 25.0 + oy)]),
            fill=spec["tail_dark"],
            outline=OUTLINE_SOFT,
            width=hd(0.2),
        )
        draw.polygon(
            points([(5.7 + ox, 23.1 + oy), (8.6 + ox, 21.3 + oy), (10.5 + ox, 22.9 + oy), (7.9 + ox, 25.5 + oy)]),
            fill=spec["tail_light"],
            outline=OUTLINE_SOFT,
            width=hd(0.18),
        )

    draw.rounded_rectangle(box(12.1, 14.7, 18.0, 18.6), radius=hd(0.5), fill=LEATHER_DEEP, outline=OUTLINE_SOFT, width=hd(0.2))
    draw.rounded_rectangle(box(12.7, 15.2, 17.2, 17.9), radius=hd(0.32), fill=LEATHER_MID)
    draw_line(draw, (12.9, 15.7), (17.0, 17.5), LEATHER_GLOW, 0.18)
    return finalize(image)


def draw_bow() -> Image.Image:
    image, draw = create_canvas()
    draw.polygon(
        points([(9.4, 25.9), (7.5, 22.7), (6.8, 18.3), (7.0, 13.0), (8.3, 8.9), (11.1, 5.4), (14.8, 3.4), (18.3, 3.6), (20.0, 5.9), (19.3, 9.4), (16.7, 13.0), (13.9, 16.3), (12.3, 20.3), (12.0, 24.1)]),
        fill=WOOD_DARK,
        outline=OUTLINE,
        width=hd(0.9),
    )
    draw.polygon(
        points([(10.5, 24.4), (9.0, 21.8), (8.3, 18.4), (8.4, 13.8), (9.6, 10.4), (12.0, 7.3), (15.0, 5.8), (17.2, 6.0), (18.0, 7.2), (17.5, 9.0), (15.5, 11.9), (13.2, 15.0), (11.8, 19.0), (11.4, 22.8)]),
        fill=WOOD_MID,
    )
    draw.line(points([(18.6, 3.9), (20.0, 7.6), (20.3, 12.3), (19.4, 16.7), (17.5, 21.2), (14.8, 25.1)]), fill=OUTLINE, width=hd(1.18))
    draw.line(points([(18.1, 4.6), (19.4, 7.9), (19.6, 12.1), (18.9, 16.1), (17.1, 20.2), (14.6, 24.1)]), fill=WOOD_DEEP, width=hd(0.76))
    draw.line(points([(17.7, 5.2), (18.9, 8.1), (19.0, 12.0), (18.3, 15.6), (16.8, 19.5), (14.4, 23.4)]), fill=WOOD_LIGHT, width=hd(0.24))
    draw_line(draw, (18.6, 4.0), (14.4, 25.0), OUTLINE, 0.62)
    draw_line(draw, (18.2, 4.6), (14.7, 24.2), STEEL_LIGHT, 0.26)
    draw_line(draw, (8.2, 18.5), (21.7, 11.8), OUTLINE, 1.5)
    draw_line(draw, (8.6, 18.2), (21.3, 12.1), WOOD_MID, 0.88)
    draw_line(draw, (9.3, 17.7), (20.5, 12.7), WOOD_LIGHT, 0.22)
    draw.polygon(points([(20.4, 10.6), (26.1, 11.8), (22.4, 16.0), (18.4, 13.4)]), fill=STEEL_DARK, outline=OUTLINE_SOFT, width=hd(0.22))
    draw.polygon(points([(21.0, 11.4), (24.1, 12.0), (22.0, 14.4), (19.7, 13.0)]), fill=STEEL_LIGHT)
    draw.polygon(points([(7.3, 17.2), (9.6, 15.8), (10.9, 17.5), (8.7, 20.0)]), fill=RED_DARK, outline=OUTLINE_SOFT, width=hd(0.18))
    draw.polygon(points([(6.1, 18.0), (8.2, 16.1), (9.7, 17.8), (7.8, 20.5)]), fill=RED_LIGHT, outline=OUTLINE_SOFT, width=hd(0.16))
    draw.rounded_rectangle(box(10.8, 14.3, 15.3, 20.7), radius=hd(0.65), fill=LEATHER_DEEP, outline=OUTLINE_SOFT, width=hd(0.24))
    draw.rounded_rectangle(box(11.4, 15.0, 14.6, 19.7), radius=hd(0.4), fill=LEATHER_LIGHT)
    for y in (15.8, 17.2, 18.6):
        draw_line(draw, (11.2, y), (14.7, y), LEATHER_MID, 0.16)
    return finalize(image)


def draw_crossbow() -> Image.Image:
    image, draw = create_canvas()
    draw.polygon(
        points([(5.8, 11.6), (12.8, 7.7), (20.5, 7.5), (27.2, 10.8), (25.0, 15.0), (16.3, 17.8), (7.5, 17.0)]),
        fill=WOOD_DARK,
        outline=OUTLINE,
        width=hd(0.9),
    )
    draw.polygon(
        points([(7.2, 12.2), (13.2, 9.1), (19.9, 8.9), (24.8, 11.2), (23.2, 13.8), (16.2, 16.0), (8.8, 15.6)]),
        fill=WOOD_MID,
    )
    draw.polygon(
        points([(12.6, 9.5), (19.0, 9.5), (22.7, 11.2), (16.1, 13.9), (10.7, 13.1)]),
        fill=WOOD_LIGHT,
    )
    draw.arc(box(2.7, 4.7, 17.6, 17.5), start=182, end=350, fill=OUTLINE, width=hd(1.12))
    draw.arc(box(3.3, 5.4, 17.0, 16.8), start=182, end=350, fill=STEEL_DARK, width=hd(0.68))
    draw.arc(box(15.6, 4.7, 29.7, 17.6), start=190, end=358, fill=OUTLINE, width=hd(1.12))
    draw.arc(box(16.1, 5.4, 29.1, 16.9), start=190, end=358, fill=STEEL_DARK, width=hd(0.68))
    draw_line(draw, (4.8, 9.8), (25.9, 13.2), STEEL_LIGHT, 0.32)
    draw_line(draw, (6.4, 9.6), (25.9, 12.9), OUTLINE_SOFT, 0.18)
    draw_line(draw, (10.3, 25.6), (18.4, 15.8), OUTLINE, 2.18)
    draw_line(draw, (10.7, 25.2), (18.1, 16.1), WOOD_DEEP, 1.44)
    draw_line(draw, (11.4, 24.5), (17.4, 16.8), WOOD_MID, 0.6)
    draw.rounded_rectangle(box(13.2, 11.3, 18.6, 15.9), radius=hd(0.7), fill=LEATHER_DEEP, outline=OUTLINE_SOFT, width=hd(0.24))
    draw.rounded_rectangle(box(13.9, 12.0, 17.8, 15.0), radius=hd(0.4), fill=LEATHER_LIGHT)
    draw.polygon(points([(22.8, 10.9), (26.4, 11.9), (23.2, 14.1)]), fill=RED_DARK, outline=OUTLINE_SOFT, width=hd(0.18))
    draw.polygon(points([(21.2, 10.6), (24.0, 11.2), (22.0, 12.8)]), fill=STEEL_LIGHT, outline=OUTLINE_SOFT, width=hd(0.14))
    return finalize(image)


def draw_quiver() -> Image.Image:
    image, draw = create_canvas()
    draw.polygon(
        points([(8.8, 7.4), (18.8, 6.5), (22.8, 10.1), (22.9, 22.6), (19.2, 26.4), (11.0, 26.7), (7.7, 23.1), (7.4, 10.5)]),
        fill=LEATHER_DARK,
        outline=OUTLINE,
        width=hd(0.86),
    )
    draw.polygon(
        points([(9.8, 8.5), (18.0, 7.9), (20.7, 10.5), (20.8, 21.9), (18.4, 24.5), (11.8, 24.8), (9.3, 22.0), (9.1, 10.8)]),
        fill=LEATHER_MID,
    )
    draw.polygon(
        points([(10.8, 9.8), (17.6, 9.5), (19.2, 11.2), (19.3, 15.8), (17.4, 18.2), (12.5, 18.5), (10.7, 16.3), (10.6, 11.3)]),
        fill=LEATHER_LIGHT,
    )
    for shaft_x in (11.4, 13.8, 16.2, 18.5):
        draw_line(draw, (shaft_x, 5.7), (shaft_x, 16.0), OUTLINE, 0.72)
        draw_line(draw, (shaft_x + 0.1, 6.0), (shaft_x + 0.1, 15.6), WOOD_DEEP, 0.42)
    draw.polygon(points([(10.4, 3.7), (12.6, 4.5), (11.3, 7.1)]), fill=STEEL_LIGHT, outline=OUTLINE_SOFT, width=hd(0.16))
    draw.polygon(points([(12.8, 2.9), (15.2, 3.7), (13.8, 6.3)]), fill=STEEL_LIGHT, outline=OUTLINE_SOFT, width=hd(0.16))
    draw.polygon(points([(15.3, 3.2), (17.6, 4.0), (16.3, 6.5)]), fill=STEEL_LIGHT, outline=OUTLINE_SOFT, width=hd(0.16))
    draw.polygon(points([(17.7, 3.8), (20.0, 4.7), (18.8, 7.1)]), fill=STEEL_LIGHT, outline=OUTLINE_SOFT, width=hd(0.16))
    draw.arc(box(2.6, 8.1, 18.5, 25.9), start=236, end=340, fill=OUTLINE, width=hd(1.2))
    draw.arc(box(3.2, 8.8, 18.0, 25.2), start=236, end=340, fill=LEATHER_DEEP, width=hd(0.76))
    draw.arc(box(4.0, 9.8, 17.0, 24.1), start=238, end=337, fill=LEATHER_GLOW, width=hd(0.24))
    draw.rounded_rectangle(box(12.0, 18.7, 17.8, 21.2), radius=hd(0.55), fill=LEATHER_DEEP, outline=OUTLINE_SOFT, width=hd(0.18))
    draw.rounded_rectangle(box(12.6, 19.1, 17.1, 20.6), radius=hd(0.35), fill=LEATHER_LIGHT)
    draw_line(draw, (11.9, 10.7), (11.9, 23.0), LEATHER_GLOW, 0.24)
    draw_line(draw, (18.1, 10.2), (18.1, 22.2), OUTLINE_SOFT, 0.18)
    return finalize(image)


def main() -> None:
    print("Primary item icon benchmark:")
    print(format_primary_reference_summary())

    copy_icon("chipped_dagger.png", "dagger.png")
    copy_icon("patched_tunic.png", "leather_armor.png")
    copy_icon("splintered_shield.png", "wooden_shield.png")

    save_image(draw_arrow(), "arrow.png")
    save_image(draw_bolt(), "bolt.png")
    save_image(draw_bow(), "bow.png")
    save_image(draw_crossbow(), "crossbow.png")
    save_image(draw_quiver(), "quiver.png")

    keep_icon("leather_helmet.png")
    keep_icon("leather_legs.png")
    keep_icon("leather_boots.png")
    keep_icon("small_axe.png")
    keep_icon("wooden_club.png")
    keep_icon("small_health_potion.png")
    keep_icon("small_mana_potion.png")

    validate_project_generated_icons()
    print("Generated item icons passed the Aldrym leather-set quality gate.")


if __name__ == "__main__":
    main()
