import { GAME_CONFIG } from "./data/gameConfig.js";
import BootScene from "./scenes/BootScene.js";
import PreloadScene from "./scenes/PreloadScene.js";
import GameScene from "./scenes/GameScene.js";
import UIScene from "./scenes/UIScene.js";

window.addEventListener("load", () => {
    const config = {
        type: Phaser.CANVAS,
        parent: "game-root",
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: GAME_CONFIG.backgroundColor,
        scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH
        },
        scene: [
            BootScene,
            PreloadScene,
            GameScene,
            UIScene
        ]
    };

    const game = new Phaser.Game(config);
    window.__DOLVIN_GAME__ = game;

    window.addEventListener("resize", () => {
        if (!game || !game.scale) return;
        game.scale.resize(window.innerWidth, window.innerHeight);
    });
});