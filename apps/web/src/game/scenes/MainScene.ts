import type { Position } from "@aldrym/shared";
import Phaser from "phaser";

import {
  LOCAL_TILE_PALETTE,
  getTileCenter,
  getTileType,
  isWalkableTile,
  type LocalMapData
} from "../map/localMap";

type MoveDirection = "up" | "down" | "left" | "right";

interface MovementKeys {
  up?: Phaser.Input.Keyboard.Key;
  down?: Phaser.Input.Keyboard.Key;
  left?: Phaser.Input.Keyboard.Key;
  right?: Phaser.Input.Keyboard.Key;
}

export interface MainSceneOptions {
  initialPosition: Position;
  map: LocalMapData;
  onPositionChange?: (position: Position) => void;
}

const CAMERA_ZOOM = 2;
const MOVE_COOLDOWN_MS = 140;
const MOVE_TWEEN_DURATION_MS = 100;

export class MainScene extends Phaser.Scene {
  private readonly initialPosition: Position;
  private readonly map: LocalMapData;
  private readonly onPositionChange?: (position: Position) => void;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private movementKeys?: MovementKeys;
  private nextMoveAt = 0;
  private isMoving = false;
  private playerPosition: Position;
  private player?: Phaser.GameObjects.Container;

  constructor(options: MainSceneOptions) {
    super({ key: "main-scene" });
    this.initialPosition = { ...options.initialPosition };
    this.map = options.map;
    this.onPositionChange = options.onPositionChange;
    this.playerPosition = { ...options.initialPosition };
  }

  create(): void {
    this.drawMap();
    this.createPlayer();
    this.createControls();
    this.configureCamera();
    this.onPositionChange?.(this.playerPosition);
  }

  update(time: number): void {
    if (this.isMoving || time < this.nextMoveAt) {
      return;
    }

    const direction = this.getRequestedDirection();

    if (!direction) {
      return;
    }

    this.nextMoveAt = time + MOVE_COOLDOWN_MS;
    this.tryMove(direction);
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

  private createPlayer(): void {
    const { x, y } = getTileCenter(this.map, this.initialPosition);
    const shadow = this.add.ellipse(0, 8, 18, 10, 0x000000, 0.28);
    const body = this.add.rectangle(0, -3, 18, 22, 0xc79e62, 1);
    const tunic = this.add.rectangle(0, 0, 12, 12, 0x6c4b2f, 1);
    const head = this.add.ellipse(0, -13, 10, 10, 0xe6cfaa, 1);

    body.setStrokeStyle(2, 0x2e1a10, 1);
    tunic.setStrokeStyle(1, 0x3e2a19, 1);
    head.setStrokeStyle(1, 0x72583c, 1);

    this.player = this.add.container(x, y, [shadow, body, tunic, head]);
    this.player.setDepth(20);
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
    if (!this.player) {
      return;
    }

    const worldWidth = this.map.width * this.map.tileSize;
    const worldHeight = this.map.height * this.map.tileSize;
    const camera = this.cameras.main;

    camera.setBackgroundColor(0x120c08);
    camera.setBounds(0, 0, worldWidth, worldHeight);
    camera.setRoundPixels(true);
    camera.setZoom(CAMERA_ZOOM);
    camera.startFollow(this.player, true, 0.2, 0.2);
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

  private tryMove(direction: MoveDirection): void {
    if (!this.player) {
      return;
    }

    const targetPosition = this.getTargetPosition(direction);

    if (!isWalkableTile(this.map, targetPosition)) {
      return;
    }

    this.playerPosition = targetPosition;
    this.isMoving = true;
    this.onPositionChange?.(this.playerPosition);

    const { x, y } = getTileCenter(this.map, targetPosition);

    this.tweens.add({
      targets: this.player,
      x,
      y,
      duration: MOVE_TWEEN_DURATION_MS,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.isMoving = false;
      }
    });
  }

  private getTargetPosition(direction: MoveDirection): Position {
    switch (direction) {
      case "up":
        return { ...this.playerPosition, y: this.playerPosition.y - 1 };
      case "down":
        return { ...this.playerPosition, y: this.playerPosition.y + 1 };
      case "left":
        return { ...this.playerPosition, x: this.playerPosition.x - 1 };
      case "right":
        return { ...this.playerPosition, x: this.playerPosition.x + 1 };
      default:
        return this.playerPosition;
    }
  }
}
