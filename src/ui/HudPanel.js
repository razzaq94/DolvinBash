export default class HudPanel {
    constructor(scene) {
        this.scene = scene;

        this.multiplier = 1;
        this.comboCount = 0;
        this.comboRatio = 0;

        // Placeholder y; layout() runs immediately (below HTML logo).
        this.text = scene.add.text(0, 0, "", {
            fontFamily: '"Bubblegum Sans", cursive',
            fontSize: "30px",
            color: "#60a5fa", // Vibrant Blue
            stroke: "#1e3a8a",
            strokeThickness: 2,
            shadow: { offsetX: 3, offsetY: 3, color: "#1e3a8a", blur: 0, stroke: true, fill: true }
        }).setScrollFactor(0).setDepth(1100);

        this.comboText = scene.add.text(0, 0, "", {
            fontFamily: '"Bubblegum Sans", cursive',
            fontSize: "22px",
            color: "#a855f7", // Vibrant Purple
            stroke: "#581c87",
            strokeThickness: 2,
            shadow: { offsetX: 2, offsetY: 2, color: "#3b0764", blur: 0, stroke: true, fill: true }
        }).setScrollFactor(0).setDepth(1100);

        this.comboBarBg = scene.add.rectangle(0, 0, 140, 8, 0x0f172a)
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setStrokeStyle(1, 0x334155);

        this.comboBarFill = scene.add.rectangle(0, 0, 0, 8, 0x22c55e)
            .setOrigin(0, 0.5)
            .setScrollFactor(0);

        this.layout();
        this.update();
    }

    /**
     * Position below the real HTML header. #ui-root uses CSS --ui-scale on desktop so fixed
     * pixel guesses never match; we measure getBoundingClientRect vs the canvas.
     */
    layout() {
        const layout = this.scene.getViewportLayout?.();
        const w = layout?.width ?? this.scene.scale?.width ?? 800;
        const isMobile = layout ? layout.isMobile : w < 900;
        const stageTop = layout?.stageTop ?? (isMobile ? 12 : 16);

        const padX = Math.max(10, Math.round(w * 0.018));
        const gapGame = isMobile ? 8 : 10;

        const multSize = isMobile ? 26 : 30;
        const comboSize = isMobile ? 19 : 22;
        this.text.setFontSize(`${multSize}px`);
        this.comboText.setFontSize(`${comboSize}px`);

        let topY = stageTop + (isMobile ? 52 : 64);
        const canvas = this.scene.game?.canvas;
        if (typeof document !== "undefined" && canvas) {
            const canvasRect = canvas.getBoundingClientRect();
            const header = document.querySelector(".game-header");
            const logo = document.querySelector(".logo-text");
            const el = logo || header;
            if (el && canvasRect.height > 4) {
                const er = el.getBoundingClientRect();
                const belowCanvasTop = er.bottom - canvasRect.top;
                const gameH = this.scene.scale.height;
                const pxToGame = gameH / canvasRect.height;
                topY = Math.max(stageTop + 4, belowCanvasTop * pxToGame + gapGame);
            }
        }
        const lineGap = isMobile ? 36 : 40;
        const barGap = isMobile ? 22 : 24;
        const comboY = topY + lineGap;
        const barY = comboY + barGap;

        this.text.setPosition(padX, topY);
        this.comboText.setPosition(padX, comboY);
        this.comboBarBg.setPosition(padX, barY);
        this.comboBarFill.setPosition(padX, barY);

        const barW = Math.min(160, Math.max(100, Math.round(w * 0.12)));
        this.comboBarBg.width = barW;
        this.comboBarBg.height = isMobile ? 7 : 8;
        this.comboBarFill.height = this.comboBarBg.height;
    }

    setMultiplier(value) {
        this.multiplier = value;

        this.scene.tweens.killTweensOf(this.text);
        this.text.setScale(1.15);

        this.scene.tweens.add({
            targets: this.text,
            scaleX: 1,
            scaleY: 1,
            duration: 140,
            ease: "Quad.easeOut"
        });

        this.update();
    }

    setCombo(comboCount, comboRatio = 0) {
        this.comboCount = comboCount;
        this.comboRatio = Phaser.Math.Clamp(comboRatio, 0, 1);

        this.scene.tweens.killTweensOf(this.comboText);
        this.comboText.setScale(1.12);

        this.scene.tweens.add({
            targets: this.comboText,
            scaleX: 1,
            scaleY: 1,
            duration: 120,
            ease: "Quad.easeOut"
        });

        this.update();
    }

    update() {
        this.text.setText(`Multiplier: x${this.multiplier}`);
        this.comboText.setText(this.comboCount > 0 ? `Combo: ${this.comboCount}` : "");
        const barW = this.comboBarBg.width || 140;
        this.comboBarFill.width = this.comboCount > 0 ? barW * this.comboRatio : 0;
    }

    setVisible(value) {
        this.text.setVisible(value);
        this.comboText.setVisible(value);
        this.comboBarBg.setVisible(value && this.comboCount > 0);
        this.comboBarFill.setVisible(value && this.comboCount > 0);
    }
}