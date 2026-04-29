import { GAME_CONFIG } from "../data/gameConfig.js";

export default class ResultSystem {
    calculate(betAmount, multiplier, hitHazard, maxCombo = 0, travelStats = null, options = {}) {
        const maxMul = Number(GAME_CONFIG.round?.maxMultiplier ?? 999) || 999;
        const safeBetAmount = Math.max(0, Number(betAmount) || 0);
        const safeMultiplier = Phaser.Math.Clamp(Number((multiplier ?? 1).toFixed(2)), 1, maxMul);
        const distance = Number(travelStats?.distance ?? 0) || 0;
        const airTimeMs = Number(travelStats?.airTimeMs ?? 0) || 0;
        const peakHeight = Number(travelStats?.peakHeight ?? 0) || 0;

        const authoritative = !!options?.authoritative;
        if (authoritative) {
            const serverMultiplier = Phaser.Math.Clamp(
                Number((options?.serverMultiplier ?? safeMultiplier).toFixed(2)),
                1,
                maxMul
            );
            const serverPayout = Math.max(0, Number((options?.serverPayout ?? 0).toFixed(2)) || 0);
            const serverHitHazard = options?.serverHitHazard != null ? !!options.serverHitHazard : !!hitHazard;
            return {
                betAmount: safeBetAmount,
                multiplier: safeMultiplier,
                finalMultiplier: serverMultiplier,
                travelBonus: 0,
                hitHazard: serverHitHazard,
                payout: serverPayout,
                netChange: Number((serverPayout - safeBetAmount).toFixed(2)),
                outcome: serverHitHazard ? "LOSS" : "WIN",
                maxCombo,
                distance: Number(distance.toFixed(2)),
                airTimeMs: Math.round(airTimeMs),
                peakHeight: Number(peakHeight.toFixed(2))
            };
        }

        const payout = hitHazard ? 0 : Math.round(safeBetAmount * safeMultiplier * 100) / 100;
        const netChange = Number((payout - safeBetAmount).toFixed(2));
        const outcome = hitHazard ? "LOSS" : "WIN";

        return {
            betAmount: safeBetAmount,
            multiplier: safeMultiplier,
            finalMultiplier: safeMultiplier,
            travelBonus: 0,
            hitHazard,
            payout,
            netChange,
            outcome,
            maxCombo,
            distance: Number(distance.toFixed(2)),
            airTimeMs: Math.round(airTimeMs),
            peakHeight: Number(peakHeight.toFixed(2))
        };
    }
}
