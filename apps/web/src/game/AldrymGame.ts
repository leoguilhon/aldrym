import type {
  CardinalDirection,
  Corpse,
  GroundItem,
  InventoryMoveTarget,
  MoveDirection,
  Position,
  WorldMonster,
  WorldPlayer
} from "@aldrym/shared";
import Phaser from "phaser";

import { createGameConfig } from "./config/gameConfig";
import { createLocalMap } from "./map/localMap";
import { MainScene } from "./scenes/MainScene";

export interface AldrymGameOptions {
  activeCombatMonsterId?: string | null;
  corpses: Corpse[];
  groundItems: GroundItem[];
  localCharacterId: string;
  monsters: WorldMonster[];
  onAttackMonster?: (monsterId: string) => void;
  onMoveCorpse?: (corpseId: string, position: Position) => void;
  onMoveGroundItem?: (groundItemId: string, position: Position) => void;
  onTakeGroundItem?: (groundItemId: string) => void;
  onTakeGroundItemToTarget?: (
    groundItemId: string,
    target: Extract<InventoryMoveTarget, { locationType: "container" | "equipment" }>
  ) => void;
  onOpenCorpse?: (corpseId: string) => void;
  onShowNotice?: (message: string) => void;
  onMoveIntent?: (direction: MoveDirection) => void;
  onMoveToIntent?: (position: Position) => void;
  onTurnIntent?: (direction: CardinalDirection) => void;
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
      groundItems: options.groundItems,
      initialPlayers: options.players,
      localCharacterId: options.localCharacterId,
      map: createLocalMap(),
      monsters: options.monsters,
      onAttackMonster: options.onAttackMonster,
      onMoveCorpse: options.onMoveCorpse,
      onMoveGroundItem: options.onMoveGroundItem,
      onMoveIntent: options.onMoveIntent,
      onMoveToIntent: options.onMoveToIntent,
      onTurnIntent: options.onTurnIntent,
      onOpenCorpse: options.onOpenCorpse,
      onShowNotice: options.onShowNotice,
      onTakeGroundItem: options.onTakeGroundItem,
      onTakeGroundItemToTarget: options.onTakeGroundItemToTarget
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

  setGroundItems(groundItems: GroundItem[]): void {
    this.scene.setGroundItems(groundItems);
  }

  showMonsterDamage(monsterId: string, damage: number): void {
    this.scene.showMonsterDamage(monsterId, damage);
  }

  showMonsterMiss(monsterId: string): void {
    this.scene.showMonsterMiss(monsterId);
  }

  showPlayerDamage(characterId: string, damage: number): void {
    this.scene.showPlayerDamage(characterId, damage);
  }

  showPlayerMiss(characterId: string): void {
    this.scene.showPlayerMiss(characterId);
  }

  getTilePositionFromClientPoint(clientX: number, clientY: number): Position | null {
    return this.scene.getTilePositionFromClientPoint(clientX, clientY);
  }

  setActiveCombatMonsterId(monsterId: string | null): void {
    this.scene.setActiveCombatMonsterId(monsterId);
  }

  destroy(): void {
    this.game.destroy(true);
  }
}
