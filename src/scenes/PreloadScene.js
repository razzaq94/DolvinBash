import { GAME_CONFIG } from "../data/gameConfig.js";

export default class PreloadScene extends Phaser.Scene {
    constructor() {
        super("PreloadScene");
        this.loadingText = null;
        this.loadingSubText = null;
        this.loadingBarBg = null;
        this.loadingBarFill = null;
        this.loadingProgress = 0;
    }

    preload() {
        if (GAME_CONFIG.debug.enableLogs) {
            console.log("[PreloadScene] preload");
        }

        this.drawLoadingText();
        this.scale.on("resize", this.handleResize, this);
        this.load.on("progress", (value) => {
            this.loadingProgress = Phaser.Math.Clamp(Number(value) || 0, 0, 1);
            this.drawLoadingText();
        });

        this.load.image("bg", "assets/seamless-bg-png-2.png");
        this.load.image("bg_skyline", "assets/obstacles/sky.png");
        this.load.image("bg_buildings", "assets/obstacles/far buildings.png");
        this.load.image("bg_road_bushes", "assets/obstacles/road and bushes.png");
        // UI logos should be part of preload pipeline so they are ready before gameplay UI appears.
        this.load.image("ui_logo_top", "assets/logo1.png");
        this.load.image("ui_logo_mid", "assets/logo2.png");

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
        this.load.image("doll_happywin", "assets/doll/happywin.png");
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
        this.load.image("bat_wing_up", "assets/obstacles/wingsup.png");
        this.load.image("bat_wing_mid", "assets/obstacles/wingsmiddle.png");
        this.load.image("bat_wing_down", "assets/obstacles/wingsdown.png");
        this.load.image("hazard_trafficcone", "assets/obstacles/trafficcone.png");
        this.load.image("hazard_roadblocker", "assets/obstacles/roadblocker.png");

        // Placeholder audio from Phaser Labs CDN for remaining effects
        const audioPrefix = "https://labs.phaser.io/assets/audio/SoundEffects/";
        this.load.audio("sfx_bounce", audioPrefix + "squit.mp3");
        this.load.audio("sfx_hazard", "src/sounds/hurt.mp3");
        // Use local audio for rolling/spin so it never misses cache on high-DPR/mobile browsers.
        this.load.audio("sfx_spin", "src/sounds/spin.mp3");
        // Keep sfx_slide reserved (legacy key) for any future slide/hit loop if needed.
        this.load.audio("sfx_slide", "src/sounds/hit.mp3");
        // One-shot ground impact hit
        this.load.audio("sfx_hit", "src/sounds/hit.mp3");

        // Win/Loss + Background music
        this.load.audio("sfx_win", "src/sounds/gamewin.mp3");
        this.load.audio("sfx_loss", "src/sounds/gameover.mp3");
    }

    /**
     * Bat-only: linear texture filtering so scaled wing frames stay smooth (HD art on mobile + PC).
     */
    applyBatHdTextureSettings() {
        const keys = ["bat_wing_up", "bat_wing_mid", "bat_wing_down"];
        const F = Phaser.Textures?.FilterMode;
        if (!F) {
            return;
        }

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (!this.textures.exists(key)) {
                continue;
            }
            const tex = this.textures.get(key);
            try {
                if (typeof tex.setFilter === "function") {
                    tex.setFilter(F.LINEAR);
                }
            } catch (_) {
                /* ignore */
            }
        }
    }

    /**
     * Doll sprites: linear texture filtering for smooth HD scaling (mobile + PC).
     */
    applyDollHdTextureSettings() {
        const keys = [
            "doll_idle",
            "doll_surprised",
            "doll_excited",
            "doll_determined",
            "doll_impact",
            "doll_panic",
            "doll_dazed",
            "doll_dizzy",
            "doll_ko",
            "doll_win",
            "doll_loss",
            "doll_falling",
            "doll_happy",
            "doll_happywin",
            "doll_angry"
        ];
        const F = Phaser.Textures?.FilterMode;
        if (!F) {
            return;
        }
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (!this.textures.exists(key)) continue;
            const tex = this.textures.get(key);
            try {
                if (typeof tex.setFilter === "function") {
                    tex.setFilter(F.LINEAR);
                }
            } catch (_) {
                /* ignore */
            }
        }
    }

    /**
     * Kicker sprites: linear texture filtering for smooth HD scaling (mobile + PC).
     */
    applyKickerHdTextureSettings() {
        const keys = [
            "kicker_idle",
            "kicker_ready",
            "kicker_swing1",
            "kicker_swing2",
            "kicker_follow"
        ];
        const F = Phaser.Textures?.FilterMode;
        if (!F) {
            return;
        }
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (!this.textures.exists(key)) continue;
            const tex = this.textures.get(key);
            try {
                if (typeof tex.setFilter === "function") {
                    tex.setFilter(F.LINEAR);
                }
            } catch (_) {
                /* ignore */
            }
        }
    }

    create() {
        if (GAME_CONFIG.debug.enableLogs) {
            console.log("[PreloadScene] create");
        }

        this.applyBatHdTextureSettings();
        this.applyDollHdTextureSettings();
        this.applyKickerHdTextureSettings();
        this.load.off("progress");

        this.scale.off("resize", this.handleResize, this);
        this.loadingText?.destroy();
        this.loadingSubText?.destroy();
        this.loadingBarBg?.destroy();
        this.loadingBarFill?.destroy();

        this.scene.start("GameScene");
        this.scene.launch("UIScene");
    }

    drawLoadingText() {
        const width = this.scale.width;
        const height = this.scale.height;

        if (!this.loadingText) {
            this.loadingText = this.add.text(0, 0, "", {
                fontSize: "32px",
                color: "#ffffff"
            }).setOrigin(0.5);
        }
        if (!this.loadingSubText) {
            this.loadingSubText = this.add.text(0, 0, "", {
                fontSize: "18px",
                color: "#cbd5e1"
            }).setOrigin(0.5);
        }

        if (!this.loadingBarBg) {
            this.loadingBarBg = this.add.rectangle(0, 0, 1, 1, 0x0f172a, 0.85).setStrokeStyle(2, 0xffffff, 0.25);
        }
        if (!this.loadingBarFill) {
            this.loadingBarFill = this.add.rectangle(0, 0, 1, 1, 0x22c55e, 1);
        }

        const isMobile = width < 900;
        const titleSize = isMobile ? "24px" : "34px";
        const subSize = isMobile ? "14px" : "18px";
        const barW = Math.min(isMobile ? 360 : 560, Math.round(width * (isMobile ? 0.78 : 0.56)));
        const barH = isMobile ? 18 : 22;
        const barX = width * 0.5;
        const barY = height * 0.5 + (isMobile ? 22 : 26);
        const fillW = Math.max(0, Math.round(barW * this.loadingProgress));
        const percentText = `${Math.round(this.loadingProgress * 100)}%`;

        this.loadingText.setText(`Preparing Game Assets (${percentText})`);
        this.loadingText.setPosition(width * 0.5, barY - (isMobile ? 46 : 52));
        this.loadingText.setStyle({
            fontFamily: '"Luckiest Guy", cursive',
            fontSize: titleSize,
            fontStyle: "600",
            color: "#ffffff"
        });

        this.loadingSubText.setText("");

        this.loadingBarBg.setPosition(barX, barY);
        this.loadingBarBg.setSize(barW, barH);

        this.loadingBarFill.setOrigin(0, 0.5);
        this.loadingBarFill.setPosition(barX - barW * 0.5, barY);
        this.loadingBarFill.setSize(fillW, Math.max(8, barH - 8));
    }

    handleResize() {
        this.drawLoadingText();
    }
}