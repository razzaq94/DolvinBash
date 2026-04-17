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
    const rawDpr = Number(window.devicePixelRatio) || 1;
    const isMobileLike = isPortrait && isSmallScreen;
    // Force high-DPI rendering across devices (desktop/tablet/mobile), with safe caps.
    // Mobile gets a slightly lower cap to avoid GPU overload on weaker phones.
    const renderResolution = isMobileLike
        ? Math.max(1.5, Math.min(2.25, rawDpr))
        : Math.max(1.5, Math.min(3, rawDpr));

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
        // Render at device DPR (capped) to keep text/sprites crisp on iPad/tablet/mobile/PC.
        resolution: renderResolution,
        render: {
            antialias: true,
            antialiasGL: true,
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