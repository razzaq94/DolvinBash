import { GAME_CONFIG } from "./data/gameConfig.js";
import BootScene from "./scenes/BootScene.js";
import PreloadScene from "./scenes/PreloadScene.js";
import GameScene from "./scenes/GameScene.js";

window.addEventListener("load", () => {
    // Fixed internal canvas sizes:
    // - Desktop: 1920x1080 and ENVELOP (fills full screen, crops a little if needed)
    // - Mobile portrait: 720x1280 and ENVELOP (portrait, full screen cover)
    const viewport = window.visualViewport;
    const vw = Math.round(viewport?.width ?? window.innerWidth);
    const vh = Math.round(viewport?.height ?? window.innerHeight);
    const isPortrait = vh >= vw;
    const isSmallScreen = Math.min(vw, vh) <= 900;

    const baseWidth = (isPortrait && isSmallScreen) ? 720 : (GAME_CONFIG.baseWidth || 1920);
    const baseHeight = (isPortrait && isSmallScreen) ? 1280 : (GAME_CONFIG.baseHeight || 1080);
    const scaleMode = (isPortrait && isSmallScreen) ? Phaser.Scale.ENVELOP : Phaser.Scale.ENVELOP;

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
            mode: scaleMode,
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