import type { MoveDirection, WorldPlayer } from "@aldrym/shared";
import Phaser from "phaser";

import {
  LOCAL_TILE_PALETTE,
  getTileCenter,
  getTileType,
  type LocalMapData
} from "../map/localMap";

interface MovementKeys {
  up?: Phaser.Input.Keyboard.Key;
  down?: Phaser.Input.Keyboard.Key;
  left?: Phaser.Input.Keyboard.Key;
  right?: Phaser.Input.Keyboard.Key;
}

interface PlayerView {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
}

export interface MainSceneOptions {
  initialPlayers: WorldPlayer[];
  localCharacterId: string;
  map: LocalMapData;
  onMoveIntent?: (direction: MoveDirection) => void;
}

const CAMERA_ZOOM = 2;
const MOVE_COOLDOWN_MS = 140;
const MOVE_TWEEN_DURATION_MS = 100;

export class MainScene extends Phaser.Scene {
  private readonly localCharacterId: string;
  private readonly map: LocalMapData;
  private readonly onMoveIntent?: (direction: MoveDirection) => void;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private movementKeys?: MovementKeys;
  private nextMoveAt = 0;
  private isSceneReady = false;
  private pendingPlayers: WorldPlayer[];
  private readonly playerViews = new Map<string, PlayerView>();

  constructor(options: MainSceneOptions) {
    super({ key: "main-scene" });
    this.localCharacterId = options.localCharacterId;
    this.map = options.map;
    this.onMoveIntent = options.onMoveIntent;
    this.pendingPlayers = options.initialPlayers;
  }

  create(): void {
    this.drawMap();
    this.createControls();
    this.configureCamera();
    this.isSceneReady = true;
    this.syncPlayers(this.pendingPlayers);
  }

  update(time: number): void {
    if (!this.onMoveIntent || time < this.nextMoveAt) {
      return;
    }

    const direction = this.getRequestedDirection();

    if (!direction) {
      return;
    }

    this.nextMoveAt = time + MOVE_COOLDOWN_MS;
    this.onMoveIntent(direction);
  }

  setPlayers(players: WorldPlayer[]): void {
    this.pendingPlayers = players.map((player) => ({ ...player }));

    if (this.isSceneReady) {
      this.syncPlayers(this.pendingPlayers);
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

    this.cursors = keyboard.createCursorKeys();
    this.movementKeys = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
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
      duration: MOVE_TWEEN_DURATION_MS,
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
}
