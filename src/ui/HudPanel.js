export default class HudPanel {
    constructor(scene) {
        this.scene = scene;

        this.multiplier = 1;
        this.comboCount = 0;
        this.comboRatio = 0;

        // Keep HUD below the HTML header ("DOLWIN & BASH") to avoid overlap.
        this.text = scene.add.text(20, 72, "", {
            fontFamily: '"Bubblegum Sans", cursive',
            fontSize: "36px",
            color: "#60a5fa", // Vibrant Blue
            stroke: "#1e3a8a",
            strokeThickness: 2,
            shadow: { offsetX: 3, offsetY: 3, color: "#1e3a8a", blur: 0, stroke: true, fill: true }
        }).setScrollFactor(0).setDepth(1100);

        this.comboText = scene.add.text(20, 118, "", {
            fontFamily: '"Bubblegum Sans", cursive',
            fontSize: "26px",
            color: "#a855f7", // Vibrant Purple
            stroke: "#581c87",
            strokeThickness: 2,
            shadow: { offsetX: 2, offsetY: 2, color: "#3b0764", blur: 0, stroke: true, fill: true }
        }).setScrollFactor(0).setDepth(1100);

        this.comboBarBg = scene.add.rectangle(20, 145, 140, 10, 0x0f172a)
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setStrokeStyle(1, 0x334155);

        this.comboBarFill = scene.add.rectangle(20, 145, 0, 10, 0x22c55e)
            .setOrigin(0, 0.5)
            .setScrollFactor(0);

        this.update();
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
        this.comboBarFill.width = this.comboCount > 0 ? 140 * this.comboRatio : 0;
    }

    setVisible(value) {
        this.text.setVisible(value);
        this.comboText.setVisible(value);
        this.comboBarBg.setVisible(value && this.comboCount > 0);
        this.comboBarFill.setVisible(value && this.comboCount > 0);
    }
}