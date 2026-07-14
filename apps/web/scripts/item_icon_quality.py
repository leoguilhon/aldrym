from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image


CANVAS_SIZE = 32
ITEMS_DIR = Path(__file__).resolve().parents[1] / "public" / "assets" / "items"

PRIMARY_REFERENCE_ICON_NAMES = (
    "leather_helmet.png",
    "leather_armor.png",
    "leather_legs.png",
    "leather_boots.png",
)
SECONDARY_REFERENCE_ICON_NAMES = (
    "dagger.png",
    "wooden_shield.png",
    "brown_backpack.png",
)
PROJECT_GENERATED_ICON_NAMES = (
    "arrow.png",
    "bolt.png",
    "bow.png",
    "crossbow.png",
    "quiver.png",
)


@dataclass(frozen=True)
class IconMetrics:
    width: int
    height: int
    bbox_width: int
    bbox_height: int
    alpha_pixels: int
    density: float


@dataclass(frozen=True)
class IconQualityRule:
    min_bbox_width: int
    min_bbox_height: int
    min_alpha_pixels: int
    min_density: float


DEFAULT_ITEM_RULE = IconQualityRule(
    min_bbox_width=22,
    min_bbox_height=24,
    min_alpha_pixels=300,
    min_density=0.38,
)
AMMO_BUNDLE_RULE = IconQualityRule(
    min_bbox_width=28,
    min_bbox_height=24,
    min_alpha_pixels=220,
    min_density=0.25,
)
SPECIFIC_ICON_RULES = {
    "arrow.png": AMMO_BUNDLE_RULE,
    "bolt.png": AMMO_BUNDLE_RULE,
    "bow.png": IconQualityRule(
        min_bbox_width=22,
        min_bbox_height=26,
        min_alpha_pixels=330,
        min_density=0.48,
    ),
    "crossbow.png": IconQualityRule(
        min_bbox_width=28,
        min_bbox_height=24,
        min_alpha_pixels=340,
        min_density=0.40,
    ),
    "quiver.png": IconQualityRule(
        min_bbox_width=22,
        min_bbox_height=28,
        min_alpha_pixels=400,
        min_density=0.55,
    ),
}


def resolve_icon_path(icon_name_or_path: str | Path) -> Path:
    icon_path = Path(icon_name_or_path)
    if icon_path.is_absolute():
        return icon_path
    if icon_path.parent == Path("."):
        return ITEMS_DIR / icon_path.name
    return icon_path


def compute_icon_metrics(icon_path: str | Path) -> IconMetrics:
    image = Image.open(resolve_icon_path(icon_path)).convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        return IconMetrics(
            width=image.width,
            height=image.height,
            bbox_width=0,
            bbox_height=0,
            alpha_pixels=0,
            density=0.0,
        )

    alpha_pixels = sum(1 for pixel_alpha in alpha.getdata() if pixel_alpha)
    bbox_width = bbox[2] - bbox[0]
    bbox_height = bbox[3] - bbox[1]
    density = alpha_pixels / (bbox_width * bbox_height)

    return IconMetrics(
        width=image.width,
        height=image.height,
        bbox_width=bbox_width,
        bbox_height=bbox_height,
        alpha_pixels=alpha_pixels,
        density=density,
    )


def get_quality_rule(icon_name_or_path: str | Path) -> IconQualityRule:
    return SPECIFIC_ICON_RULES.get(Path(icon_name_or_path).name, DEFAULT_ITEM_RULE)


def describe_metrics(metrics: IconMetrics) -> str:
    return (
        f"canvas={metrics.width}x{metrics.height}, "
        f"subject={metrics.bbox_width}x{metrics.bbox_height}, "
        f"alpha={metrics.alpha_pixels}, "
        f"density={metrics.density:.3f}"
    )


def format_primary_reference_summary() -> str:
    parts: list[str] = []
    for icon_name in PRIMARY_REFERENCE_ICON_NAMES:
        parts.append(f"{icon_name}: {describe_metrics(compute_icon_metrics(icon_name))}")
    return "\n".join(parts)


def validate_icon(icon_name_or_path: str | Path) -> list[str]:
    icon_path = resolve_icon_path(icon_name_or_path)
    metrics = compute_icon_metrics(icon_path)
    rule = get_quality_rule(icon_path.name)
    failures: list[str] = []

    if metrics.width != CANVAS_SIZE or metrics.height != CANVAS_SIZE:
        failures.append(f"must stay at {CANVAS_SIZE}x{CANVAS_SIZE}")
    if metrics.alpha_pixels == 0:
        failures.append("cannot be empty")
        return failures
    if metrics.bbox_width < rule.min_bbox_width:
        failures.append(f"subject width {metrics.bbox_width}px is below {rule.min_bbox_width}px")
    if metrics.bbox_height < rule.min_bbox_height:
        failures.append(f"subject height {metrics.bbox_height}px is below {rule.min_bbox_height}px")
    if metrics.alpha_pixels < rule.min_alpha_pixels:
        failures.append(f"alpha pixel count {metrics.alpha_pixels} is below {rule.min_alpha_pixels}")
    if metrics.density < rule.min_density:
        failures.append(f"density {metrics.density:.3f} is below {rule.min_density:.3f}")
    return failures


def validate_project_generated_icons() -> None:
    failures: list[str] = []
    for icon_name in PROJECT_GENERATED_ICON_NAMES:
        icon_failures = validate_icon(icon_name)
        if icon_failures:
            metrics = describe_metrics(compute_icon_metrics(icon_name))
            failures.append(f"{icon_name}: {metrics}; " + "; ".join(icon_failures))

    if failures:
        raise ValueError(
            "Generated item icons failed the Aldrym leather-set quality gate:\n"
            + "\n".join(failures)
        )
