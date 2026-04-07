import { GAME_CONFIG } from "./data/gameConfig.js";
import BootScene from "./scenes/BootScene.js";
import PreloadScene from "./scenes/PreloadScene.js";
import GameScene from "./scenes/GameScene.js";

window.addEventListener("load", () => {
    const viewport = window.visualViewport;
    const vw = Math.round(viewport?.width ?? window.innerWidth);
    const vh = Math.round(viewport?.height ?? window.innerHeight);
    const isPortrait = vh >= vw;
    const isSmallScreen = Math.min(vw, vh) <= 900;

    // PC/4K safe: fixed design size + ENVELOP.
    // Mobile portrait: keep the responsive RESIZE approach that was working for you.
    const useResize = isPortrait && isSmallScreen;

    const baseWidth = useResize ? 720 : (GAME_CONFIG.baseWidth || 1920);
    const baseHeight = useResize ? 1280 : (GAME_CONFIG.baseHeight || 1080);

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
            roundPixels: false
        },
        backgroundColor: GAME_CONFIG.backgroundColor,
        scale: {
            mode: useResize ? Phaser.Scale.RESIZE : Phaser.Scale.ENVELOP,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            ...(useResize ? {} : { width: baseWidth, height: baseHeight })
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