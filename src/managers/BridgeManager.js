export default class BridgeManager {
    constructor(gameStateManager, roundManager) {
        this.gameStateManager = gameStateManager;
        this.roundManager = roundManager;
        this.onWindowError = null;
        this.onUnhandledRejection = null;
    }

    init() {
        // Platform -> Game functions (strictly per client integration spec).
        window.updateBalance = (balance) => {
            this.roundManager.uiManager?.updateBalance?.(balance);
        };
        window.updateMultiplier = (multiplier) => {
            this.roundManager.uiManager?.updateMultiplier?.(multiplier);
        };
        window.updateBetAmount = (betAmount) => {
            this.roundManager.uiManager?.setBet?.(betAmount);
        };
        window.updateAutoplayRemainingSpins = (remainingSpins) => {
            this.roundManager.uiManager?.setAutoPlayRemaining?.(remainingSpins);
        };
        window.startGame = (roundId, betAmount, winAmount, crashPoint) => {
            if (Number.isFinite(Number(betAmount))) {
                this.roundManager.uiManager?.setBet?.(Number(betAmount));
            }
            this.roundManager.startPrototypeRound({
                externalRoundData: {
                    roundId,
                    betAmount: Number(betAmount),
                    winAmount: Number(winAmount),
                    crashPoint: Number(crashPoint)
                }
            });
        };

        // Client PDF callback: window.onGameError(error)
        this.onWindowError = (event) => {
            const fn = window?.onGameError;
            if (typeof fn === "function") {
                const msg = String(event?.message || event?.error?.message || "Unexpected game error");
                try {
                    fn(msg);
                } catch (error) {
                    console.error("[BridgeManager] callback failed: onGameError", error);
                }
            }
        };
        this.onUnhandledRejection = (event) => {
            const fn = window?.onGameError;
            if (typeof fn === "function") {
                const reason = event?.reason;
                const msg = typeof reason === "string"
                    ? reason
                    : String(reason?.message || "Unhandled promise rejection");
                try {
                    fn(msg);
                } catch (error) {
                    console.error("[BridgeManager] callback failed: onGameError", error);
                }
            }
        };
        window.addEventListener("error", this.onWindowError);
        window.addEventListener("unhandledrejection", this.onUnhandledRejection);
        // Client PDF callback naming.
        const gameReadyFn = window?.gameReady;
        if (typeof gameReadyFn === "function") {
            try {
                gameReadyFn();
            } catch (error) {
                console.error("[BridgeManager] callback failed: gameReady", error);
            }
        }
    }

    destroy() {
        if (this.onWindowError) {
            window.removeEventListener("error", this.onWindowError);
            this.onWindowError = null;
        }
        if (this.onUnhandledRejection) {
            window.removeEventListener("unhandledrejection", this.onUnhandledRejection);
            this.onUnhandledRejection = null;
        }
    }
}