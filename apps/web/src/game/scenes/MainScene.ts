import { getMovementCooldownMs, getMovementTweenDurationMs } from "@aldrym/shared";
import type { Corpse, MoveDirection, WorldMonster, WorldPlayer } from "@aldrym/shared";
import Phaser from "phaser";

import {
  LOCAL_TILE_PALETTE,
  getTileCenter,
  getTileType,
  type LocalMapData
} from "../map/localMap";

interface MovementKeys {
  downLeft?: Phaser.Input.Keyboard.Key;
  downRight?: Phaser.Input.Keyboard.Key;
  up?: Phaser.Input.Keyboard.Key;
  upLeft?: Phaser.Input.Keyboard.Key;
  upRight?: Phaser.Input.Keyboard.Key;
  down?: Phaser.Input.Keyboard.Key;
  left?: Phaser.Input.Keyboard.Key;
  right?: Phaser.Input.Keyboard.Key;
}

interface PlayerView {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
}

interface MonsterView {
  alive: boolean;
  body: Phaser.GameObjects.Ellipse;
  container: Phaser.GameObjects.Container;
  detail: Phaser.GameObjects.Rectangle;
  healthBack: Phaser.GameObjects.Rectangle;
  healthBar: Phaser.GameObjects.Rectangle;
  hitArea: Phaser.GameObjects.Zone;
  label: Phaser.GameObjects.Text;
  shadow: Phaser.GameObjects.Ellipse;
  tileMarker: Phaser.GameObjects.Rectangle;
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

interface RespawnWarningView {
  container: Phaser.GameObjects.Container;
}

export interface MainSceneOptions {
  activeCombatMonsterId?: string | null;
  corpses: Corpse[];
  initialPlayers: WorldPlayer[];
  localCharacterId: string;
  map: LocalMapData;
  monsters: WorldMonster[];
  onAttackMonster?: (monsterId: string) => void;
  onMoveIntent?: (direction: MoveDirection) => void;
  onOpenCorpse?: (corpseId: string) => void;
}

const CAMERA_ZOOM = 2;
const MONSTER_HEALTH_BAR_WIDTH = 24;
const RESPAWN_WARNING_MS = 3000;

export class MainScene extends Phaser.Scene {
  private activeCombatMonsterId: string | null;
  private readonly localCharacterId: string;
  private readonly map: LocalMapData;
  private readonly onAttackMonster?: (monsterId: string) => void;
  private readonly onMoveIntent?: (direction: MoveDirection) => void;
  private readonly onOpenCorpse?: (corpseId: string) => void;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private movementKeys?: MovementKeys;
  private nextMoveAt = 0;
  private isSceneReady = false;
  private pendingCorpses: Corpse[];
  private pendingMonsters: WorldMonster[];
  private pendingPlayers: WorldPlayer[];
  private readonly corpseViews = new Map<string, CorpseView>();
  private readonly monsterViews = new Map<string, MonsterView>();
  private readonly playerViews = new Map<string, PlayerView>();
  private readonly respawnWarningTimers = new Map<string, Phaser.Time.TimerEvent>();
  private readonly respawnWarningViews = new Map<string, RespawnWarningView>();
  private hoveredCorpseId: string | null = null;

  constructor(options: MainSceneOptions) {
    super({ key: "main-scene" });
    this.activeCombatMonsterId = options.activeCombatMonsterId ?? null;
    this.localCharacterId = options.localCharacterId;
    this.map = options.map;
    this.onAttackMonster = options.onAttackMonster;
    this.onMoveIntent = options.onMoveIntent;
    this.onOpenCorpse = options.onOpenCorpse;
    this.pendingCorpses = options.corpses;
    this.pendingMonsters = options.monsters;
    this.pendingPlayers = options.initialPlayers;
  }

  create(): void {
    this.drawMap();
    this.createControls();
    this.configureCamera();
    this.isSceneReady = true;
    this.syncCorpses(this.pendingCorpses);
    this.syncMonsters(this.pendingMonsters);
    this.syncPlayers(this.pendingPlayers);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.resetCorpseCursor());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.resetCorpseCursor());
  }

  update(time: number): void {
    if (!this.onMoveIntent || time < this.nextMoveAt) {
      return;
    }

    const direction = this.getRequestedDirection();

    if (!direction) {
      return;
    }

    this.nextMoveAt = time + getMovementCooldownMs(this.getLocalPlayerLevel(), direction);
    this.onMoveIntent(direction);
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
    }
  }

  setCorpses(corpses: Corpse[]): void {
    this.pendingCorpses = corpses.map((corpse) => ({ ...corpse, items: corpse.items.map((item) => ({ ...item })) }));

    if (this.isSceneReady) {
      this.syncCorpses(this.pendingCorpses);
    }
  }

  private drawMap(): void {
    const graphics = this.add.graphics();
    const worldWidth = this.map.width * this.map.tileSize;
    const worldHeight = this.map.height * this.map.tileSize;

    graphics.fillStyle(0x120c08, 1);
    graphics.fillRect(0, 0, worldWidth, worldHeight);

    for (let y = 0; y < this.map.height; y += 1) {
      for (let x = 0; x < this.map.width; x += 1) {
        const tileType = getTileType(this.map, x, y);

        if (!tileType) {
          continue;
        }

        const palette = LOCAL_TILE_PALETTE[tileType];
        const worldX = x * this.map.tileSize;
        const worldY = y * this.map.tileSize;

        graphics.fillStyle(palette.edgeColor, 1);
        graphics.fillRect(worldX, worldY, this.map.tileSize, this.map.tileSize);

        graphics.fillStyle(palette.baseColor, 1);
        graphics.fillRect(worldX + 1, worldY + 1, this.map.tileSize - 2, this.map.tileSize - 2);

        if (tileType === "grass") {
          graphics.fillStyle(palette.accentColor, 0.18);
          graphics.fillRect(worldX + 5, worldY + 4, this.map.tileSize - 10, 7);
          graphics.fillRect(worldX + 8, worldY + 16, this.map.tileSize - 16, 6);
        } else if (tileType === "dirt") {
          graphics.fillStyle(palette.accentColor, 0.24);
          graphics.fillRect(worldX + 4, worldY + 6, this.map.tileSize - 12, 5);
          graphics.fillRect(worldX + 10, worldY + 17, this.map.tileSize - 14, 4);
        } else if (tileType === "stone") {
          graphics.fillStyle(palette.accentColor, 0.22);
          graphics.fillRect(worldX + 4, worldY + 4, this.map.tileSize - 8, 9);
          graphics.fillRect(worldX + 7, worldY + 18, this.map.tileSize - 14, 4);
        } else if (tileType === "water") {
          graphics.fillStyle(palette.accentColor, 0.2);
          graphics.fillRect(worldX + 4, worldY + 5, this.map.tileSize - 8, 5);
          graphics.fillRect(worldX + 9, worldY + 17, this.map.tileSize - 18, 4);
        } else if (tileType === "wall") {
          graphics.fillStyle(palette.accentColor, 0.3);
          graphics.fillRect(worldX + 4, worldY + 4, this.map.tileSize - 8, 5);
          graphics.fillStyle(0x1e1714, 0.35);
          graphics.fillRect(worldX + 4, worldY + this.map.tileSize - 8, this.map.tileSize - 8, 4);
        }
      }
    }
  }

  private createControls(): void {
    const keyboard = this.input.keyboard;

    if (!keyboard) {
      return;
    }

    this.input.mouse?.disableContextMenu();
    this.cursors = keyboard.createCursorKeys();
    this.movementKeys = keyboard.addKeys({
      downLeft: Phaser.Input.Keyboard.KeyCodes.Z,
      downRight: Phaser.Input.Keyboard.KeyCodes.C,
      up: Phaser.Input.Keyboard.KeyCodes.W,
      upLeft: Phaser.Input.Keyboard.KeyCodes.Q,
      upRight: Phaser.Input.Keyboard.KeyCodes.E,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    }) as MovementKeys;
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

  private getRequestedDirection(): MoveDirection | null {
    if (this.isKeyDown(this.movementKeys?.upLeft)) {
      return "up-left";
    }

    if (this.isKeyDown(this.movementKeys?.upRight)) {
      return "up-right";
    }

    if (this.isKeyDown(this.movementKeys?.downLeft)) {
      return "down-left";
    }

    if (this.isKeyDown(this.movementKeys?.downRight)) {
      return "down-right";
    }

    if (this.isKeyDown(this.cursors?.up, this.movementKeys?.up)) {
      return "up";
    }

    if (this.isKeyDown(this.cursors?.down, this.movementKeys?.down)) {
      return "down";
    }

    if (this.isKeyDown(this.cursors?.left, this.movementKeys?.left)) {
      return "left";
    }

    if (this.isKeyDown(this.cursors?.right, this.movementKeys?.right)) {
      return "right";
    }

    return null;
  }

  private isKeyDown(...keys: Array<Phaser.Input.Keyboard.Key | undefined>): boolean {
    return keys.some((key) => Boolean(key?.isDown));
  }

  private syncPlayers(players: WorldPlayer[]): void {
    const activeCharacterIds = new Set(players.map((player) => player.characterId));

    for (const player of players) {
      this.upsertPlayerView(player);
    }

    for (const [characterId, view] of this.playerViews.entries()) {
      if (!activeCharacterIds.has(characterId)) {
        view.container.destroy(true);
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

  private upsertPlayerView(player: WorldPlayer): void {
    const existingView = this.playerViews.get(player.characterId);
    const { x, y } = getTileCenter(this.map, player);

    if (!existingView) {
      this.playerViews.set(player.characterId, this.createPlayerView(player, x, y));
      return;
    }

    existingView.label.setText(player.name);
    this.tweens.killTweensOf(existingView.container);
    this.tweens.add({
      targets: existingView.container,
      x,
      y,
      duration: getMovementTweenDurationMs(player.level),
      ease: "Quad.easeOut"
    });
  }

  private createPlayerView(player: WorldPlayer, x: number, y: number): PlayerView {
    const isLocalPlayer = player.characterId === this.localCharacterId;
    const label = this.add.text(0, -24, player.name, {
      color: "#f2e5c8",
      fontFamily: "Georgia",
      fontSize: "11px",
      stroke: "#120c08",
      strokeThickness: 3
    });
    const shadow = this.add.ellipse(0, 8, 18, 10, 0x000000, 0.28);
    const body = this.add.rectangle(0, -3, 18, 22, isLocalPlayer ? 0xc79e62 : 0xa9a6a0, 1);
    const tunic = this.add.rectangle(0, 0, 12, 12, isLocalPlayer ? 0x6c4b2f : 0x42546a, 1);
    const head = this.add.ellipse(0, -13, 10, 10, 0xe6cfaa, 1);

    label.setOrigin(0.5, 1);
    body.setStrokeStyle(2, 0x2e1a10, 1);
    tunic.setStrokeStyle(1, 0x3e2a19, 1);
    head.setStrokeStyle(1, 0x72583c, 1);

    const container = this.add.container(x, y, [label, shadow, body, tunic, head]);
    container.setDepth(isLocalPlayer ? 20 : 16);

    return {
      container,
      label
    };
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
    const tooltip = this.add.text(0, -31, "Open corpse", {
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
        this.onOpenCorpse?.(corpse.id);
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
      this.updateMonsterView(existingView, monster);
      return;
    }

    if (existingView.container.x !== x || existingView.container.y !== y) {
      this.tweens.killTweensOf(existingView.container);
      this.tweens.add({
        targets: existingView.container,
        x,
        y,
        duration: getMovementTweenDurationMs(monster.level),
        ease: "Quad.easeOut"
      });
    }

    this.updateMonsterView(existingView, monster);
  }

  private getLocalPlayerLevel(): number {
    return this.pendingPlayers.find((player) => player.characterId === this.localCharacterId)?.level ?? 1;
  }

  private createMonsterView(monster: WorldMonster, x: number, y: number): MonsterView {
    const label = this.add.text(0, -24, this.getMonsterLabel(monster), {
      color: "#f2e5c8",
      fontFamily: "Georgia",
      fontSize: "10px",
      stroke: "#120c08",
      strokeThickness: 3
    });
    const shadow = this.add.ellipse(0, 8, 18, 9, 0x000000, 0.24);
    const tileMarker = this.add.rectangle(0, 0, this.map.tileSize - 4, this.map.tileSize - 4, 0x000000, 0);
    const body = this.add.ellipse(0, 0, 24, 18, this.getMonsterColor(monster.type), 1);
    const detail = this.add.rectangle(0, -1, 14, 6, 0xf0d18c, 0.58);
    const healthBack = this.add.rectangle(-MONSTER_HEALTH_BAR_WIDTH / 2, -15, MONSTER_HEALTH_BAR_WIDTH, 4, 0x23140d, 1);
    const healthBar = this.add.rectangle(-MONSTER_HEALTH_BAR_WIDTH / 2, -15, MONSTER_HEALTH_BAR_WIDTH, 4, 0x9f3d2c, 1);
    const hitArea = this.add.zone(0, 0, this.map.tileSize, this.map.tileSize);

    label.setOrigin(0.5, 1);
    this.updateMonsterTileMarker(tileMarker, monster);
    body.setStrokeStyle(2, 0x2e1a10, 1);
    detail.setStrokeStyle(1, 0x3e2a19, 0.7);
    healthBack.setOrigin(0, 0.5);
    healthBar.setOrigin(0, 0.5);
    hitArea.setOrigin(0.5);
    hitArea.setInteractive();

    const container = this.add.container(x, y, [hitArea, tileMarker, label, healthBack, healthBar, shadow, body, detail]);
    container.setDepth(40);
    hitArea.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 2) {
        this.onAttackMonster?.(monster.id);
      }
    });

    const view = {
      alive: monster.alive,
      body,
      container,
      detail,
      healthBack,
      healthBar,
      hitArea,
      label,
      shadow,
      tileMarker
    };

    this.updateMonsterView(view, monster);
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

    view.alive = true;
    view.container.setDepth(40);
    view.label.setVisible(true);
    view.label.setPosition(0, -24);
    view.label.setText(this.getMonsterLabel(monster));
    view.healthBack.setVisible(true);
    view.healthBar.setVisible(true);
    view.body.setVisible(true);
    view.body.setPosition(0, 0);
    view.body.setDisplaySize(24, 18);
    view.body.setFillStyle(this.getMonsterColor(monster.type), 1);
    view.body.setStrokeStyle(2, 0x2e1a10, 1);
    view.detail.setVisible(true);
    view.detail.setPosition(0, -1);
    view.detail.setDisplaySize(14, 6);
    view.detail.setFillStyle(0xf0d18c, 0.58);
    view.detail.setStrokeStyle(1, 0x3e2a19, 0.7);
    view.shadow.setVisible(true);
    view.shadow.setDisplaySize(18, 9);
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
    view.body.setVisible(false);
    view.detail.setVisible(false);
    view.shadow.setVisible(false);
    view.hitArea.disableInteractive();
    view.tileMarker.setVisible(true);
    view.tileMarker.setStrokeStyle(1, 0x7d5b3d, 0.55);
  }

  private updateMonsterHealthBar(healthBar: Phaser.GameObjects.Rectangle, healthRatio: number): void {
    const filledWidth = Math.ceil(MONSTER_HEALTH_BAR_WIDTH * healthRatio);

    healthBar.setDisplaySize(Math.max(0, filledWidth), 4);
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
    return `${monster.name} ${monster.health}/${monster.maxHealth}`;
  }

  private getMonsterColor(type: WorldMonster["type"]): number {
    switch (type) {
      case "rat":
        return 0x7c7568;
      case "wolf":
        return 0x8f8a7e;
      case "troll":
        return 0x4f7552;
      case "goblin":
        return 0x6f8b3d;
      case "rotworm":
        return 0x8b4f38;
      case "orc":
        return 0x53633d;
      default:
        return 0x7c7568;
    }
  }

  private getCorpseLabel(corpse: Corpse): string {
    return corpse.isEmpty ? `${corpse.monsterName} corpse` : `${corpse.monsterName} corpse *`;
  }

}
