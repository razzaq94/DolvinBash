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
        this.load.image("bg_skyline", "assets/obstacles/sky.png");
        this.load.image("bg_buildings", "assets/obstacles/far buildings.png");
        this.load.image("bg_road_bushes", "assets/obstacles/road and bushes.png");

        this.load.image("kicker_idle", "assets/kicker_idle.png");
        this.load.image("kicker_ready", "assets/kicker_ready.png");
        this.load.image("kicker_swing1", "assets/kicker_swing1.png");
        this.load.image("kicker_swing2", "assets/kicker_swing2.png");
        this.load.image("kicker_follow", "assets/kicker_follow.png");

        // Doll pose frames
        this.load.image("doll_idle", "assets/doll/idle.png");
        this.load.image("doll_surprised", "assets/doll/kick_surprised.png");
        this.load.image("doll_excited", "assets/doll/fly_up.png");
        this.load.image("doll_determined", "assets/doll/fly_forward.png");
        this.load.image("doll_impact", "assets/doll/hit.png");
        this.load.image("doll_panic", "assets/doll/dive.png");
        this.load.image("doll_dazed", "assets/doll/slide.png");
        this.load.image("doll_dizzy", "assets/doll/spin.png");
        this.load.image("doll_ko", "assets/doll/ko.png");
        this.load.image("doll_win", "assets/doll/win.png");
        this.load.image("doll_loss", "assets/doll/ko.png");
        this.load.image("doll_falling", "assets/doll/falling.png");
        this.load.image("doll_happy", "assets/doll/happy.png");
        this.load.image("doll_angry", "assets/doll/angry.png");

        // Custom audio provided by the user
        this.load.audio("sfx_kick", "src/sounds/bat.mp3");
        this.load.audio("sfx_pickup", "src/sounds/hit.mp3");
        this.load.audio("sfx_click", "src/sounds/click.mp3");
        this.load.audio("sfx_start", "src/sounds/start.mp3");

        // Environmental Obstacles
        this.load.image("hazard_tree", "assets/obstacles/tall trees.png");
        this.load.image("hazard_lamp_post", "assets/obstacles/lamp posts.png");
        this.load.image("hazard_hole", "assets/obstacles/hole.png");
        this.load.image("hazard_water", "assets/obstacles/water pools 1.png");
        this.load.image("hazard_pole", "assets/obstacles/water poles.png"); // Using hydrant as pole
        this.load.image("hazard_water_2", "assets/obstacles/water pools 2.png");
        this.load.image("hazard_bomb", "assets/obstacles/bomb.png");

        // Placeholder audio from Phaser Labs CDN for remaining effects
        const audioPrefix = "https://labs.phaser.io/assets/audio/SoundEffects/";
        this.load.audio("sfx_bounce", audioPrefix + "squit.mp3");
        this.load.audio("sfx_hazard", "src/sounds/hurt.mp3");
        this.load.audio("sfx_slide", audioPrefix + "squit.mp3"); // Using squit as placeholder for "ragar" sound

        // Win/Loss + Background music
        this.load.audio("sfx_win", "src/sounds/gamewin.mp3");
        this.load.audio("sfx_loss", "src/sounds/gameover.mp3");
        this.load.audio("bgm_loop", "https://labs.phaser.io/assets/audio/tech.mp3");
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