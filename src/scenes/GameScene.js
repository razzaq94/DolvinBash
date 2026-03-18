import { GAME_CONFIG } from "../data/gameConfig.js";
import GameStateManager, { GAME_STATES } from "../managers/GameStateManager.js";
import RoundManager from "../managers/RoundManager.js";
import UIManager from "../managers/UIManager.js";
import BridgeManager from "../managers/BridgeManager.js";
import DollController from "../systems/DollController.js";
import InteractionSystem from "../systems/InteractionSystem.js";
import ResultSystem from "../systems/ResultSystem.js";

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
    }

    createWorld() {
        this.bg = this.add.image(0, 0, "bg")
            .setOrigin(0, 0)
            .setScrollFactor(0);

        this.infoText = this.add.text(40, 40, "Dolvin Bash - GameScene", {
            fontSize: "28px",
            color: "#ffffff"
        }).setScrollFactor(0);

        this.cameras.main.setBounds(0, 0, this.worldWidth, this.scale.height);

        this.layoutWorld();
    }

    createActors() {
        this.createKicker();

        this.dollController = new DollController(this);
        this.dollController.create();
    }

    createSystems() {
        this.interactionSystem = new InteractionSystem(this, this.dollController);
        this.interactionSystem.create();

        this.resultSystem = new ResultSystem();
    }

    createKicker() {
        const groundY = this.getGroundY();

        this.kicker = this.add.image(
            GAME_CONFIG.kicker.x,
            groundY - 6,
            "kicker_idle"
        ).setOrigin(0.5, 1);

        this.kicker.setScale(0.42);

        this.kickerController = {
            isAnimating: false,

            playKick: () => {
                if (this.kickerController.isAnimating) return;

                this.kickerController.isAnimating = true;

                this.setKickerPose("kicker_ready");

                this.time.delayedCall(90, () => {
                    this.setKickerPose("kicker_swing1");
                });

                this.time.delayedCall(170, () => {
                    this.setKickerPose("kicker_swing2");
                });

                this.time.delayedCall(280, () => {
                    this.setKickerPose("kicker_follow");
                });

                this.time.delayedCall(460, () => {
                    this.setKickerPose("kicker_idle");
                    this.kickerController.isAnimating = false;
                });
            },

            reset: () => {
                this.setKickerPose("kicker_idle");
                this.kickerController.isAnimating = false;
            },

            relayout: () => {
                const nextGroundY = this.getGroundY();
                this.kicker.setPosition(GAME_CONFIG.kicker.x, nextGroundY - 6);
            }
        };
    }

    setKickerPose(textureKey) {
        if (!this.kicker) return;
        this.kicker.setTexture(textureKey);
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
        const deltaSeconds = delta / 1000;

        this.dollController?.update(deltaSeconds);

        if (this.gameStateManager?.isState(GAME_STATES.FLYING)) {
            this.interactionSystem?.update(deltaSeconds);
        }

        this.updateCamera(deltaSeconds);
    }

    updateCamera(deltaSeconds) {
        if (!this.dollController) return;

        const cam = this.cameras.main;

        const targetX = this.dollController.position.x + GAME_CONFIG.camera.followOffsetX;

        const clampedTarget = Phaser.Math.Clamp(
            targetX,
            0,
            GAME_CONFIG.camera.maxX
        );

        cam.scrollX = Phaser.Math.Linear(
            cam.scrollX,
            clampedTarget,
            GAME_CONFIG.camera.followLerp
        );
    }

    layoutWorld() {
        const width = this.scale.width;
        const height = this.scale.height;

        if (this.bg) {
            this.bg.setPosition(0, 0);
            this.bg.setDisplaySize(width, height);
        }

        if (this.infoText) {
            this.infoText.setPosition(40, 40);
        }

        this.cameras.main.setBounds(0, 0, this.worldWidth, height);
    }

    handleResize() {
        this.layoutWorld();

        this.kickerController?.relayout();
        this.dollController?.relayout();
        this.interactionSystem?.relayout();

        this.uiManager?.betPanel?.layout();
        this.uiManager?.resultPanel?.layout();
    }

    getGroundY() {
        return this.scale.height - GAME_CONFIG.world.groundOffsetFromBottom;
    }

    resetCamera() {
        const cam = this.cameras.main;
        cam.scrollX = 0;
        cam.scrollY = 0;
        cam.setAngle(0);
        cam.setZoom(1);
    }

    shakeOnHazard() {
        this.cameras.main.shake(180, 0.010);
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
    }
}