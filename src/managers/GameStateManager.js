export const GAME_STATES = Object.freeze({
    IDLE: "IDLE",
    BETTING: "BETTING",
    STARTING: "STARTING",
    KICKING: "KICKING",
    FLYING: "FLYING",
    ROUND_END: "ROUND_END",
    RESULT: "RESULT",
    PAUSED: "PAUSED"
});

export default class GameStateManager {
    constructor(options = {}) {
        this.debug = options.debug ?? true;
        this.currentState = GAME_STATES.IDLE;
        this.previousState = null;
        this.beforePauseState = GAME_STATES.IDLE;
        this.listeners = new Set();
    }

    init(initialState = GAME_STATES.BETTING) {
        this.currentState = initialState;
        this.previousState = null;
        this.beforePauseState = initialState;

        if (this.debug) {
            console.log(`[GameStateManager] init -> ${this.currentState}`);
        }

        this.emitChange(null, this.currentState, "init");
    }

    getState() {
        return this.currentState;
    }

    getPreviousState() {
        return this.previousState;
    }

    isState(state) {
        return this.currentState === state;
    }

    canTransitionTo(nextState) {
        const current = this.currentState;

        if (current === nextState) {
            return false;
        }

        switch (current) {
            case GAME_STATES.IDLE:
                return nextState === GAME_STATES.BETTING || nextState === GAME_STATES.PAUSED;

            case GAME_STATES.BETTING:
                return nextState === GAME_STATES.STARTING || nextState === GAME_STATES.PAUSED;

            case GAME_STATES.STARTING:
                return nextState === GAME_STATES.KICKING || nextState === GAME_STATES.PAUSED;

            case GAME_STATES.KICKING:
                return nextState === GAME_STATES.FLYING || nextState === GAME_STATES.PAUSED;

            case GAME_STATES.FLYING:
                return nextState === GAME_STATES.ROUND_END || nextState === GAME_STATES.PAUSED;

            case GAME_STATES.ROUND_END:
                return nextState === GAME_STATES.RESULT || nextState === GAME_STATES.PAUSED;

            case GAME_STATES.RESULT:
                return nextState === GAME_STATES.BETTING || nextState === GAME_STATES.PAUSED;

            case GAME_STATES.PAUSED:
                return nextState !== GAME_STATES.PAUSED;

            default:
                return false;
        }
    }

    setState(nextState, reason = "") {
        if (!this.canTransitionTo(nextState)) {
            if (this.debug) {
                console.warn(
                    `[GameStateManager] Invalid transition: ${this.currentState} -> ${nextState}${reason ? ` | reason: ${reason}` : ""}`
                );
            }
            return false;
        }

        const oldState = this.currentState;
        this.previousState = oldState;
        this.currentState = nextState;

        if (this.debug) {
            console.log(
                `[GameStateManager] ${oldState} -> ${nextState}${reason ? ` | reason: ${reason}` : ""}`
            );
        }

        this.emitChange(oldState, nextState, reason);
        return true;
    }

    pause(reason = "pause") {
        if (this.currentState === GAME_STATES.PAUSED) {
            return false;
        }

        this.beforePauseState = this.currentState;
        return this.setState(GAME_STATES.PAUSED, reason);
    }

    resume(reason = "resume") {
        if (this.currentState !== GAME_STATES.PAUSED) {
            return false;
        }

        const targetState = this.beforePauseState || GAME_STATES.BETTING;
        return this.setState(targetState, reason);
    }

    reset(reason = "reset") {
        const oldState = this.currentState;
        this.previousState = oldState;
        this.currentState = GAME_STATES.BETTING;
        this.beforePauseState = GAME_STATES.BETTING;

        if (this.debug) {
            console.log(`[GameStateManager] ${oldState} -> ${this.currentState} | reason: ${reason}`);
        }

        this.emitChange(oldState, this.currentState, reason);
    }

    subscribe(callback) {
        if (typeof callback !== "function") {
            return () => {};
        }

        this.listeners.add(callback);

        callback({
            previousState: this.previousState,
            currentState: this.currentState,
            reason: "subscribe"
        });

        return () => {
            this.listeners.delete(callback);
        };
    }

    emitChange(previousState, currentState, reason) {
        this.listeners.forEach((callback) => {
            callback({
                previousState,
                currentState,
                reason
            });
        });
    }
}