export const GAME_CONFIG = {
    baseWidth: 1280,
    baseHeight: 720,

    backgroundColor: "#1e293b",

    round: {
        startingBalance: 1000,
        defaultBet: 1,
        minBet: 1,
        maxBet: 500,
        baseMultiplier: 1,
        maxMultiplier: 999,
        travelBonusPer100: 0.02,
        defaultSpeedMode: "NORMAL",
        defaultVolatility: "NORMAL"
    },

    world: {
        groundOffsetFromBottom: 118, // Lowered from 140 to sink deeper
        groundHeight: 140,
        width: 20000,

        // Visual background (road+bushes) vertical alignment.
        // Mobile: a bit lower, PC: a bit higher.
        roadVerticalOffsetMobile: 230,
        roadVerticalOffsetDesktop: 140
    },

    // Fine-tune road obstacle vertical placement (relative to groundY).
    roadObstacleY: {
        hole: 34,
        trafficcone: 34,
        roadblocker: 74
    },

    // Road hazard AABB vs sprite size (smaller = must touch visual; client felt old boxes were too forgiving).
    roadObstacleColliders: {
        dollHalfWidthFactor: 0.32,
        dollHalfHeightFactor: 0.38,
        hole: { wFactor: 0.32, hFactor: 0.28 },
        trafficcone: { wFactor: 0.44, hFactor: 0.5 },
        roadblocker: { wFactor: 0.5, hFactor: 0.44 }
    },

    doll: {
        startX: 175,
        startYOffsetFromGround: 105,// Slightly higher start position
        width: 120,
        height: 120,
        gravity: 1400, // Reduced from 1700 for floatier feel
        launchVelocityX: 490, // Reduced from 620 to feel less "forward heavy"
        launchVelocityY: -760,
        bounceDamping: 0.32,
        minBounceVelocity: 175,
        stopVelocityX: 26,
        friction: 0.992,
        // Early stop once rolling reaches a "mid" speed band (ends the round sooner).
        // When grounded and abs(vx) <= midRollStopVelocityX for >= midRollStopMs, we stop and resolve win/loss.
        midRollStopVelocityX: 60,
        midRollStopMs: 520,
        rotationSpeed: 5.5,
        collisionYOffsetFromGround: 10, // Visual offset for landing on road
        maxFlightTimeMs: 7000, // Increased from 5000 to allow longer flights
        // Desktop only: each round randomizes ground roll (long slide vs early stop) so obstacle timing varies.
        pcDesktopRollVariance: {
            enabled: true,
            frictionHeatMin: 0.55,
            frictionHeatMax: 1.45,
            groundedMsExtraMin: -350,
            groundedMsExtraMax: 1300,
            stopVxMulMin: 0.7,
            stopVxMulMax: 1.38,
            minGroundedToAllowStop: 380,
            maxGroundedToAllowStop: 3600
        }
    },

    kicker: {
        x: 110,
        width: 40,
        height: 100,
        kickMoveX: 22,
        kickDuration: 140,
        // Apply the actual doll launch a bit before the full swing finishes (snappier impact).
        hitDelayMs: 220,
        // Haptics (mobile): vibrate on bat hit.
        vibrateOnHit: true,
        vibrateMs: 18
    },

    camera: {
        followLerp: 0.08,
        followOffsetX: -220,
        maxX: 19000,
        shakeMinorMs: 120,
        shakeMinorIntensity: 0.0045,
        shakeMajorMs: 180,
        shakeMajorIntensity: 0.01
    },

    combo: {
        enabled: true,
        windowMs: 1200,
        bonusEveryHits: 2,
        bonusAmount: 1
    },

    travel: {
        distanceStep: 140,
        distanceStepMultiplier: 0.12,
        airtimeStepMs: 700,
        airtimeStepMultiplier: 0.05
    },

    skyMultipliers: {
        enabled: true,
        minCount: 22,
        maxCount: 28,
        // Desktop dense pool so gap-only fillers always have enough nodes.
        minCountDesktop: 56,
        maxCountDesktop: 68,
        // Only initial prefill (on Play start): begin a little ahead of the kicker area.
        prefillStartAheadPx: 120,
        prefillStartAheadPxDesktop: 180,
        startX: 520,
        endX: 3200, // Extended range
        // Spread multipliers across almost full screen height (relative to groundY).
        // More negative = higher on screen.
        minYOffset: -520,
        maxYOffset: -110,
        nodeRadius: 20,
        // Gameplay hit (tighter than visible text) so distant numbers do not "magnet" hit.
        hitRadius: 15,
        // Long single-frame sweeps are split so we do not count near-misses along the chord.
        maxSweepSegmentPx: 46,
        // Minimum padding between sky numbers and bats/bombs (AABB separation; strict no overlap).
        strictAirThreatGap: 22,
        pickupHitScale: 0.82,
        // Mobile: thora thora forgiving colliders for numbers.
        mobileCircleHitTweak: {
            enabled: true,
            skyHitMul: 1.08,
            pickupHitMul: 1.1,
            bombHitMul: 1.06,
            dollRadiusAdd: 0.9
        },
        // PC (wide / ENVELOP): slightly larger circle hits than mobile — “thora thora” only.
        desktopCircleHitTweak: {
            enabled: true,
            skyHitMul: 1.06,
            pickupHitMul: 1.05,
            bombHitMul: 1.065,
            dollRadiusAdd: 0.75
        },
        minGap: 0, // New: controls minimum spacing between multipliers
        maxGap: 0, // New: controls maximum spacing between multipliers
        pool: [
            { id: "m_x2_up", label: "x2", bonus: 1, weight: 15, color: 0xfacc15, motion: "up_forward", forceX: 140, forceY: -420 },
            { id: "m_x3_forward", label: "x3", bonus: 2, weight: 10, color: 0xf59e0b, motion: "forward", forceX: 220, forceY: -180 },
            { id: "m_x5_burst", label: "x5", bonus: 4, weight: 5, color: 0x8b5cf6, motion: "burst_up", forceX: 280, forceY: -520 },
            { id: "m_plus1_float", label: "+1", bonus: 1, weight: 35, color: 0x22c55e, motion: "up_forward", forceX: 120, forceY: -320 },
            { id: "m_back_hit", label: "-1", penalty: 1, weight: 20, color: 0xfb7185, motion: "backward", forceX: -180, forceY: -120 }
        ]
    },

    // Procedural bombs: fewer hazards, wider random gaps; thinPercent = empty “air pocket” slots.
    proceduralBombStream: {
        gapMin: 260,
        gapMax: 460,
        unablePlaceGapMin: 200,
        unablePlaceGapMax: 380,
        fillAheadPx: 1050,
        gapMinDesktop: 200,
        gapMaxDesktop: 380,
        unablePlaceGapMinDesktop: 220,
        unablePlaceGapMaxDesktop: 420,
        fillAheadPxDesktop: 1800,
        spawnThinPercent: 42,
        maxSpawnStepsPerFrame: 18,
        xJitterMin: -56,
        xJitterMax: 78
    },

    // Softer sim on narrow mobile GPUs (e.g. jerky flight under high timeScale or frame spikes).
    performance: {
        mobileGameplayTimeScaleCap: 1.12,
        mobilePhysicsDeltaCapMs: 30
    },

    speedModes: {
        SLOW: {
            launchXMultiplier: 0.88,
            launchYMultiplier: 0.9,
            gravityMultiplier: 0.92,
            frictionMultiplier: 1.015,
            travelMultiplier: 0.92,
            timeScale: 0.75
        },
        NORMAL: {
            launchXMultiplier: 1,
            launchYMultiplier: 1,
            gravityMultiplier: 1,
            frictionMultiplier: 1,
            travelMultiplier: 1,
            timeScale: 1
        },
        FAST: {
            launchXMultiplier: 1.14,
            launchYMultiplier: 1.08,
            gravityMultiplier: 1.08,
            frictionMultiplier: 0.985,
            travelMultiplier: 1.14,
            timeScale: 1.50
        },
        ULTRA: {
            launchXMultiplier: 1.65,
            launchYMultiplier: 1.38,
            gravityMultiplier: 1.26,
            frictionMultiplier: 0.96,
            travelMultiplier: 1.65,
            timeScale: 2.30
        }
    },

    volatilityModes: {
        LOW: {
            bonusMultiplier: 0.86,
            penaltyMultiplier: 0.7,
            hazardWeightMultiplier: 0.75
        },
        NORMAL: {
            bonusMultiplier: 1,
            penaltyMultiplier: 1,
            hazardWeightMultiplier: 1
        },
        HIGH: {
            bonusMultiplier: 1.2,
            penaltyMultiplier: 1.15,
            hazardWeightMultiplier: 1.3
        }
    },

    bat: {
        impulseX: 420,
        impulseY: -720,
        // Bat hit: harder downward drive and slightly less horizontal → “more straight down”.
        diveVelocityY: 1220,
        diveVelocityX: 140,
        // Pattern-spawned bats: same HD box as procedural (full source detail, mobile + PC).
        displayWidth: 140,
        displayHeight: 96,
        // Max on-screen size (world px): large enough to use client PNGs sharply; same on mobile + desktop.
        streamTargetMaxPx: 96,
        stream: {
            poolCount: 90,
            gapMin: 280,
            gapMax: 500,
            gapMinDesktop: 220,
            gapMaxDesktop: 420,
            unablePlaceGapMin: 220,
            unablePlaceGapMax: 400,
            unablePlaceGapMinDesktop: 240,
            unablePlaceGapMaxDesktop: 460,
            fillAheadPx: 980,
            fillAheadPxDesktop: 1750,
            spawnThinPercent: 48,
            maxSpawnStepsPerFrame: 16,
            xJitterMin: -64,
            xJitterMax: 84,
            // Desync from bomb column so they don’t spawn in the same stripe as often.
            spawnPhaseOffsetX: 420
        },
        wingFrameMs: 128,
        wingTextureUp: "bat_wing_up",
        wingTextureMid: "bat_wing_mid",
        wingTextureDown: "bat_wing_down",
        hitbox: { wFactor: 0.5, hFactor: 0.52 }
    },

    encounters: {
        // Ground road obstacles (hole / cone / barricade): no spawn until the doll is rolling on the road;
        // each spawn roll can be one of the variants or nothing (clear lane → easier win).
        roadObstacleStream: {
            minRollSpeedX: 24,
            gapMin: 760,
            gapMax: 1700,
            firstGapAfterRollMin: 480,
            firstGapAfterRollMax: 1040,
            // Stream behavior: keep some obstacles prefilled ahead so they don't "pop in".
            fillAheadPx: 2000,
            fillAheadPxDesktop: 2600,
            maxSpawnStepsPerFrame: 10,
            // Desktop (ENVELOP / wide): clearer lanes made "nothing" feel like ~1/5 spawns; tune separately from mobile.
            gapMinDesktop: 560,
            gapMaxDesktop: 1180,
            firstGapAfterRollMinDesktop: 360,
            firstGapAfterRollMaxDesktop: 820,
            rightEdgePaddingPx: 44,
            rightEdgePaddingRatio: 0.07,
            spawnWeights: {
                nothing: 34,
                hole: 20,
                trafficcone: 28,
                roadblocker: 18
            },
            spawnWeightsDesktop: {
                nothing: 18,
                hole: 24,
                trafficcone: 30,
                roadblocker: 28
            }
        },
        hazardRules: {
            tree: { severity: "major", multiplierPenalty: 0, bounceImpulseX: -220, bounceImpulseY: -280 },
            lamp_post: { severity: "major", multiplierPenalty: 0, bounceImpulseX: -200, bounceImpulseY: -260 },
            water: { severity: "minor", multiplierPenalty: 0.5, bounceImpulseX: -160, bounceImpulseY: -240 },
            pole: { severity: "minor", multiplierPenalty: 0.8, bounceImpulseX: -280, bounceImpulseY: -300 },
            hole: { severity: "minor", multiplierPenalty: 0.6, bounceImpulseX: -220, bounceImpulseY: -260 },
            default: { severity: "major", multiplierPenalty: 0, bounceImpulseX: -180, bounceImpulseY: -240 }
        },
        patterns: [
            {
                id: "pattern_easy_arc",
                weight: 25,
                items: [
                    { type: "pickup", x: 600, yOffset: -180, label: "x2" },
                    { type: "bomb", x: 980, yOffset: -160, label: "÷2" },
                    { type: "hazard", x: 1400, yOffset: 0, label: "TREE", variant: "tree" },
                    { type: "hazard", x: 1800, yOffset: 0, label: "LAMP", variant: "lamp_post" }
                ]
            },
            {
                id: "pattern_low_pickup_fast_hazard",
                weight: 20,
                items: [
                    { type: "pickup", x: 520, yOffset: -120, label: "x2" },
                    { type: "bomb", x: 880, yOffset: -140, label: "÷2" },
                    { type: "hazard", x: 1220, yOffset: 0, label: "POLE", variant: "pole" }
                ]
            },
            {
                id: "pattern_double_reward",
                weight: 15,
                items: [
                    { type: "pickup", x: 560, yOffset: -180, label: "x2" },
                    { type: "pickup", x: 900, yOffset: -150, label: "+1" },
                    { type: "hazard", x: 1900, yOffset: 0, label: "WATER", variant: "water" }
                ]
            },
            {
                id: "pattern_risky_middle",
                weight: 15,
                items: [
                    { type: "pickup", x: 950, yOffset: -200, label: "x2" },
                    { type: "bomb", x: 1180, yOffset: -160, label: "÷2" },
                    { type: "hazard", x: 1320, yOffset: 0, label: "WATER", variant: "water" },
                    { type: "hazard", x: 1700, yOffset: 0, label: "POLE", variant: "pole" },
                    { type: "hazard", x: 2100, yOffset: 0, label: "LAMP", variant: "lamp_post" }
                ]
            },
            {
                id: "pattern_simple_combo",
                weight: 15,
                items: [
                    { type: "pickup", x: 500, yOffset: -150, label: "x2" },
                    { type: "pickup", x: 1100, yOffset: -180, label: "+1" },
                    { type: "hazard", x: 1500, yOffset: 0, label: "TREE", variant: "tree" },
                    { type: "hazard", x: 1900, yOffset: 0, label: "LAMP", variant: "lamp_post" }
                ]
            },
            {
                id: "pattern_hazard_risk",
                weight: 10,
                items: [
                    { type: "pickup", x: 1240, yOffset: -130, label: "x2" },
                    { type: "hazard", x: 1640, yOffset: 0, label: "WATER", variant: "water" }
                ]
            }
        ]
    },

    debug: {
        enableLogs: true,
        showSceneLabels: true
    }
};