from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image, ImageDraw


CANVAS_SIZE = 32
ROOT_DIR = Path(__file__).resolve().parents[3]
ITEMS_DIR = ROOT_DIR / "apps" / "web" / "public" / "assets" / "items"

OUTLINE = (22, 16, 12, 255)
LEATHER_DARK = (70, 42, 24, 255)
LEATHER_MID = (127, 78, 44, 255)
LEATHER_LIGHT = (179, 121, 74, 255)
WOOD_DARK = (82, 53, 26, 255)
WOOD_MID = (125, 82, 42, 255)
WOOD_LIGHT = (175, 126, 76, 255)
STEEL_DARK = (85, 83, 76, 255)
STEEL_MID = (142, 139, 129, 255)
STEEL_LIGHT = (226, 223, 210, 255)
RED_DARK = (105, 24, 26, 255)
RED_MID = (176, 52, 57, 255)
RED_LIGHT = (242, 134, 124, 255)
BLUE_DARK = (36, 55, 111, 255)
BLUE_MID = (69, 105, 187, 255)
BLUE_LIGHT = (132, 182, 255, 255)
GLASS_HIGHLIGHT = (241, 235, 220, 220)
TRANSPARENT = (0, 0, 0, 0)


def create_canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), TRANSPARENT)
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


def draw_leather_helmet() -> Image.Image:
    image, draw = create_canvas()
    draw.polygon([(10, 9), (22, 9), (25, 12), (25, 16), (23, 20), (20, 23), (12, 23), (9, 20), (7, 16), (7, 12)], fill=OUTLINE)
    draw.polygon([(11, 10), (21, 10), (24, 13), (24, 16), (22, 19), (19, 22), (13, 22), (10, 19), (8, 16), (8, 13)], fill=LEATHER_DARK)
    draw.polygon([(12, 11), (20, 11), (22, 13), (22, 16), (20, 18), (18, 20), (14, 20), (12, 18), (10, 16), (10, 13)], fill=LEATHER_MID)
    draw.rectangle((12, 20, 14, 25), fill=OUTLINE)
    draw.rectangle((18, 20, 20, 25), fill=OUTLINE)
    draw.rectangle((13, 20, 14, 24), fill=LEATHER_DARK)
    draw.rectangle((18, 20, 19, 24), fill=LEATHER_DARK)
    draw.rectangle((13, 12, 19, 13), fill=LEATHER_LIGHT)
    draw.rectangle((12, 14, 13, 16), fill=LEATHER_LIGHT)
    return image


def draw_leather_legs() -> Image.Image:
    image, draw = create_canvas()
    draw.rectangle((10, 7, 22, 10), fill=OUTLINE)
    draw.rectangle((11, 8, 21, 10), fill=LEATHER_DARK)
    draw.rectangle((11, 11, 15, 24), fill=OUTLINE)
    draw.rectangle((17, 11, 21, 24), fill=OUTLINE)
    draw.rectangle((12, 11, 15, 23), fill=LEATHER_MID)
    draw.rectangle((17, 11, 20, 23), fill=LEATHER_MID)
    draw.rectangle((12, 14, 13, 20), fill=LEATHER_LIGHT)
    draw.rectangle((17, 14, 18, 20), fill=LEATHER_LIGHT)
    draw.rectangle((12, 24, 15, 26), fill=WOOD_DARK)
    draw.rectangle((17, 24, 20, 26), fill=WOOD_DARK)
    return image


def draw_leather_boots() -> Image.Image:
    image, draw = create_canvas()
    draw.rectangle((8, 12, 14, 22), fill=OUTLINE)
    draw.rectangle((18, 12, 24, 22), fill=OUTLINE)
    draw.rectangle((9, 12, 13, 21), fill=LEATHER_DARK)
    draw.rectangle((19, 12, 23, 21), fill=LEATHER_DARK)
    draw.rectangle((9, 22, 16, 25), fill=OUTLINE)
    draw.rectangle((17, 22, 24, 25), fill=OUTLINE)
    draw.rectangle((9, 22, 15, 24), fill=LEATHER_MID)
    draw.rectangle((17, 22, 23, 24), fill=LEATHER_MID)
    draw.rectangle((10, 14, 11, 19), fill=LEATHER_LIGHT)
    draw.rectangle((20, 14, 21, 19), fill=LEATHER_LIGHT)
    return image


def draw_small_axe() -> Image.Image:
    image, draw = create_canvas()
    draw.line((11, 24, 21, 8), fill=OUTLINE, width=5)
    draw.line((11, 24, 21, 8), fill=WOOD_MID, width=3)
    draw.polygon([(14, 10), (19, 5), (23, 5), (25, 7), (23, 12), (20, 14), (16, 14), (15, 12)], fill=OUTLINE)
    draw.polygon([(15, 10), (19, 6), (22, 6), (23, 7), (22, 11), (19, 13), (17, 13), (16, 11)], fill=STEEL_MID)
    draw.polygon([(16, 9), (19, 6), (22, 6), (21, 8), (18, 10)], fill=STEEL_LIGHT)
    draw.line((12, 23, 20, 9), fill=WOOD_LIGHT, width=1)
    draw.ellipse((9, 22, 13, 26), fill=WOOD_DARK)
    return image


def draw_wooden_club() -> Image.Image:
    image, draw = create_canvas()
    draw.line((10, 24, 21, 9), fill=OUTLINE, width=6)
    draw.line((10, 24, 21, 9), fill=WOOD_DARK, width=4)
    draw.line((11, 23, 20, 10), fill=WOOD_MID, width=2)
    draw.ellipse((16, 5, 25, 13), fill=OUTLINE)
    draw.ellipse((17, 6, 24, 12), fill=WOOD_MID)
    draw.ellipse((18, 7, 22, 10), fill=WOOD_LIGHT)
    draw.ellipse((8, 22, 12, 26), fill=WOOD_DARK)
    return image


def draw_potion(liquid_dark: tuple[int, int, int, int], liquid_mid: tuple[int, int, int, int], liquid_light: tuple[int, int, int, int]) -> Image.Image:
    image, draw = create_canvas()
    draw.rectangle((13, 6, 18, 8), fill=OUTLINE)
    draw.rectangle((14, 6, 17, 7), fill=WOOD_LIGHT)
    draw.rectangle((12, 8, 19, 10), fill=OUTLINE)
    draw.rectangle((13, 9, 18, 10), fill=WOOD_DARK)
    draw.rounded_rectangle((9, 10, 22, 24), radius=3, fill=OUTLINE)
    draw.rounded_rectangle((10, 11, 21, 23), radius=3, fill=(42, 36, 28, 200))
    draw.rounded_rectangle((11, 15, 20, 22), radius=2, fill=liquid_dark)
    draw.rounded_rectangle((12, 16, 19, 21), radius=2, fill=liquid_mid)
    draw.rectangle((13, 17, 14, 20), fill=liquid_light)
    draw.rectangle((13, 12, 14, 15), fill=GLASS_HIGHLIGHT)
    draw.rectangle((16, 12, 17, 13), fill=GLASS_HIGHLIGHT)
    return image


def main() -> None:
    copy_icon("chipped_dagger.png", "dagger.png")
    copy_icon("patched_tunic.png", "leather_armor.png")
    copy_icon("splintered_shield.png", "wooden_shield.png")

    save_image(draw_leather_helmet(), "leather_helmet.png")
    save_image(draw_leather_legs(), "leather_legs.png")
    save_image(draw_leather_boots(), "leather_boots.png")
    save_image(draw_small_axe(), "small_axe.png")
    save_image(draw_wooden_club(), "wooden_club.png")
    save_image(draw_potion(RED_DARK, RED_MID, RED_LIGHT), "small_health_potion.png")
    save_image(draw_potion(BLUE_DARK, BLUE_MID, BLUE_LIGHT), "small_mana_potion.png")


if __name__ == "__main__":
    main()
