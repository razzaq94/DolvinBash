export default class HudPanel {
    constructor(scene) {
        this.scene = scene;

        this.multiplier = 1;
        this.comboCount = 0;
        this.comboRatio = 0;

        this.text = scene.add.text(20, 20, "", {
            fontSize: "28px",
            color: "#facc15"
        }).setScrollFactor(0);

        this.comboText = scene.add.text(20, 58, "", {
            fontSize: "22px",
            color: "#86efac"
        }).setScrollFactor(0);

        this.comboBarBg = scene.add.rectangle(20, 95, 140, 10, 0x0f172a)
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setStrokeStyle(1, 0x334155);

        this.comboBarFill = scene.add.rectangle(20, 95, 0, 10, 0x22c55e)
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