import { GAME_CONFIG } from "./data/gameConfig.js";
import BootScene from "./scenes/BootScene.js";
import PreloadScene from "./scenes/PreloadScene.js";
import GameScene from "./scenes/GameScene.js";

window.addEventListener("load", () => {
    const viewport = window.visualViewport;
    const vw = Math.max(1, Math.round(viewport?.width ?? window.innerWidth));
    const vh = Math.max(1, Math.round(viewport?.height ?? window.innerHeight));

    // Pure Phaser.Scale.RESIZE matches the *browser* pixel size, so on 4K the game
    // world becomes ~3840×2160 — heavy, glitchy layout, and “collapsed” sprites.
    // Fixed *design* size + ENVELOP: internal coords stay stable; canvas scales to
    // fill #game-root (same visual as “responsive”, safe on 4K / high-DPR).
    const isPortrait = vh >= vw;
    const isCompact = Math.min(vw, vh) <= 900;
    const baseWidth = isPortrait && isCompact ? 720 : 1920;
    const baseHeight = isPortrait && isCompact ? 1280 : 1080;

    const config = {
        type: Phaser.AUTO,
        parent: "game-root",
        width: baseWidth,
        height: baseHeight,
        resolution: 1,
        render: {
            antialias: true,
            roundPixels: true
        },
        backgroundColor: GAME_CONFIG.backgroundColor,
        scale: {
            mode: Phaser.Scale.ENVELOP,
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
