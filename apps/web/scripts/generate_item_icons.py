from __future__ import annotations

import shutil
from pathlib import Path

from item_icon_quality import (
    AI_PIPELINE_ITEM_ICON_NAMES,
    format_primary_reference_summary,
    validate_ai_pipeline_item_icons,
)


ROOT_DIR = Path(__file__).resolve().parents[3]
ITEMS_DIR = ROOT_DIR / "apps" / "web" / "public" / "assets" / "items"

CANONICAL_ICON_COPIES = {
    "chipped_dagger.png": "dagger.png",
    "patched_tunic.png": "leather_armor.png",
    "splintered_shield.png": "wooden_shield.png",
}
PRESERVED_ITEM_ICON_NAMES = (
    "arrow.png",
    "bolt.png",
    "bow.png",
    "crossbow.png",
    "quiver.png",
    "leather_helmet.png",
    "leather_legs.png",
    "leather_boots.png",
    "brown_backpack.png",
    "small_axe.png",
    "wooden_club.png",
    "small_health_potion.png",
    "small_mana_potion.png",
    "gold_coin.png",
    "meat.png",
)
AI_FIRST_WORKFLOW_HINT = """\
Do not recreate item icons with procedural canvas code.
Use the AI-first item icon workflow instead:
1. Generate the icon with image generation using the leather-set benchmark references.
2. Remove the chroma-key background.
3. Fit the cutout into a 32x32 canvas with `python apps/web/scripts/prepare_generated_item_icon.py`.
4. Compare the final icon side by side with the leather-set benchmark icons.
5. Run `python apps/web/scripts/validate_item_icons.py` as a technical sanity check.
"""


def copy_icon(source_name: str, target_name: str) -> None:
    source_path = ITEMS_DIR / source_name
    target_path = ITEMS_DIR / target_name

    if not source_path.exists():
        if target_path.exists():
            print(f"Kept existing apps/web/public/assets/items/{target_name}")
            return
        raise FileNotFoundError(
            f"Missing canonical item icon source: {source_path}\n{AI_FIRST_WORKFLOW_HINT}"
        )

    shutil.copyfile(source_path, target_path)
    print(f"Copied apps/web/public/assets/items/{source_name} -> {target_name}")


def keep_icon(name: str) -> None:
    target_path = ITEMS_DIR / name
    if not target_path.exists():
        raise FileNotFoundError(
            f"Missing required item icon: {target_path}\n{AI_FIRST_WORKFLOW_HINT}"
        )
    print(f"Kept existing apps/web/public/assets/items/{name}")


def main() -> None:
    print("Primary item icon benchmark:")
    print(format_primary_reference_summary())
    print("")
    print("AI-first item icon workflow only. Procedural canvas generation is disabled.")

    for source_name, target_name in CANONICAL_ICON_COPIES.items():
        copy_icon(source_name, target_name)

    for icon_name in PRESERVED_ITEM_ICON_NAMES:
        keep_icon(icon_name)

    validate_ai_pipeline_item_icons()
    print("AI-pipeline item icons passed the Aldrym item icon sanity checks.")


if __name__ == "__main__":
    main()
