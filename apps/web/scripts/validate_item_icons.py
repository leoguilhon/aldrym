from __future__ import annotations

import argparse
from pathlib import Path
import sys

from item_icon_quality import (
    AI_PIPELINE_ITEM_ICON_NAMES,
    compute_icon_metrics,
    describe_metrics,
    format_primary_reference_summary,
    resolve_icon_path,
    validate_icon,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate Aldrym AI-pipeline item icons against the project sanity checks."
    )
    parser.add_argument(
        "icons",
        nargs="*",
        help=(
            "Item icon file names relative to apps/web/public/assets/items or absolute paths. "
            "Defaults to the AI-pipeline item icons."
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    icon_names = args.icons or list(AI_PIPELINE_ITEM_ICON_NAMES)

    print("Primary item icon benchmark:")
    print(format_primary_reference_summary())
    print("")

    failures: list[str] = []
    for icon_name in icon_names:
        icon_path = resolve_icon_path(icon_name)
        metrics = compute_icon_metrics(icon_path)
        issues = validate_icon(icon_path)
        print(f"{Path(icon_name).name}: {describe_metrics(metrics)}")
        if issues:
            failures.append(f"{Path(icon_name).name}: " + "; ".join(issues))

    if failures:
        print("")
        print("Sanity check failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("")
    print("Sanity check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
