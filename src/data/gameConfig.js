export const GAME_CONFIG = {
    baseWidth: 1280,
    baseHeight: 720,

    backgroundColor: "#1e293b",

    round: {
        startingBalance: 1000,
        defaultBet: 50,
        minBet: 1,
        maxBet: 500,
        baseMultiplier: 1,
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

    doll: {
        startX: 175,
        startYOffsetFromGround: 92, // Raised to hand/bat level
        width: 120,
        height: 120,
        gravity: 1400, // Reduced from 1700 for floatier feel
        launchVelocityX: 490, // Reduced from 620 to feel less "forward heavy"
        launchVelocityY: -760,
        bounceDamping: 0.48,
        minBounceVelocity: 140,
        stopVelocityX: 18,
        friction: 0.995, // Increased from 0.992 for better carry
        rotationSpeed: 5.5,
        collisionYOffsetFromGround: 10, // Visual offset for landing on road
        maxFlightTimeMs: 7000 // Increased from 5000 to allow longer flights
    },

    kicker: {
        x: 110,
        width: 40,
        height: 100,
        kickMoveX: 22,
        kickDuration: 140
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
        startX: 520,
        endX: 3200, // Extended range
        // Spread multipliers across almost full screen height (relative to groundY).
        // More negative = higher on screen.
        minYOffset: -520,
        maxYOffset: -110,
        nodeRadius: 20,
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
        diveVelocityY: 980,
        diveVelocityX: 260
    },

    encounters: {
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
                    { type: "hazard", x: 1220, yOffset: 0, label: "POLE", variant: "pole" },
                    { type: "hazard", x: 1540, yOffset: 0, label: "HOLE", variant: "hole" }
                ]
            },
            {
                id: "pattern_double_reward",
                weight: 15,
                items: [
                    { type: "pickup", x: 560, yOffset: -180, label: "x2" },
                    { type: "pickup", x: 900, yOffset: -150, label: "+1" },
                    { type: "hazard", x: 1560, yOffset: 0, label: "HOLE", variant: "hole" },
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
                    { type: "hazard", x: 1640, yOffset: 0, label: "WATER", variant: "water" },
                    { type: "hazard", x: 2000, yOffset: 0, label: "HOLE", variant: "hole" }
                ]
            }
        ]
    },

    debug: {
        enableLogs: true,
        showSceneLabels: true
    }
};