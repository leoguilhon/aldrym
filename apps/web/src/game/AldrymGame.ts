import type { CharacterSummary, Position } from "@aldrym/shared";
import Phaser from "phaser";

import { createGameConfig } from "./config/gameConfig";
import { createLocalMap, resolveLocalPlayerSpawn } from "./map/localMap";
import { MainScene } from "./scenes/MainScene";

export interface AldrymGameOptions {
  character: CharacterSummary;
  onPositionChange?: (position: Position) => void;
  parent: HTMLElement;
}

export class AldrymGame {
  private readonly game: Phaser.Game;

  constructor(options: AldrymGameOptions) {
    const map = createLocalMap();
    const initialPosition = resolveLocalPlayerSpawn(map, options.character);
    const scene = new MainScene({
      initialPosition,
      map,
      onPositionChange: options.onPositionChange
    });

    this.game = new Phaser.Game(
      createGameConfig({
        parent: options.parent,
        scene
      })
    );
  }

  destroy(): void {
    this.game.destroy(true);
  }
}
