export default class ResultSystem {
    calculate(betAmount, multiplier, hitHazard, maxCombo = 0) {
        const payout = hitHazard ? 0 : betAmount * multiplier;

        return {
            betAmount,
            multiplier,
            hitHazard,
            payout,
            maxCombo
        };
    }
}