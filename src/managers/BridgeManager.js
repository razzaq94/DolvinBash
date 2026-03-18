export default class BridgeManager {
    constructor(gameStateManager, roundManager) {
        this.gameStateManager = gameStateManager;
        this.roundManager = roundManager;
        this.unsubscribe = null;
    }

    init() {
        window.DolvinBash = {
            startExternalRound: () => {
                this.roundManager.startPrototypeRound();
            },

            pauseGame: () => {
                this.gameStateManager.pause("external_pause");
            },

            resumeGame: () => {
                this.gameStateManager.resume("external_resume");
            },

            replayRound: () => {
                this.roundManager.replay();
            },

            getCurrentState: () => {
                return this.gameStateManager.getState();
            }
        };

        this.unsubscribe = this.gameStateManager.subscribe((payload) => {
            if (payload.currentState === "PAUSED") {
                this.emitCallback("onDolvinPause", {
                    state: payload.currentState,
                    previousState: payload.previousState,
                    reason: payload.reason
                });
            } else if (payload.previousState === "PAUSED") {
                this.emitCallback("onDolvinResume", {
                    state: payload.currentState,
                    previousState: payload.previousState,
                    reason: payload.reason
                });
            }
        });

        this.emitCallback("onDolvinGameReady", {
            ready: true
        });

        console.log("[BridgeManager] window.DolvinBash ready");
    }

    emitCallback(name, payload) {
        const fn = window?.[name];
        if (typeof fn === "function") {
            try {
                fn(payload);
            } catch (error) {
                console.error(`[BridgeManager] callback failed: ${name}`, error);
            }
        }
    }

    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }
}