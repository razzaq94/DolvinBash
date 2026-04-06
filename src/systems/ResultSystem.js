import { GAME_CONFIG } from "../data/gameConfig.js";

export default class ResultSystem {
    calculate(betAmount, multiplier, hitHazard, maxCombo = 0, travelStats = null) {
        const maxMul = Number(GAME_CONFIG.round?.maxMultiplier ?? 999) || 999;
        const safeMultiplier = Phaser.Math.Clamp(Number((multiplier ?? 1).toFixed(2)), 1, maxMul);
        const distance = travelStats?.distance ?? 0;
        const airTimeMs = travelStats?.airTimeMs ?? 0;
        const peakHeight = travelStats?.peakHeight ?? 0;
        const travelCfg = GAME_CONFIG.travel || {};
        const distanceStep = Math.max(1, Number(travelCfg.distanceStep ?? 100));
        const distanceStepMultiplier = Math.max(0, Number(travelCfg.distanceStepMultiplier ?? 0));
        const airtimeStepMs = Math.max(1, Number(travelCfg.airtimeStepMs ?? 1000));
        const airtimeStepMultiplier = Math.max(0, Number(travelCfg.airtimeStepMultiplier ?? 0));

        const distanceSteps = Math.floor(Math.max(0, distance) / distanceStep);
        const airtimeSteps = Math.floor(Math.max(0, airTimeMs) / airtimeStepMs);
        const travelBonusRaw = (distanceSteps * distanceStepMultiplier) + (airtimeSteps * airtimeStepMultiplier);
        const travelBonus = Number(travelBonusRaw.toFixed(2));
        const finalMultiplier = Phaser.Math.Clamp(Number((safeMultiplier + travelBonus).toFixed(2)), 1, maxMul);
        const payout = hitHazard ? 0 : Math.round(betAmount * finalMultiplier * 100) / 100;
        const netChange = Number((payout - betAmount).toFixed(2));
        const outcome = hitHazard ? "LOSS" : "WIN";

        return {
            betAmount,
            multiplier: safeMultiplier,
            finalMultiplier,
            travelBonus,
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