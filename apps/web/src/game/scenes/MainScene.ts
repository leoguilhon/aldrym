import { getMovementCooldownMs, getMovementTweenDurationMs } from "@aldrym/shared";
import type { Corpse, GroundItem, InventoryMoveTarget, MoveDirection, Position, WorldMonster, WorldPlayer } from "@aldrym/shared";
import Phaser from "phaser";

import {
  getNextPosition,
  getTileCenter,
  getTileType,
  isWalkableTile,
  type LocalMapData
} from "../map/localMap";

interface PlayerView {
  container: Phaser.GameObjects.Container;
  facing: CardinalDirection;
  healthBack: Phaser.GameObjects.Rectangle;
  healthBar: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  manaBack: Phaser.GameObjects.Rectangle;
  manaBar: Phaser.GameObjects.Rectangle;
  outfitTextureKey: OutfitTextureKey;
  shadow: Phaser.GameObjects.Ellipse;
  sprite: Phaser.GameObjects.Sprite;
  walkPhase: number;
}

interface MonsterView {
  alive: boolean;
  container: Phaser.GameObjects.Container;
  facing: CardinalDirection;
  healthBack: Phaser.GameObjects.Rectangle;
  healthBar: Phaser.GameObjects.Rectangle;
  hitArea: Phaser.GameObjects.Zone;
  label: Phaser.GameObjects.Text;
  monsterType: WorldMonster["type"];
  shadow: Phaser.GameObjects.Ellipse;
  sprite: Phaser.GameObjects.Sprite;
  tileMarker: Phaser.GameObjects.Rectangle;
  walkPhase: number;
}

interface CorpseView {
  body: Phaser.GameObjects.Ellipse;
  cloth: Phaser.GameObjects.Rectangle;
  container: Phaser.GameObjects.Container;
  highlight: Phaser.GameObjects.Rectangle;
  hitArea: Phaser.GameObjects.Zone;
  label: Phaser.GameObjects.Text;
  tooltip: Phaser.GameObjects.Text;
}

interface GroundItemView {
  body: Phaser.GameObjects.Image;
  container: Phaser.GameObjects.Container;
  highlight: Phaser.GameObjects.Rectangle;
  hitArea: Phaser.GameObjects.Zone;
  label: Phaser.GameObjects.Text;
  quantity: Phaser.GameObjects.Text;
  tooltip: Phaser.GameObjects.Text;
}

interface RespawnWarningView {
  container: Phaser.GameObjects.Container;
}

export interface MainSceneOptions {
  activeCombatMonsterId?: string | null;
  corpses: Corpse[];
  groundItems: GroundItem[];
  initialPlayers: WorldPlayer[];
  localCharacterId: string;
  map: LocalMapData;
  monsters: WorldMonster[];
  onAttackMonster?: (monsterId: string) => void;
  onMoveCorpse?: (corpseId: string, position: Position) => void;
  onMoveIntent?: (direction: MoveDirection) => void;
  onMoveGroundItem?: (groundItemId: string, position: Position) => void;
  onOpenCorpse?: (corpseId: string) => void;
  onShowNotice?: (message: string) => void;
  onTakeGroundItem?: (groundItemId: string) => void;
  onTakeGroundItemToTarget?: (
    groundItemId: string,
    target: Extract<InventoryMoveTarget, { locationType: "container" | "equipment" }>
  ) => void;
}

const CAMERA_ZOOM = 2;
const ACTOR_NAME_LABEL_COLOR = "#ffffff";
const ACTOR_NAME_LABEL_STROKE = "#000000";
const ACTOR_NAME_LABEL_STROKE_THICKNESS = 2;
const ACTOR_NAME_LABEL_RESOLUTION = 2;
const ACTOR_NAME_LABEL_FONT_FAMILY = '"Palatino Linotype", "Book Antiqua", Georgia, serif';
const PLAYER_NAME_LABEL_DEPTH = 90;
const PLAYER_NAME_LABEL_OFFSET_Y = -29;
const MONSTER_HEALTH_BAR_WIDTH = 24;
const MONSTER_HEALTH_BAR_HEIGHT = 4;
const PLAYER_RESOURCE_BAR_WIDTH = 28;
const PLAYER_RESOURCE_BAR_HEIGHT = 3;
const RESPAWN_WARNING_MS = 3000;
type CardinalDirection = "south" | "north" | "east" | "west";
type AnimationState = "idle" | "walk-a" | "walk-b";
type InventoryContainerOrEquipmentTarget = Extract<InventoryMoveTarget, { locationType: "container" | "equipment" }>;
type AutoInteraction =
  | { type: "open-corpse"; corpseId: string }
  | { type: "move-corpse"; corpseId: string; position: Position }
  | { type: "take-ground-item"; groundItemId: string }
  | { type: "take-ground-item-to-target"; groundItemId: string; target: InventoryContainerOrEquipmentTarget }
  | { type: "move-ground-item"; groundItemId: string; position: Position };
const tileTextureKeys = {
  dirt: "tile-dirt",
  grass: "tile-grass",
  stone: "tile-stone",
  wall: "tile-wall",
  water: "tile-water"
} as const;
const monsterTextureKeys: Record<WorldMonster["type"], string> = {
  rat: "monster-rat",
  troll: "monster-troll"
};
const outfitTextureKeys = {
  druid: "outfit-druid",
  hunter: "outfit-hunter",
  knight: "outfit-knight",
  sorcerer: "outfit-sorcerer"
} as const;
type OutfitTextureKey = (typeof outfitTextureKeys)[keyof typeof outfitTextureKeys];
const itemTextureKeys = {
  brown_backpack: "item-brown-backpack",
  dagger: "item-dagger",
  gold_coin: "item-gold-coin",
  leather_armor: "item-leather-armor",
  leather_boots: "item-leather-boots",
  leather_helmet: "item-leather-helmet",
  leather_legs: "item-leather-legs",
  meat: "item-meat",
  small_axe: "item-small-axe",
  small_health_potion: "item-small-health-potion",
  small_mana_potion: "item-small-mana-potion",
  wooden_club: "item-wooden-club",
  wooden_shield: "item-wooden-shield"
} as const;
const cardinalDirections: CardinalDirection[] = ["south", "north", "east", "west"];
const pathMoveDirections: MoveDirection[] = ["up-left", "up-right", "down-left", "down-right", "up", "down", "left", "right"];

export class MainScene extends Phaser.Scene {
  private activeCombatMonsterId: string | null;
  private readonly localCharacterId: string;
  private readonly map: LocalMapData;
  private readonly onAttackMonster?: (monsterId: string) => void;
  private readonly onMoveCorpse?: (corpseId: string, position: Position) => void;
  private readonly onMoveIntent?: (direction: MoveDirection) => void;
  private readonly onMoveGroundItem?: (groundItemId: string, position: Position) => void;
  private readonly onOpenCorpse?: (corpseId: string) => void;
  private readonly onShowNotice?: (message: string) => void;
  private readonly onTakeGroundItem?: (groundItemId: string) => void;
  private readonly onTakeGroundItemToTarget?: (
    groundItemId: string,
    target: InventoryContainerOrEquipmentTarget
  ) => void;
  private readonly pressedMovementCodes = new Set<string>();
  private nextMoveAt = 0;
  private isSceneReady = false;
  private pendingCorpses: Corpse[];
  private pendingGroundItems: GroundItem[];
  private pendingMonsters: WorldMonster[];
  private pendingPlayers: WorldPlayer[];
  private readonly corpseViews = new Map<string, CorpseView>();
  private readonly groundItemViews = new Map<string, GroundItemView>();
  private readonly monsterViews = new Map<string, MonsterView>();
  private readonly playerViews = new Map<string, PlayerView>();
  private readonly respawnWarningTimers = new Map<string, Phaser.Time.TimerEvent>();
  private readonly respawnWarningViews = new Map<string, RespawnWarningView>();
  private clickWalkTarget: Position | null = null;
  private draggedCorpseId: string | null = null;
  private draggedGroundItemId: string | null = null;
  private hoveredCorpseId: string | null = null;
  private hoveredGroundItemId: string | null = null;
  private pendingAutoInteraction: AutoInteraction | null = null;

  constructor(options: MainSceneOptions) {
    super({ key: "main-scene" });
    this.activeCombatMonsterId = options.activeCombatMonsterId ?? null;
    this.localCharacterId = options.localCharacterId;
    this.map = options.map;
    this.onAttackMonster = options.onAttackMonster;
    this.onMoveCorpse = options.onMoveCorpse;
    this.onMoveIntent = options.onMoveIntent;
    this.onMoveGroundItem = options.onMoveGroundItem;
    this.onOpenCorpse = options.onOpenCorpse;
    this.onShowNotice = options.onShowNotice;
    this.onTakeGroundItem = options.onTakeGroundItem;
    this.onTakeGroundItemToTarget = options.onTakeGroundItemToTarget;
    this.pendingCorpses = options.corpses;
    this.pendingGroundItems = options.groundItems;
    this.pendingMonsters = options.monsters;
    this.pendingPlayers = options.initialPlayers;
  }

  preload(): void {
    this.load.image(tileTextureKeys.grass, "/assets/tiles/grass.png");
    this.load.image(tileTextureKeys.dirt, "/assets/tiles/dirt.png");
    this.load.image(tileTextureKeys.stone, "/assets/tiles/stone.png");
    this.load.image(tileTextureKeys.water, "/assets/tiles/water.png");
    this.load.image(tileTextureKeys.wall, "/assets/tiles/wall.png");
    this.load.spritesheet(monsterTextureKeys.rat, "/assets/spritesheets/monsters/rat.png", {
      frameHeight: 64,
      frameWidth: 64
    });
    this.load.spritesheet(monsterTextureKeys.troll, "/assets/spritesheets/monsters/troll.png", {
      frameHeight: 96,
      frameWidth: 96
    });
    this.load.spritesheet(outfitTextureKeys.knight, "/assets/spritesheets/outfits/knight.png", {
      frameHeight: 64,
      frameWidth: 64
    });
    this.load.spritesheet(outfitTextureKeys.druid, "/assets/spritesheets/outfits/druid.png", {
      frameHeight: 64,
      frameWidth: 64
    });
    this.load.spritesheet(outfitTextureKeys.sorcerer, "/assets/spritesheets/outfits/sorcerer.png", {
      frameHeight: 64,
      frameWidth: 64
    });
    this.load.spritesheet(outfitTextureKeys.hunter, "/assets/spritesheets/outfits/hunter.png", {
      frameHeight: 64,
      frameWidth: 64
    });
    this.load.image(itemTextureKeys.dagger, "/assets/items/dagger.png");
    this.load.image(itemTextureKeys.gold_coin, "/assets/items/gold_coin.png");
    this.load.image(itemTextureKeys.brown_backpack, "/assets/items/brown_backpack.png");
    this.load.image(itemTextureKeys.leather_armor, "/assets/items/leather_armor.png");
    this.load.image(itemTextureKeys.leather_boots, "/assets/items/leather_boots.png");
    this.load.image(itemTextureKeys.leather_helmet, "/assets/items/leather_helmet.png");
    this.load.image(itemTextureKeys.leather_legs, "/assets/items/leather_legs.png");
    this.load.image(itemTextureKeys.meat, "/assets/items/meat.png");
    this.load.image(itemTextureKeys.small_axe, "/assets/items/small_axe.png");
    this.load.image(itemTextureKeys.small_health_potion, "/assets/items/small_health_potion.png");
    this.load.image(itemTextureKeys.small_mana_potion, "/assets/items/small_mana_potion.png");
    this.load.image(itemTextureKeys.wooden_club, "/assets/items/wooden_club.png");
    this.load.image(itemTextureKeys.wooden_shield, "/assets/items/wooden_shield.png");
  }

  create(): void {
    this.createDirectionalAnimations();
    this.drawMap();
    this.createControls();
    this.configureCamera();
    this.isSceneReady = true;
    this.syncCorpses(this.pendingCorpses);
    this.syncGroundItems(this.pendingGroundItems);
    this.syncMonsters(this.pendingMonsters);
    this.syncPlayers(this.pendingPlayers);
    window.addEventListener("aldrym:item-drag-start", this.clearMovementInput);
    window.addEventListener("aldrym:ground-item-target-drop", this.handleGroundItemTargetDrop);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.resetCorpseCursor());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      window.removeEventListener("aldrym:item-drag-start", this.clearMovementInput);
      window.removeEventListener("aldrym:ground-item-target-drop", this.handleGroundItemTargetDrop);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this);
      this.resetCorpseCursor();
    });
  }

  update(time: number): void {
    if (!this.onMoveIntent || time < this.nextMoveAt) {
      return;
    }

    const direction = this.getRequestedDirection();

    if (direction) {
      this.clickWalkTarget = null;
      this.pendingAutoInteraction = null;
      this.emitMoveIntent(direction, time);
      return;
    }

    const clickWalkDirection = this.getClickWalkDirection();

    if (!clickWalkDirection) {
      return;
    }

    this.emitMoveIntent(clickWalkDirection, time);
  }

  private emitMoveIntent(direction: MoveDirection, time: number): void {
    this.nextMoveAt = time + getMovementCooldownMs(this.getLocalPlayerLevel(), direction);
    this.onMoveIntent?.(direction);
  }

  setMonsters(monsters: WorldMonster[]): void {
    this.pendingMonsters = monsters.map((monster) => ({ ...monster }));

    if (this.isSceneReady) {
      this.syncMonsters(this.pendingMonsters);
    }
  }

  setActiveCombatMonsterId(monsterId: string | null): void {
    if (this.activeCombatMonsterId === monsterId) {
      return;
    }

    this.activeCombatMonsterId = monsterId;

    if (this.isSceneReady) {
      this.syncMonsterTargetMarkers();
    }
  }

  setPlayers(players: WorldPlayer[]): void {
    this.pendingPlayers = players.map((player) => ({ ...player }));

    if (this.isSceneReady) {
      this.syncPlayers(this.pendingPlayers);
      this.flushPendingAutoInteraction();
    }
  }

  setCorpses(corpses: Corpse[]): void {
    this.pendingCorpses = corpses.map((corpse) => ({ ...corpse, items: corpse.items.map((item) => ({ ...item })) }));

    if (this.isSceneReady) {
      this.syncCorpses(this.pendingCorpses);
    }
  }

  setGroundItems(groundItems: GroundItem[]): void {
    this.pendingGroundItems = groundItems.map((groundItem) => ({ ...groundItem }));

    if (this.isSceneReady) {
      this.syncGroundItems(this.pendingGroundItems);
    }
  }

  showMonsterDamage(monsterId: string, damage: number): void {
    const view = this.monsterViews.get(monsterId);

    if (!view || damage <= 0) {
      return;
    }

    this.spawnFloatingDamageText(view.container.x, view.container.y - 28, damage);
  }

  showPlayerDamage(characterId: string, damage: number): void {
    const view = this.playerViews.get(characterId);

    if (!view || damage <= 0) {
      return;
    }

    this.spawnFloatingDamageText(view.container.x, view.container.y - 30, damage);
  }

  getTilePositionFromClientPoint(clientX: number, clientY: number): Position | null {
    const rect = this.game.canvas.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const canvasX = (clientX - rect.left) * (this.game.canvas.width / rect.width);
    const canvasY = (clientY - rect.top) * (this.game.canvas.height / rect.height);
    const worldPoint = this.cameras.main.getWorldPoint(canvasX, canvasY);
    const tileX = Math.floor(worldPoint.x / this.map.tileSize);
    const tileY = Math.floor(worldPoint.y / this.map.tileSize);

    if (tileX < 0 || tileY < 0 || tileX >= this.map.width || tileY >= this.map.height) {
      return null;
    }

    return {
      x: tileX,
      y: tileY,
      z: 0
    };
  }

  private drawMap(): void {
    const worldWidth = this.map.width * this.map.tileSize;
    const worldHeight = this.map.height * this.map.tileSize;
    const background = this.add.rectangle(0, 0, worldWidth, worldHeight, 0x120c08, 1);

    background.setOrigin(0);

    for (let y = 0; y < this.map.height; y += 1) {
      for (let x = 0; x < this.map.width; x += 1) {
        const tileType = getTileType(this.map, x, y);

        if (!tileType) {
          continue;
        }

        const worldX = x * this.map.tileSize;
        const worldY = y * this.map.tileSize;
        const tile = this.add.image(worldX, worldY, tileTextureKeys[tileType]);

        tile.setOrigin(0);
        tile.setDisplaySize(this.map.tileSize, this.map.tileSize);
        tile.setDepth(tileType === "wall" ? 3 : 1);
      }
    }
  }

  private createControls(): void {
    const keyboard = this.input.keyboard;

    if (!keyboard) {
      return;
    }

    this.input.mouse?.disableContextMenu();
    keyboard.on("keydown", (event: KeyboardEvent) => {
      if (this.isMovementCode(event.code)) {
        event.preventDefault();
        this.pressedMovementCodes.add(event.code);
      }
    });
    keyboard.on("keyup", (event: KeyboardEvent) => {
      if (this.isMovementCode(event.code)) {
        event.preventDefault();
        this.pressedMovementCodes.delete(event.code);
      }
    });
  }

  private configureCamera(): void {
    const worldWidth = this.map.width * this.map.tileSize;
    const worldHeight = this.map.height * this.map.tileSize;
    const camera = this.cameras.main;

    camera.setBackgroundColor(0x120c08);
    camera.setBounds(0, 0, worldWidth, worldHeight);
    camera.setRoundPixels(true);
    camera.setZoom(CAMERA_ZOOM);
  }

  private createDirectionalAnimations(): void {
    const animatedTextureKeys = [
      ...Object.values(outfitTextureKeys),
      ...Object.values(monsterTextureKeys)
    ];

    for (const textureKey of animatedTextureKeys) {
      for (const [directionIndex, direction] of cardinalDirections.entries()) {
        const rowStartFrame = directionIndex * 4;
        this.createAnimationIfMissing(this.getAnimationKey(textureKey, direction, "idle"), textureKey, [rowStartFrame], 1);
        this.createAnimationIfMissing(
          this.getAnimationKey(textureKey, direction, "walk-a"),
          textureKey,
          [rowStartFrame, rowStartFrame + 2, rowStartFrame, rowStartFrame + 3],
          8
        );
        this.createAnimationIfMissing(
          this.getAnimationKey(textureKey, direction, "walk-b"),
          textureKey,
          [rowStartFrame, rowStartFrame + 3, rowStartFrame, rowStartFrame + 2],
          8
        );
      }
    }
  }

  private createAnimationIfMissing(key: string, textureKey: string, frames: number[], frameRate: number): void {
    if (this.anims.exists(key)) {
      this.anims.remove(key);
    }

    this.anims.create({
      key,
      frames: frames.map((frame) => ({
        key: textureKey,
        frame
      })),
      frameRate,
      repeat: -1
    });
  }

  private getAnimationKey(textureKey: string, direction: CardinalDirection, state: AnimationState): string {
    return `${textureKey}-${direction}-${state}`;
  }

  private playDirectionalAnimation(
    sprite: Phaser.GameObjects.Sprite,
    textureKey: string,
    direction: CardinalDirection,
    state: AnimationState
  ): void {
    sprite.anims.play(this.getAnimationKey(textureKey, direction, state), true);
  }

  private takeNextWalkAnimationState(view: { walkPhase: number }): AnimationState {
    const state = view.walkPhase % 2 === 0 ? "walk-a" : "walk-b";
    view.walkPhase += 1;

    return state;
  }

  private inferFacingDirection(
    from: Pick<Position, "x" | "y">,
    to: Pick<Position, "x" | "y">,
    fallback: CardinalDirection
  ): CardinalDirection {
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;

    if (deltaX === 0 && deltaY === 0) {
      return fallback;
    }

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      return deltaX > 0 ? "east" : "west";
    }

    return deltaY > 0 ? "south" : "north";
  }

  private inferTweenMoveDirection(from: Pick<Position, "x" | "y">, to: Pick<Position, "x" | "y">): MoveDirection | undefined {
    const deltaX = Math.sign(to.x - from.x);
    const deltaY = Math.sign(to.y - from.y);

    if (deltaX < 0 && deltaY < 0) {
      return "up-left";
    }

    if (deltaX > 0 && deltaY < 0) {
      return "up-right";
    }

    if (deltaX < 0 && deltaY > 0) {
      return "down-left";
    }

    if (deltaX > 0 && deltaY > 0) {
      return "down-right";
    }

    if (deltaY < 0) {
      return "up";
    }

    if (deltaY > 0) {
      return "down";
    }

    if (deltaX < 0) {
      return "left";
    }

    if (deltaX > 0) {
      return "right";
    }

    return undefined;
  }

  private getRequestedDirection(): MoveDirection | null {
    if (this.pressedMovementCodes.has("KeyQ")) {
      return "up-left";
    }

    if (this.pressedMovementCodes.has("KeyE")) {
      return "up-right";
    }

    if (this.pressedMovementCodes.has("KeyZ")) {
      return "down-left";
    }

    if (this.pressedMovementCodes.has("KeyC")) {
      return "down-right";
    }

    if (this.pressedMovementCodes.has("ArrowUp") || this.pressedMovementCodes.has("KeyW")) {
      return "up";
    }

    if (this.pressedMovementCodes.has("ArrowDown") || this.pressedMovementCodes.has("KeyS")) {
      return "down";
    }

    if (this.pressedMovementCodes.has("ArrowLeft") || this.pressedMovementCodes.has("KeyA")) {
      return "left";
    }

    if (this.pressedMovementCodes.has("ArrowRight") || this.pressedMovementCodes.has("KeyD")) {
      return "right";
    }

    return null;
  }

  private getClickWalkDirection(): MoveDirection | null {
    if (!this.clickWalkTarget) {
      return null;
    }

    const localPlayer = this.getLocalPlayerPosition();

    if (!localPlayer || localPlayer.z !== this.clickWalkTarget.z) {
      this.clickWalkTarget = null;
      return null;
    }

    if (this.isSameTile(localPlayer, this.clickWalkTarget)) {
      this.clickWalkTarget = null;
      return null;
    }

    const path = this.findPathToTile(localPlayer, this.clickWalkTarget);

    if (path.length === 0) {
      this.clickWalkTarget = null;
      return null;
    }

    return path[0];
  }

  private findPathToTile(start: Position, target: Position): MoveDirection[] {
    if (!this.isTileAvailableForClickWalk(target)) {
      return [];
    }

    const startKey = this.getPositionKey(start);
    const targetKey = this.getPositionKey(target);
    const queue: Position[] = [start];
    const visited = new Set<string>([startKey]);
    const cameFrom = new Map<string, { direction: MoveDirection; previousKey: string }>();

    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      const sortedDirections = this.getPathDirectionsToward(current, target);

      for (const direction of sortedDirections) {
        const nextPosition = getNextPosition(current, direction);
        const nextKey = this.getPositionKey(nextPosition);

        if (visited.has(nextKey) || !this.isTileAvailableForClickWalk(nextPosition)) {
          continue;
        }

        cameFrom.set(nextKey, {
          direction,
          previousKey: this.getPositionKey(current)
        });

        if (nextKey === targetKey) {
          return this.reconstructPath(cameFrom, startKey, targetKey);
        }

        visited.add(nextKey);
        queue.push(nextPosition);
      }
    }

    return [];
  }

  private getPathDirectionsToward(current: Position, target: Position): MoveDirection[] {
    const deltaX = Math.sign(target.x - current.x);
    const deltaY = Math.sign(target.y - current.y);
    const preferredDirections: MoveDirection[] = [];

    if (deltaX < 0 && deltaY < 0) {
      preferredDirections.push("up-left");
    } else if (deltaX > 0 && deltaY < 0) {
      preferredDirections.push("up-right");
    } else if (deltaX < 0 && deltaY > 0) {
      preferredDirections.push("down-left");
    } else if (deltaX > 0 && deltaY > 0) {
      preferredDirections.push("down-right");
    }

    if (deltaY < 0) {
      preferredDirections.push("up");
    } else if (deltaY > 0) {
      preferredDirections.push("down");
    }

    if (deltaX < 0) {
      preferredDirections.push("left");
    } else if (deltaX > 0) {
      preferredDirections.push("right");
    }

    return [...preferredDirections, ...pathMoveDirections.filter((direction) => !preferredDirections.includes(direction))];
  }

  private reconstructPath(
    cameFrom: Map<string, { direction: MoveDirection; previousKey: string }>,
    startKey: string,
    targetKey: string
  ): MoveDirection[] {
    const path: MoveDirection[] = [];
    let currentKey = targetKey;

    while (currentKey !== startKey) {
      const step = cameFrom.get(currentKey);

      if (!step) {
        return [];
      }

      path.unshift(step.direction);
      currentKey = step.previousKey;
    }

    return path;
  }

  private getLocalPlayerPosition(): Position | null {
    const player = this.pendingPlayers.find((worldPlayer) => worldPlayer.characterId === this.localCharacterId);

    return player ? { x: player.x, y: player.y, z: player.z } : null;
  }

  private isInDirectContact(left: Pick<Position, "x" | "y" | "z">, right: Pick<Position, "x" | "y" | "z">): boolean {
    if (left.z !== right.z) {
      return false;
    }

    return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y)) <= 1;
  }

  private runOrQueueAutoInteraction(source: Position, action: AutoInteraction, failureMessage: string): void {
    const localPlayer = this.getLocalPlayerPosition();

    if (!localPlayer) {
      this.onShowNotice?.("You need to enter the world first.");
      return;
    }

    if (this.isInDirectContact(localPlayer, source)) {
      this.pendingAutoInteraction = null;
      this.clickWalkTarget = null;
      this.executeAutoInteraction(action);
      return;
    }

    const interactionPosition = this.findReachableInteractionPosition(localPlayer, source);

    if (!interactionPosition) {
      this.pendingAutoInteraction = null;
      this.clickWalkTarget = null;
      this.onShowNotice?.(failureMessage);
      return;
    }

    this.pendingAutoInteraction = action;
    this.pressedMovementCodes.clear();
    this.clickWalkTarget = interactionPosition;
  }

  private findReachableInteractionPosition(localPlayer: Position, source: Position): Position | null {
    if (localPlayer.z !== source.z) {
      return null;
    }

    const candidates: Position[] = [];

    for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        candidates.push({
          x: source.x + xOffset,
          y: source.y + yOffset,
          z: source.z
        });
      }
    }

    const reachableCandidates = candidates
      .filter((candidate) => this.isTileAvailableForClickWalk(candidate))
      .map((candidate) => {
        if (this.isSameTile(localPlayer, candidate)) {
          return {
            candidate,
            pathLength: 0
          };
        }

        const path = this.findPathToTile(localPlayer, candidate);

        return {
          candidate,
          pathLength: path.length > 0 ? path.length : Number.POSITIVE_INFINITY
        };
      })
      .filter((candidate) => Number.isFinite(candidate.pathLength))
      .sort((left, right) => {
        if (left.pathLength !== right.pathLength) {
          return left.pathLength - right.pathLength;
        }

        const leftDistance = Math.max(Math.abs(left.candidate.x - localPlayer.x), Math.abs(left.candidate.y - localPlayer.y));
        const rightDistance = Math.max(Math.abs(right.candidate.x - localPlayer.x), Math.abs(right.candidate.y - localPlayer.y));

        return leftDistance - rightDistance;
      });

    return reachableCandidates[0]?.candidate ?? null;
  }

  private flushPendingAutoInteraction(): void {
    if (!this.pendingAutoInteraction) {
      return;
    }

    const source = this.getAutoInteractionSource(this.pendingAutoInteraction);
    const localPlayer = this.getLocalPlayerPosition();

    if (!source || !localPlayer) {
      this.pendingAutoInteraction = null;
      this.clickWalkTarget = null;
      return;
    }

    if (!this.isInDirectContact(localPlayer, source)) {
      return;
    }

    const action = this.pendingAutoInteraction;
    this.pendingAutoInteraction = null;
    this.clickWalkTarget = null;
    this.executeAutoInteraction(action);
  }

  private getAutoInteractionSource(action: AutoInteraction): Position | null {
    if (action.type === "open-corpse" || action.type === "move-corpse") {
      const corpse = this.pendingCorpses.find((currentCorpse) => currentCorpse.id === action.corpseId);
      return corpse ? { x: corpse.x, y: corpse.y, z: corpse.z } : null;
    }

    const groundItem = this.pendingGroundItems.find((currentGroundItem) => currentGroundItem.id === action.groundItemId);
    return groundItem ? { x: groundItem.x, y: groundItem.y, z: groundItem.z } : null;
  }

  private executeAutoInteraction(action: AutoInteraction): void {
    switch (action.type) {
      case "open-corpse":
        this.onOpenCorpse?.(action.corpseId);
        return;
      case "move-corpse":
        this.onMoveCorpse?.(action.corpseId, action.position);
        return;
      case "take-ground-item":
        this.onTakeGroundItem?.(action.groundItemId);
        return;
      case "take-ground-item-to-target":
        this.onTakeGroundItemToTarget?.(action.groundItemId, action.target);
        return;
      case "move-ground-item":
        this.onMoveGroundItem?.(action.groundItemId, action.position);
        return;
    }
  }

  private isTileAvailableForClickWalk(position: Position): boolean {
    if (!isWalkableTile(this.map, position)) {
      return false;
    }

    return !this.pendingMonsters.some((monster) => monster.alive && this.isSameTile(monster, position));
  }

  private isSameTile(left: Pick<Position, "x" | "y" | "z">, right: Pick<Position, "x" | "y" | "z">): boolean {
    return left.x === right.x && left.y === right.y && left.z === right.z;
  }

  private getPositionKey(position: Pick<Position, "x" | "y" | "z">): string {
    return `${position.x}:${position.y}:${position.z}`;
  }

  private isMovementCode(code: string): boolean {
    return (
      code === "ArrowUp" ||
      code === "ArrowDown" ||
      code === "ArrowLeft" ||
      code === "ArrowRight" ||
      code === "KeyW" ||
      code === "KeyA" ||
      code === "KeyS" ||
      code === "KeyD" ||
      code === "KeyQ" ||
      code === "KeyE" ||
      code === "KeyZ" ||
      code === "KeyC"
    );
  }

  private readonly clearMovementInput = (): void => {
    this.pressedMovementCodes.clear();
    this.clickWalkTarget = null;
    this.pendingAutoInteraction = null;
  };

  private readonly handleGroundItemTargetDrop = (event: Event): void => {
    const detail = (event as CustomEvent<{
      groundItemId?: string;
      target?: InventoryContainerOrEquipmentTarget;
    }>).detail;
    const groundItemId = detail?.groundItemId?.trim();
    const target = detail?.target;

    if (!groundItemId || !target || (target.locationType !== "container" && target.locationType !== "equipment")) {
      return;
    }

    const groundItem = this.pendingGroundItems.find((currentGroundItem) => currentGroundItem.id === groundItemId);

    if (!groundItem) {
      this.onShowNotice?.("That item is no longer on the ground.");
      return;
    }

    this.runOrQueueAutoInteraction(
      groundItem,
      {
        type: "take-ground-item-to-target",
        groundItemId,
        target
      },
      "There is no path to that item."
    );
  };

  private readonly handlePointerUp = (pointer: Phaser.Input.Pointer): void => {
    const corpseId = this.draggedCorpseId;
    const groundItemId = this.draggedGroundItemId;
    this.draggedCorpseId = null;
    this.draggedGroundItemId = null;

    const position = this.getTilePositionFromWorldPoint(pointer.worldX, pointer.worldY);

    if (!position) {
      return;
    }

    if (corpseId) {
      const corpse = this.pendingCorpses.find((currentCorpse) => currentCorpse.id === corpseId);

      if (!corpse) {
        this.onShowNotice?.("That corpse is gone.");
        return;
      }

      if (this.isSameTile(corpse, position)) {
        return;
      }

      const localPlayer = this.getLocalPlayerPosition();

      if (!localPlayer || !this.isInDirectContact(localPlayer, corpse)) {
        this.runOrQueueAutoInteraction(
          corpse,
          {
            type: "move-corpse",
            corpseId,
            position
          },
          "There is no path to that corpse."
        );
        return;
      }

      this.onMoveCorpse?.(corpseId, position);
      return;
    }

    if (groundItemId) {
      const groundItem = this.pendingGroundItems.find((currentGroundItem) => currentGroundItem.id === groundItemId);

      if (!groundItem) {
        this.onShowNotice?.("That item is no longer on the ground.");
        return;
      }

      const localPlayer = this.getLocalPlayerPosition();

      if (!localPlayer || !this.isInDirectContact(localPlayer, groundItem)) {
        this.runOrQueueAutoInteraction(
          groundItem,
          {
            type: "move-ground-item",
            groundItemId,
            position
          },
          "There is no path to that item."
        );
        return;
      }

      this.onMoveGroundItem?.(groundItemId, position);
      return;
    }

    if (pointer.button !== 0 || !this.onMoveIntent) {
      return;
    }

    this.pressedMovementCodes.clear();
    this.clickWalkTarget = this.isTileAvailableForClickWalk(position) ? position : null;
  };

  private getTilePositionFromWorldPoint(worldX: number, worldY: number): Position | null {
    const tileX = Math.floor(worldX / this.map.tileSize);
    const tileY = Math.floor(worldY / this.map.tileSize);

    if (tileX < 0 || tileY < 0 || tileX >= this.map.width || tileY >= this.map.height) {
      return null;
    }

    return {
      x: tileX,
      y: tileY,
      z: 0
    };
  }

  private syncPlayers(players: WorldPlayer[]): void {
    const activeCharacterIds = new Set(players.map((player) => player.characterId));

    for (const player of players) {
      this.upsertPlayerView(player);
    }

    for (const [characterId, view] of this.playerViews.entries()) {
      if (!activeCharacterIds.has(characterId)) {
        view.container.destroy(true);
        view.label.destroy();
        this.playerViews.delete(characterId);
      }
    }

    const localPlayerView = this.playerViews.get(this.localCharacterId);

    if (localPlayerView) {
      this.cameras.main.startFollow(localPlayerView.container, true, 0.2, 0.2);
    }
  }

  private syncMonsters(monsters: WorldMonster[]): void {
    const knownMonsterIds = new Set(monsters.map((monster) => monster.id));

    for (const monster of monsters) {
      this.upsertMonsterView(monster);
      this.syncRespawnWarning(monster);
    }

    for (const [monsterId, view] of this.monsterViews.entries()) {
      if (!knownMonsterIds.has(monsterId)) {
        view.container.destroy(true);
        this.monsterViews.delete(monsterId);
      }
    }

    for (const monsterId of this.respawnWarningViews.keys()) {
      if (!knownMonsterIds.has(monsterId)) {
        this.clearRespawnWarning(monsterId);
      }
    }
  }

  private syncCorpses(corpses: Corpse[]): void {
    const knownCorpseIds = new Set(corpses.map((corpse) => corpse.id));

    for (const corpse of corpses) {
      this.upsertCorpseView(corpse);
    }

    for (const [corpseId, view] of this.corpseViews.entries()) {
      if (!knownCorpseIds.has(corpseId)) {
        this.destroyCorpseView(corpseId, view);
        this.corpseViews.delete(corpseId);
      }
    }
  }

  private syncGroundItems(groundItems: GroundItem[]): void {
    const knownGroundItemIds = new Set(groundItems.map((groundItem) => groundItem.id));

    for (const groundItem of groundItems) {
      this.upsertGroundItemView(groundItem);
    }

    for (const [groundItemId, view] of this.groundItemViews.entries()) {
      if (!knownGroundItemIds.has(groundItemId)) {
        this.destroyGroundItemView(groundItemId, view);
        this.groundItemViews.delete(groundItemId);
      }
    }
  }

  private upsertPlayerView(player: WorldPlayer): void {
    const existingView = this.playerViews.get(player.characterId);
    const { x, y } = getTileCenter(this.map, player);

    if (!existingView) {
      this.playerViews.set(player.characterId, this.createPlayerView(player, x, y));
      return;
    }

    existingView.label.setText(player.name);
    this.updatePlayerResourceBars(existingView, player);
    this.tweens.killTweensOf(existingView.container);
    this.tweens.killTweensOf(existingView.label);
    const nextDirection = this.inferFacingDirection(existingView.container, { x, y }, existingView.facing);
    const isMoving = existingView.container.x !== x || existingView.container.y !== y;
    existingView.facing = nextDirection;
    const nextOutfitTextureKey = this.getPlayerOutfitTextureKey(player);

    if (existingView.outfitTextureKey !== nextOutfitTextureKey) {
      existingView.outfitTextureKey = nextOutfitTextureKey;
      existingView.sprite.setTexture(nextOutfitTextureKey);
    }

    if (!isMoving) {
      existingView.label.setPosition(x, y + PLAYER_NAME_LABEL_OFFSET_Y);
      this.playDirectionalAnimation(existingView.sprite, existingView.outfitTextureKey, existingView.facing, "idle");
      return;
    }

    this.playDirectionalAnimation(
      existingView.sprite,
      existingView.outfitTextureKey,
      existingView.facing,
      this.takeNextWalkAnimationState(existingView)
    );
    const movementDuration = getMovementTweenDurationMs(player.level, this.inferTweenMoveDirection(existingView.container, { x, y }));
    this.tweens.add({
      targets: existingView.container,
      x,
      y,
      duration: movementDuration,
      ease: "Linear",
      onComplete: () => {
        this.playDirectionalAnimation(existingView.sprite, existingView.outfitTextureKey, existingView.facing, "idle");
      }
    });
    this.tweens.add({
      targets: existingView.label,
      x,
      y: y + PLAYER_NAME_LABEL_OFFSET_Y,
      duration: movementDuration,
      ease: "Linear"
    });
  }

  private createPlayerView(player: WorldPlayer, x: number, y: number): PlayerView {
    const isLocalPlayer = player.characterId === this.localCharacterId;
    const outfitTextureKey = this.getPlayerOutfitTextureKey(player);
    const label = this.createActorNameLabel(x, y + PLAYER_NAME_LABEL_OFFSET_Y, player.name, "9px");
    const healthBack = this.add.rectangle(-PLAYER_RESOURCE_BAR_WIDTH / 2 - 1, -26, PLAYER_RESOURCE_BAR_WIDTH + 2, PLAYER_RESOURCE_BAR_HEIGHT + 2, 0x1b0f0a, 0.95);
    const healthBar = this.add.rectangle(-PLAYER_RESOURCE_BAR_WIDTH / 2, -26, PLAYER_RESOURCE_BAR_WIDTH, PLAYER_RESOURCE_BAR_HEIGHT, 0x1fa143, 1);
    const manaBack = this.add.rectangle(-PLAYER_RESOURCE_BAR_WIDTH / 2 - 1, -21, PLAYER_RESOURCE_BAR_WIDTH + 2, PLAYER_RESOURCE_BAR_HEIGHT + 2, 0x1b0f0a, 0.95);
    const manaBar = this.add.rectangle(-PLAYER_RESOURCE_BAR_WIDTH / 2, -21, PLAYER_RESOURCE_BAR_WIDTH, PLAYER_RESOURCE_BAR_HEIGHT, 0x2f6fd4, 1);
    const shadow = this.add.ellipse(0, 8, 18, 10, 0x000000, 0.28);
    const sprite = this.add.sprite(0, 14, outfitTextureKey, 0);

    healthBack.setOrigin(0, 0.5);
    healthBack.setStrokeStyle(1, 0xf0d18c, 0.22);
    healthBar.setOrigin(0, 0.5);
    manaBack.setOrigin(0, 0.5);
    manaBack.setStrokeStyle(1, 0xf0d18c, 0.22);
    manaBar.setOrigin(0, 0.5);
    sprite.setOrigin(0.5, 1);
    sprite.setDisplaySize(34, 34);
    this.playDirectionalAnimation(sprite, outfitTextureKey, "south", "idle");
    const view = {
      facing: "south" as CardinalDirection,
      container: this.add.container(x, y, [shadow, sprite, healthBack, healthBar, manaBack, manaBar]),
      healthBack,
      healthBar,
      label,
      manaBack,
      manaBar,
      outfitTextureKey,
      shadow,
      sprite,
      walkPhase: 0
    };

    view.container.setDepth(isLocalPlayer ? 20 : 16);
    label.setDepth(PLAYER_NAME_LABEL_DEPTH);
    this.updatePlayerResourceBars(view, player);

    return view;
  }

  private getPlayerOutfitTextureKey(player: WorldPlayer): OutfitTextureKey {
    return outfitTextureKeys[player.characterClass] ?? outfitTextureKeys.knight;
  }

  private updatePlayerResourceBars(view: Pick<PlayerView, "healthBar" | "manaBar">, player: WorldPlayer): void {
    const healthRatio = player.maxHealth > 0 ? Phaser.Math.Clamp(player.health / player.maxHealth, 0, 1) : 0;
    const manaRatio = player.maxMana > 0 ? Phaser.Math.Clamp(player.mana / player.maxMana, 0, 1) : 0;

    view.healthBar.setDisplaySize(Math.max(0, Math.ceil(PLAYER_RESOURCE_BAR_WIDTH * healthRatio)), PLAYER_RESOURCE_BAR_HEIGHT);
    view.manaBar.setDisplaySize(Math.max(0, Math.ceil(PLAYER_RESOURCE_BAR_WIDTH * manaRatio)), PLAYER_RESOURCE_BAR_HEIGHT);
  }

  private upsertCorpseView(corpse: Corpse): void {
    const existingView = this.corpseViews.get(corpse.id);
    const { x, y } = getTileCenter(this.map, corpse);

    if (!existingView) {
      this.corpseViews.set(corpse.id, this.createCorpseView(corpse, x, y));
      return;
    }

    existingView.container.setPosition(x, y);
    existingView.label.setText(this.getCorpseLabel(corpse));
    existingView.body.setFillStyle(corpse.isEmpty ? 0x4b3a2f : 0x6c4c34, 1);
    existingView.cloth.setFillStyle(corpse.isEmpty ? 0x6f5b46 : 0x9b7143, 0.65);
  }

  private createCorpseView(corpse: Corpse, x: number, y: number): CorpseView {
    const highlight = this.add.rectangle(0, 0, this.map.tileSize - 5, this.map.tileSize - 5, 0x6c4c34, 0.08);
    const label = this.add.text(0, -17, this.getCorpseLabel(corpse), {
      color: "#f7df9f",
      fontFamily: "Georgia",
      fontSize: "9px",
      stroke: "#120c08",
      strokeThickness: 3
    });
    const hitArea = this.add.zone(0, 0, this.map.tileSize, this.map.tileSize);
    const shadow = this.add.ellipse(0, 8, 22, 8, 0x000000, 0.24);
    const body = this.add.ellipse(0, 3, 22, 12, corpse.isEmpty ? 0x4b3a2f : 0x6c4c34, 1);
    const cloth = this.add.rectangle(2, 1, 12, 4, corpse.isEmpty ? 0x6f5b46 : 0x9b7143, 0.65);
    const tooltip = this.add.text(0, -31, "Drag corpse / Right-click open", {
      backgroundColor: "#2b1a10",
      color: "#f7df9f",
      fontFamily: "Georgia",
      fontSize: "8px",
      padding: { x: 3, y: 2 },
      stroke: "#120c08",
      strokeThickness: 2
    });

    highlight.setStrokeStyle(1, 0xc9a25d, 0.62);
    label.setOrigin(0.5, 1);
    body.setStrokeStyle(1, 0x2e1a10, 1);
    cloth.setAngle(-12);
    tooltip.setOrigin(0.5, 1);
    tooltip.setVisible(false);
    hitArea.setOrigin(0.5);
    hitArea.setInteractive();
    hitArea.on("pointerover", () => {
      this.setCorpseHoverState(corpse.id, true);
    });
    hitArea.on("pointerout", () => {
      this.setCorpseHoverState(corpse.id, false);
    });
    hitArea.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 2) {
        const currentCorpse = this.pendingCorpses.find((pendingCorpse) => pendingCorpse.id === corpse.id) ?? corpse;

        this.runOrQueueAutoInteraction(
          currentCorpse,
          {
            type: "open-corpse",
            corpseId: corpse.id
          },
          "There is no path to that corpse."
        );
        return;
      }

      if (pointer.button === 0) {
        this.draggedCorpseId = corpse.id;
        this.pressedMovementCodes.clear();
        this.clickWalkTarget = null;
      }
    });

    const container = this.add.container(x, y, [highlight, hitArea, shadow, body, cloth, label, tooltip]);
    container.setDepth(14);

    return {
      body,
      cloth,
      container,
      highlight,
      hitArea,
      label,
      tooltip
    };
  }

  private destroyCorpseView(corpseId: string, view: CorpseView): void {
    if (this.hoveredCorpseId === corpseId) {
      this.hoveredCorpseId = null;
      this.resetCorpseCursor();
    }

    view.hitArea.removeAllListeners();
    view.container.destroy(true);
  }

  private setCorpseHoverState(corpseId: string, isHovered: boolean): void {
    const view = this.corpseViews.get(corpseId);

    if (!view) {
      return;
    }

    if (isHovered) {
      this.hoveredCorpseId = corpseId;
      view.highlight.setFillStyle(0xc9a25d, 0.18);
      view.highlight.setStrokeStyle(2, 0xf0d18c, 1);
      view.tooltip.setVisible(true);
      this.setCorpseCursor("pointer");
      return;
    }

    if (this.hoveredCorpseId === corpseId) {
      this.hoveredCorpseId = null;
      this.resetCorpseCursor();
    }

    view.highlight.setFillStyle(0x6c4c34, 0.08);
    view.highlight.setStrokeStyle(1, 0xc9a25d, 0.62);
    view.tooltip.setVisible(false);
  }

  private setCorpseCursor(cursor: string): void {
    const canvas = this.game.canvas;

    if (canvas) {
      canvas.style.cursor = cursor;
    }
  }

  private resetCorpseCursor(): void {
    this.setCorpseCursor("");
  }

  private upsertGroundItemView(groundItem: GroundItem): void {
    const existingView = this.groundItemViews.get(groundItem.id);
    const { x, y } = getTileCenter(this.map, groundItem);

    if (!existingView) {
      this.groundItemViews.set(groundItem.id, this.createGroundItemView(groundItem, x, y));
      return;
    }

    existingView.container.setPosition(x, y);
    existingView.label.setText(this.getGroundItemLabel(groundItem));
    existingView.tooltip.setText(this.getGroundItemLabel(groundItem));
    existingView.body.setTexture(this.getItemTextureKey(groundItem.itemKey));
    this.updateGroundItemSpriteSize(existingView.body, groundItem.itemKey);
    existingView.quantity.setText(groundItem.quantity > 1 ? String(groundItem.quantity) : "");
  }

  private createGroundItemView(groundItem: GroundItem, x: number, y: number): GroundItemView {
    const highlight = this.add.rectangle(0, 0, this.map.tileSize - 8, this.map.tileSize - 8, 0xc9a25d, 0.06);
    const hitArea = this.add.zone(0, 0, this.map.tileSize, this.map.tileSize);
    const shadow = this.add.ellipse(0, 8, 18, 7, 0x000000, 0.24);
    const body = this.add.image(0, 3, this.getItemTextureKey(groundItem.itemKey));
    const quantity = this.add.text(9, 7, groundItem.quantity > 1 ? String(groundItem.quantity) : "", {
      color: "#fff1bf",
      fontFamily: "Georgia",
      fontSize: "8px",
      stroke: "#120c08",
      strokeThickness: 2
    });
    const label = this.add.text(0, -14, this.getGroundItemLabel(groundItem), {
      color: "#f7df9f",
      fontFamily: "Georgia",
      fontSize: "8px",
      stroke: "#120c08",
      strokeThickness: 3
    });
    const tooltip = this.add.text(0, -29, this.getGroundItemLabel(groundItem), {
      backgroundColor: "#2b1a10",
      color: "#f7df9f",
      fontFamily: "Georgia",
      fontSize: "8px",
      padding: { x: 3, y: 2 },
      stroke: "#120c08",
      strokeThickness: 2
    });

    highlight.setStrokeStyle(1, 0xc9a25d, 0.48);
    body.setOrigin(0.5);
    this.updateGroundItemSpriteSize(body, groundItem.itemKey);
    quantity.setOrigin(1, 1);
    label.setOrigin(0.5, 1);
    label.setVisible(false);
    tooltip.setOrigin(0.5, 1);
    tooltip.setVisible(false);
    hitArea.setOrigin(0.5);
    hitArea.setInteractive();
    hitArea.on("pointerover", () => {
      this.setGroundItemHoverState(groundItem.id, true);
    });
    hitArea.on("pointerout", () => {
      this.setGroundItemHoverState(groundItem.id, false);
    });
    hitArea.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 2) {
        const currentGroundItem = this.pendingGroundItems.find((pendingGroundItem) => pendingGroundItem.id === groundItem.id) ?? groundItem;

        this.runOrQueueAutoInteraction(
          currentGroundItem,
          {
            type: "take-ground-item",
            groundItemId: groundItem.id
          },
          "There is no path to that item."
        );
        return;
      }

      if (pointer.button === 0) {
        this.draggedGroundItemId = groundItem.id;
        this.pressedMovementCodes.clear();
        window.dispatchEvent(
          new CustomEvent("aldrym:ground-item-drag-start", {
            detail: {
              clientX: pointer.event instanceof MouseEvent ? pointer.event.clientX : 0,
              clientY: pointer.event instanceof MouseEvent ? pointer.event.clientY : 0,
              groundItemId: groundItem.id,
              itemKey: groundItem.itemKey
            }
          })
        );
      }
    });

    const container = this.add.container(x, y, [highlight, hitArea, shadow, body, quantity, label, tooltip]);
    container.setDepth(13);

    return {
      body,
      container,
      highlight,
      hitArea,
      label,
      quantity,
      tooltip
    };
  }

  private getItemTextureKey(itemKey: string): string {
    return itemTextureKeys[itemKey as keyof typeof itemTextureKeys] ?? itemTextureKeys.gold_coin;
  }

  private updateGroundItemSpriteSize(sprite: Phaser.GameObjects.Image, itemKey: string): void {
    if (itemKey === "brown_backpack") {
      sprite.setDisplaySize(21, 21);
      return;
    }

    if (itemKey === "wooden_shield" || itemKey === "leather_armor") {
      sprite.setDisplaySize(20, 20);
      return;
    }

    if (itemKey === "leather_helmet" || itemKey === "leather_legs" || itemKey === "leather_boots") {
      sprite.setDisplaySize(19, 19);
      return;
    }

    if (itemKey === "small_health_potion" || itemKey === "small_mana_potion") {
      sprite.setDisplaySize(17, 17);
      return;
    }

    if (itemKey === "small_axe" || itemKey === "wooden_club") {
      sprite.setDisplaySize(20, 20);
      return;
    }

    sprite.setDisplaySize(18, 18);
  }

  private destroyGroundItemView(groundItemId: string, view: GroundItemView): void {
    if (this.hoveredGroundItemId === groundItemId) {
      this.hoveredGroundItemId = null;
      this.resetCorpseCursor();
    }

    view.hitArea.removeAllListeners();
    view.container.destroy(true);
  }

  private setGroundItemHoverState(groundItemId: string, isHovered: boolean): void {
    const view = this.groundItemViews.get(groundItemId);

    if (!view) {
      return;
    }

    if (isHovered) {
      this.hoveredGroundItemId = groundItemId;
      view.highlight.setFillStyle(0xc9a25d, 0.18);
      view.highlight.setStrokeStyle(2, 0xf0d18c, 1);
      view.tooltip.setVisible(true);
      this.setCorpseCursor("pointer");
      return;
    }

    if (this.hoveredGroundItemId === groundItemId) {
      this.hoveredGroundItemId = null;
      this.resetCorpseCursor();
    }

    view.highlight.setFillStyle(0xc9a25d, 0.06);
    view.highlight.setStrokeStyle(1, 0xc9a25d, 0.48);
    view.tooltip.setVisible(false);
  }

  private upsertMonsterView(monster: WorldMonster): void {
    const existingView = this.monsterViews.get(monster.id);
    const { x, y } = getTileCenter(this.map, monster);

    if (!existingView) {
      this.monsterViews.set(monster.id, this.createMonsterView(monster, x, y));
      return;
    }

    if (!existingView.alive && monster.alive) {
      this.tweens.killTweensOf(existingView.container);
      existingView.container.setPosition(x, y);
      existingView.facing = "south";
      this.updateMonsterView(existingView, monster);
      this.playDirectionalAnimation(existingView.sprite, monsterTextureKeys[monster.type], existingView.facing, "idle");
      return;
    }

    const nextDirection = this.inferFacingDirection(existingView.container, { x, y }, existingView.facing);
    const isMoving = existingView.container.x !== x || existingView.container.y !== y;
    existingView.facing = nextDirection;

    if (existingView.container.x !== x || existingView.container.y !== y) {
      this.tweens.killTweensOf(existingView.container);
      this.playDirectionalAnimation(
        existingView.sprite,
        monsterTextureKeys[monster.type],
        existingView.facing,
        this.takeNextWalkAnimationState(existingView)
      );
      this.tweens.add({
        targets: existingView.container,
        x,
        y,
        duration: getMovementTweenDurationMs(monster.level, this.inferTweenMoveDirection(existingView.container, { x, y })),
        ease: "Linear",
        onComplete: () => {
          this.playDirectionalAnimation(existingView.sprite, monsterTextureKeys[monster.type], existingView.facing, "idle");
        }
      });
    } else if (monster.alive && !isMoving) {
      this.playDirectionalAnimation(existingView.sprite, monsterTextureKeys[monster.type], existingView.facing, "idle");
    }

    this.updateMonsterView(existingView, monster);
  }

  private getLocalPlayerLevel(): number {
    return this.pendingPlayers.find((player) => player.characterId === this.localCharacterId)?.level ?? 1;
  }

  private createMonsterView(monster: WorldMonster, x: number, y: number): MonsterView {
    const metrics = this.getMonsterVisualMetrics(monster.type);
    const label = this.createActorNameLabel(0, metrics.labelY, this.getMonsterLabel(monster), "9px");
    const shadow = this.add.ellipse(0, 8, 18, 9, 0x000000, 0.24);
    const tileMarker = this.add.rectangle(0, 0, this.map.tileSize - 4, this.map.tileSize - 4, 0x000000, 0);
    const sprite = this.add.sprite(0, metrics.spriteY, monsterTextureKeys[monster.type], 0);
    const healthBack = this.add.rectangle(
      -MONSTER_HEALTH_BAR_WIDTH / 2 - 1,
      metrics.healthY,
      MONSTER_HEALTH_BAR_WIDTH + 2,
      MONSTER_HEALTH_BAR_HEIGHT + 2,
      0x23140d,
      1
    );
    const healthBar = this.add.rectangle(
      -MONSTER_HEALTH_BAR_WIDTH / 2,
      metrics.healthY,
      MONSTER_HEALTH_BAR_WIDTH,
      MONSTER_HEALTH_BAR_HEIGHT,
      0x9f3d2c,
      1
    );
    const hitArea = this.add.zone(0, 0, this.map.tileSize, this.map.tileSize);

    this.updateMonsterTileMarker(tileMarker, monster);
    sprite.setOrigin(0.5, 1);
    this.updateMonsterSpriteSize(sprite, monster.type);
    healthBack.setOrigin(0, 0.5);
    healthBack.setStrokeStyle(1, 0xf0d18c, 0.24);
    healthBar.setOrigin(0, 0.5);
    hitArea.setOrigin(0.5);
    hitArea.setInteractive();

    const container = this.add.container(x, y, [hitArea, tileMarker, shadow, sprite, healthBack, healthBar, label]);
    container.setDepth(40);
    hitArea.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 2) {
        this.onAttackMonster?.(monster.id);
      }
    });

    const view = {
      alive: monster.alive,
      container,
      facing: "south" as CardinalDirection,
      healthBack,
      healthBar,
      hitArea,
      label,
      monsterType: monster.type,
      shadow,
      sprite,
      tileMarker,
      walkPhase: 0
    };

    this.updateMonsterView(view, monster);
    this.playDirectionalAnimation(sprite, monsterTextureKeys[monster.type], view.facing, "idle");
    return view;
  }

  private updateMonsterView(view: MonsterView, monster: WorldMonster): void {
    if (!monster.alive) {
      this.updateMonsterCorpseView(view, monster);
      return;
    }

    this.updateMonsterAliveView(view, monster);
  }

  private updateMonsterAliveView(view: MonsterView, monster: WorldMonster): void {
    const healthRatio = monster.maxHealth > 0 ? Phaser.Math.Clamp(monster.health / monster.maxHealth, 0, 1) : 0;
    const metrics = this.getMonsterVisualMetrics(monster.type);

    view.alive = true;
    view.container.setDepth(40);
    view.label.setVisible(true);
    view.label.setPosition(0, metrics.labelY);
    view.label.setText(this.getMonsterLabel(monster));
    view.healthBack.setVisible(true);
    view.healthBack.setPosition(-MONSTER_HEALTH_BAR_WIDTH / 2 - 1, metrics.healthY);
    view.healthBar.setVisible(true);
    view.healthBar.setPosition(-MONSTER_HEALTH_BAR_WIDTH / 2, metrics.healthY);
    view.sprite.setVisible(true);
    if (view.monsterType !== monster.type) {
      view.monsterType = monster.type;
      view.sprite.setTexture(monsterTextureKeys[monster.type]);
      this.playDirectionalAnimation(view.sprite, monsterTextureKeys[monster.type], view.facing, "idle");
    }
    view.sprite.setPosition(0, metrics.spriteY);
    this.updateMonsterSpriteSize(view.sprite, monster.type);
    view.shadow.setVisible(true);
    view.shadow.setDisplaySize(metrics.shadowWidth, metrics.shadowHeight);
    view.tileMarker.setVisible(true);
    view.hitArea.setInteractive();
    this.updateMonsterHealthBar(view.healthBar, healthRatio);
    this.updateMonsterTileMarker(view.tileMarker, monster);
  }

  private updateMonsterCorpseView(view: MonsterView, monster: WorldMonster): void {
    view.alive = false;
    view.container.setDepth(18);
    view.label.setVisible(false);
    view.healthBack.setVisible(false);
    view.healthBar.setVisible(false);
    view.sprite.setVisible(false);
    view.shadow.setVisible(false);
    view.hitArea.disableInteractive();
    view.tileMarker.setVisible(true);
    view.tileMarker.setStrokeStyle(1, 0x7d5b3d, 0.55);
  }

  private updateMonsterHealthBar(healthBar: Phaser.GameObjects.Rectangle, healthRatio: number): void {
    const filledWidth = Math.ceil(MONSTER_HEALTH_BAR_WIDTH * healthRatio);

    healthBar.setDisplaySize(Math.max(0, filledWidth), MONSTER_HEALTH_BAR_HEIGHT);
  }

  private syncMonsterTargetMarkers(): void {
    for (const [monsterId, view] of this.monsterViews.entries()) {
      const monster = this.pendingMonsters.find((pendingMonster) => pendingMonster.id === monsterId);

      if (monster?.alive) {
        this.updateMonsterTileMarker(view.tileMarker, monster);
      }
    }
  }

  private updateMonsterTileMarker(tileMarker: Phaser.GameObjects.Rectangle, monster: WorldMonster): void {
    if (monster.id === this.activeCombatMonsterId) {
      tileMarker.setStrokeStyle(2, 0xc4312b, 1);
      return;
    }

    tileMarker.setStrokeStyle(2, 0xf0d18c, 0.9);
  }

  private createActorNameLabel(x: number, y: number, value: string, fontSize: string): Phaser.GameObjects.Text {
    const label = this.add.text(x, y, value, {
      color: ACTOR_NAME_LABEL_COLOR,
      fontFamily: ACTOR_NAME_LABEL_FONT_FAMILY,
      fontSize,
      fontStyle: "600",
      padding: {
        x: 2,
        y: 1
      },
      stroke: ACTOR_NAME_LABEL_STROKE,
      strokeThickness: ACTOR_NAME_LABEL_STROKE_THICKNESS
    });

    label.setResolution(ACTOR_NAME_LABEL_RESOLUTION);
    label.setOrigin(0.5, 1);
    label.setShadow(0, 2, "rgba(0, 0, 0, 0.35)", 3, true, true);

    return label;
  }

  private spawnFloatingDamageText(x: number, y: number, damage: number): void {
    const damageText = this.add.text(x, y, String(damage), {
      color: "#e64d47",
      fontFamily: "Georgia",
      fontSize: "14px",
      stroke: "#120c08",
      strokeThickness: 3
    });

    damageText.setDepth(120);
    damageText.setOrigin(0.5, 1);

    this.tweens.add({
      targets: damageText,
      alpha: 0,
      duration: 720,
      ease: "Sine.easeOut",
      y: y - 18,
      onComplete: () => {
        damageText.destroy();
      }
    });
  }

  private syncRespawnWarning(monster: WorldMonster): void {
    if (monster.alive) {
      this.clearRespawnWarning(monster.id);
      return;
    }

    if (!monster.respawnDueAt || this.respawnWarningViews.has(monster.id) || this.respawnWarningTimers.has(monster.id)) {
      return;
    }

    const delay = Math.max(0, monster.respawnDueAt - Date.now() - RESPAWN_WARNING_MS);

    if (delay === 0) {
      this.createRespawnWarning(monster);
      return;
    }

    const timer = this.time.delayedCall(delay, () => {
      this.respawnWarningTimers.delete(monster.id);
      this.createRespawnWarning(monster);
    });

    this.respawnWarningTimers.set(monster.id, timer);
  }

  private createRespawnWarning(monster: WorldMonster): void {
    if (this.respawnWarningViews.has(monster.id) || monster.alive) {
      return;
    }

    const { x, y } = getTileCenter(this.map, {
      x: monster.spawnX,
      y: monster.spawnY
    });
    const tileMarker = this.add.rectangle(0, 0, this.map.tileSize - 5, this.map.tileSize - 5, 0x2f2118, 0.18);
    const innerPulse = this.add.ellipse(0, 0, 18, 18, 0xf0d18c, 0.22);
    const spark = this.add.rectangle(0, 0, 5, 5, 0xf0d18c, 0.7);

    tileMarker.setStrokeStyle(2, 0xf0d18c, 0.85);
    spark.setAngle(45);

    const container = this.add.container(x, y, [tileMarker, innerPulse, spark]);
    container.setDepth(12);

    this.tweens.add({
      targets: container,
      alpha: 0.35,
      duration: 420,
      ease: "Sine.easeInOut",
      repeat: -1,
      yoyo: true
    });
    this.tweens.add({
      targets: innerPulse,
      scale: 1.45,
      duration: 520,
      ease: "Sine.easeOut",
      repeat: -1,
      yoyo: true
    });

    this.respawnWarningViews.set(monster.id, {
      container
    });
  }

  private clearRespawnWarning(monsterId: string): void {
    const timer = this.respawnWarningTimers.get(monsterId);

    if (timer) {
      timer.remove(false);
      this.respawnWarningTimers.delete(monsterId);
    }

    const warning = this.respawnWarningViews.get(monsterId);

    if (warning) {
      this.tweens.killTweensOf(warning.container);
      warning.container.destroy(true);
      this.respawnWarningViews.delete(monsterId);
    }
  }

  private getMonsterLabel(monster: WorldMonster): string {
    return monster.name;
  }

  private updateMonsterSpriteSize(sprite: Phaser.GameObjects.Sprite, type: WorldMonster["type"]): void {
    const metrics = this.getMonsterVisualMetrics(type);
    sprite.setDisplaySize(metrics.spriteWidth, metrics.spriteHeight);
  }

  private getMonsterVisualMetrics(type: WorldMonster["type"]): {
    healthY: number;
    labelY: number;
    shadowHeight: number;
    shadowWidth: number;
    spriteHeight: number;
    spriteWidth: number;
    spriteY: number;
  } {
    const spriteWidth = type === "troll" ? 42 : 32;
    const spriteHeight = type === "troll" ? 42 : 32;
    const spriteY = type === "troll" ? 16 : 13;
    const spriteTop = spriteY - spriteHeight;

    return {
      healthY: spriteTop - 2,
      labelY: spriteTop - 5,
      shadowHeight: type === "troll" ? 10 : 8,
      shadowWidth: type === "troll" ? 22 : 16,
      spriteHeight,
      spriteWidth,
      spriteY
    };
  }

  private getCorpseLabel(corpse: Corpse): string {
    return corpse.isEmpty ? `${corpse.monsterName} corpse` : `${corpse.monsterName} corpse *`;
  }

  private getGroundItemLabel(groundItem: GroundItem): string {
    return groundItem.quantity > 1 ? `${groundItem.name} x${groundItem.quantity}` : groundItem.name;
  }

}
