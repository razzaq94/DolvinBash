export default class BetPanel {
    constructor(scene, config) {
        this.scene = scene;

        this.balance = config.startingBalance;
        this.bet = config.defaultBet;
        this.minBet = config.minBet;
        this.maxBet = config.maxBet;

        this.multiplier = 1;
        this.comboCount = 0;
        this.comboRatio = 0;
        this.speedMode = config.defaultSpeedMode || "NORMAL";
        this.volatility = config.defaultVolatility || "NORMAL";

        this.container = scene.add.container(0, 0).setScrollFactor(0);
        this.container.setDepth(1000);
        this.playPulseTween = null;

        this.createUI();
        this.layout();
    }

    createUI() {
        const s = this.scene;

        this.bg = s.add.rectangle(0, 0, 10, 10, 0x0b1220, 0.96)
            .setOrigin(0, 1)
            .setScrollFactor(0);
        this.bgStroke = s.add.rectangle(0, 0, 10, 10, 0x000000, 0)
            .setOrigin(0, 1)
            .setStrokeStyle(2, 0x24324a, 1)
            .setScrollFactor(0);

        this.balanceLabel = s.add.text(0, 0, "Balance", {
            fontSize: "12px",
            color: "#94a3b8"
        }).setScrollFactor(0);
        this.balanceText = s.add.text(0, 0, "", {
            fontFamily: '"Bubblegum Sans", cursive',
            fontSize: "22px",
            color: "#4ade80", // Green
            fontStyle: "bold"
        }).setScrollFactor(0);

        this.multiplierLabel = s.add.text(0, 0, "Multiplier", {
            fontSize: "12px",
            color: "#94a3b8"
        }).setScrollFactor(0);
        this.multiplierText = s.add.text(0, 0, "", {
            fontFamily: '"Bubblegum Sans", cursive',
            fontSize: "22px",
            color: "#60a5fa", // Blue
            fontStyle: "bold"
        }).setScrollFactor(0);

        this.comboText = s.add.text(0, 0, "", {
            fontFamily: '"Bubblegum Sans", cursive',
            fontSize: "14px",
            color: "#a855f7" // Purple
        }).setScrollFactor(0);

        this.comboBarBg = s.add.rectangle(0, 0, 120, 8, 0x0f172a)
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setStrokeStyle(1, 0x334155);
        this.comboBarFill = s.add.rectangle(0, 0, 0, 8, 0x22c55e)
            .setOrigin(0, 0.5)
            .setScrollFactor(0);

        this.betLabel = s.add.text(0, 0, "Bet", {
            fontSize: "12px",
            color: "#94a3b8"
        }).setScrollFactor(0);
        this.betText = s.add.text(0, 0, "", {
            fontFamily: '"Bubblegum Sans", cursive',
            fontSize: "22px",
            color: "#fb923c", // Orange
            fontStyle: "bold"
        }).setScrollFactor(0);

        this.btnMinus = this.createButton("−", () => this.decreaseBet());
        this.btnPlus = this.createButton("+", () => this.increaseBet());
        this.btnSpeed = this.createButton(this.speedMode, () => this.cycleSpeedMode(), 92);
        this.btnVolatility = this.createButton(this.volatility, () => this.cycleVolatility(), 92);
        this.btnStart = this.createButton("PLAY", () => {
            this.onStart?.();
        }, 170, { fill: 0x16a34a, stroke: 0x22c55e });
        this.playGlow = s.add.circle(0, 0, 10, 0x22c55e, 0.16).setScrollFactor(0).setVisible(false);

        this.container.add([
            this.bg,
            this.bgStroke,
            this.playGlow,
            this.balanceLabel,
            this.balanceText,
            this.multiplierLabel,
            this.multiplierText,
            this.comboText,
            this.comboBarBg,
            this.comboBarFill,
            this.betLabel,
            this.betText,
            this.btnMinus,
            this.btnPlus,
            this.btnSpeed,
            this.btnVolatility,
            this.btnStart
        ]);

        this.refresh();
        this.updateLive();
    }

    createButton(label, callback, width = 56, colors = {}) {
        const s = this.scene;

        const fill = colors.fill ?? 0x162235;
        const stroke = colors.stroke ?? 0x3b4a64;
        const bg = s.add.rectangle(0, 0, width, 46, fill)
            .setStrokeStyle(2, stroke, 1)
            .setInteractive({ useHandCursor: true })
            .setScrollFactor(0);

        const txt = s.add.text(0, 0, label, {
            fontFamily: '"Bubblegum Sans", cursive',
            fontSize: "20px",
            color: "#ffffff"
        }).setOrigin(0.5).setScrollFactor(0);

        bg.on("pointerdown", () => {
            // Keep button SFX consistent if this panel is used.
            const isPlay = String(label).toUpperCase() === "PLAY" || label === "▶";
            this.scene.audioManager?.play(isPlay ? "sfx_start" : "sfx_click", {
                volume: isPlay ? 0.5 : 0.35
            });
            callback();
        });

        const c = this.scene.add.container(0, 0, [bg, txt]).setScrollFactor(0);
        c.setSize(width, 46);
        return c;
    }

    layout() {
        const width = this.scene.scale.width;
        const height = this.scene.scale.height;
        const isMobile = width < 900;
        const outerPad = isMobile ? 8 : 14;
        const barWidth = isMobile
            ? Math.max(300, width - (outerPad * 2))
            : Math.min(760, width - (outerPad * 2));
        const barHeight = isMobile ? 112 : 92;
        const barX = width * 0.5;
        const barY = height - (barHeight * 0.5) - (isMobile ? 8 : 10);
        const trayTop = barY - (barHeight * 0.5);
        const padX = isMobile ? 12 : 16;
        const leftX = barX - (barWidth * 0.5) + padX;
        const rightX = barX + (barWidth * 0.5) - padX;
        const isUltraCompact = width <= 430;

        this.bg.setOrigin(0.5);
        this.bgStroke.setOrigin(0.5);
        this.bg.setPosition(barX, barY);
        this.bg.setSize(barWidth, barHeight);
        this.bgStroke.setPosition(barX, barY);
        this.bgStroke.setSize(barWidth, barHeight);
        this.bg.setRadius?.(18);
        this.bgStroke.setRadius?.(18);

        this.container.setPosition(0, 0);

        const topRowY = trayTop + (isMobile ? 28 : 32);
        const bottomRowY = trayTop + barHeight - (isMobile ? 20 : 18);
        const rightClusterCenterY = trayTop + (barHeight * 0.5);

        const startW = isUltraCompact ? 84 : (isMobile ? 94 : 124);
        const startH = isUltraCompact ? 44 : (isMobile ? 48 : 56);
        const playLeft = rightX - startW;
        const startX = playLeft + (startW * 0.5);
        this.btnStart.setPosition(startX, rightClusterCenterY);
        this.btnStart.list[0].width = startW;
        this.btnStart.list[0].height = startH;
        this.btnStart.list[0].setRadius?.(startH * 0.5);
        this.btnStart.list[0].setStrokeStyle(2, 0x34d399, 1);
        this.btnStart.list[1].setFontSize(isUltraCompact ? 14 : (isMobile ? 16 : 18));
        this.btnStart.list[1].setText(isUltraCompact ? "▶" : "PLAY");
        this.btnStart.list[1].setOrigin(0.5);
        this.btnStart.list[1].setPosition(0, 0);

        this.playGlow.setVisible(true);
        this.playGlow.setPosition(startX, rightClusterCenterY);
        this.playGlow.setRadius((startH * 0.5) + 4);

        const betW = isUltraCompact ? 30 : (isMobile ? 34 : 38);
        const betGap = 6;
        const playGap = isUltraCompact ? 8 : (isMobile ? 10 : 12);
        const plusX = playLeft - playGap - (betW * 0.5) - (isUltraCompact ? 10 : 14);
        const minusX = plusX - betW - betGap;
        const betValueX = minusX - (isUltraCompact ? 42 : (isMobile ? 52 : 66));

        this.btnMinus.setPosition(minusX, rightClusterCenterY);
        this.btnPlus.setPosition(plusX, rightClusterCenterY);
        this.btnMinus.list[0].width = betW;
        this.btnPlus.list[0].width = betW;
        this.btnMinus.list[0].height = isUltraCompact ? 30 : (isMobile ? 32 : 36);
        this.btnPlus.list[0].height = isUltraCompact ? 30 : (isMobile ? 32 : 36);
        this.btnMinus.list[1].setFontSize(isUltraCompact ? 14 : (isMobile ? 15 : 18));
        this.btnPlus.list[1].setFontSize(isUltraCompact ? 14 : (isMobile ? 15 : 18));

        this.betLabel.setFontSize(isUltraCompact ? 9 : (isMobile ? 10 : 12));
        this.betText.setFontSize(isUltraCompact ? 15 : (isMobile ? 16 : 20));
        this.betLabel.setPosition(betValueX, rightClusterCenterY - (isMobile ? 22 : 24));
        this.betText.setPosition(betValueX, rightClusterCenterY + (isMobile ? 2 : 0));

        const infoGap = isMobile ? 88 : 136;
        this.balanceLabel.setFontSize(isMobile ? 10 : 12);
        this.balanceText.setFontSize(isMobile ? 14 : 16);
        this.balanceLabel.setPosition(leftX, trayTop + 10);
        this.balanceText.setPosition(leftX, topRowY);

        this.multiplierLabel.setFontSize(isMobile ? 10 : 12);
        this.multiplierText.setFontSize(isMobile ? 14 : 16);
        this.multiplierLabel.setPosition(leftX + infoGap, trayTop + 10);
        this.multiplierText.setPosition(leftX + infoGap, topRowY);

        const speedW = isMobile ? 78 : 92;
        const volW = isMobile ? 78 : 92;
        this.btnSpeed.list[0].width = speedW;
        this.btnVolatility.list[0].width = volW;
        this.btnSpeed.list[0].height = isMobile ? 28 : 30;
        this.btnVolatility.list[0].height = isMobile ? 28 : 30;
        this.btnSpeed.list[1].setFontSize(isMobile ? 10 : 11);
        this.btnVolatility.list[1].setFontSize(isMobile ? 10 : 11);
        this.btnSpeed.setPosition(leftX + (speedW * 0.5), bottomRowY);
        this.btnVolatility.setPosition(leftX + speedW + 8 + (volW * 0.5), bottomRowY);

        this.comboText.setFontSize(isMobile ? 10 : 11);
        const comboX = isMobile ? (leftX + speedW + volW + 24) : (leftX + 220);
        this.comboText.setPosition(comboX, bottomRowY - 8);
        this.comboBarBg.setPosition(comboX, bottomRowY + 2);
        this.comboBarFill.setPosition(comboX, bottomRowY + 2);
        this.comboBarBg.width = isMobile ? 86 : 112;
    }

    increaseBet() {
        this.bet = Math.min(this.bet + 10, this.maxBet);
        this.refresh();
    }

    decreaseBet() {
        this.bet = Math.max(this.bet - 10, this.minBet);
        this.refresh();
    }

    setBalance(value) {
        const val = Number(value);
        if (Number.isFinite(val)) {
            this.balance = Math.max(0, val);
            this.refresh();
        }
    }

    setBet(value) {
        const val = Number(value);
        if (Number.isFinite(val)) {
            this.bet = Phaser.Math.Clamp(val, this.minBet, this.maxBet);
            this.refresh();
        }
    }

    refresh() {
        this.balanceText.setText(`${this.balance}`);
        this.betText.setText(`${this.bet}`);
    }

    setMultiplier(value) {
        this.multiplier = value;
        this.updateLive(true);
    }

    setCombo(comboCount, comboRatio = 0) {
        this.comboCount = comboCount;
        this.comboRatio = Phaser.Math.Clamp(comboRatio, 0, 1);
        this.updateLive();
    }

    setControlsEnabled(value) {
        this.btnMinus.setVisible(value);
        this.btnPlus.setVisible(value);
        this.betLabel.setVisible(value);
        this.betText.setVisible(value);
        this.btnSpeed.setVisible(value);
        this.btnVolatility.setVisible(value);
        this.btnStart.setVisible(value);
        this.playGlow.setVisible(value);

        if (value) {
            this.startPlayPulse();
        } else {
            this.stopPlayPulse();
        }
    }

    cycleSpeedMode() {
        const order = ["SLOW", "NORMAL", "FAST"];
        const index = order.indexOf(this.speedMode);
        const nextIndex = (index + 1) % order.length;
        this.speedMode = order[nextIndex];
        this.btnSpeed.list[1].setText(this.speedMode);
    }

    cycleVolatility() {
        const order = ["LOW", "NORMAL", "HIGH"];
        const index = order.indexOf(this.volatility);
        const nextIndex = (index + 1) % order.length;
        this.volatility = order[nextIndex];
        this.btnVolatility.list[1].setText(this.volatility);
    }

    updateLive(pulseMultiplier = false) {
        this.multiplierText.setText(`x${this.multiplier}`);

        const hasCombo = this.comboCount > 0;
        this.comboText.setText(hasCombo ? `Combo ${this.comboCount}` : "");
        this.comboBarBg.setVisible(hasCombo);
        this.comboBarFill.setVisible(hasCombo);

        const barWidth = this.comboBarBg.width || 120;
        this.comboBarFill.width = hasCombo ? barWidth * this.comboRatio : 0;

        if (pulseMultiplier) {
            this.scene.tweens.killTweensOf(this.multiplierText);
            this.multiplierText.setScale(1.12);
            this.scene.tweens.add({
                targets: this.multiplierText,
                scaleX: 1,
                scaleY: 1,
                duration: 140,
                ease: "Quad.easeOut"
            });
        }
    }

    setVisible(value) {
        this.container.setVisible(value);

        if (!value) {
            this.stopPlayPulse();
        }
    }

    startPlayPulse() {
        const playBg = this.btnStart?.list?.[0];
        if (!playBg || this.playPulseTween) return;

        playBg.setScale(1);
        this.playPulseTween = this.scene.tweens.add({
            targets: playBg,
            scaleX: 1.04,
            scaleY: 1.04,
            yoyo: true,
            repeat: -1,
            duration: 620,
            ease: "Sine.easeInOut"
        });
    }

    stopPlayPulse() {
        const playBg = this.btnStart?.list?.[0];
        if (this.playPulseTween) {
            this.playPulseTween.stop();
            this.playPulseTween = null;
        }
        this.scene.tweens.killTweensOf(playBg);
        playBg?.setScale(1);
    }
}