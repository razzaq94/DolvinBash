import { GAME_CONFIG } from "./data/gameConfig.js";
import BootScene from "./scenes/BootScene.js";
import PreloadScene from "./scenes/PreloadScene.js";
import GameScene from "./scenes/GameScene.js";

window.addEventListener("load", () => {
    // Canvas + game size follow the parent (#game-root) — same idea as reference:
    // mode: Phaser.Scale.RESIZE, initial width/height from viewport.
    const viewport = window.visualViewport;
    const vw = Math.max(1, Math.round(viewport?.width ?? window.innerWidth));
    const vh = Math.max(1, Math.round(viewport?.height ?? window.innerHeight));

    const config = {
        type: Phaser.AUTO,
        parent: "game-root",
        width: vw,
        height: vh,
        resolution: 1,
        render: {
            antialias: true,
            roundPixels: true
        },
        backgroundColor: GAME_CONFIG.backgroundColor,
        scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH
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
