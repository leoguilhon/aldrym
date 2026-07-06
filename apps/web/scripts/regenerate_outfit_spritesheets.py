from __future__ import annotations

import itertools
from pathlib import Path

from PIL import Image


FRAME_SIZE = 64
FRAME_COLUMNS = 4
FRAME_ROWS = 4
CONTENT_HEIGHT = 58
OUTFIT_NAMES = ("druid", "hunter", "sorcerer")
ROW_ORDER_BY_OUTFIT: dict[str, tuple[int, int, int, int]] = {
    "druid": (0, 1, 3, 2),
    "sorcerer": (0, 1, 3, 2),
}

ROOT_DIR = Path(__file__).resolve().parents[3]
SOURCE_DIR = ROOT_DIR / "apps" / "web" / "public" / "assets" / "source"
OUTPUT_DIR = ROOT_DIR / "apps" / "web" / "public" / "assets" / "spritesheets" / "outfits"


def get_zero_alpha_runs(alpha: Image.Image, axis: str) -> list[tuple[int, int]]:
    limit = alpha.width if axis == "x" else alpha.height
    zero_indexes: list[int] = []

    for index in range(limit):
        if axis == "x":
            area = alpha.crop((index, 0, index + 1, alpha.height))
        else:
            area = alpha.crop((0, index, alpha.width, index + 1))

        if area.getbbox() is None:
            zero_indexes.append(index)

    runs: list[tuple[int, int]] = []

    for _, group in itertools.groupby(enumerate(zero_indexes), lambda item: item[1] - item[0]):
        grouped = list(group)
        runs.append((grouped[0][1], grouped[-1][1]))

    return runs


def get_content_ranges(zero_runs: list[tuple[int, int]], expected_count: int) -> list[tuple[int, int]]:
    ranges = [(zero_runs[index][1] + 1, zero_runs[index + 1][0] - 1) for index in range(len(zero_runs) - 1)]

    if len(ranges) != expected_count:
        raise ValueError(f"Expected {expected_count} content ranges, found {len(ranges)}")

    return ranges


def fit_frame(frame: Image.Image) -> Image.Image:
    bbox = frame.getbbox()

    if bbox is None:
        raise ValueError("Encountered an empty frame while rebuilding the spritesheet")

    trimmed = frame.crop(bbox)
    scale = CONTENT_HEIGHT / trimmed.height
    output_width = max(1, round(trimmed.width * scale))
    resized = trimmed.resize((output_width, CONTENT_HEIGHT), Image.Resampling.LANCZOS)

    output = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    x = (FRAME_SIZE - output_width) // 2
    y = FRAME_SIZE - CONTENT_HEIGHT
    output.alpha_composite(resized, (x, y))

    return output


def rebuild_outfit_sheet(outfit_name: str) -> None:
    source_path = SOURCE_DIR / f"{outfit_name}-directional-transparent.png"
    output_path = OUTPUT_DIR / f"{outfit_name}.png"

    source_image = Image.open(source_path).convert("RGBA")
    alpha = source_image.getchannel("A")

    column_ranges = get_content_ranges(get_zero_alpha_runs(alpha, "x"), FRAME_COLUMNS)
    row_ranges = get_content_ranges(get_zero_alpha_runs(alpha, "y"), FRAME_ROWS)
    ordered_row_ranges = [row_ranges[index] for index in ROW_ORDER_BY_OUTFIT.get(outfit_name, (0, 1, 2, 3))]

    output_image = Image.new("RGBA", (FRAME_SIZE * FRAME_COLUMNS, FRAME_SIZE * FRAME_ROWS), (0, 0, 0, 0))

    for row_index, (start_y, end_y) in enumerate(ordered_row_ranges):
        for column_index, (start_x, end_x) in enumerate(column_ranges):
            frame = source_image.crop((start_x, start_y, end_x + 1, end_y + 1))
            fitted_frame = fit_frame(frame)
            output_image.alpha_composite(fitted_frame, (column_index * FRAME_SIZE, row_index * FRAME_SIZE))

    output_image.save(output_path)
    print(f"Rebuilt {output_path.relative_to(ROOT_DIR)}")


def main() -> None:
    for outfit_name in OUTFIT_NAMES:
        rebuild_outfit_sheet(outfit_name)


if __name__ == "__main__":
    main()
