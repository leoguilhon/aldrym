from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


CANVAS_SIZE = 32


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Crop a transparent generated item image and fit it into a 32x32 icon canvas."
    )
    parser.add_argument("--input", required=True, help="Source PNG with transparency.")
    parser.add_argument("--output", required=True, help="Destination 32x32 PNG path.")
    parser.add_argument(
        "--fit",
        type=int,
        default=28,
        help="Maximum subject width or height inside the 32x32 canvas.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)

    image = Image.open(input_path).convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError(f"{input_path} has no visible subject")

    subject = image.crop(bbox)
    width, height = subject.size
    if width == 0 or height == 0:
        raise ValueError(f"{input_path} produced an empty crop")

    scale = min(args.fit / width, args.fit / height)
    scaled_size = (
        max(1, round(width * scale)),
        max(1, round(height * scale)),
    )
    subject = subject.resize(scaled_size, Image.Resampling.NEAREST)

    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    offset = (
        (CANVAS_SIZE - subject.width) // 2,
        (CANVAS_SIZE - subject.height) // 2,
    )
    canvas.alpha_composite(subject, offset)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path)
    print(f"Saved {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
