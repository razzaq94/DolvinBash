import { GAME_CONFIG } from "./data/gameConfig.js";
import BootScene from "./scenes/BootScene.js";
import PreloadScene from "./scenes/PreloadScene.js";
import GameScene from "./scenes/GameScene.js";

function getViewportSize() {
    const viewport = window.visualViewport;

    if (viewport) {
        return {
            width: Math.round(viewport.width),
            height: Math.round(viewport.height)
        };
    }

    return {
        width: window.innerWidth,
        height: window.innerHeight
    };
}

window.addEventListener("load", () => {
    const viewportSize = getViewportSize();

    const config = {
        type: Phaser.AUTO,
        parent: "game-root",
        width: viewportSize.width,
        height: viewportSize.height,
        // Force stable rendering across high-DPR devices (S24/4K with zoom/DPR changes).
        // We intentionally keep internal resolution at 1 and let the browser scale the canvas.
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

    const resizeGame = () => {
        if (!game || !game.scale) return;
        const nextViewportSize = getViewportSize();
        game.scale.resize(nextViewportSize.width, nextViewportSize.height);
    };

    window.addEventListener("resize", resizeGame);
    window.visualViewport?.addEventListener("resize", resizeGame);
    window.visualViewport?.addEventListener("scroll", resizeGame);
});