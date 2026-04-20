export default class BridgeManager {
    constructor(gameStateManager, roundManager) {
        this.gameStateManager = gameStateManager;
        this.roundManager = roundManager;
        this.onWindowError = null;
        this.onUnhandledRejection = null;
        this.gameReadyRetryTimer = null;
        this.gameReadyRetries = 0;
        this.gameReadyAnnounced = false;
    }

    init() {
        const toFiniteNumber = (value) => {
            if (typeof value === "number") {
                return Number.isFinite(value) ? value : NaN;
            }
            if (typeof value === "string") {
                const normalized = value.trim().replace(",", ".");
                const parsed = Number(normalized);
                return Number.isFinite(parsed) ? parsed : NaN;
            }
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : NaN;
        };

        // Platform -> Game functions (strictly per client integration spec).
        window.updateBalance = (balance) => {
            this.roundManager.uiManager?.updateBalance?.(balance);
        };
        window.updateMultiplier = (multiplier) => {
            const value = toFiniteNumber(multiplier);
            if (!Number.isFinite(value)) return;
            this.roundManager.uiManager?.updateMultiplier?.(value);
            // Keep gameplay/hud layers in sync when host drives multiplier updates.
            this.roundManager.interactionSystem?.setAuthoritativeLiveMultiplier?.(value);
            this.roundManager.dollController?.updateScoreValue?.(value);
        };
        window.updateBetAmount = (betAmount) => {
            this.roundManager.uiManager?.setBet?.(betAmount);
        };
        window.updateAutoplayRemainingSpins = (remainingSpins) => {
            this.roundManager.uiManager?.setAutoPlayRemaining?.(remainingSpins);
        };
        window.setTranslations = (translations) => {
            const next = (translations && typeof translations === "object") ? translations : {};
            const prev = (window.__dolvinTranslations && typeof window.__dolvinTranslations === "object")
                ? window.__dolvinTranslations
                : {};
            window.__dolvinTranslations = { ...prev, ...next };
            try {
                window.dispatchEvent(new CustomEvent("dolvin:translations-updated", {
                    detail: window.__dolvinTranslations
                }));
            } catch (_) {
                // ignore dispatch errors in restrictive hosts
            }
            this.roundManager.uiManager?.setTranslations?.(translations);
        };
        window.startGame = (roundId, betAmount, winAmount, crashPoint) => {
            const bet = toFiniteNumber(betAmount);
            const win = toFiniteNumber(winAmount);
            const crash = toFiniteNumber(crashPoint);

            if (Number.isFinite(bet)) {
                this.roundManager.uiManager?.setBet?.(bet);
            }
            this.roundManager.startPrototypeRound({
                fromPlatform: true,
                externalRoundData: {
                    roundId,
                    betAmount: bet,
                    winAmount: win,
                    crashPoint: crash
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
        // Retry a few times in case host binds gameReady slightly after init.
        const tryEmitGameReady = () => {
            if (this.gameReadyAnnounced) return;
            const gameReadyFn = window?.gameReady;
            if (typeof gameReadyFn !== "function") {
                return;
            }
            try {
                gameReadyFn();
                this.gameReadyAnnounced = true;
            } catch (error) {
                console.error("[BridgeManager] callback failed: gameReady", error);
            }
        };
        const scheduleGameReadyRetry = () => {
            tryEmitGameReady();
            if (this.gameReadyAnnounced) return;
            if (this.gameReadyRetries >= 20) return;
            this.gameReadyRetries += 1;
            this.gameReadyRetryTimer = window.setTimeout(scheduleGameReadyRetry, 250);
        };
        scheduleGameReadyRetry();
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
        if (this.gameReadyRetryTimer) {
            window.clearTimeout(this.gameReadyRetryTimer);
            this.gameReadyRetryTimer = null;
        }
    }
}