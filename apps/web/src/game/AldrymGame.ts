import type { Corpse, MoveDirection, WorldMonster, WorldPlayer } from "@aldrym/shared";
import Phaser from "phaser";

import { createGameConfig } from "./config/gameConfig";
import { createLocalMap } from "./map/localMap";
import { MainScene } from "./scenes/MainScene";

export interface AldrymGameOptions {
  activeCombatMonsterId?: string | null;
  corpses: Corpse[];
  localCharacterId: string;
  monsters: WorldMonster[];
  onAttackMonster?: (monsterId: string) => void;
  onOpenCorpse?: (corpseId: string) => void;
  onMoveIntent?: (direction: MoveDirection) => void;
  parent: HTMLElement;
  players: WorldPlayer[];
}

export class AldrymGame {
  private readonly game: Phaser.Game;
  private readonly scene: MainScene;

  constructor(options: AldrymGameOptions) {
    this.scene = new MainScene({
      activeCombatMonsterId: options.activeCombatMonsterId,
      corpses: options.corpses,
      initialPlayers: options.players,
      localCharacterId: options.localCharacterId,
      map: createLocalMap(),
      monsters: options.monsters,
      onAttackMonster: options.onAttackMonster,
      onMoveIntent: options.onMoveIntent,
      onOpenCorpse: options.onOpenCorpse
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

  setMonsters(monsters: WorldMonster[]): void {
    this.scene.setMonsters(monsters);
  }

  setCorpses(corpses: Corpse[]): void {
    this.scene.setCorpses(corpses);
  }

  setActiveCombatMonsterId(monsterId: string | null): void {
    this.scene.setActiveCombatMonsterId(monsterId);
  }

  destroy(): void {
    this.game.destroy(true);
  }
}
