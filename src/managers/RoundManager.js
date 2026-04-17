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
        this.currentRoundId = null;
        this.externalRoundData = null;
        this.awaitingExternalStart = false;
        this.externalStartTimeoutEvent = null;
        this.pendingExternalStartFromAutoplay = false;
    }

    emitGameError(message) {
        const fn = window?.onGameError;
        if (typeof fn === "function") {
            try {
                fn(String(message || "Unknown game error"));
            } catch (error) {
                console.error("[RoundManager] host callback failed: onGameError", error);
            }
        }
    }

    requestRoundStart({ fromAutoplay = false } = {}) {
        if (!this.gameStateManager.isState(GAME_STATES.BETTING)) return;
        if (this.awaitingExternalStart) return;

        const requestedBet = Number(this.uiManager.getCurrentBet?.() ?? 0) || 0;
        const currentBalance = Number(this.uiManager.getCurrentBalance?.() ?? 0) || 0;
        if (requestedBet > currentBalance) {
            this.uiManager.showInsufficientBalance?.(requestedBet, currentBalance);
            return;
        }

        this.awaitingExternalStart = true;
        this.pendingExternalStartFromAutoplay = !!fromAutoplay;
        this.uiManager.setAwaitingExternalStart?.(true);

        const onRoundStart = window?.onRoundStart;
        if (typeof onRoundStart === "function") {
            try {
                onRoundStart(requestedBet);
            } catch (_) {
                this.awaitingExternalStart = false;
                this.uiManager.setAwaitingExternalStart?.(false);
                this.pendingExternalStartFromAutoplay = false;
                this.emitGameError("ROUND_START_CALLBACK_FAILED");
                return;
            }
        }

        this.externalStartTimeoutEvent?.remove?.(false);
        this.externalStartTimeoutEvent = this.scene.time.delayedCall(12000, () => {
            if (!this.awaitingExternalStart) return;
            this.awaitingExternalStart = false;
            this.pendingExternalStartFromAutoplay = false;
            this.uiManager.setAwaitingExternalStart?.(false);
            this.emitGameError("ROUND_START_TIMEOUT");
        });
    }

    startPrototypeRound({ fromAutoplay = false, externalRoundData = null, fromPlatform = false } = {}) {
        if (!this.gameStateManager.isState(GAME_STATES.BETTING)) {
            console.warn("[RoundManager] Cannot start round. Current state is not BETTING.");
            if (fromPlatform) {
                this.emitGameError("INVALID_GAME_STATE_FOR_START");
            }
            return;
        }

        if (!fromAutoplay && !fromPlatform) {
            this.requestRoundStart();
            return;
        }

        const isAutoplayStart = !!fromAutoplay || !!this.pendingExternalStartFromAutoplay;
        this.awaitingExternalStart = false;
        this.pendingExternalStartFromAutoplay = false;
        this.uiManager.setAwaitingExternalStart?.(false);
        this.externalStartTimeoutEvent?.remove?.(false);
        this.externalStartTimeoutEvent = null;

        const requestedBet = Number(this.uiManager.getCurrentBet?.() ?? 0) || 0;
        const currentBalance = Number(this.uiManager.getCurrentBalance?.() ?? 0) || 0;
        if (requestedBet > currentBalance) {
            console.warn(`[RoundManager] Cannot start round. Bet (${requestedBet}) exceeds balance (${currentBalance}).`);
            this.uiManager.showInsufficientBalance?.(requestedBet, currentBalance);
            // If this was an autoplay attempt, stop chain immediately.
            if (isAutoplayStart) {
                this.autoPlayRemaining = 0;
                this.uiManager.setAutoPlayRemaining?.(0);
                this.uiManager.clearAutoPlaySelection?.();
            }
            return;
        }

        // If a previous round win stinger is still playing, stop it before kickoff.
        this.scene.audioManager?.stop?.("sfx_win");

        this.clearSequence();
        this.isRoundActive = true;
        this.hitHazard = false;

        this.currentBet = requestedBet;
        this.currentSpeedMode = this.uiManager.getSpeedMode();
        this.currentVolatility = this.uiManager.getVolatility();
        this.currentRoundId =
            String(externalRoundData?.roundId || "")
            || `rnd_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
        this.externalRoundData = externalRoundData || null;

        // Client PDF callback name: autoplay started
        if (!isAutoplayStart) {
            const selected = !!this.uiManager.getAutoPlaySelected?.();
            const spins = Math.max(1, Number(this.uiManager.getAutoPlayCount?.() ?? 1) || 1);
            if (selected && spins > 0) {
                const fn = window?.onAutoplayStart;
                if (typeof fn === "function") {
                    try {
                        fn(this.currentBet, spins);
                    } catch (error) {
                        console.error("[RoundManager] host callback failed: onAutoplayStart", error);
                    }
                }
            }
        }
        if (!isAutoplayStart) {
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
        const kickStartMs = 350;
        const hitDelayMs = Math.max(90, Number(GAME_CONFIG.kicker?.hitDelayMs ?? 300));

        this.pushEvent(this.scene.time.delayedCall(kickStartMs, () => {
            this.gameStateManager.setState(GAME_STATES.KICKING, "kick_sequence_begin");
            this.kickerController.playKick();
            this.dollController.startKickReaction();
        }));

        this.pushEvent(this.scene.time.delayedCall(kickStartMs + hitDelayMs, () => {
            this.gameStateManager.setState(GAME_STATES.FLYING, "doll_launch");
            this.dollController.launch();

            this.dollController.onMovementComplete = () => {
                if (this.dollController.isFallingInHole) {
                    return;
                }
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
        this.lastResult = this.applyExternalRoundResult(this.lastResult);

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
            // Result stingers are handled below (after autoplay decrement).

            this.emitHostEvent("onDolvinRoundEnd", {
                roundId: this.currentRoundId,
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

            const isAutoplayChain = prevRemaining > 0;
            const isLastAutoplayRound = prevRemaining === 1;

            if (this.autoPlayRemaining > 0) {
                this.pushEvent(this.scene.time.delayedCall(650, () => {
                    this.replay();
                    this.requestRoundStart({ fromAutoplay: true });
                }));
            }

            // Result stingers:
            // - During autoplay: suppress win sound to avoid spam; only play on the final autoplay round.
            // - Loss sound still plays immediately.
            if (this.lastResult.hitHazard) {
                this.scene.audioManager?.play("sfx_loss", { volume: 0.6 });
            } else if (!isAutoplayChain || isLastAutoplayRound) {
                this.scene.audioManager?.play("sfx_win", { volume: 0.6 });
                this.scene.spawnWinParticles?.();
            }
        }));
    }

    replay() {
        this.clearSequence();
        this.isRoundActive = false;
        this.hitHazard = false;
        this.currentPattern = null;
        this.externalRoundData = null;
        this.awaitingExternalStart = false;
        this.pendingExternalStartFromAutoplay = false;
        this.externalStartTimeoutEvent?.remove?.(false);
        this.externalStartTimeoutEvent = null;
        this.uiManager.setAwaitingExternalStart?.(false);

        this.scene.resetCamera();
        this.dollController.reset();
        this.kickerController.reset();
        this.interactionSystem.clearAll();

        this.gameStateManager.setState(GAME_STATES.BETTING, "replay_pressed");
    }

    stopAutoPlay() {
        this.autoPlayRemaining = 0;
        this.awaitingExternalStart = false;
        this.pendingExternalStartFromAutoplay = false;
        this.externalStartTimeoutEvent?.remove?.(false);
        this.externalStartTimeoutEvent = null;
        this.uiManager.setAwaitingExternalStart?.(false);
        this.uiManager.setAutoPlayRemaining?.(0);
        this.uiManager.clearAutoPlaySelection?.();
    }

    applyExternalRoundResult(baseResult) {
        const ext = this.externalRoundData;
        if (!ext) {
            return baseResult;
        }

        const bet = Math.max(0, Number(ext.betAmount) || Number(baseResult?.betAmount) || this.currentBet || 0);
        let win = Number(ext.winAmount);
        const crashPoint = Number(ext.crashPoint);

        if (!Number.isFinite(win)) {
            if (Number.isFinite(crashPoint) && crashPoint > 0) {
                win = Number((bet * crashPoint).toFixed(2));
            } else {
                win = Number(baseResult?.payout) || 0;
            }
        }
        win = Math.max(0, Number(win.toFixed(2)));

        let finalMultiplier = Number(baseResult?.finalMultiplier) || 1;
        if (Number.isFinite(crashPoint) && crashPoint > 0) {
            finalMultiplier = Number(crashPoint.toFixed(2));
        } else if (bet > 0) {
            finalMultiplier = Number((win / bet).toFixed(2));
        }
        finalMultiplier = Math.max(1, finalMultiplier);

        const hitHazard = win <= 0;
        const merged = {
            ...baseResult,
            betAmount: bet,
            multiplier: finalMultiplier,
            finalMultiplier,
            payout: win,
            netChange: Number((win - bet).toFixed(2)),
            outcome: hitHazard ? "LOSE" : "WIN",
            hitHazard
        };

        return merged;
    }

    emitHostEvent(callbackName, payload) {
        if (callbackName === "onDolvinRoundEnd") {
            const onRoundEnd = window?.onRoundEnd;
            if (typeof onRoundEnd === "function") {
                try {
                    onRoundEnd(String(payload?.roundId || ""), Number(payload?.payout) || 0);
                } catch (error) {
                    console.error("[RoundManager] host callback failed: onRoundEnd", error);
                }
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