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
        const isMobile = width < 900;

        this.stateText = this.add.text(14, 12, "State: -", {
            fontSize: isMobile ? "14px" : "16px",
            color: "#e2e8f0",
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            padding: { left: 8, right: 8, top: 6, bottom: 6 }
        }).setOrigin(0, 0).setAlpha(0.85);

        this.prevStateText = this.add.text(14, 40, "Prev: -", {
            fontSize: isMobile ? "12px" : "14px",
            color: "#cbd5e1",
            backgroundColor: "rgba(2, 6, 23, 0.55)",
            padding: { left: 8, right: 8, top: 6, bottom: 6 }
        }).setOrigin(0, 0).setAlpha(0.75);

        // listen global state changes
        this.listener = (payload) => {
            this.stateText.setText(`State: ${payload.currentState}`);
            this.prevStateText.setText(`Prev: ${payload.previousState || "-"}`);
        };

        this.game.events.on("global-state-changed", this.listener);

        this.scale.on("resize", this.handleResize, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    }

    handleResize(gameSize) {
        const width = gameSize?.width ?? this.scale.width;
        const isMobile = width < 900;

        this.stateText.setFontSize(isMobile ? "14px" : "16px");
        this.prevStateText.setFontSize(isMobile ? "12px" : "14px");

        this.stateText.setPosition(14, 12);
        this.prevStateText.setPosition(14, 40);
    }

    shutdown() {
        if (this.listener) {
            this.game.events.off("global-state-changed", this.listener);
            this.listener = null;
        }

        this.scale.off("resize", this.handleResize, this);
    }
}