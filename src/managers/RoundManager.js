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
        this.authoritativeFlightEvent = null;
        this.authoritativeFlightPlan = null;
        this.authoritativeTargetReached = false;
        this.authoritativeForcedLandingApplied = false;
        this.authoritativeStartAtMs = 0;
        this.authoritativeLossVisualStarted = false;
        this.authoritativeLossResolved = false;
        this.authoritativeSustainNextAtMs = 0;
        this.authoritativeLossStageStartAtMs = 0;
        this.authoritativeLossRetryAtMs = 0;
        this.authoritativeLossVisualHazard = null;
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

    parseExternalNumber(value) {
        if (typeof value === "number") {
            return Number.isFinite(value) ? value : NaN;
        }
        if (typeof value === "string") {
            const normalized = value.trim().replace(",", ".");
            const parsed = Number(normalized);
            return Number.isFinite(parsed) ? parsed : NaN;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : NaN;
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

    getAuthoritativeFlightPlan() {
        const ext = this.externalRoundData;
        const crashPoint = this.parseExternalNumber(ext?.crashPoint);
        if (!Number.isFinite(crashPoint) || crashPoint <= 0) {
            return null;
        }
        const targetMultiplier = Math.max(1, Number(crashPoint.toFixed(2)));
        const winAmount = this.parseExternalNumber(ext?.winAmount);
        const forceLoss = Number.isFinite(winAmount) ? winAmount <= 0 : false;
        // Keep a deterministic and smooth flight window while ending exactly on crashPoint.
        let durationMs = Phaser.Math.Clamp(
            Math.round(650 + ((targetMultiplier - 1) * 260)),
            650,
            6500
        );
        // Loss rounds should crash fast (platform signal: crashPoint=1, winAmount=0).
        if (forceLoss && targetMultiplier <= 1.01) {
            durationMs = 1500;
        }
        return {
            enabled: true,
            targetMultiplier,
            durationMs,
            forceLoss
        };
    }

    stopAuthoritativeFlightController() {
        this.authoritativeFlightEvent?.remove?.(false);
        this.authoritativeFlightEvent = null;
        this.authoritativeFlightPlan = null;
        this.authoritativeTargetReached = false;
        this.authoritativeForcedLandingApplied = false;
        this.authoritativeStartAtMs = 0;
        this.authoritativeLossVisualStarted = false;
        this.authoritativeLossResolved = false;
        this.authoritativeSustainNextAtMs = 0;
        this.authoritativeLossStageStartAtMs = 0;
        this.authoritativeLossRetryAtMs = 0;
        this.authoritativeLossVisualHazard = null;
    }

    stopAuthoritativeFlightTickerOnly() {
        this.authoritativeFlightEvent?.remove?.(false);
        this.authoritativeFlightEvent = null;
    }

    startAuthoritativeFlightController(plan) {
        this.stopAuthoritativeFlightController();
        this.authoritativeFlightPlan = plan;
        this.authoritativeTargetReached = false;
        this.authoritativeForcedLandingApplied = false;
        this.authoritativeStartAtMs = performance.now();
        this.authoritativeLossVisualStarted = false;
        this.authoritativeLossResolved = false;
        this.authoritativeSustainNextAtMs = 0;
        this.authoritativeLossStageStartAtMs = 0;
        this.authoritativeLossRetryAtMs = 0;
        this.authoritativeLossVisualHazard = null;
        this.interactionSystem.setAuthoritativeRoundControl?.({
            enabled: true,
            targetMultiplier: plan.targetMultiplier,
            forceLoss: !!plan.forceLoss,
            durationMs: plan.durationMs
        });
        this.interactionSystem.setAuthoritativeLiveMultiplier?.(1);

        this.authoritativeFlightEvent = this.scene.time.addEvent({
            delay: 33,
            loop: true,
            callback: () => {
                if (!this.isRoundActive || !this.gameStateManager.isState(GAME_STATES.FLYING)) {
                    return;
                }
                const elapsed = Math.max(0, performance.now() - this.authoritativeStartAtMs);
                this.interactionSystem.setAuthoritativeTimelineProgress?.(elapsed, plan.durationMs);
                if (!this.authoritativeTargetReached) {
                    const progress = Phaser.Math.Clamp(elapsed / plan.durationMs, 0, 1);
                    this.sustainAuthoritativeFlight(plan, progress);
                    if (progress >= 1) {
                        this.authoritativeTargetReached = true;
                    }
                }

                if (
                    this.authoritativeTargetReached
                    && plan.forceLoss
                    && !this.authoritativeLossVisualStarted
                    && this.isReadyForAuthoritativeRollingLossStage()
                ) {
                    this.triggerAuthoritativeLossVisual(plan);
                }
                if (
                    this.authoritativeTargetReached
                    && plan.forceLoss
                    && !this.authoritativeLossResolved
                    && this.isReadyForAuthoritativeRollingLossStage()
                ) {
                    this.triggerAuthoritativeLossVisual(plan, { forceRetry: true });
                }

                if (this.authoritativeTargetReached && !this.authoritativeForcedLandingApplied) {
                    const vx = Number(this.dollController?.velocity?.x ?? 0);
                    const dir = vx >= 0 ? 1 : -1;
                    const downY = 920;
                    // Force a controlled end descent after crashPoint is reached.
                    const downX = Math.max(120, Math.abs(vx));
                    this.dollController.applyImpulse?.(downX * dir, downY, true);
                    this.authoritativeForcedLandingApplied = true;
                }
            }
        });
    }

    triggerAuthoritativeLossVisual(plan, { forceRetry = false } = {}) {
        if (this.authoritativeLossResolved) return;
        if (this.authoritativeLossVisualStarted && !forceRetry) return;
        const now = performance.now();
        if (forceRetry && now < this.authoritativeLossRetryAtMs) return;
        this.authoritativeLossVisualStarted = true;
        if (this.authoritativeLossStageStartAtMs <= 0) {
            this.authoritativeLossStageStartAtMs = now;
        }
        const dollX = Number(this.dollController?.position?.x ?? 0);
        const vx = Number(this.dollController?.velocity?.x ?? 0);
        const dir = vx >= 0 ? 1 : -1;
        let hazard = this.authoritativeLossVisualHazard;
        if (!hazard?.active) {
            hazard = this.interactionSystem.ensureAuthoritativeLossHazardNear?.(dollX, dir, { forceSpawn: true })
                || this.interactionSystem.getBestAuthoritativeLossHazard?.(dollX);
            this.authoritativeLossVisualHazard = hazard || null;
        }
        const targetX = Number(hazard?.x ?? (dollX + (180 * dir)));
        const dx = targetX - dollX;
        let pushX = Phaser.Math.Clamp(dx * 1.2, -340, 340);
        if (Math.abs(pushX) < 110) {
            pushX = 110 * (dir >= 0 ? 1 : -1);
        }
        this.scene.shakeOnHazard?.();
        this.dollController.onGameplayInteraction?.("hazard");
        // Stage the loss while doll is rolling: nudge strongly toward spawned obstacle.
        this.dollController.applyImpulse?.(pushX, 140, true);
        this.authoritativeForcedLandingApplied = true;
        this.authoritativeLossRetryAtMs = now + (forceRetry ? 140 : 220);
    }

    isReadyForAuthoritativeRollingLossStage() {
        const dc = this.dollController;
        if (!dc?.doll || dc.isFallingInHole) return false;
        const groundY = Number(dc.getGroundY?.() ?? dc.groundY ?? 0);
        const threshold = groundY - (GAME_CONFIG.doll.collisionYOffsetFromGround ?? 10);
        const dollY = Number(dc.position?.y ?? threshold);
        const nearGround = dollY >= (threshold - 6);
        const speedX = Math.abs(Number(dc.velocity?.x ?? 0));
        // Trigger only when the doll is already on ground roll (not airborne).
        return nearGround && speedX >= 46;
    }

    sustainAuthoritativeFlight(plan, progress, { force = false } = {}) {
        const dc = this.dollController;
        if (!dc?.doll) return;
        const now = performance.now();
        if (!force && now < this.authoritativeSustainNextAtMs) return;
        const groundY = Number(dc.getGroundY?.() ?? dc.groundY ?? 0);
        const threshold = groundY - (GAME_CONFIG.doll.collisionYOffsetFromGround ?? 10);
        const dollY = Number(dc.position?.y ?? threshold);
        const nearGround = dollY >= (threshold - 24);
        if (!nearGround) return;

        const vx = Number(dc.velocity?.x ?? 0);
        const vy = Number(dc.velocity?.y ?? 0);
        if (!force && Math.abs(vy) > 220) return;
        const dir = vx >= 0 ? 1 : -1;
        const targetMul = Math.max(1, Number(plan.targetMultiplier) || 1);
        const mulRatio = Phaser.Math.Clamp((targetMul - 1) / 32, 0, 1);
        const progressRatio = Phaser.Math.Clamp(progress, 0, 1);
        const sustainPower = Math.round(180 + (120 * mulRatio) + (70 * progressRatio));
        const sustainForward = Math.max(120, 130 + (targetMul * 2.8));
        // Gentle hop sustain to preserve original gameplay feel.
        dc.applyImpulse?.(sustainForward * dir, -sustainPower, false);
        dc.setExpression?.("determined");
        this.authoritativeSustainNextAtMs = now + (force ? 90 : 240);
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
        this.authoritativeFlightPlan = this.getAuthoritativeFlightPlan();
        if (fromPlatform && !this.authoritativeFlightPlan) {
            this.emitGameError("INVALID_EXTERNAL_ROUND_DATA");
            this.isRoundActive = false;
            return;
        }

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
        this.interactionSystem.setAuthoritativeRoundControl?.({
            enabled: !!this.authoritativeFlightPlan,
            targetMultiplier: this.authoritativeFlightPlan?.targetMultiplier ?? 1,
            forceLoss: !!this.authoritativeFlightPlan?.forceLoss,
            durationMs: this.authoritativeFlightPlan?.durationMs ?? 0
        });
        if (this.authoritativeFlightPlan?.enabled) {
            // Hard reset visible live multiplier so no stale value appears between rounds.
            this.interactionSystem.setAuthoritativeLiveMultiplier?.(1);
            this.uiManager.updateMultiplier?.(1);
            this.dollController.updateScoreValue?.(1);
        }

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
            if (this.authoritativeFlightPlan?.enabled) {
                this.startAuthoritativeFlightController(this.authoritativeFlightPlan);
            }

            this.dollController.onMovementComplete = () => {
                if (this.dollController.isFallingInHole) {
                    return;
                }
                if (this.authoritativeFlightPlan?.enabled) {
                    if (!this.authoritativeTargetReached) {
                        const elapsed = Math.max(0, performance.now() - this.authoritativeStartAtMs);
                        const progress = Phaser.Math.Clamp(
                            elapsed / Math.max(1, Number(this.authoritativeFlightPlan.durationMs) || 1),
                            0,
                            1
                        );
                        this.sustainAuthoritativeFlight(this.authoritativeFlightPlan, progress, { force: true });
                        return;
                    }
                    if (this.authoritativeFlightPlan.forceLoss) {
                        if (this.dollController.isFallingInHole && !this.authoritativeLossResolved) {
                            return;
                        }
                        if (!this.authoritativeLossResolved) {
                            const stageMs = Math.max(0, performance.now() - (this.authoritativeLossStageStartAtMs || performance.now()));
                            if (this.isReadyForAuthoritativeRollingLossStage()) {
                                this.triggerAuthoritativeLossVisual(this.authoritativeFlightPlan, { forceRetry: true });
                            }
                            if (stageMs < 2600) {
                                return;
                            }
                        }
                        // Strict server authority: forceLoss from platform always resolves as loss.
                        this.hitHazard = true;
                        this.finishRound(true);
                        return;
                    }
                    const target = Number(this.authoritativeFlightPlan.targetMultiplier) || 1;
                    const current = Number(this.interactionSystem.getMultiplier?.() ?? 1) || 1;
                    if (current < (target - 0.01)) {
                        this.interactionSystem.setAuthoritativeLiveMultiplier?.(target);
                    }
                    this.hitHazard = !!this.authoritativeFlightPlan.forceLoss;
                    this.finishRound(this.hitHazard);
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
                if (this.authoritativeFlightPlan?.enabled) {
                    this.scene.shakeOnHazard?.();
                    if (isFatal && this.authoritativeFlightPlan.forceLoss) {
                        this.hitHazard = true;
                        this.authoritativeLossResolved = true;
                        if (item?.variant === "hole") {
                            this.dollController.onHoleFallComplete = () => {
                                this.authoritativeLossResolved = true;
                                this.finishRound(true);
                            };
                            this.dollController.fallIntoHole(item.x, item.shape);
                            return;
                        }
                        this.finishRound(true);
                        return;
                    }
                    if (isFatal) {
                        this.dollController.onGameplayInteraction?.("hazard");
                    }
                    return;
                }
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
        this.stopAuthoritativeFlightController();
        this.clearSequence();
        this.interactionSystem.stop();
        this.interactionSystem.setAuthoritativeRoundControl?.({ enabled: false, targetMultiplier: 1, forceLoss: false });

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
        this.stopAuthoritativeFlightController();
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
        this.stopAuthoritativeFlightController();
        this.interactionSystem.setAuthoritativeRoundControl?.({ enabled: false, targetMultiplier: 1, forceLoss: false });
        this.uiManager.setAwaitingExternalStart?.(false);
        this.uiManager.setAutoPlayRemaining?.(0);
        this.uiManager.clearAutoPlaySelection?.();
    }

    applyExternalRoundResult(baseResult) {
        const ext = this.externalRoundData;
        if (!ext) {
            return baseResult;
        }

        const bet = Math.max(
            0,
            this.parseExternalNumber(ext.betAmount) || Number(baseResult?.betAmount) || this.currentBet || 0
        );
        let win = this.parseExternalNumber(ext.winAmount);
        const crashPoint = this.parseExternalNumber(ext.crashPoint);

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
        this.stopAuthoritativeFlightController();
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