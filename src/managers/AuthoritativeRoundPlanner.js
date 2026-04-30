import { GAME_CONFIG } from "../data/gameConfig.js";

/**
 * Deterministic planner for authoritative rounds.
 * Generates a consistent hit sequence and item layout based on platform inputs.
 */
export default class AuthoritativeRoundPlanner {
    /**
     * Generate a full round plan from server-provided inputs.
     */
    static generatePlan(params) {
        const {
            roundId = "unknown",
            betAmount = 0,
            winAmount = 0,
            crashPoint = 1
        } = params;

        // 1) CREATE LOCAL DETERMINISTIC SEED
        const numericSeed = this._resolveNumericSeed(roundId, betAmount, winAmount, crashPoint);
        const rng = this._createSeededRNG(numericSeed);

        const targetMultiplier = Math.max(1, Number(crashPoint.toFixed(2)));
        const isLoss = winAmount <= 0;

        // 2) CREATE ROUND PLAN
        // Choose step count based on crashPoint
        let stepCount;
        if (targetMultiplier <= 3) {
            stepCount = Math.floor(rng() * 4) + 6; // 6 to 9
        } else if (targetMultiplier <= 10) {
            stepCount = Math.floor(rng() * 6) + 10; // 10 to 15
        } else if (targetMultiplier <= 30) {
            stepCount = Math.floor(rng() * 8) + 14; // 14 to 21
        } else {
            stepCount = Math.floor(rng() * 10) + 18; // 18 to 27
        }

        // Calculate duration based on crashPoint: ensure high crash points have enough "runway"
        let durationMs = 3000 + (targetMultiplier * 380); 
        durationMs = Math.max(3500, Math.min(durationMs, 25000));

        const steps = this._generateStepSequence(rng, targetMultiplier, stepCount, isLoss);

        const plan = {
            roundId,
            betAmount,
            winAmount,
            crashPoint: targetMultiplier,
            seed: numericSeed,
            startMultiplier: 1.00,
            targetMultiplier,
            durationMs,
            isLoss,
            steps,
            useSeededAuthoritativePlanner: true
        };

        if (GAME_CONFIG.debug?.enableLogs) {
            console.log(`[AuthoritativeRoundPlanner] Plan generated for round ${roundId}`);
            console.log(` - Seed: ${numericSeed}`);
            console.log(` - Target: ${targetMultiplier}`);
            console.log(` - Steps: ${steps.length}`);
            steps.forEach(s => {
                console.log(`   [Step ${s.stepIndex}] ${s.multiplierBefore} -> ${s.label} -> ${s.multiplierAfter}`);
            });
        }

        return plan;
    }

    /**
     * Generates a deterministic sequence of multiplier operations.
     * The PHYSICAL path (types) is determined solely by the seed for consistency.
     * The VALUES (labels) are scaled to reach the target.
     */
    static _generateStepSequence(rng, target, count, isLoss) {
        const steps = [];
        let currentMultiplier = 1.00;

        const stepCount = Math.max(2, Math.round(Number(count) || 6));
        const growthSteps = Math.max(1, stepCount - 1);

        const format = (value) => Number(value.toFixed(2));
        const makeLabel = (type, value) => {
            if (type === "add") return `+${value.toFixed(2)}`;
            if (type === "bat") return `+${value.toFixed(2)}`;
            if (type === "subtract") return `-${value.toFixed(2)}`;
            if (type === "multiply") return `x${value.toFixed(2)}`;
            if (type === "divide") return `÷${value.toFixed(2)}`;
            return `+${value.toFixed(2)}`;
        };

        // Distribution target across growth steps (visible on screen):
        //   add (+):      ~30%
        //   subtract (-): ~30%
        //   multiply (x): ~10%
        //   bat:          ~15%
        //   divide (÷):   ~15%
        // Net positive (add+multiply+bat) vs negative (subtract+divide) ≈ 55/45.
        // Adjacency rules:
        //   - allow consecutive `add` (two `+` in a row is fine, even encouraged).
        //   - never two `subtract` in a row.
        //   - never two `multiply` in a row.
        //   - never two hazards in a row (bat/bomb in any combination).
        const pickWeightedType = (current, lastType) => {
            // Re-balanced: + and * are favored (55%), but -, bat, and bomb (45%) still appear frequently
            const weights = { add: 40, subtract: 20, multiply: 15, bat: 12, divide: 13 };
            // Feasibility: never let subtract/divide drag below 1.0
            if (current <= 1.10) {
                weights.subtract = 0;
                weights.divide = 0;
            } else if (current <= 1.40) {
                weights.divide = 0;
            }
            // Multiply is most useful before reaching the upper portion; soft taper near target.
            if (current >= Math.max(1.5, target * 0.85)) {
                weights.multiply = 0;
            }
            // We previously forced strict alternating for a pure zig-zag, but the 
            // 5-lane physics bounce system now naturally guarantees an intense zig-zag 
            // even if multiple `+` happen in a row. So we relax the alternating rule
            // to allow more + and * as requested.
            if (lastType === "bat" || lastType === "divide") {
                weights.bat = 0;
                weights.divide = 0;
            }
            if (lastType === "subtract") {
                weights.subtract = 0;
            }
            if (lastType === "multiply") {
                weights.multiply = 0;
            }
            const total = weights.add + weights.subtract + weights.multiply + weights.bat + weights.divide;
            if (total === 0) return "add";
            let r = rng() * total;
            const order = ["add", "subtract", "multiply", "bat", "divide"];
            for (const t of order) {
                r -= weights[t];
                if (r <= 0) return t;
            }
            return "add";
        };

        for (let i = 0; i < growthSteps; i++) {
            const before = currentMultiplier;
            // Force a minimum gap even if we are at or above target (for variety in loss paths)
            const remainingGap = Math.max(0.15, target - currentMultiplier);
            const remainingGrowthSteps = Math.max(1, growthSteps - i);
            const lastType = steps.length > 0 ? steps[steps.length - 1].type : null;
            let type = pickWeightedType(currentMultiplier, lastType);

            let value = 0;
            let after = currentMultiplier;

            if (type === "add" || type === "bat") {
                // Spread positive contribution across remaining steps with jitter for variety.
                const baseShare = remainingGap / remainingGrowthSteps;
                const jitter = 0.55 + (rng() * 0.95); // 0.55 .. 1.50
                const maxReadableAdd = target > 30 ? 9 : target > 10 ? 6 : target > 3 ? 3 : 1.5;
                value = format(Math.min(maxReadableAdd, Math.max(0.10, baseShare * jitter)));
                after = format(currentMultiplier + value);
                // Reserve headroom so we don't overshoot target before final step.
                if (after >= target * 0.96 && i < growthSteps - 1) {
                    value = format(Math.max(0.10, remainingGap * 0.45));
                    after = format(currentMultiplier + value);
                }
            } else if (type === "multiply") {
                // x1.20 .. x1.80 — always a meaningful boost but never beyond crash target.
                value = format(1.20 + (rng() * 0.60));
                after = format(currentMultiplier * value);
                // If a multiply would overshoot, fall back to a regular add.
                if (after >= target * 0.96 && i < growthSteps - 1) {
                    type = "add";
                    const baseShare = remainingGap / remainingGrowthSteps;
                    value = format(Math.max(0.10, baseShare));
                    after = format(currentMultiplier + value);
                }
            } else if (type === "subtract") {
                const cap = Math.min(2.5, Math.max(0.20, (currentMultiplier - 1.0) * 0.65));
                value = format(Math.max(0.10, 0.20 + (rng() * cap)));
                after = format(Math.max(1, currentMultiplier - value));
            } else if (type === "divide") {
                value = format(1.20 + (rng() * 0.65)); // ÷1.20 .. ÷1.85
                after = format(Math.max(1, currentMultiplier / value));
            }

            // Avoid perfectly flat steps.
            if (Math.abs(after - before) < 0.01) {
                type = "add";
                value = 0.10;
                after = format(before + value);
            }

            currentMultiplier = after;
            steps.push({
                stepIndex: steps.length,
                type,
                value,
                label: makeLabel(type, value),
                multiplierBefore: before,
                multiplierAfter: currentMultiplier,
                expectedHit: true
            });
        }

        const before = currentMultiplier;
        const finalDiff = format(target - currentMultiplier);
        const finalType = finalDiff >= 0 ? "add" : "subtract";
        const finalValue = Math.abs(finalDiff);
        steps.push({
            stepIndex: steps.length,
            type: finalType,
            value: finalValue,
            label: makeLabel(finalType, finalValue),
            multiplierBefore: before,
            multiplierAfter: target,
            expectedHit: true,
            isFinalStep: true // Flag so the InteractionSystem knows to slam down
        });

        return steps;
    }

    static _resolveNumericSeed(roundId, betAmount, winAmount, crashPoint) {
        const combined = `${roundId}_${betAmount}_${winAmount}_${crashPoint}_${Math.random()}_${Date.now()}`;
        let hash = 0;
        for (let i = 0; i < combined.length; i++) {
            hash = ((hash << 5) - hash) + combined.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    static _createSeededRNG(seed) {
        let state = seed % 2147483647;
        if (state <= 0) state += 2147483646;
        return function() {
            state = (state * 48271) % 2147483647;
            return (state - 1) / 2147483646;
        };
    }
}
