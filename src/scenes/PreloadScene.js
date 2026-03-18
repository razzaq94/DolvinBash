import { GAME_CONFIG } from "../data/gameConfig.js";

export default class PreloadScene extends Phaser.Scene {
    constructor() {
        super("PreloadScene");
        this.loadingText = null;
    }

    preload() {
        if (GAME_CONFIG.debug.enableLogs) {
            console.log("[PreloadScene] preload");
        }

        this.drawLoadingText();
        this.scale.on("resize", this.handleResize, this);

        this.load.image("bg", "assets/seamless-bg-png-2.png");

        this.load.image("kicker_idle", "assets/kicker_idle.png");
        this.load.image("kicker_ready", "assets/kicker_ready.png");
        this.load.image("kicker_swing1", "assets/kicker_swing1.png");
        this.load.image("kicker_swing2", "assets/kicker_swing2.png");
        this.load.image("kicker_follow", "assets/kicker_follow.png");
    }

    create() {
        if (GAME_CONFIG.debug.enableLogs) {
            console.log("[PreloadScene] create");
        }

        this.scale.off("resize", this.handleResize, this);

        this.scene.start("GameScene");
        this.scene.launch("UIScene");
    }

    drawLoadingText() {
        const width = this.scale.width;
        const height = this.scale.height;

        if (this.loadingText) {
            this.loadingText.destroy();
        }

        this.loadingText = this.add.text(width * 0.5, height * 0.5, "Loading...", {
            fontSize: "32px",
            color: "#ffffff"
        }).setOrigin(0.5);
    }

    handleResize() {
        this.drawLoadingText();
    }
}