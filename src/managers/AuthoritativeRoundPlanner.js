/**
 * Deterministic planner for authoritative rounds.
 * Generates a consistent hit sequence and item layout based on a server seed.
 */
export default class AuthoritativeRoundPlanner {
    /**
     * Generate a full round plan from server-provided inputs.
     */
    static generatePlan(params) {
        const {
            crashPoint,
            winAmount,
            seed,
            durationMs: requestedDurationMs,
            roundId = "unknown"
        } = params;

        // Ensure we have a stable numeric seed
        const numericSeed = this._resolveNumericSeed(seed, roundId, crashPoint, winAmount);
        const rng = this._createSeededRNG(numericSeed);

        const targetMultiplier = Math.max(1, Number(crashPoint.toFixed(2)));
        const isLoss = winAmount <= 0;

        // Determine number of steps (5 to 12 based on target)
        const stepCount = isLoss ? 1 : Math.min(12, Math.max(5, Math.floor(Math.log2(targetMultiplier) * 2) + 4));

        // Derive duration if not provided
        let durationMs = requestedDurationMs;
        if (!durationMs || durationMs <= 0) {
            durationMs = Math.round(650 + ((targetMultiplier - 1) * 260));
            durationMs = Math.max(1500, Math.min(durationMs, 12000));
            if (isLoss && targetMultiplier <= 1.01) durationMs = 1500;
        }

        const steps = this._generateStepSequence(rng, targetMultiplier, stepCount, isLoss);

        const plan = {
            roundSeed: numericSeed,
            startMultiplier: 1.00,
            targetMultiplier,
            durationMs,
            isLoss,
            steps,
            useSeededAuthoritativePlanner: true
        };

        if (typeof console !== "undefined" && console.log) {
            console.log(`[AuthoritativeRoundPlanner] Plan generated for round ${roundId}`);
            console.log(` - Seed: ${numericSeed}`);
            console.log(` - Target: ${targetMultiplier}`);
            console.log(` - Steps: ${steps.length}`);
            steps.forEach(s => {
                console.log(`   [Step ${s.stepIndex}] ${s.multiplierBefore} -> ${s.label} -> ${s.multiplierAfter} (${s.category})`);
            });
        }

        return plan;
    }

    /**
     * Generates a deterministic sequence of multiplier operations summing/multiplying exactly to target.
     */
    static _generateStepSequence(rng, target, count, isLoss) {
        const steps = [];
        let currentMultiplier = 1.00;

        if (isLoss && target <= 1.01) {
            // Special case for immediate loss
            return [{
                stepIndex: 0,
                type: "add",
                value: 0,
                label: "+0",
                multiplierBefore: 1,
                multiplierAfter: 1,
                shouldHit: true,
                category: "bomb"
            }];
        }

        // We need to distribute the 'growth' over (count - 2) steps, 
        // leaving the last 2 for exact convergence.
        const convergenceSteps = 2;
        const growthSteps = Math.max(1, count - convergenceSteps);

        for (let i = 0; i < growthSteps; i++) {
            const isLastGrowth = i === growthSteps - 1;
            const remainingTarget = target - currentMultiplier;
            
            // Choose operation type
            // 70% Add, 20% Multiply, 10% Subtract
            const roll = rng();
            let type = "add";
            if (roll > 0.7 && currentMultiplier > 1.2) type = "multiply";
            if (roll > 0.9 && i > 1) type = "subtract";

            let stepValue = 0;
            let label = "";

            if (type === "multiply") {
                // Target a portion of the remaining growth
                const share = (rng() * 0.3 + 0.1); 
                const targetAfter = currentMultiplier + (remainingTarget * share);
                const factor = Number((targetAfter / currentMultiplier).toFixed(2));
                
                if (factor > 1.05 && factor < 4.0) {
                    stepValue = Number((currentMultiplier * (factor - 1)).toFixed(2));
                    label = `x${factor}`;
                    currentMultiplier = Number((currentMultiplier * factor).toFixed(2));
                } else {
                    type = "add"; // Fallback
                }
            }

            if (type === "subtract") {
                stepValue = Number((rng() * 0.15 + 0.05).toFixed(2));
                label = `-${stepValue}`;
                currentMultiplier = Number((currentMultiplier - stepValue).toFixed(2));
            }

            if (type === "add") {
                const share = (rng() * 0.4 + 0.1) / (growthSteps - i);
                stepValue = Number((remainingTarget * share).toFixed(2));
                stepValue = Math.max(0.01, stepValue);
                label = `+${stepValue}`;
                currentMultiplier = Number((currentMultiplier + stepValue).toFixed(2));
            }

            steps.push({
                stepIndex: i,
                type,
                value: stepValue,
                label,
                multiplierBefore: Number((currentMultiplier - stepValue).toFixed(2)),
                multiplierAfter: currentMultiplier,
                shouldHit: true,
                category: rng() > 0.3 ? "sky" : "pickup"
            });
        }

        // Convergence steps to land exactly on target
        for (let i = 0; i < convergenceSteps; i++) {
            const isLast = i === convergenceSteps - 1;
            const gap = target - currentMultiplier;
            let stepValue = 0;
            let label = "";
            let type = "add";

            if (isLast) {
                stepValue = Number(gap.toFixed(2));
            } else {
                stepValue = Number((gap * (rng() * 0.4 + 0.3)).toFixed(2));
            }

            label = `+${stepValue}`;
            const before = currentMultiplier;
            currentMultiplier = Number((currentMultiplier + stepValue).toFixed(2));

            steps.push({
                stepIndex: steps.length,
                type,
                value: stepValue,
                label,
                multiplierBefore: before,
                multiplierAfter: currentMultiplier,
                shouldHit: true,
                category: "sky"
            });
        }

        return steps;
    }

    static _resolveNumericSeed(seed, roundId, crashPoint, winAmount) {
        if (typeof seed === "number") return seed;
        if (typeof seed === "string" && seed.length > 0) {
            let hash = 0;
            for (let i = 0; i < seed.length; i++) {
                hash = ((hash << 5) - hash) + seed.charCodeAt(i);
                hash |= 0;
            }
            return Math.abs(hash);
        }
        // Fallback stable seed
        const combined = `${roundId}_${crashPoint}_${winAmount}`;
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
