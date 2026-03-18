import { GAME_STATES } from "./GameStateManager.js";
import { GAME_CONFIG } from "../data/gameConfig.js";

export default class RoundManager {
    constructor(scene, gameStateManager, dollController, kickerController, interactionSystem, resultSystem, uiManager) {
        this.scene = scene;
        this.gameStateManager = gameStateManager;
        this.dollController = dollController;
        this.kickerController = kickerController;
        this.interactionSystem = interactionSystem;
        this.resultSystem = resultSystem;
        this.uiManager = uiManager;

        this.sequenceEvents = [];
        this.isRoundActive = false;
        this.currentBet = 0;
        this.lastResult = null;
        this.hitHazard = false;
        this.currentPattern = null;
    }

    startPrototypeRound() {
        if (!this.gameStateManager.isState(GAME_STATES.BETTING)) {
            console.warn("[RoundManager] Cannot start round. Current state is not BETTING.");
            return;
        }

        this.clearSequence();
        this.isRoundActive = true;
        this.hitHazard = false;

        this.currentBet = this.uiManager.getCurrentBet();
        this.currentPattern = this.pickEncounterPattern();

        this.scene.resetCamera();
        this.dollController.reset();
        this.kickerController.reset();
        this.interactionSystem.loadPattern(this.currentPattern);

        this.emitHostEvent("onDolvinRoundStart", {
            betAmount: this.currentBet,
            patternId: this.currentPattern?.id || "",
            state: "STARTING"
        });

        const started = this.gameStateManager.setState(GAME_STATES.STARTING, "player_start_pressed");
        if (!started) {
            this.isRoundActive = false;
            return;
        }

        this.runSequence();
    }

    pickEncounterPattern() {
        const patterns = GAME_CONFIG.encounters.patterns;
        if (!patterns.length) return null;

        let totalWeight = 0;
        for (let i = 0; i < patterns.length; i++) {
            totalWeight += Math.max(0, patterns[i].weight ?? 1);
        }

        if (totalWeight <= 0) {
            return patterns[Phaser.Math.Between(0, patterns.length - 1)];
        }

        let roll = Phaser.Math.Between(1, totalWeight);

        for (let i = 0; i < patterns.length; i++) {
            roll -= Math.max(0, patterns[i].weight ?? 1);
            if (roll <= 0) {
                return patterns[i];
            }
        }

        return patterns[patterns.length - 1];
    }

    runSequence() {
        this.pushEvent(this.scene.time.delayedCall(350, () => {
            this.gameStateManager.setState(GAME_STATES.KICKING, "kick_sequence_begin");
            this.kickerController.playKick();
            this.dollController.startKickReaction();
        }));

        this.pushEvent(this.scene.time.delayedCall(650, () => {
            this.gameStateManager.setState(GAME_STATES.FLYING, "doll_launch");
            this.dollController.launch();

            this.dollController.onMovementComplete = () => {
                this.finishRound(false);
            };

            this.interactionSystem.onHazardHit = () => {
                this.scene.shakeOnHazard();
                this.dollController.stopMovement();
                this.finishRound(true);
            };
        }));
    }

    finishRound(hitHazard) {
        if (!this.isRoundActive) {
            return;
        }

        this.isRoundActive = false;
        this.hitHazard = hitHazard;
        this.clearSequence();
        this.interactionSystem.stop();

        const movedToRoundEnd = this.gameStateManager.setState(
            GAME_STATES.ROUND_END,
            hitHazard ? "hazard_hit" : "movement_finished"
        );

        if (!movedToRoundEnd) {
            return;
        }

        const multiplier = this.interactionSystem.getMultiplier();

        this.lastResult = this.resultSystem.calculate(
            this.currentBet,
            multiplier,
            hitHazard,
            this.interactionSystem.getMaxCombo()
        );

        this.lastResult.patternId = this.interactionSystem.getPatternId();

        this.pushEvent(this.scene.time.delayedCall(500, () => {
            this.gameStateManager.setState(GAME_STATES.RESULT, "show_result_panel");
            this.uiManager.showResult(this.lastResult);
            this.uiManager.applyRoundResult(this.lastResult);

            this.emitHostEvent("onDolvinRoundEnd", {
                betAmount: this.lastResult.betAmount,
                multiplier: this.lastResult.multiplier,
                payout: this.lastResult.payout,
                hitHazard: this.lastResult.hitHazard,
                maxCombo: this.lastResult.maxCombo,
                patternId: this.lastResult.patternId || ""
            });
        }));
    }

    replay() {
        this.clearSequence();
        this.isRoundActive = false;
        this.hitHazard = false;
        this.currentPattern = null;

        this.scene.resetCamera();
        this.dollController.reset();
        this.kickerController.reset();
        this.interactionSystem.clearAll();

        this.gameStateManager.setState(GAME_STATES.BETTING, "replay_pressed");
    }

    emitHostEvent(callbackName, payload) {
        const fn = window?.[callbackName];
        if (typeof fn === "function") {
            try {
                fn(payload);
            } catch (error) {
                console.error(`[RoundManager] host callback failed: ${callbackName}`, error);
            }
        }
    }

    clearSequence() {
        for (let i = 0; i < this.sequenceEvents.length; i++) {
            this.sequenceEvents[i]?.remove(false);
        }

        this.sequenceEvents.length = 0;
        this.dollController.onMovementComplete = null;
        this.interactionSystem.onHazardHit = null;
    }

    pushEvent(event) {
        this.sequenceEvents.push(event);
    }

    destroy() {
        this.clearSequence();
    }
}