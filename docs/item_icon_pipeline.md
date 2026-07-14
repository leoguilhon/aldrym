# Item Icon Pipeline

All new Aldrym item icons must be produced through the AI-first item icon pipeline.

Do not create item icons with procedural canvas drawing, geometric scripting, SVG-style shape construction, or other code-generated icon shortcuts.

## Benchmark

Use these icons as the primary quality benchmark:

- `apps/web/public/assets/items/leather_helmet.png`
- `apps/web/public/assets/items/leather_armor.png`
- `apps/web/public/assets/items/leather_legs.png`
- `apps/web/public/assets/items/leather_boots.png`

Use these only as secondary category references after the leather-set bar is already matched:

- `apps/web/public/assets/items/dagger.png`
- `apps/web/public/assets/items/wooden_shield.png`
- `apps/web/public/assets/items/brown_backpack.png`

## Required Workflow

1. Generate the item icon through image generation using the benchmark references and a flat chroma-key background.
2. Remove the chroma-key background and keep a clean alpha cutout.
3. Normalize the cutout into the final 32x32 game icon with `python apps/web/scripts/prepare_generated_item_icon.py`.
4. Compare the final PNG side by side with the leather-set benchmark icons at native scale.
5. Run `python apps/web/scripts/validate_item_icons.py` as a technical sanity check for canvas size and subject occupancy.

## Acceptance Rule

Manual visual review against the benchmark is mandatory.

`python apps/web/scripts/validate_item_icons.py` is not a quality oracle. It only verifies technical sanity and must never be used to justify accepting an icon that still looks weaker than the benchmark set.
