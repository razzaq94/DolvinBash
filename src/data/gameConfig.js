export const GAME_CONFIG = {
    baseWidth: 1280,
    baseHeight: 720,

    backgroundColor: "#1e293b",

    round: {
        startingBalance: 1000,
        defaultBet: 50,
        minBet: 10,
        maxBet: 500,
        baseMultiplier: 1
    },

    world: {
        groundOffsetFromBottom: 140,
        groundHeight: 140,
        width: 3200
    },

    doll: {
        startX: 180,
        startYOffsetFromGround: 36,
        width: 44,
        height: 44,
        gravity: 1700,
        launchVelocityX: 520,
        launchVelocityY: -760,
        bounceDamping: 0.48,
        minBounceVelocity: 140,
        stopVelocityX: 18,
        friction: 0.992,
        rotationSpeed: 5.5,
        maxFlightTimeMs: 5000
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
        maxX: 2200
    },

    combo: {
        enabled: true,
        windowMs: 1200,
        bonusEveryHits: 2,
        bonusAmount: 1
    },

    bat: {
        impulseX: 420,
        impulseY: -720
    },

    encounters: {
        patterns: [
            {
                id: "pattern_easy_arc",
                weight: 25,
                items: [
                    { type: "pickup", x: 600, yOffset: -180, label: "x2" },
                    { type: "bomb", x: 1000, yOffset: -110, label: "B" },
                    { type: "hazard", x: 1400, yOffset: -40, label: "!" }
                ]
            },
            {
                id: "pattern_low_pickup_fast_hazard",
                weight: 20,
                items: [
                    { type: "pickup", x: 520, yOffset: -120, label: "x2" },
                    { type: "bomb", x: 860, yOffset: -170, label: "B" },
                    { type: "hazard", x: 1220, yOffset: -40, label: "!" }
                ]
            },
            {
                id: "pattern_double_reward",
                weight: 15,
                items: [
                    { type: "pickup", x: 560, yOffset: -180, label: "x2" },
                    { type: "pickup", x: 900, yOffset: -150, label: "+1" },
                    { type: "bomb", x: 1180, yOffset: -100, label: "B" },
                    { type: "hazard", x: 1560, yOffset: -40, label: "!" }
                ]
            },
            {
                id: "pattern_risky_middle",
                weight: 15,
                items: [
                    { type: "bomb", x: 640, yOffset: -120, label: "B" },
                    { type: "pickup", x: 950, yOffset: -200, label: "x2" },
                    { type: "hazard", x: 1320, yOffset: -40, label: "!" }
                ]
            },
            {
                id: "pattern_bat_combo",
                weight: 15,
                items: [
                    { type: "pickup", x: 500, yOffset: -150, label: "x2" },
                    { type: "bat", x: 800, yOffset: -100, label: "HIT", impulseX: 440, impulseY: -760 },
                    { type: "pickup", x: 1100, yOffset: -180, label: "+1" },
                    { type: "hazard", x: 1500, yOffset: -40, label: "!" }
                ]
            },
            {
                id: "pattern_bat_bomb_risk",
                weight: 10,
                items: [
                    { type: "bat", x: 700, yOffset: -120, label: "HIT", impulseX: 390, impulseY: -700 },
                    { type: "bomb", x: 1020, yOffset: -170, label: "B" },
                    { type: "pickup", x: 1240, yOffset: -130, label: "x2" },
                    { type: "hazard", x: 1640, yOffset: -40, label: "!" }
                ]
            }
        ]
    },

    debug: {
        enableLogs: true,
        showSceneLabels: true
    }
};