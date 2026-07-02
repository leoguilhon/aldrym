import type { MoveDirection, WorldPlayer } from "@aldrym/shared";
import Phaser from "phaser";

import { createGameConfig } from "./config/gameConfig";
import { createLocalMap } from "./map/localMap";
import { MainScene } from "./scenes/MainScene";

export interface AldrymGameOptions {
  localCharacterId: string;
  onMoveIntent?: (direction: MoveDirection) => void;
  parent: HTMLElement;
  players: WorldPlayer[];
}

export class AldrymGame {
  private readonly game: Phaser.Game;
  private readonly scene: MainScene;

  constructor(options: AldrymGameOptions) {
    this.scene = new MainScene({
      initialPlayers: options.players,
      localCharacterId: options.localCharacterId,
      map: createLocalMap(),
      onMoveIntent: options.onMoveIntent
    });

    this.game = new Phaser.Game(
      createGameConfig({
        parent: options.parent,
        scene: this.scene
      })
    );
  }

  setPlayers(players: WorldPlayer[]): void {
    this.scene.setPlayers(players);
  }

  destroy(): void {
    this.game.destroy(true);
  }
}
