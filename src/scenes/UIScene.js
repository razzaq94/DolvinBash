export default class UIScene extends Phaser.Scene {
    constructor() {
        super("UIScene");

        this.stateText = null;
        this.prevStateText = null;
        this.listener = null;
    }

    create() {
        console.log("[UIScene] create");

        const { width } = this.scale;

        this.stateText = this.add.text(width - 40, 40, "Current State: -", {
            fontSize: "22px",
            color: "#ffffff",
            backgroundColor: "#1e293b",
            padding: { left: 10, right: 10, top: 6, bottom: 6 }
        }).setOrigin(1, 0);

        this.prevStateText = this.add.text(width - 40, 80, "Previous State: -", {
            fontSize: "18px",
            color: "#cbd5e1",
            backgroundColor: "#0f172a",
            padding: { left: 10, right: 10, top: 6, bottom: 6 }
        }).setOrigin(1, 0);

        // listen global state changes
        this.listener = (payload) => {
            this.stateText.setText(`Current State: ${payload.currentState}`);
            this.prevStateText.setText(`Previous State: ${payload.previousState || "-"}`);
        };

        this.game.events.on("global-state-changed", this.listener);
    }

    shutdown() {
        if (this.listener) {
            this.game.events.off("global-state-changed", this.listener);
            this.listener = null;
        }
    }
}