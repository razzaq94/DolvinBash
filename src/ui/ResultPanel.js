export default class ResultPanel {
    constructor(scene) {
        this.scene = scene;

        this.container = scene.add.container(0, 0).setScrollFactor(0);

        this.bg = scene.add.rectangle(0, 0, 430, 300, 0x0f172a)
            .setStrokeStyle(2, 0x94a3b8)
            .setScrollFactor(0);

        this.text = this.scene.add.text(0, -25, "", {
            fontSize: "24px",
            color: "#ffffff",
            align: "center",
            lineSpacing: 8
        }).setOrigin(0.5).setScrollFactor(0);

        this.btnReplay = this.createButton("REPLAY", () => {
            this.onReplay?.();
        });

        this.container.add([this.bg, this.text, this.btnReplay]);

        this.layout();
        this.setVisible(false);
    }

    createButton(label, callback) {
        const bg = this.scene.add.rectangle(0, 0, 160, 52, 0x1e293b)
            .setStrokeStyle(2, 0x94a3b8)
            .setInteractive({ useHandCursor: true })
            .setScrollFactor(0);

        const txt = this.scene.add.text(0, 0, label, {
            fontSize: "22px",
            color: "#ffffff"
        }).setOrigin(0.5).setScrollFactor(0);

        bg.on("pointerdown", callback);

        return this.scene.add.container(0, 110, [bg, txt]).setScrollFactor(0);
    }

    layout() {
        const width = this.scene.scale.width;
        const height = this.scene.scale.height;

        this.container.setPosition(width * 0.5, height * 0.5);
    }

    show(result) {
        const resultLabel = result.hitHazard ? "Lost" : "Won";
        const resultColor = result.hitHazard ? "#fca5a5" : "#86efac";

        this.text.setColor(resultColor);
        this.text.setText(
            `Bet: ${result.betAmount}\n` +
            `Multiplier: x${result.multiplier}\n` +
            `Max Combo: ${result.maxCombo}\n` +
            `Result: ${resultLabel}\n` +
            `Payout: ${result.payout}`
        );

        this.container.setScale(0.9);
        this.container.setAlpha(0);
        this.setVisible(true);

        this.scene.tweens.killTweensOf(this.container);
        this.scene.tweens.add({
            targets: this.container,
            scaleX: 1,
            scaleY: 1,
            alpha: 1,
            duration: 180,
            ease: "Back.easeOut"
        });
    }

    setVisible(value) {
        this.container.setVisible(value);
    }
}