export default class UIScene extends Phaser.Scene {
    constructor() {
        super("UIScene");

        this.stateText = null;
        this.prevStateText = null;
        this.listener = null;
        this.currentState = "-";
        this.previousState = "-";
        this.translationListener = null;
    }

    create() {
        console.log("[UIScene] create");

        const { width } = this.scale;
        const isMobile = width < 900;

        this.stateText = this.add.text(14, 12, "", {
            fontSize: isMobile ? "14px" : "16px",
            color: "#e2e8f0",
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            padding: { left: 8, right: 8, top: 6, bottom: 6 }
        }).setOrigin(0, 0).setAlpha(0.85);

        this.prevStateText = this.add.text(14, 40, "", {
            fontSize: isMobile ? "12px" : "14px",
            color: "#cbd5e1",
            backgroundColor: "rgba(2, 6, 23, 0.55)",
            padding: { left: 8, right: 8, top: 6, bottom: 6 }
        }).setOrigin(0, 0).setAlpha(0.75);

        // listen global state changes
        this.listener = (payload) => {
            this.currentState = String(payload?.currentState || "-");
            this.previousState = String(payload?.previousState || "-");
            this.updateStateLabels();
        };

        this.game.events.on("global-state-changed", this.listener);
        this.translationListener = () => this.updateStateLabels();
        if (typeof window !== "undefined") {
            window.addEventListener("dolvin:translations-updated", this.translationListener);
        }

        this.scale.on("resize", this.handleResize, this);
        this.updateStateLabels();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    }

    tr(key, fallback) {
        const map = (typeof window !== "undefined" && window.__dolvinTranslations && typeof window.__dolvinTranslations === "object")
            ? window.__dolvinTranslations
            : {};
        const raw = map?.[key];
        if (typeof raw === "string" && raw.trim().length) return raw;
        return fallback;
    }

    updateStateLabels() {
        this.stateText?.setText(`${this.tr("state", "State")}: ${this.currentState}`);
        this.prevStateText?.setText(`${this.tr("previous", "Prev")}: ${this.previousState}`);
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
        if (this.translationListener && typeof window !== "undefined") {
            window.removeEventListener("dolvin:translations-updated", this.translationListener);
            this.translationListener = null;
        }

        this.scale.off("resize", this.handleResize, this);
    }
}