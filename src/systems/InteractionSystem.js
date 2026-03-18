import { GAME_CONFIG } from "../data/gameConfig.js";

export default class InteractionSystem {
    constructor(scene, dollController) {
        this.scene = scene;
        this.dollController = dollController;

        this.multiplier = 1;
        this.comboCount = 0;
        this.maxCombo = 0;
        this.comboWindowRemainingMs = 0;
        this.interactionsEnabled = false;

        this.pickups = [];
        this.bombs = [];
        this.hazards = [];
        this.bats = [];
        this.allItems = [];

        this.onMultiplierChanged = null;
        this.onComboChanged = null;
        this.onHazardHit = null;

        this.activePatternId = "";
    }

    create() {
        this.reset();
    }

    loadPattern(pattern) {
        this.clearAll();

        if (!pattern || !Array.isArray(pattern.items)) {
            return;
        }

        this.activePatternId = pattern.id || "unknown_pattern";

        const groundY = this.getGroundY();

        for (let i = 0; i < pattern.items.length; i++) {
            const itemData = pattern.items[i];
            const x = itemData.x;
            const yOffset = itemData.yOffset;
            const y = groundY + yOffset;

            let item = null;

            if (itemData.type === "pickup") {
                item = this.createCircleObject(
                    x,
                    y,
                    18,
                    0x22c55e,
                    itemData.label || "x2",
                    "pickup",
                    yOffset
                );

                item.rewardValue = itemData.label === "+1" ? 1 : 1;
                this.pickups.push(item);
            } else if (itemData.type === "bomb") {
                item = this.createCircleObject(
                    x,
                    y,
                    20,
                    0xef4444,
                    itemData.label || "B",
                    "bomb",
                    yOffset
                );
                this.bombs.push(item);
            } else if (itemData.type === "hazard") {
                item = this.createRectObject(
                    x,
                    y,
                    36,
                    76,
                    0xf59e0b,
                    itemData.label || "!",
                    "hazard",
                    yOffset
                );
                this.hazards.push(item);
            } else if (itemData.type === "bat") {
                item = this.createRectObject(
                    x,
                    y,
                    100,
                    40,
                    0x3b82f6,
                    itemData.label || "HIT",
                    "bat",
                    yOffset
                );

                item.impulseX = itemData.impulseX ?? GAME_CONFIG.bat.impulseX;
                item.impulseY = itemData.impulseY ?? GAME_CONFIG.bat.impulseY;

                this.bats.push(item);
            }

            if (item) {
                this.allItems.push(item);
            }
        }

        if (GAME_CONFIG.debug.enableLogs) {
            console.log(`[InteractionSystem] loaded pattern: ${this.activePatternId}`);
        }

        this.reset();
    }

    createCircleObject(x, y, radius, color, label, type, yOffset) {
        const shape = this.scene.add.circle(x, y, radius, color).setStrokeStyle(2, 0x0f172a);
        const text = this.scene.add.text(x, y, label, {
            fontSize: "16px",
            color: "#ffffff"
        }).setOrigin(0.5);

        return {
            type,
            x,
            y,
            yOffset,
            radius,
            shape,
            text,
            active: true
        };
    }

    createRectObject(x, y, width, height, color, label, type, yOffset) {
        const shape = this.scene.add.rectangle(x, y, width, height, color).setStrokeStyle(2, 0x0f172a);
        const text = this.scene.add.text(x, y, label, {
            fontSize: "18px",
            color: "#ffffff"
        }).setOrigin(0.5);

        return {
            type,
            x,
            y,
            yOffset,
            width,
            height,
            shape,
            text,
            active: true
        };
    }

    reset() {
        this.multiplier = 1;
        this.comboCount = 0;
        this.maxCombo = 0;
        this.comboWindowRemainingMs = 0;
        this.interactionsEnabled = true;

        this.setObjectsActive(this.pickups, true);
        this.setObjectsActive(this.bombs, true);
        this.setObjectsActive(this.hazards, true);
        this.setObjectsActive(this.bats, true);

        this.emitMultiplierChanged();
        this.emitComboChanged();
    }

    update(deltaSeconds) {
        if (!this.interactionsEnabled || !this.dollController?.doll) {
            return;
        }

        this.updateComboTimer(deltaSeconds);

        const dollX = this.dollController.position.x;
        const dollY = this.dollController.position.y;

        this.checkCircleCollisions(this.pickups, dollX, dollY, 24, (item) => {
            const baseReward = item.rewardValue ?? 1;

            this.addCombo();

            let comboBonus = 0;
            if (
                GAME_CONFIG.combo.enabled &&
                this.comboCount > 0 &&
                this.comboCount % GAME_CONFIG.combo.bonusEveryHits === 0
            ) {
                comboBonus = GAME_CONFIG.combo.bonusAmount;
            }

            this.multiplier += baseReward + comboBonus;

            this.consumeObject(item);
            this.popObject(item.shape, item.text, 0x22c55e);

            const floatingValue = comboBonus > 0
                ? `+${baseReward + comboBonus}`
                : `+${baseReward}`;

            this.showFloatingText(item.x, item.y - 26, floatingValue);
            this.dollController.setFace("^_^");

            if (comboBonus > 0) {
                this.showFloatingText(item.x, item.y - 58, `COMBO +${comboBonus}`);
            }

            this.emitMultiplierChanged();
        });

        this.checkCircleCollisions(this.bombs, dollX, dollY, 24, (item) => {
            this.multiplier = Math.max(1, this.multiplier - 1);
            this.resetCombo();

            this.consumeObject(item);
            this.popObject(item.shape, item.text, 0xef4444);
            this.showFloatingText(item.x, item.y - 26, "-1");
            this.dollController.setFace(">:(");
            this.flashScreen(0xef4444);
            this.emitMultiplierChanged();
        });

        this.checkRectCollisions(this.bats, dollX, dollY, 30, 30, (item) => {
            if (this.dollController.velocity.y < -50) {
                return;
            }

            this.consumeObject(item);

            const dir = Math.sign(dollX - item.x) || 1;

            this.dollController.applyImpulse(
                item.impulseX * dir,
                item.impulseY
            );

            this.popObject(item.shape, item.text, 0x3b82f6);
            this.showFloatingText(item.x, item.y - 30, "BOOST");
            this.flashScreen(0x3b82f6);
            this.dollController.setFace("O_O");
        });

        this.checkRectCollisions(this.hazards, dollX, dollY, 22, 22, (item) => {
            this.consumeObject(item);
            this.interactionsEnabled = false;
            this.resetCombo();
            this.dollController.setFace("X_X");
            this.flashScreen(0xf59e0b);
            this.onHazardHit?.(item);
        });
    }

    updateComboTimer(deltaSeconds) {
        if (!GAME_CONFIG.combo.enabled) {
            return;
        }

        if (this.comboCount <= 0 || this.comboWindowRemainingMs <= 0) {
            return;
        }

        this.comboWindowRemainingMs -= deltaSeconds * 1000;

        if (this.comboWindowRemainingMs <= 0) {
            this.comboWindowRemainingMs = 0;
            this.resetCombo();
        } else {
            this.emitComboChanged();
        }
    }

    addCombo() {
        if (!GAME_CONFIG.combo.enabled) {
            return;
        }

        this.comboCount += 1;
        this.comboWindowRemainingMs = GAME_CONFIG.combo.windowMs;

        if (this.comboCount > this.maxCombo) {
            this.maxCombo = this.comboCount;
        }

        this.emitComboChanged();
    }

    resetCombo() {
        if (this.comboCount === 0 && this.comboWindowRemainingMs === 0) {
            return;
        }

        this.comboCount = 0;
        this.comboWindowRemainingMs = 0;
        this.emitComboChanged();
    }

    checkCircleCollisions(items, dollX, dollY, dollRadius, callback) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.active) continue;

            const dist = Phaser.Math.Distance.Between(dollX, dollY, item.x, item.y);
            if (dist <= dollRadius + item.radius) {
                callback(item);
            }
        }
    }

    checkRectCollisions(items, dollX, dollY, dollHalfW, dollHalfH, callback) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.active) continue;

            const left = item.x - item.width * 0.5;
            const right = item.x + item.width * 0.5;
            const top = item.y - item.height * 0.5;
            const bottom = item.y + item.height * 0.5;

            const dollLeft = dollX - dollHalfW;
            const dollRight = dollX + dollHalfW;
            const dollTop = dollY - dollHalfH;
            const dollBottom = dollY + dollHalfH;

            const overlaps =
                dollRight >= left &&
                dollLeft <= right &&
                dollBottom >= top &&
                dollTop <= bottom;

            if (overlaps) {
                callback(item);
            }
        }
    }

    consumeObject(item) {
        item.active = false;
        item.shape.setVisible(false);
        item.text.setVisible(false);
    }

    setObjectsActive(items, isActive) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            item.active = isActive;
            item.shape.setVisible(isActive);
            item.text.setVisible(isActive);
            item.shape.setScale(1);
            item.text.setScale(1);
            item.shape.setAlpha(1);
            item.text.setAlpha(1);
        }
    }

    popObject(shape, text, color) {
        const pulse = this.scene.add.circle(shape.x, shape.y, 10, color, 0.55);

        this.scene.tweens.add({
            targets: pulse,
            radius: 42,
            alpha: 0,
            duration: 260,
            ease: "Quad.easeOut",
            onComplete: () => pulse.destroy()
        });

        this.scene.tweens.add({
            targets: [shape, text],
            scaleX: 1.35,
            scaleY: 1.35,
            alpha: 0,
            duration: 180,
            ease: "Back.easeOut"
        });
    }

    flashScreen(color) {
        const cam = this.scene.cameras.main;
        cam.flash(120, (color >> 16) & 255, (color >> 8) & 255, color & 255, false);
    }

    showFloatingText(x, y, value) {
        const t = this.scene.add.text(x, y, value, {
            fontSize: "22px",
            color: "#f8fafc",
            backgroundColor: "#0f172a",
            padding: { left: 6, right: 6, top: 4, bottom: 4 }
        }).setOrigin(0.5);

        this.scene.tweens.add({
            targets: t,
            y: y - 36,
            alpha: 0,
            duration: 550,
            ease: "Quad.easeOut",
            onComplete: () => t.destroy()
        });
    }

    emitMultiplierChanged() {
        this.onMultiplierChanged?.(this.multiplier);
    }

    emitComboChanged() {
        this.onComboChanged?.({
            comboCount: this.comboCount,
            maxCombo: this.maxCombo,
            comboWindowRemainingMs: this.comboWindowRemainingMs,
            comboWindowRatio: GAME_CONFIG.combo.windowMs > 0
                ? this.comboWindowRemainingMs / GAME_CONFIG.combo.windowMs
                : 0
        });
    }

    stop() {
        this.interactionsEnabled = false;
    }

    getMultiplier() {
        return this.multiplier;
    }

    getComboCount() {
        return this.comboCount;
    }

    getMaxCombo() {
        return this.maxCombo;
    }

    getPatternId() {
        return this.activePatternId;
    }

    getGroundY() {
        return this.scene.getGroundY();
    }

    relayout() {
        const groundY = this.getGroundY();

        for (let i = 0; i < this.allItems.length; i++) {
            const item = this.allItems[i];
            item.y = groundY + item.yOffset;
            item.shape.y = item.y;
            item.text.y = item.y;
        }
    }

    clearAll() {
        for (let i = 0; i < this.allItems.length; i++) {
            this.allItems[i].shape?.destroy();
            this.allItems[i].text?.destroy();
        }

        this.pickups.length = 0;
        this.bombs.length = 0;
        this.hazards.length = 0;
        this.bats.length = 0;
        this.allItems.length = 0;
        this.activePatternId = "";
    }

    destroy() {
        this.clearAll();
    }
}