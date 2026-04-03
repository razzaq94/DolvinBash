import { GAME_CONFIG } from "../data/gameConfig.js";

export default class DollController {
    constructor(scene) {
        this.scene = scene;

        this.doll = null;
        this.shadow = null;
        this.faceText = null;

        this.isActive = false;
        this.hasLaunched = false;

        this.position = new Phaser.Math.Vector2(0, 0);
        this.velocity = new Phaser.Math.Vector2(0, 0);

        this.groundY = 0;
        this.elapsedMs = 0;
        this.launchStartX = 0;
        this.maxX = 0;
        this.minY = 0;

        this.onMovementComplete = null;

        this.trailTimer = 0;
        this.trails = [];
        this.trailTheme = "default";
        this.trailThemeRemainingMs = 0;
        this.trailsEnabled = true;
        this.currentExpression = "idle";
        this.lastVerticalState = "neutral";
        this.expressionLockTimerMs = 0;
        this.happySpinRemainingDeg = 0;
        this.speedMode = GAME_CONFIG.round.defaultSpeedMode || "NORMAL";
        this.speedTuning = GAME_CONFIG.speedModes?.[this.speedMode] || GAME_CONFIG.speedModes?.NORMAL || {};
        this.baseDollScale = 1;
        this.airBoostTimerMs = 0;
        this.expressionTextureMap = {
            idle: "doll_idle",
            surprised: "doll_surprised",
            excited: "doll_excited",
            determined: "doll_determined",
            impact: "doll_impact",
            panic: "doll_panic",
            dazed: "doll_dazed",
            frustrated: "doll_angry",
            ko: "doll_ko",
            win: "doll_happywin",
            loss: "doll_loss",
            dizzy: "doll_dizzy",
            falling: "doll_falling",
            happy: "doll_happy",
            spiral: "doll_ko",
            tongue: "doll_ko",
            stunned: "doll_ko"
        };

        this.scoreHistory = [];
        this.maxScoreItems = 6;
        this.scoreContainer = null;
        this.idleFloatingTween = null;
        this.slideSound = null;
        this.isFallingInHole = false;
        this.onHoleFallComplete = null;
        this.groundedMs = 0;
        this.wasOnGround = false;

        // Desktop: sampled each launch — random roll length vs obstacles.
        this.pcRollFrictionHeat = 1;
        this.pcRollStopMsExtra = 0;
        this.pcStopVxMul = 1;
    }

    create() {
        const groundY = this.getGroundY();
        const startX = this.getStartX();
        const startY = groundY - GAME_CONFIG.doll.startYOffsetFromGround;

        this.groundY = groundY;
        this.position.set(startX, startY);
        this.velocity.set(0, 0);

        this.shadow = this.scene.add.ellipse(startX, groundY + 12, 54, 18, 0x000000, 0.22); // Lowered from +18
        this.shadow.setDepth(25);
        this.doll = this.scene.add.image(startX, startY, "doll_idle").setDepth(36);
        this.computeBaseDollScale();
        this.applyDollScale();

        this.faceText = this.scene.add.text(startX, startY, ":|", {
            fontSize: "18px",
            color: "#0f172a"
        }).setOrigin(0.5).setDepth(37).setVisible(false);

        this.isActive = false;
        this.hasLaunched = false;
        this.elapsedMs = 0;
        this.trailTimer = 0;
        this.trailTheme = "default";
        this.trailThemeRemainingMs = 0;
        this.trailsEnabled = true;
        this.launchStartX = startX;
        this.maxX = startX;
        this.minY = startY;
        this.currentExpression = "idle";
        this.lastVerticalState = "neutral";
        this.airBoostTimerMs = 0;
        this.expressionLockTimerMs = 0;
        this.happySpinRemainingDeg = 0;
        this.wasOnGround = false;

        this.scoreContainer = this.scene.add.container(startX, startY).setDepth(45);
        this.scoreHistory = [];
        this.currentValueText = null;

        this.syncVisuals();
        this.startIdleFloating();
    }

    reset() {
        const groundY = this.getGroundY();
        const startX = this.getStartX();
        const startY = groundY - GAME_CONFIG.doll.startYOffsetFromGround;

        this.groundY = groundY;
        this.position.set(startX, startY);
        this.velocity.set(0, 0);
        this.elapsedMs = 0;
        this.isActive = false;
        this.hasLaunched = false;
        this.startIdleFloating();
        this.trailTimer = 0;
        this.trailTheme = "default";
        this.trailThemeRemainingMs = 0;
        this.trailsEnabled = true;
        this.launchStartX = startX;
        this.maxX = startX;
        this.minY = startY;
        this.airBoostTimerMs = 0;
        this.isFallingInHole = false;
        this.expressionLockTimerMs = 0;
        this.happySpinRemainingDeg = 0;
        this.wasOnGround = false;
        this.onHoleFallComplete = null;
        this.groundedMs = 0;
        this.pcRollFrictionHeat = 1;
        this.pcRollStopMsExtra = 0;
        this.pcStopVxMul = 1;

        this.clearTrails();
        this.trailsEnabled = true;
        this.setExpression("idle");
        this.stopSlideSound();

        if (this.doll) {
            this.scene.tweens.killTweensOf(this.doll);
            this.doll.clearMask?.(true);
            this.doll.setAngle(0);
            this.doll.setAlpha(1);
            this.applyDollScale();
            this.doll.setVisible(true);
        }

        if (this.shadow) {
            this.scene.tweens.killTweensOf(this.shadow);
            this.shadow.setAlpha(0.22);
            this.shadow.setVisible(true);
        }

        if (this.faceText) {
            this.scene.tweens.killTweensOf(this.faceText);
            this.faceText.setVisible(false);
            this.faceText.setAlpha(1);
            this.faceText.setScale(1);
        }

        if (this.scoreContainer) {
            this.scene.tweens.killTweensOf(this.scoreContainer);
            this.scoreContainer.setVisible(true);
            this.scoreContainer.setAlpha(1);
            this.scoreContainer.setScale(1);
        }

        if (this.holeMaskGfx) {
            this.holeMaskGfx.destroy();
        }
        this.holeMaskGfx = null;
        this.holeMask = null;
        if (this.holeVisual && this.holeVisualPrevDepth != null) {
            this.holeVisual.setDepth(this.holeVisualPrevDepth);
        }
        this.holeVisual = null;
        this.holeVisualPrevDepth = null;

        this.syncVisuals();
        this.clearScoreStack();
    }

    startKickReaction() {
        this.setExpression("surprised");

        this.scene.tweens.killTweensOf(this.doll);
        const base = this.baseDollScale || 1;

        this.scene.tweens.add({
            targets: this.doll,
            scaleX: base * 1.12,
            scaleY: base * 0.9,
            duration: 90,
            yoyo: true,
            ease: "Quad.easeOut"
        });
    }

    launch() {
        this.stopIdleFloating();
        this.hasLaunched = true;
        this.isActive = true;
        this.elapsedMs = 0;
        this.launchStartX = this.position.x;
        this.maxX = this.position.x;
        this.minY = this.position.y;

        this.sampleDesktopRollVariance();

        const launchXMultiplier = this.speedTuning.launchXMultiplier ?? 1;
        const launchYMultiplier = this.speedTuning.launchYMultiplier ?? 1;
        this.velocity.x = GAME_CONFIG.doll.launchVelocityX * launchXMultiplier;
        this.velocity.y = GAME_CONFIG.doll.launchVelocityY * launchYMultiplier;

        this.setExpression("determined");
    }

    sampleDesktopRollVariance() {
        const cfg = GAME_CONFIG.doll?.pcDesktopRollVariance;
        if (!cfg?.enabled) {
            this.pcRollFrictionHeat = 1;
            this.pcRollStopMsExtra = 0;
            this.pcStopVxMul = 1;
            return;
        }
        const layout = this.scene.getViewportLayout?.();
        const w = this.scene.scale?.width ?? 0;
        const isMobile = layout ? layout.isMobile : w < 900;
        if (isMobile) {
            this.pcRollFrictionHeat = 1;
            this.pcRollStopMsExtra = 0;
            this.pcStopVxMul = 1;
            return;
        }

        this.pcRollFrictionHeat = Phaser.Math.FloatBetween(
            cfg.frictionHeatMin ?? 0.55,
            cfg.frictionHeatMax ?? 1.45
        );
        this.pcRollStopMsExtra = Phaser.Math.Between(
            cfg.groundedMsExtraMin ?? -350,
            cfg.groundedMsExtraMax ?? 1300
        );
        this.pcStopVxMul = Phaser.Math.FloatBetween(
            cfg.stopVxMulMin ?? 0.7,
            cfg.stopVxMulMax ?? 1.38
        );
    }

    applyImpulse(x, y, forceReset = false) {
        if (!this.doll) {
            return;
        }

        this.isActive = true;
        this.hasLaunched = true;

        if (forceReset) {
            // Absolute force change (used for DROP! or specific events)
            this.velocity.x = x;
            this.velocity.y = y;
            if (y > 100) this.airBoostTimerMs = 0; // Kill glide on sharp drop
        } else {
            // Stabilize momentum: Instead of always MAX, allow for gradual speed control
            this.velocity.x = (this.velocity.x * 0.5) + (x * 0.5);
            this.velocity.y = Math.min(this.velocity.y, y);
        }

        // Only start/extend glide if we are moving UP sharply
        if (this.velocity.y < -120) {
            this.airBoostTimerMs = 680;
        }

        // If we recently hit a +/x and are showing "happy", don't override it immediately.
        if (!this.isExpressionLocked()) {
            this.setExpression("panic");
        }

        this.stopIdleFloating();

        this.scene.tweens.killTweensOf(this.doll);
        const base = this.baseDollScale || 1;

        this.scene.tweens.add({
            targets: this.doll,
            scaleX: base * 1.2,
            scaleY: base * 1.2,
            duration: 80,
            yoyo: true,
            ease: "Back.easeOut"
        });
    }

    forceDiveDown(direction = 1) {
        const diveY = GAME_CONFIG.bat?.diveVelocityY ?? 980;
        const diveX = GAME_CONFIG.bat?.diveVelocityX ?? 260;
        this.applyImpulse(Math.abs(diveX) * direction, Math.abs(diveY));
        this.setExpression("panic");
    }

    applyObstacleHit(impulseX, impulseY) {
        const direction = this.velocity.x >= 0 ? 1 : -1;
        this.applyImpulse(impulseX * direction, -Math.abs(impulseY));
        // Any obstacle collision should show the hit sprite immediately.
        this.setExpression("impact");
        this.lockExpressionFor(1000);
        this.playImpactFeedback();
    }

    update(deltaSeconds) {
        if (!this.isActive || !this.doll) {
            return;
        }

        this.elapsedMs += deltaSeconds * 1000;
        this.trailTimer += deltaSeconds;
        this.expressionLockTimerMs = Math.max(0, this.expressionLockTimerMs - (deltaSeconds * 1000));
        if (this.trailThemeRemainingMs > 0) {
            this.trailThemeRemainingMs = Math.max(0, this.trailThemeRemainingMs - (deltaSeconds * 1000));
        }

        const gravityMultiplier = this.speedTuning.gravityMultiplier ?? 1;
        if (this.airBoostTimerMs > 0) {
            this.airBoostTimerMs = Math.max(0, this.airBoostTimerMs - (deltaSeconds * 1000));
        }
        const airBoostGravityScale = this.airBoostTimerMs > 0 ? 0.28 : 1;
        this.velocity.y += GAME_CONFIG.doll.gravity * gravityMultiplier * airBoostGravityScale * deltaSeconds;

        // Smooth glide feel: while boost is active, reduce harsh downward snap.
        if (this.airBoostTimerMs > 0 && this.velocity.y > 80) {
            this.velocity.y *= 0.81; // Stronger damping for floatier glide
        }
        this.position.x += this.velocity.x * deltaSeconds;
        this.position.y += this.velocity.y * deltaSeconds;
        this.maxX = Math.max(this.maxX, this.position.x);
        this.minY = Math.min(this.minY, this.position.y);

        const collisionThreshold = this.groundY - (GAME_CONFIG.doll.collisionYOffsetFromGround ?? 10);
        const isOnGround = !this.isFallingInHole && this.position.y >= collisionThreshold - 1;
        this.groundedMs = isOnGround ? (this.groundedMs + (deltaSeconds * 1000)) : 0;

        // Play a one-shot "hit" when we touch ground (air -> ground transition).
        if (isOnGround && !this.wasOnGround) {
            const impact = Phaser.Math.Clamp(Math.abs(this.velocity.y) / 900, 0.15, 1);
            // Requirement: play hurt sound on ground impact.
            this.scene.audioManager?.play("sfx_hazard", { volume: 0.45 + (impact * 0.45) });
        }
        this.wasOnGround = isOnGround;

        if (isOnGround) {
            // Speed-synced rolling: circumference of visual match travel
            const rollFactor = 0.22; 
            this.doll.angle += this.velocity.x * rollFactor * 60 * deltaSeconds;
        } else {
            // Air trajectory tilt (skip when doing a "Superman" roll)
            if (this.currentExpression === "happy" && this.happySpinRemainingDeg > 0) {
                // One-time Superman roll on +/x hit: exactly 1 rotation, then stop.
                const spinSpeedDegPerSec = 720;
                const deltaDeg = Math.min(this.happySpinRemainingDeg, spinSpeedDegPerSec * deltaSeconds);
                this.doll.angle += deltaDeg;
                this.happySpinRemainingDeg = Math.max(0, this.happySpinRemainingDeg - deltaDeg);
            } else {
                const targetTilt = Phaser.Math.Clamp(this.velocity.y * 0.05, -20, 40);
                this.doll.angle = Phaser.Math.Linear(this.doll.angle, targetTilt, 0.1);
            }
        }

        if (this.position.y >= collisionThreshold && !this.isFallingInHole) {
            this.position.y = collisionThreshold;

            if (Math.abs(this.velocity.y) > GAME_CONFIG.doll.minBounceVelocity) {
                this.velocity.y = -Math.abs(this.velocity.y) * GAME_CONFIG.doll.bounceDamping;
                this.velocity.x *= 0.92;
                if (!this.isExpressionLocked()) {
                    this.setExpression("impact");
                }
                this.playBounceFeedback();
            } else {
                this.velocity.y = 0;
                const frictionMultiplier = this.speedTuning.frictionMultiplier ?? 1;
                // Friction is a damping factor and must stay < 1.
                // Use an exponential model so:
                // - frictionMultiplier > 1 => stronger friction (more slowdown)
                // - frictionMultiplier < 1 => weaker friction (less slowdown)
                const baseFriction = Phaser.Math.Clamp(GAME_CONFIG.doll.friction ?? 0.995, 0.90, 0.9999);
                const fm = Phaser.Math.Clamp(Number(frictionMultiplier) || 1, 0.6, 1.6);
                let effectiveFriction = Phaser.Math.Clamp(Math.pow(baseFriction, fm), 0.90, 0.9999);
                const heat = this.pcRollFrictionHeat ?? 1;
                if (heat !== 1) {
                    // heat < 1 → gentler slowdown (longer roll); heat > 1 → stronger slowdown (shorter roll).
                    effectiveFriction = 1 + (effectiveFriction - 1) * heat;
                }
                this.velocity.x *= effectiveFriction;
                if (!this.isExpressionLocked()) {
                    this.setExpression("dizzy");
                }
            }
        }

        this.updateSlideSound(isOnGround);
        this.updateFlightExpression();

        if (this.trailTimer >= 0.045 && Math.abs(this.velocity.x) > 80) {
            this.trailTimer = 0;
            this.spawnTrail();
        }

        this.syncVisuals();
    }

    // Run after InteractionSystem so road hazards (hole/cone) register before we declare a win.
    finalizeAfterHazards() {
        if (!this.isActive || !this.doll) {
            return;
        }

        const collisionThreshold = this.groundY - (GAME_CONFIG.doll.collisionYOffsetFromGround ?? 10);
        const isAtRestOnGround = this.position.y >= collisionThreshold - 0.1;

        const vCfg = GAME_CONFIG.doll?.pcDesktopRollVariance || {};
        const baseStopMs = 1400;
        const stopMs = Phaser.Math.Clamp(
            baseStopMs + (this.pcRollStopMsExtra ?? 0),
            vCfg.minGroundedToAllowStop ?? 380,
            vCfg.maxGroundedToAllowStop ?? 3600
        );
        const vxStop = Math.max(
            3.5,
            (GAME_CONFIG.doll.stopVelocityX * 0.22) * (this.pcStopVxMul ?? 1)
        );

        const shouldStopByVelocity =
            !this.isFallingInHole &&
            Math.abs(this.velocity.x) <= vxStop &&
            Math.abs(this.velocity.y) <= 1 &&
            isAtRestOnGround &&
            this.groundedMs >= stopMs;

        // Safety timeout should never end mid-air. Round must resolve after ground contact.
        const shouldStopByTime = this.elapsedMs >= GAME_CONFIG.doll.maxFlightTimeMs;

        if (
            shouldStopByVelocity ||
            (!this.isFallingInHole && shouldStopByTime && isAtRestOnGround && this.groundedMs >= stopMs)
        ) {
            this.stopMovement();
        }

        // Check if hole fall is complete
        if (this.isFallingInHole && this.position.y > this.groundY + 200) {
            this.isActive = false;
            // Ensure doll is fully hidden once it falls into hole.
            this.doll?.setVisible(false);
            this.shadow?.setVisible(false);
            this.faceText?.setVisible(false);
            this.scoreContainer?.setVisible(false);
            if (this.doll) {
                this.doll.clearMask?.(true);
            }
            if (this.holeMaskGfx) {
                this.holeMaskGfx.destroy();
            }
            this.holeMaskGfx = null;
            this.holeMask = null;
            if (this.holeVisual && this.holeVisualPrevDepth != null) {
                this.holeVisual.setDepth(this.holeVisualPrevDepth);
            }
            this.holeVisual = null;
            this.holeVisualPrevDepth = null;
            if (this.onHoleFallComplete) {
                const cb = this.onHoleFallComplete;
                this.onHoleFallComplete = null;
                cb();
            }
        }
    }

    fallIntoHole(holeX, holeVisual = null) {
        if (this.isFallingInHole) return;
        
        this.isFallingInHole = true;
        this.isActive = true; // Ensure we keep updating to finish the fall
        this.setExpression("panic");

        // Turn off trails completely during hole fall.
        this.trailsEnabled = false;
        this.trailTimer = 0;
        this.clearTrails();

        // Make the hole render in front so the doll looks like it falls "into" it.
        // (Doll is depth ~36; scoreContainer ~45.)
        this.holeVisual = holeVisual || null;
        this.holeVisualPrevDepth = null;
        if (this.holeVisual?.depth != null) {
            this.holeVisualPrevDepth = this.holeVisual.depth;
            this.holeVisual.setDepth(80);
        }

        // Clip the doll to the hole area so it doesn't look like it falls "outside" the hole.
        // We only apply this during the hole-fall cinematic.
        try {
            this.holeMaskGfx?.destroy?.();
        } catch (_) {}
        this.holeMaskGfx = null;
        this.holeMask = null;
        if (this.holeVisual && this.doll) {
            const hx = this.holeVisual.x ?? holeX;
            const hy = this.holeVisual.y ?? (this.groundY + 10);
            const hw = this.holeVisual.displayWidth || this.holeVisual.width || 140;
            const hh = this.holeVisual.displayHeight || this.holeVisual.height || 40;

            // Slightly smaller than the visual so edges feel like a "rim".
            const rx = Math.max(18, (hw * 0.36));
            const ry = Math.max(10, (hh * 0.22));

            this.holeMaskGfx = this.scene.add.graphics();
            this.holeMaskGfx.fillStyle(0xffffff, 1);
            this.holeMaskGfx.fillEllipse(hx, hy - (ry * 0.15), rx * 2, ry * 2);
            this.holeMaskGfx.setDepth(79); // just below the hole visual

            this.holeMask = this.holeMaskGfx.createGeometryMask();
            this.doll.setMask(this.holeMask);
        }
        
        // Disable horizontal air boost or glide
        this.airBoostTimerMs = 0;
        
        // Zero out horizontal speed or snap to hole center for better visual
        this.velocity.x = (holeX - this.position.x) * 1.5; 
        this.velocity.y = 350; // Force down into the abyss
        
        // Shrink doll while falling for "depth" feel
        this.scene.tweens.add({
            targets: this.doll,
            scaleX: 0,
            scaleY: 0,
            alpha: 0,
            duration: 800,
            ease: "Cubic.easeIn"
        });
        
        if (this.shadow) {
            this.scene.tweens.add({
                targets: this.shadow,
                alpha: 0,
                duration: 300
            });
        }
    }

    stopMovement() {
        if (!this.isActive) {
            return;
        }

        this.isActive = false;
        this.velocity.set(0, 0);
        // RoundManager will apply win/loss pose on stop.
        this.setExpression("dizzy");
        this.stopSlideSound(); // FIX: Ensure sound stops when doll stops
        this.syncVisuals();

        if (typeof this.onMovementComplete === "function") {
            this.onMovementComplete();
        }
    }

    stopImmediatelyDead() {
        // Instant stop on fatal ground obstacle hit while rolling.
        this.isActive = false;
        this.velocity.set(0, 0);
        this.trailTimer = 0;
        this.trailsEnabled = false;
        this.clearTrails();
        this.setExpression("ko");
        this.stopSlideSound();
        this.syncVisuals();

        if (typeof this.onMovementComplete === "function") {
            this.onMovementComplete();
        }
    }

    disableTrailsNow() {
        this.trailsEnabled = false;
        this.trailTimer = 0;
        this.clearTrails();
    }

    updateFlightExpression() {
        if (!this.hasLaunched) return;
        if (this.isExpressionLocked()) return;

        if (this.velocity.y > 220) { // Lower threshold for falling feel
            if (this.lastVerticalState !== "diving") {
                this.setExpression("falling");
                this.lastVerticalState = "diving";
            }
            return;
        }

        if (this.velocity.y < -120) {
            if (this.lastVerticalState !== "ascending") {
                this.setExpression("determined");
                this.lastVerticalState = "ascending";
            }
            return;
        }

        if (Math.abs(this.velocity.y) <= 120 && Math.abs(this.velocity.x) > 70) {
            if (this.lastVerticalState !== "glide") {
                this.setExpression("determined");
                this.lastVerticalState = "glide";
            }
        }
    }

    updateSlideSound(isOnGround) {
        if (!this.doll || !this.scene.sound) return;

        // ONLY play sound when on ground AND rotating/sliding (kalabaazi)
        // Use a slightly lower threshold so slow mode still triggers sound.
        const isRollingOnGround = isOnGround && Math.abs(this.velocity.x) > 25;

        if (isRollingOnGround) {
            if (!this.slideSound) {
                this.slideSound = this.scene.sound.add("sfx_spin", { loop: true, volume: 1 });
                this.slideSound.play();
            } else if (!this.slideSound.isPlaying) {
                this.slideSound.play();
            }
            
            // Adjust volume/rate based on speed for "ragar" feel
            const speedFactor = Phaser.Math.Clamp(Math.abs(this.velocity.x) / 600, 0.1, 1);
            this.slideSound.setVolume(1);
            // Slightly faster base + more speed-based ramp (still capped for sanity).
            this.slideSound.setRate(Phaser.Math.Clamp(1.15 + (speedFactor * 0.95), 0.8, 2.0));
        } else {
            this.stopSlideSound();
        }
    }

    stopSlideSound() {
        if (this.slideSound) {
            if (this.slideSound.isPlaying) this.slideSound.stop();
            // Pause/destroy churn can cause “no sound” on some mobile browsers.
            // Keep instance and just stop; it will resume on next roll.
        }
    }

    spawnTrail() {
        if (!this.isActive || !this.doll || !this.scene.add) return;
        if (!this.trailsEnabled) return;

        const x = this.position.x;
        const y = this.position.y;
        const speedX = Math.abs(this.velocity.x);
        
        // Only spawn trail if moving fast enough
        if (speedX < 80) return;

        const { trailColor, coreColor } = this.getTrailColors();
        
        // 1. Thick Glowing Beam Segment
        // Base wide glow
        const glowRadius = (this.doll.displayHeight * 0.5) * 0.68;
        const beamGlow = this.scene.add.circle(x, y, glowRadius, trailColor, 0.72)
            .setDepth(this.doll.depth - 2);
        
        this.scene.tweens.add({
            targets: beamGlow,
            radius: glowRadius * 0.4,
            alpha: 0,
            x: x - (this.velocity.x * 0.12), // Slight lag
            y: y - (this.velocity.y * 0.12),
            duration: 520,
            ease: "Quad.easeOut",
            onComplete: () => beamGlow.destroy()
        });

        // 2. Inner Hot Core
        const coreRadius = glowRadius * 0.46;
        const beamCore = this.scene.add.circle(x, y, coreRadius, coreColor, 0.82)
            .setDepth(this.doll.depth - 1);
        
        this.scene.tweens.add({
            targets: beamCore,
            radius: 0,
            alpha: 0,
            duration: 380,
            ease: "Cubic.out",
            onComplete: () => beamCore.destroy()
        });

        // 3. Star Sparkles (Reference Match)
        // Spawning 4-pointed stars or bright white crosses
        if (Math.random() > 0.68) {
            const sparkleX = x + Phaser.Math.Between(-25, 10);
            const sparkleY = y + Phaser.Math.Between(-30, 30);
            
            // Using a simple text-based star or a small thin cross
            const sparkle = this.scene.add.text(sparkleX, sparkleY, "✦", {
                fontSize: "28px",
                color: "#ffffff"
            }).setOrigin(0.5).setDepth(this.doll.depth + 1);
            
            this.scene.tweens.add({
                targets: sparkle,
                scale: 1.6,
                angle: 120,
                alpha: 0,
                duration: 450,
                ease: "Sine.easeIn",
                onComplete: () => sparkle.destroy()
            });
        }

        // 4. Subtle Speed Streaks
        if (speedX > 400) {
            const streak = this.scene.add.rectangle(
                x - 20, 
                y + Phaser.Math.Between(-35, 35),
                Phaser.Math.Between(80, 150), 2, 0xffffff, 0.25
            ).setDepth(this.doll.depth - 3);

            this.scene.tweens.add({
                targets: streak,
                x: streak.x - 180,
                alpha: 0,
                scaleX: 0.1,
                duration: 250,
                onComplete: () => streak.destroy()
            });
        }
    }

    setTrailTheme(theme = "default", durationMs = 900) {
        const t = String(theme || "default");
        this.trailTheme = t;
        // durationMs <= 0 means "persist until changed"
        const dur = Number(durationMs);
        this.trailThemeRemainingMs = Number.isFinite(dur) ? dur : 0;
    }

    getTrailColors() {
        // Defaults (green)
        let trailColor = 0x22c55e;
        let coreColor = 0x86efac;

        const isThemeActive = (this.trailThemeRemainingMs <= 0) || (this.trailThemeRemainingMs > 0);
        if (isThemeActive) {
            if (this.trailTheme === "plus") {
                trailColor = 0x22c55e;
                coreColor = 0x86efac;
            } else if (this.trailTheme === "x") {
                trailColor = 0xfacc15;
                coreColor = 0xfef08a;
            } else if (this.trailTheme === "minus") {
                trailColor = 0xdc2626;
                coreColor = 0xfca5a5;
            }
        }

        return { trailColor, coreColor };
    }

    playBounceFeedback() {
        this.scene.tweens.killTweensOf(this.doll);
        const base = this.baseDollScale || 1;

        this.scene.tweens.add({
            targets: this.doll,
            scaleX: base * 1.14,
            scaleY: base * 0.82,
            duration: 80,
            yoyo: true,
            ease: "Quad.easeOut"
        });
    }

    playImpactFeedback() {
        this.scene.tweens.killTweensOf(this.doll);
        const base = this.baseDollScale || 1;

        this.scene.tweens.add({
            targets: this.doll,
            angle: { from: -14, to: 14 },
            scaleX: base * 1.15,
            scaleY: base * 0.86,
            duration: 90,
            yoyo: true,
            repeat: 1,
            ease: "Sine.easeInOut"
        });
    }

    syncVisuals() {
        if (!this.doll || !this.shadow || !this.faceText) {
            return;
        }

        this.doll.setPosition(this.position.x, this.position.y);
        this.faceText.setPosition(this.position.x, this.position.y);

        const shadowScale = Phaser.Math.Clamp(
            1 - ((this.groundY - this.position.y) / 260),
            0.45,
            1
        );

        this.shadow.setPosition(this.position.x, this.groundY + 18);
        this.shadow.setScale(shadowScale, shadowScale);

        if (this.scoreContainer) {
            this.scoreContainer.setPosition(this.position.x, this.position.y - 64);
        }
    }
    addScoreItem(value, color = "#22c55e") {
        if (!this.scoreContainer) return;
        if (!value || String(value).trim() === "") return;

        // Ensure current value text exists and is at the bottom
        if (!this.currentValueText) {
            this.currentValueText = this.scene.add.text(0, 0, "", {
                fontFamily: '"Luckiest Guy", cursive',
                fontSize: "36px",
                color: "#fff200",
                stroke: "#a16207",
                strokeThickness: 2,
                shadow: { offsetX: 3, offsetY: 3, color: "#a16207", blur: 0, stroke: true, fill: true }
            }).setOrigin(0.5).setDepth(40);
            this.scoreContainer.add(this.currentValueText);
        }

        const config = {
            fontFamily: '"Bubblegum Sans", cursive',
            fontSize: "28px",
            color: color, 
            stroke: "#000000",
            strokeThickness: 4,
            shadow: { offsetX: 3, offsetY: 3, color: "rgba(0,0,0,0.5)", blur: 2, fill: true, stroke: true }
        };
        const text = this.scene.add.text(0, 0, value, config).setOrigin(0.5);
        text.alpha = 0; // Starts invisible but will fade in
        text.scale = 0.8;

        this.scoreContainer.add(text);
        this.scoreHistory.push(text);

        // Position all items correctly to prevent overlapping
        const itemHeight = 22;
        this.scoreHistory.forEach((item, index) => {
            const targetY = -((this.scoreHistory.length - index) * itemHeight);
            
            this.scene.tweens.killTweensOf(item);
            this.scene.tweens.add({
                targets: item,
                y: targetY,
                alpha: 1,
                scale: 1,
                duration: 150,
                ease: "Cubic.out"
            });
        });

        // Keep it under max items
        if (this.scoreHistory.length > this.maxScoreItems) {
            const oldest = this.scoreHistory.shift();
            this.scene.tweens.killTweensOf(oldest);
            this.scene.tweens.add({
                targets: oldest,
                alpha: 0,
                scale: 0.6,
                duration: 150,
                onComplete: () => oldest.destroy()
            });
        }

        // Fadeout timer for individual items
        this.scene.time.delayedCall(2500, () => {
            if (text.active) {
                const idx = this.scoreHistory.indexOf(text);
                if (idx >= 0) {
                    this.scoreHistory.splice(idx, 1);
                }
                this.scene.tweens.add({
                    targets: text,
                    alpha: 0,
                    scaleX: 0.8,
                    scaleY: 0.8,
                    duration: 200,
                    onComplete: () => text.destroy()
                });
            }
        });
    }

    updateScoreValue(multiplier) {
        if (!this.currentValueText && this.scoreContainer) {
            this.addScoreItem(""); // Trigger creation
        }
        if (this.currentValueText) {
            this.currentValueText.setText(`x${multiplier.toFixed(2)}`);
        }
    }

    clearScoreStack() {
        if (!this.scoreContainer) return;
        this.scoreContainer.removeAll(true);
        this.scoreHistory = [];
        this.currentValueText = null;
    }

    setFace(value) {
        if (this.faceText) {
            this.faceText.setText(value);
        }
    }

    setExpression(name) {
        // Filter out "idle" pose (which has the hand) if already launched
        let finalName = name;
        if (this.hasLaunched && name === "idle") {
            finalName = "determined";
        }

        this.currentExpression = finalName;
        const textureKey = this.expressionTextureMap[finalName] || this.expressionTextureMap.idle;
        if (this.doll && this.scene.textures.exists(textureKey)) {
            const currentMultiplier = this.baseDollScale > 0
                ? (this.doll.scaleX / this.baseDollScale)
                : 1;
            this.doll.setTexture(textureKey);
            this.applyDollScale(currentMultiplier);
        }
    }

    isExpressionLocked() {
        return this.expressionLockTimerMs > 0;
    }

    lockExpressionFor(ms) {
        const next = Number(ms) || 0;
        if (next > 0) {
            this.expressionLockTimerMs = Math.max(this.expressionLockTimerMs, next);
        }
    }

    onGameplayInteraction(type) {
        if (type === "pickup") {
            // + numbers / x numbers -> happy for 1 second, then resume normal flow
            this.setExpression("happy");
            this.lockExpressionFor(1000);
            this.happySpinRemainingDeg = 360;
            return;
        }

        if (type === "sky") {
            // Sky multipliers (+ / x)
            this.setExpression("happy");
            this.lockExpressionFor(1000);
            this.happySpinRemainingDeg = 360;
            return;
        }

        if (type === "minus") {
            // Negative multiplier should keep the doll in "fly down" flow.
            this.setExpression("determined");
            this.lockExpressionFor(320);
            return;
        }

        if (type === "bomb") {
            this.setExpression("frustrated");
            this.playImpactFeedback();
            return;
        }

        if (type === "bat") {
            this.setExpression("panic");
            this.playImpactFeedback();
            return;
        }

        if (type === "hazard") {
            // Any obstacle/hazard collision should show the hit sprite immediately.
            this.setExpression("impact");
            this.lockExpressionFor(1000);
            this.playImpactFeedback();
            // Optional follow-up expression after hit window completes
            this.scene.time.delayedCall(1000, () => {
                if (!this.isExpressionLocked() && this.currentExpression === "impact") {
                    this.setExpression("spiral"); // Still uses ko texture but logically different
                }
            });
            return;
        }

        this.setExpression("dazed");
    }

    onRoundResult(didWin) {
        this.setExpression(didWin ? "win" : "loss");
    }

    setRoundTuning(speedMode = "NORMAL") {
        this.speedMode = speedMode;
        this.speedTuning = GAME_CONFIG.speedModes?.[speedMode] || GAME_CONFIG.speedModes?.NORMAL || {};
    }

    getGroundY() {
        return this.scene.getGroundY?.()
            ?? (this.scene.scale.height - GAME_CONFIG.world.groundOffsetFromBottom);
    }

    getStartX() {
        const layout = this.scene.getViewportLayout?.();

        if (!layout) {
            return GAME_CONFIG.doll.startX;
        }

        // Slightly further away for better visual balance
        return this.scene.getKickerX() + (layout.isMobile ? 48 : 64);
    }

    getTravelStats() {
        const distance = Math.max(0, this.maxX - this.launchStartX);
        const airTimeMs = this.elapsedMs;
        const peakHeight = Math.max(0, this.groundY - this.minY);

        return {
            distance: Number(distance.toFixed(2)),
            airTimeMs: Math.round(airTimeMs),
            peakHeight: Number(peakHeight.toFixed(2))
        };
    }

    relayout() {
        const previousGroundY = this.groundY;
        const nextGroundY = this.getGroundY();
        const diff = nextGroundY - previousGroundY;

        this.groundY = nextGroundY;
        this.position.y += diff;
        this.applyDollScale();

        this.syncVisuals();
    }

    computeBaseDollScale() {
        const idleTexture = this.scene.textures.get("doll_idle");
        const sourceHeight = idleTexture?.source?.[0]?.height || 1;
        const targetHeight = GAME_CONFIG.doll.height;
        this.baseDollScale = targetHeight / sourceHeight;
    }

    applyDollScale(multiplier = 1) {
        if (!this.doll) return;

        const safeMultiplier = Number.isFinite(multiplier) ? multiplier : 1;
        this.doll.setScale(this.baseDollScale * safeMultiplier);
    }

    clearTrails() {
        for (let i = 0; i < this.trails.length; i++) {
            this.trails[i]?.destroy();
        }
        this.trails.length = 0;
    }

    destroy() {
        this.stopIdleFloating();
        this.clearTrails();

        this.shadow?.destroy();
        this.doll?.destroy();
        this.faceText?.destroy();

        this.shadow = null;
        this.doll = null;
        this.faceText = null;
    }

    startIdleFloating() {
        if (!this.doll || this.idleFloatingTween) return;

        const groundY = this.getGroundY();
        const startY = groundY - GAME_CONFIG.doll.startYOffsetFromGround;

        this.idleFloatingTween = this.scene.tweens.add({
            targets: this.doll,
            y: startY - 8,
            duration: 1800,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
        });
    }

    stopIdleFloating() {
        if (this.idleFloatingTween) {
            this.idleFloatingTween.stop();
            this.idleFloatingTween = null;
            
            // Reset to base position
            if (this.doll) {
                const groundY = this.getGroundY();
                this.doll.y = groundY - GAME_CONFIG.doll.startYOffsetFromGround;
            }
        }
    }
}