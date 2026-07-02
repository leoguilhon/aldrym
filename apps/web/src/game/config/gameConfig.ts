import Phaser from "phaser";

const GAME_VIEWPORT_WIDTH = 960;
const GAME_VIEWPORT_HEIGHT = 640;

export interface CreateGameConfigOptions {
  parent: HTMLElement;
  scene: Phaser.Types.Scenes.SceneType;
}

export function createGameConfig(options: CreateGameConfigOptions): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent: options.parent,
    width: GAME_VIEWPORT_WIDTH,
    height: GAME_VIEWPORT_HEIGHT,
    backgroundColor: 0x120c08,
    pixelArt: true,
    roundPixels: true,
    disableContextMenu: true,
    banner: false,
    scene: options.scene
  };
}
