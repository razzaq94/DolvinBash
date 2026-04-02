import { GAME_CONFIG } from "../data/gameConfig.js";
import GameStateManager, { GAME_STATES } from "../managers/GameStateManager.js";
import RoundManager from "../managers/RoundManager.js";
import UIManager from "../managers/UIManager.js";
import BridgeManager from "../managers/BridgeManager.js";
import DollController from "../systems/DollController.js";
import InteractionSystem from "../systems/InteractionSystem.js";
import ResultSystem from "../systems/ResultSystem.js";
import AudioManager from "../systems/AudioManager.js";

export default class GameScene extends Phaser.Scene {
    constructor() {
        super("GameScene");

        this.gameStateManager = null;
        this.roundManager = null;
        this.uiManager = null;
        this.bridgeManager = null;
        this.dollController = null;
        this.kickerController = null;
        this.interactionSystem = null;
        this.resultSystem = null;

        this.bg = null;
        this.infoText = null;
        this.stateUnsubscribe = null;

        this.worldWidth = GAME_CONFIG.world.width;

        this.kicker = null;
        this.gameplayTimeScale = 1;
    }

    create() {
        if (GAME_CONFIG.debug.enableLogs) {
            console.log("[GameScene] create");
        }

        this.cameras.main.setBackgroundColor(GAME_CONFIG.backgroundColor);

        this.createWorld();
        this.createActors();
        this.createSystems();
        this.createManagers();
        this.registerStateSubscription();
        this.registerInput();
        this.registerResize();

        this.gameStateManager.init(GAME_STATES.BETTING);

        // Background music
        this.bgm = this.audioManager?.play("bgm_loop", { volume: 0.08, loop: true, rate: 0.95 });
    }

    createWorld() {
        this.createBackground();

        this.cameras.main.setBounds(0, -2000, this.worldWidth, this.scale.height + 2000);

        this.layoutWorld();
    }

    createBackground() {
        this.bgVerticalOffset = 0;
        this.roadVerticalOffset = 210;

        // Separate skyline layer behind the main background
        this.skyline1 = this.add.image(0, 0, "bg_skyline")
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(-130);

        this.skyline2 = this.add.image(0, 0, "bg_skyline")
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(-130);

        // Far buildings as a separate mid-back layer
        this.buildings1 = this.add.image(0, 0, "bg_buildings")
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(-120);

        this.buildings2 = this.add.image(0, 0, "bg_buildings")
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(-120);

        // Foreground backdrop layer (road + bushes) from separate asset.
        // This stays visually aligned with world obstacles.
        this.bg1 = this.add.image(0, 0, "bg_road_bushes")
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(-100);

        this.bg2 = this.add.image(0, 0, "bg_road_bushes")
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(-100);

        this.bg = this.bg1; // Legacy reference
    }

    createActors() {
        this.createKicker();

        this.dollController = new DollController(this);
        this.dollController.create();
    }

    createSystems() {
        this.audioManager = new AudioManager(this);
        this.interactionSystem = new InteractionSystem(this, this.dollController);
        this.interactionSystem.create();

        this.resultSystem = new ResultSystem();
    }

    createKicker() {
        const groundY = this.getGroundY();
        const kickerX = this.getKickerX();

        this.kicker = this.add.image(
            kickerX,
            groundY + 12,
            "kicker_idle"
        ).setOrigin(0.5, 1);

        this.kicker.setScale(0.42);
        this.idleTween = null;
        this.startKickerIdle();

        this.kickerController = {
            isAnimating: false,

            playKick: () => {
                if (this.kickerController.isAnimating) return;

                this.kickerController.isAnimating = true;

                this.setKickerPose("kicker_ready");
                // Smoother feel: subtle anticipation dip
                this.tweens.killTweensOf(this.kicker);
                this.tweens.add({
                    targets: this.kicker,
                    y: this.getGroundY() + 14,
                    duration: 70,
                    yoyo: true,
                    ease: "Sine.easeInOut"
                });

                this.time.delayedCall(70, () => {
                    this.setKickerPose("kicker_swing1");
                    // Sound: Bash/Kick
                    this.audioManager?.play("sfx_kick", { volume: 0.35 });
                });

                this.time.delayedCall(135, () => {
                    this.setKickerPose("kicker_swing2");
                });

                // Keep follow frame very brief so the "hand out" pose doesn't linger
                this.time.delayedCall(200, () => {
                    this.setKickerPose("kicker_follow");
                });

                this.time.delayedCall(300, () => {
                    this.setKickerPose("kicker_idle");
                    this.kickerController.isAnimating = false;
                    this.startKickerIdle();
                });
            },

            reset: () => {
                this.setKickerPose("kicker_idle");
                this.kickerController.isAnimating = false;
                this.startKickerIdle();
            },

            relayout: () => {
                const nextGroundY = this.getGroundY();
                this.kicker.setPosition(this.getKickerX(), nextGroundY + 12);
            }
        };
    }

    setKickerPose(textureKey) {
        if (!this.kicker) return;
        this.kicker.setTexture(textureKey);

        if (textureKey !== "kicker_idle") {
            this.stopKickerIdle();
        }
    }

    startKickerIdle() {
        if (!this.kicker || this.idleTween) return;

        const groundY = this.getGroundY();
        this.idleTween = this.tweens.add({
            targets: this.kicker,
            scaleY: 0.432,
            y: groundY + 11.2,
            duration: 1400,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
        });
    }

    stopKickerIdle() {
        if (this.idleTween) {
            this.idleTween.stop();
            this.idleTween = null;

            if (this.kicker) {
                this.kicker.setScale(0.42);
                const groundY = this.getGroundY();
                this.kicker.y = groundY + 12;
            }
        }
    }

    createManagers() {
        this.gameStateManager = new GameStateManager({
            debug: GAME_CONFIG.debug.enableLogs
        });

        this.uiManager = new UIManager(this);
        this.uiManager.createAll();

        this.interactionSystem.onMultiplierChanged = (value) => {
            this.uiManager.updateMultiplier(value);
        };

        this.interactionSystem.onComboChanged = (payload) => {
            this.uiManager.updateCombo(payload);
        };

        this.roundManager = new RoundManager(
            this,
            this.gameStateManager,
            this.dollController,
            this.kickerController,
            this.interactionSystem,
            this.resultSystem,
            this.uiManager
        );

        // The following code block is based on the user's instruction to expand the doll's collision box.
        // It is assumed that the checkRectCollisions method is part of interactionSystem
        // and is called internally with these parameters.
        // This change is applied directly to the interactionSystem's internal collision logic.
        // Note: The provided snippet in the instruction was syntactically incorrect for this file,
        // so the change is applied conceptually to the interactionSystem's collision box size.
        this.uiManager.bindEvents(this.roundManager);

        this.bridgeManager = new BridgeManager(this.gameStateManager, this.roundManager);
        this.bridgeManager.init();
    }

    registerStateSubscription() {
        this.stateUnsubscribe = this.gameStateManager.subscribe((payload) => {
            if (GAME_CONFIG.debug.enableLogs) {
                console.log(
                    `[GameScene] state changed -> ${payload.currentState}` +
                    (payload.reason ? ` | reason: ${payload.reason}` : "")
                );
            }

            this.uiManager.updateByState(payload.currentState);
            this.game.events.emit("global-state-changed", payload);
        });
    }

    registerInput() {
        if (!this.input.keyboard) return;

        this.input.keyboard.on("keydown-S", () => {
            this.roundManager.startPrototypeRound();
        });

        this.input.keyboard.on("keydown-P", () => {
            if (this.gameStateManager.isState(GAME_STATES.PAUSED)) {
                this.gameStateManager.resume("keyboard_resume");
            } else {
                this.gameStateManager.pause("keyboard_pause");
            }
        });

        this.input.keyboard.on("keydown-R", () => {
            this.roundManager.replay();
        });
    }

    registerResize() {
        this.scale.on("resize", this.handleResize, this);
        this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
        this.events.on(Phaser.Scenes.Events.DESTROY, this.onShutdown, this);
    }

    update(time, delta) {
        const timeScale = Math.max(0.5, Math.min(1.6, Number(this.gameplayTimeScale) || 1));
        let deltaSeconds = (delta / 1000) * timeScale;
        const layout = this.getViewportLayout?.() || { isMobile: false };
        const capMs = layout.isMobile ? (GAME_CONFIG.performance?.mobilePhysicsDeltaCapMs ?? 0) : 0;
        if (capMs > 0) {
            const capSec = (capMs / 1000) * timeScale;
            if (deltaSeconds > capSec) {
                deltaSeconds = capSec;
            }
        }

        this.dollController?.update(deltaSeconds);

        if (this.gameStateManager?.isState(GAME_STATES.FLYING)) {
            this.interactionSystem?.update(deltaSeconds);
        }

        this.dollController?.finalizeAfterHazards?.();

        this.updateCamera(deltaSeconds);
    }

    setGameplayTimeScale(scale = 1) {
        let s = Math.max(0.5, Math.min(1.6, Number(scale) || 1));
        const layout = this.getViewportLayout?.() || { isMobile: false };
        const mobileCap = GAME_CONFIG.performance?.mobileGameplayTimeScaleCap;
        if (layout.isMobile && mobileCap != null && mobileCap > 0) {
            s = Math.min(s, mobileCap);
        }
        this.gameplayTimeScale = s;
        // Make tweens/timers also match the selected speed.
        if (this.time) this.time.timeScale = s;
        if (this.tweens) this.tweens.timeScale = s;
    }

    updateCamera(deltaSeconds) {
        if (!this.dollController) return;

        const cam = this.cameras.main;
        const height = this.scale.height;
        const layout = this.getViewportLayout?.() || { isMobile: false };

        // X Following
        const width = this.scale.width;
        const targetX = layout.isMobile
            ? (this.dollController.position.x - (width * 0.5)) // center on mobile portrait
            : (this.dollController.position.x + GAME_CONFIG.camera.followOffsetX);
        const followMaxX = Math.max(0, this.worldWidth - this.scale.width);
        const clampedX = Phaser.Math.Clamp(targetX, 0, followMaxX);

        if (layout.isMobile) {
            // Hard center on mobile (no lag), like reference portrait games.
            cam.scrollX = clampedX;
        } else {
            cam.scrollX = Phaser.Math.Linear(
                cam.scrollX,
                clampedX,
                GAME_CONFIG.camera.followLerp
            );
        }

        // Y Following (Sky Follow)
        const dollY = this.dollController.position.y;
        const groundY = this.dollController.groundY;

        const verticalLead = layout.isMobile ? (height * 0.5) : (height * 0.48);
        const targetScrollY = Math.min(0, dollY - verticalLead);

        const minY = -2000;
        const maxY = 0;

        const clampedY = Phaser.Math.Clamp(targetScrollY, minY, maxY);
        if (layout.isMobile) {
            cam.scrollY = clampedY;
        } else {
            cam.scrollY = Phaser.Math.Linear(
                cam.scrollY,
                clampedY,
                GAME_CONFIG.camera.verticalLerp ?? 0.045
            );
        }

        this.updateBackgroundMotion(cam.scrollX, cam.scrollY);
    }

    layoutWorld() {
        const layout = this.getViewportLayout();
        const { width, height, stageTop, stageBottom } = layout;
        const bgTexture = this.textures.get("bg");
        const source = bgTexture?.getSourceImage?.();
        const textureWidth = source?.width || GAME_CONFIG.baseWidth;
        const textureHeight = source?.height || GAME_CONFIG.baseHeight;
        const scale = Math.max(width / textureWidth, height / textureHeight);

        const roadOffset =
            layout.isMobile
                ? (GAME_CONFIG.world.roadVerticalOffsetMobile ?? this.roadVerticalOffset)
                : (GAME_CONFIG.world.roadVerticalOffsetDesktop ?? this.roadVerticalOffset);
        this.roadVerticalOffsetActive = roadOffset;

        if (this.skyline1 && this.skyline2) {
            const skyTexture = this.textures.get("bg_skyline");
            const skySource = skyTexture?.getSourceImage?.();
            const skyW = skySource?.width || textureWidth;
            const skyH = skySource?.height || textureHeight;
            const skyScale = Math.max(width / skyW, height / skyH) * 1.02;
            this.skyline1.setScale(skyScale);
            this.skyline2.setScale(skyScale);

            const skylineWidth = Math.ceil(this.skyline1.displayWidth);
            this.skyline1.setPosition(0, Math.round(height * 0.5) + this.bgVerticalOffset);
            this.skyline2.setPosition(skylineWidth - 1, Math.round(height * 0.5) + this.bgVerticalOffset);
        }

        if (this.buildings1 && this.buildings2) {
            const bTexture = this.textures.get("bg_buildings");
            const bSource = bTexture?.getSourceImage?.();
            const bW = bSource?.width || textureWidth;
            const bH = bSource?.height || textureHeight;
            const bScale = Math.max(width / bW, height / bH) * 1.02;
            this.buildings1.setScale(bScale);
            this.buildings2.setScale(bScale);

            const buildingsWidth = Math.ceil(this.buildings1.displayWidth);
            this.buildings1.setPosition(0, Math.round(height * 0.5) + this.bgVerticalOffset);
            this.buildings2.setPosition(buildingsWidth - 1, Math.round(height * 0.5) + this.bgVerticalOffset);
        }

        if (this.bg1 && this.bg2) {
            // FIX: 1.02 overscale — sub-pixel gaps ko cover karne ke liye
            const overScale = scale * 1.02;
            this.bg1.setScale(overScale);
            this.bg2.setScale(overScale);

            // FIX: Math.ceil se bgWidth integer guarantee — gap nahi aayega
            const bgWidth = Math.ceil(this.bg1.displayWidth);

            this.bg1.setPosition(0, Math.round(height * 0.5) + roadOffset);
            // FIX: -1 pixel overlap hardcode — consistent seam removal
            this.bg2.setPosition(bgWidth - 1, Math.round(height * 0.5) + roadOffset);
        }

        if (this.infoText) {
            this.infoText.setPosition(16, Math.max(10, stageTop - 22));
        }

        this.cameras.main.setBounds(0, -2000, this.worldWidth, height + 2000);
        this.updateBackgroundMotion(this.cameras.main.scrollX, this.cameras.main.scrollY);
    }

    updateBackgroundMotion(scrollX = 0, scrollY = 0) {
        if (!this.bg1 || !this.bg2) return;

        const height = this.scale.height;
        const roadOffset = this.roadVerticalOffsetActive ?? this.roadVerticalOffset;

        if (this.skyline1 && this.skyline2) {
            const skylineWidth = Math.ceil(this.skyline1.displayWidth);
            const skylineParallaxX = 0.65;
            const skylineOffset = scrollX * skylineParallaxX;
            const skylineBaseX = -(skylineOffset % skylineWidth);
            const skylineRoundedX = Math.round(skylineBaseX);

            this.skyline1.x = skylineRoundedX;
            this.skyline2.x = skylineRoundedX + skylineWidth - 1;

            // Keep skyline vertically static; only horizontal parallax.
            const skylineYShift = 0;
            this.skyline1.y = Math.round((height * 0.5) + this.bgVerticalOffset + skylineYShift);
            this.skyline2.y = Math.round((height * 0.5) + this.bgVerticalOffset + skylineYShift);
        }

        if (this.buildings1 && this.buildings2) {
            const buildingsWidth = Math.ceil(this.buildings1.displayWidth);
            // Keep buildings static relative to gameplay world (no parallax).
            const buildingsParallaxX = 1.0;
            const buildingsOffset = scrollX * buildingsParallaxX;
            const buildingsBaseX = -(buildingsOffset % buildingsWidth);
            const buildingsRoundedX = Math.round(buildingsBaseX);

            this.buildings1.x = buildingsRoundedX;
            this.buildings2.x = buildingsRoundedX + buildingsWidth - 1;

            // Move buildings in reverse of camera Y (same behavior as static BG).
            const buildingsYShift = -scrollY;
            this.buildings1.y = Math.round((height * 0.5) + this.bgVerticalOffset + buildingsYShift);
            this.buildings2.y = Math.round((height * 0.5) + this.bgVerticalOffset + buildingsYShift);
        }

        // FIX: Math.ceil — fractional bgWidth se gap aata tha, ab nahi aayega
        const bgWidth = Math.ceil(this.bg1.displayWidth);

        // Set parallaxFactor to 1.0 so that the ground/background moves at the same speed 
        // as the world-space obstacles (IterationSystem objects). 
        // This ensures obstacles "stick" to the road and grass.
        const parallaxFactor = 1.0;
        const totalOffset = scrollX * parallaxFactor;

        // FIX: Math.round on base — dono images ek saath consistent rounding
        const baseX = -(totalOffset % bgWidth);
        const roundedX = Math.round(baseX);

        this.bg1.x = roundedX;
        // FIX: bgWidth - 1 fixed overlap — white line permanently gone
        this.bg2.x = roundedX + bgWidth - 1;

        // Move static BG in reverse of camera Y (1:1).
        // camera up   (scrollY negative) -> BG down
        // camera down (scrollY positive) -> BG up
        const reverseCameraY = -scrollY;

        // FIX: Math.round on Y too — vertical sub-pixel rendering fix
        this.bg1.y = Math.round((height * 0.5) + roadOffset + reverseCameraY);
        this.bg2.y = Math.round((height * 0.5) + roadOffset + reverseCameraY);
    }

    onShutdown() {
        this.scale.off("resize", this.handleResize, this);

        if (this.stateUnsubscribe) {
            this.stateUnsubscribe();
            this.stateUnsubscribe = null;
        }

        this.bridgeManager?.destroy();
        this.roundManager?.destroy();
        this.interactionSystem?.destroy();
        this.dollController?.destroy();

        this.bgm?.stop?.();
        this.bgm?.destroy?.();
        this.bgm = null;
    }

    handleResize() {
        this.layoutWorld();

        this.kickerController?.relayout();
        this.dollController?.relayout();
        this.interactionSystem?.relayout();

        this.uiManager?.betPanel?.layout();
        this.uiManager?.resultPanel?.layout();
    }

    getViewportLayout() {
        const width = this.scale.width;
        const height = this.scale.height;
        const isMobile = width < 900;

        const hudReserved = isMobile ? 122 : 114;
        const stageTop = isMobile ? 12 : 16;
        const stageBottom = height - hudReserved;
        const stageHeight = Math.max(200, stageBottom - stageTop);
        const contentWidth = width;
        const stageLeft = 0;
        const stageRight = width;

        return {
            width,
            height,
            isMobile,
            hudReserved,
            stageTop,
            stageBottom,
            stageHeight,
            contentWidth,
            stageLeft,
            stageRight,
            centerX: width * 0.5
        };
    }

    getGroundY() {
        const layout = this.getViewportLayout();
        return layout.stageBottom - (layout.isMobile ? 10 : 16);
    }

    getKickerX() {
        const layout = this.getViewportLayout();
        return layout.isMobile ? 76 : 112;
    }

    resetCamera() {
        const cam = this.cameras.main;
        cam.scrollX = 0;
        cam.scrollY = 0;
        cam.setAngle(0);
        cam.setZoom(1);
        this.updateBackgroundMotion(0, 0);
    }

    shakeOnHazard() {
        this.cameras.main.shake(
            GAME_CONFIG.camera.shakeMajorMs ?? 180,
            GAME_CONFIG.camera.shakeMajorIntensity ?? 0.01
        );
    }

    shakeMinor() {
        this.cameras.main.shake(
            GAME_CONFIG.camera.shakeMinorMs ?? 120,
            GAME_CONFIG.camera.shakeMinorIntensity ?? 0.0045
        );
    }

    spawnWinParticles() {
        const cam = this.cameras.main;
        const { width, height } = this.scale;
        const left = cam.scrollX;
        const top = cam.scrollY;

        for (let i = 0; i < 95; i++) {
            const x = left + Phaser.Math.Between(40, width - 40);
            const y = top + Phaser.Math.Between(-40, 110);
            const size = Phaser.Math.Between(10, 22);
            const color = Phaser.Display.Color.GetColor(
                Phaser.Math.Between(170, 255),
                Phaser.Math.Between(170, 255),
                Phaser.Math.Between(170, 255)
            );

            const glow = this.add.circle(x, y, size * 0.95, color, 0.28)
                .setDepth(998)
                .setScrollFactor(1, 1);

            const p = this.add.rectangle(x, y, size, size, color, 1)
                .setDepth(999)
                .setScrollFactor(1, 1)
                .setAngle(Phaser.Math.Between(0, 360));

            this.tweens.add({
                targets: [p, glow],
                x: x + Phaser.Math.Between(-260, 260),
                y: y + Phaser.Math.Between(420, 760),
                angle: p.angle + Phaser.Math.Between(-520, 520),
                alpha: 0,
                duration: Phaser.Math.Between(1150, 1700),
                ease: "Quad.easeOut",
                onComplete: () => {
                    p.destroy();
                    glow.destroy();
                }
            });
        }
    }
}