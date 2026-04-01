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
        this.currentSpeedMode = GAME_CONFIG.round.defaultSpeedMode || "NORMAL";
        this.currentVolatility = GAME_CONFIG.round.defaultVolatility || "NORMAL";

        this.autoPlayRemaining = 0;
    }

    startPrototypeRound({ fromAutoplay = false } = {}) {
        if (!this.gameStateManager.isState(GAME_STATES.BETTING)) {
            console.warn("[RoundManager] Cannot start round. Current state is not BETTING.");
            return;
        }

        this.clearSequence();
        this.isRoundActive = true;
        this.hitHazard = false;

        this.currentBet = this.uiManager.getCurrentBet();
        this.currentSpeedMode = this.uiManager.getSpeedMode();
        this.currentVolatility = this.uiManager.getVolatility();
        if (!fromAutoplay) {
            const desired = Math.max(1, Number(this.uiManager.getAutoPlayCount?.() ?? 1) || 1);
            // Show/run autoplay ONLY when user explicitly selected it (even if it's x1).
            const selected = !!this.uiManager.getAutoPlaySelected?.();
            this.autoPlayRemaining = selected ? desired : 0;
            this.uiManager.setAutoPlayRemaining?.(this.autoPlayRemaining);
        }
        this.dollController.setRoundTuning?.(this.currentSpeedMode);
        this.interactionSystem.setRoundTuning?.({
            speedMode: this.currentSpeedMode,
            volatility: this.currentVolatility
        });
        const speedCfg = GAME_CONFIG.speedModes?.[this.currentSpeedMode] || GAME_CONFIG.speedModes?.NORMAL || {};
        this.scene.setGameplayTimeScale?.(speedCfg.timeScale ?? 1);
        this.currentPattern = this.pickEncounterPattern();

        this.scene.resetCamera();
        this.dollController.reset();
        this.kickerController.reset();
        this.interactionSystem.loadPattern(this.currentPattern);

        this.emitHostEvent("onDolvinRoundStart", {
            betAmount: this.currentBet,
            patternId: this.currentPattern?.id || "",
            speedMode: this.currentSpeedMode,
            volatility: this.currentVolatility,
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
        const volatilityCfg = GAME_CONFIG.volatilityModes?.[this.currentVolatility] || GAME_CONFIG.volatilityModes?.NORMAL || {};
        const hazardWeightMultiplier = volatilityCfg.hazardWeightMultiplier ?? 1;

        let totalWeight = 0;
        for (let i = 0; i < patterns.length; i++) {
            const pattern = patterns[i];
            const baseWeight = Math.max(0, pattern.weight ?? 1);
            const hazardCount = (pattern.items || []).filter((item) => item.type === "hazard").length;
            const adjustedWeight = baseWeight * Math.max(0.25, 1 + ((hazardWeightMultiplier - 1) * hazardCount * 0.35));
            totalWeight += adjustedWeight;
        }

        const totalWeightInt = Math.max(1, Math.round(totalWeight));

        if (totalWeight <= 0) {
            return patterns[Phaser.Math.Between(0, patterns.length - 1)];
        }

        let roll = Phaser.Math.Between(1, totalWeightInt);

        for (let i = 0; i < patterns.length; i++) {
            const pattern = patterns[i];
            const baseWeight = Math.max(0, pattern.weight ?? 1);
            const hazardCount = (pattern.items || []).filter((item) => item.type === "hazard").length;
            const adjustedWeight = baseWeight * Math.max(0.25, 1 + ((hazardWeightMultiplier - 1) * hazardCount * 0.35));
            roll -= adjustedWeight;
            if (roll <= 0) {
                return pattern;
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
                // Round resolves only when the doll fully stops.
                if (!this.hitHazard) {
                    // Apply win pose immediately after full stop.
                    this.dollController.onRoundResult?.(true);
                    this.dollController.doll?.setAngle?.(0);
                }
                this.finishRound(this.hitHazard);
            };

            this.interactionSystem.onHazardHit = (item, isFatal) => {
                this.scene.shakeOnHazard();
                if (isFatal) {
                    this.hitHazard = true;
                    if (item?.variant === "hole") {
                        // Trigger the cinematic hole-fall sequence
                        this.dollController.onHoleFallComplete = () => {
                            this.finishRound(true);
                        };
                        this.dollController.fallIntoHole(item.x, item.shape);
                    }
                }
                // No finishRound if not fatal - just let the downward impulse work
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
        const travelStats = this.dollController.getTravelStats?.() || null;

        this.lastResult = this.resultSystem.calculate(
            this.currentBet,
            multiplier,
            hitHazard,
            this.interactionSystem.getMaxCombo(),
            travelStats
        );

        this.lastResult.patternId = this.interactionSystem.getPatternId();

        const resultDelayMs = hitHazard ? 500 : 2000;
        this.pushEvent(this.scene.time.delayedCall(resultDelayMs, () => {
            this.gameStateManager.setState(GAME_STATES.RESULT, "show_result_panel");
            // Win pose is applied immediately on stop; only enforce loss pose here.
            if (this.lastResult.hitHazard) {
                this.dollController.onRoundResult?.(false);
            }
            this.uiManager.showResult(this.lastResult);
            this.uiManager.applyRoundResult(this.lastResult);
            // Result stingers
            if (this.lastResult.hitHazard) {
                this.scene.audioManager?.play("sfx_loss", { volume: 0.6 });
            } else {
                this.scene.audioManager?.play("sfx_win", { volume: 0.6 });
                this.scene.spawnWinParticles?.();
            }

            this.emitHostEvent("onDolvinRoundEnd", {
                betAmount: this.lastResult.betAmount,
                multiplier: this.lastResult.multiplier,
                finalMultiplier: this.lastResult.finalMultiplier,
                travelBonus: this.lastResult.travelBonus,
                payout: this.lastResult.payout,
                netChange: this.lastResult.netChange,
                outcome: this.lastResult.outcome,
                hitHazard: this.lastResult.hitHazard,
                maxCombo: this.lastResult.maxCombo,
                distance: this.lastResult.distance,
                airTimeMs: this.lastResult.airTimeMs,
                peakHeight: this.lastResult.peakHeight,
                speedMode: this.currentSpeedMode,
                volatility: this.currentVolatility,
                patternId: this.lastResult.patternId || ""
            });

            // Auto play: replay and start next round automatically.
            const prevRemaining = this.autoPlayRemaining;
            if (this.autoPlayRemaining > 0) {
                this.autoPlayRemaining -= 1;
            }
            this.uiManager.setAutoPlayRemaining?.(this.autoPlayRemaining);
            if (prevRemaining > 0 && this.autoPlayRemaining === 0) {
                // Autoplay finished -> show icon only (no number)
                this.uiManager.clearAutoPlaySelection?.();
            }

            if (this.autoPlayRemaining > 0) {
                this.pushEvent(this.scene.time.delayedCall(650, () => {
                    this.replay();
                    this.startPrototypeRound({ fromAutoplay: true });
                }));
            }
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