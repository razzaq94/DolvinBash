export default class BetPanel {
    constructor(scene, config) {
        this.scene = scene;

        this.balance = config.startingBalance;
        this.bet = config.defaultBet;
        this.minBet = config.minBet;
        this.maxBet = config.maxBet;

        this.container = scene.add.container(0, 0).setScrollFactor(0);

        this.createUI();
        this.layout();
    }

    createUI() {
        const s = this.scene;

        this.balanceText = s.add.text(0, 0, "", {
            fontSize: "22px",
            color: "#22c55e"
        }).setScrollFactor(0);

        this.betText = s.add.text(0, 0, "", {
            fontSize: "28px",
            color: "#ffffff"
        }).setScrollFactor(0);

        this.btnMinus = this.createButton("-", () => this.decreaseBet());
        this.btnPlus = this.createButton("+", () => this.increaseBet());
        this.btnStart = this.createButton("START", () => {
            this.onStart?.();
        }, 180);

        this.container.add([
            this.balanceText,
            this.betText,
            this.btnMinus,
            this.btnPlus,
            this.btnStart
        ]);

        this.refresh();
    }

    createButton(label, callback, width = 60) {
        const s = this.scene;

        const bg = s.add.rectangle(0, 0, width, 50, 0x1e293b)
            .setStrokeStyle(2, 0x94a3b8)
            .setInteractive({ useHandCursor: true })
            .setScrollFactor(0);

        const txt = s.add.text(0, 0, label, {
            fontSize: "22px",
            color: "#ffffff"
        }).setOrigin(0.5).setScrollFactor(0);

        bg.on("pointerdown", callback);

        return this.scene.add.container(0, 0, [bg, txt]).setScrollFactor(0);
    }

    layout() {
        const width = this.scene.scale.width;
        const height = this.scene.scale.height;

        this.container.setPosition(width * 0.5, height - 120);

        this.balanceText.setPosition(-200, -40);
        this.betText.setPosition(-40, 0);

        this.btnMinus.setPosition(-120, 0);
        this.btnPlus.setPosition(40, 0);
        this.btnStart.setPosition(180, 0);
    }

    increaseBet() {
        this.bet = Math.min(this.bet + 10, this.maxBet);
        this.refresh();
    }

    decreaseBet() {
        this.bet = Math.max(this.bet - 10, this.minBet);
        this.refresh();
    }

    refresh() {
        this.balanceText.setText(`Balance: ${this.balance}`);
        this.betText.setText(`Bet: ${this.bet}`);
    }

    setVisible(value) {
        this.container.setVisible(value);
    }
}