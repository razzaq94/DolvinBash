export default class ResultPanel {
    constructor(scene) {
        this.scene = scene;

        this.container = scene.add.container(0, 0).setScrollFactor(0);
        this.container.setDepth(1200);

        this.bg = scene.add.rectangle(0, 0, 430, 300, 0x0f172a, 0.96)
            .setStrokeStyle(2, 0x94a3b8)
            .setScrollFactor(0);

        this.text = this.scene.add.text(0, -25, "", {
            fontFamily: '"Bubblegum Sans", cursive',
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
            fontFamily: '"Bubblegum Sans", cursive',
            fontSize: "22px",
            color: "#ffffff"
        }).setOrigin(0.5).setScrollFactor(0);

        bg.on("pointerdown", callback);

        return this.scene.add.container(0, 110, [bg, txt]).setScrollFactor(0);
    }

    layout() {
        const width = this.scene.scale.width;
        const height = this.scene.scale.height;
        const layout = this.scene.getViewportLayout?.();

        const isMobile = width < 900;
        const hudHeight = layout?.hudReserved ?? (isMobile ? 128 : 126);

        const maxPanelW = isMobile ? Math.min(420, Math.max(284, width - 24)) : 420;
        const panelW = Math.min(maxPanelW, width - 28);
        const panelH = isMobile ? 290 : 340; // Increased significantly to avoid overlap

        this.bg.width = panelW;
        this.bg.height = panelH;
        this.bg.setStrokeStyle(2, 0x475569);

        this.text.setFontSize(isMobile ? 18 : 20);
        this.text.setWordWrapWidth(panelW - 36, true);
        this.text.setPosition(0, isMobile ? -50 : -60); // Moved text UP

        this.btnReplay.list[0].width = isMobile ? 136 : 150;
        this.btnReplay.list[0].height = isMobile ? 42 : 46;
        this.btnReplay.list[1].setFontSize(isMobile ? 16 : 18);
        this.btnReplay.y = (panelH * 0.5) - (isMobile ? 32 : 36); // Pushed button DOWN

        // Keep it above the fixed bottom HUD, centered in the remaining space.
        const usableHeight = Math.max(120, height - hudHeight);
        const centerY = layout
            ? Phaser.Math.Clamp(
                layout.stageTop + (layout.stageHeight * 0.48),
                panelH * 0.55,
                height - hudHeight - (panelH * 0.45)
            )
            : (usableHeight * 0.5);
        this.container.setPosition(width * 0.5, centerY);
    }

    show(result) {
        const resultLabel = result.hitHazard ? "Round Lost" : "Round Won";
        const resultColor = result.hitHazard ? "#f43f5e" : "#4ade80"; // Vibrant Red / Green
        const pointsLine = result.netChange >= 0
            ? `Points Won: +${result.netChange}`
            : `Points Lost: ${result.netChange}`;

        this.text.setColor(resultColor);
        this.text.setText(
            `Bet: ${result.betAmount}\n` +
            `Final Multiplier: x${result.finalMultiplier ?? result.multiplier}\n` +
            `Travel Bonus: +${result.travelBonus ?? 0}\n` +
            `Distance: ${Math.round(result.distance ?? 0)}\n` +
            `Air Time: ${Math.max(0, Math.round((result.airTimeMs ?? 0) / 100) / 10)}s\n` +
            `Max Combo: ${result.maxCombo}\n` +
            `Result: ${resultLabel}\n` +
            `${pointsLine}\n` +
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