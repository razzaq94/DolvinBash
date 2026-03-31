import { GAME_CONFIG } from "./data/gameConfig.js";
import BootScene from "./scenes/BootScene.js";
import PreloadScene from "./scenes/PreloadScene.js";
import GameScene from "./scenes/GameScene.js";

window.addEventListener("load", () => {
    const baseWidth = GAME_CONFIG.baseWidth || 1280;
    const baseHeight = GAME_CONFIG.baseHeight || 720;

    const config = {
        type: Phaser.AUTO,
        parent: "game-root",
        width: baseWidth,
        height: baseHeight,
        // Force stable rendering across high-DPR devices (S24/4K with zoom/DPR changes).
        // We intentionally keep internal resolution at 1 and let the browser scale the canvas.
        resolution: 1,
        render: {
            antialias: true,
            roundPixels: true
        },
        backgroundColor: GAME_CONFIG.backgroundColor,
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: baseWidth,
            height: baseHeight
        },
        scene: [
            BootScene,
            PreloadScene,
            GameScene
        ]
    };

    const game = new Phaser.Game(config);
    window.__DOLVIN_GAME__ = game;

    const refreshScale = () => {
        if (!game?.scale) return;
        game.scale.refresh();
    };

    window.addEventListener("resize", refreshScale);
    window.visualViewport?.addEventListener("resize", refreshScale);
});