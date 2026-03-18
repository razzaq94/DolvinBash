import { GAME_CONFIG } from "../data/gameConfig.js";

export default class DollController {
    constructor(scene) {
        this.scene = scene;

        this.doll = null;
        this.shadow = null;
        this.faceText = null;

        this.isActive = false;
        this.hasLaunched = false;

        this.position = new Phaser.Math.Vector2(0, 0);
        this.velocity = new Phaser.Math.Vector2(0, 0);

        this.groundY = 0;
        this.elapsedMs = 0;

        this.onMovementComplete = null;

        this.trailTimer = 0;
        this.trails = [];
    }

    create() {
        const groundY = this.getGroundY();
        const startX = GAME_CONFIG.doll.startX;
        const startY = groundY - GAME_CONFIG.doll.startYOffsetFromGround;

        this.groundY = groundY;
        this.position.set(startX, startY);
        this.velocity.set(0, 0);

        this.shadow = this.scene.add.ellipse(startX, groundY + 18, 54, 18, 0x000000, 0.22);
        this.doll = this.scene.add.rectangle(
            startX,
            startY,
            GAME_CONFIG.doll.width,
            GAME_CONFIG.doll.height,
            0xf1f5f9
        ).setStrokeStyle(2, 0x0f172a);

        this.faceText = this.scene.add.text(startX, startY, ":|", {
            fontSize: "18px",
            color: "#0f172a"
        }).setOrigin(0.5);

        this.isActive = false;
        this.hasLaunched = false;
        this.elapsedMs = 0;
        this.trailTimer = 0;

        this.syncVisuals();
    }

    reset() {
        const groundY = this.getGroundY();
        const startX = GAME_CONFIG.doll.startX;
        const startY = groundY - GAME_CONFIG.doll.startYOffsetFromGround;

        this.groundY = groundY;
        this.position.set(startX, startY);
        this.velocity.set(0, 0);
        this.elapsedMs = 0;
        this.isActive = false;
        this.hasLaunched = false;
        this.trailTimer = 0;

        this.clearTrails();
        this.setFace(":|");

        if (this.doll) {
            this.doll.setAngle(0);
            this.doll.setScale(1);
            this.doll.setVisible(true);
        }

        if (this.shadow) {
            this.shadow.setVisible(true);
        }

        if (this.faceText) {
            this.faceText.setVisible(true);
            this.faceText.setScale(1);
        }

        this.syncVisuals();
    }

    startKickReaction() {
        this.setFace(":O");

        this.scene.tweens.killTweensOf([this.doll, this.faceText]);

        this.scene.tweens.add({
            targets: [this.doll, this.faceText],
            scaleX: 1.12,
            scaleY: 0.9,
            duration: 90,
            yoyo: true,
            ease: "Quad.easeOut"
        });
    }

    launch() {
        this.hasLaunched = true;
        this.isActive = true;
        this.elapsedMs = 0;

        this.velocity.x = GAME_CONFIG.doll.launchVelocityX;
        this.velocity.y = GAME_CONFIG.doll.launchVelocityY;

        this.setFace("XD");
    }

    applyImpulse(x, y) {
        if (!this.doll) {
            return;
        }

        this.isActive = true;
        this.hasLaunched = true;

        this.velocity.x = x;
        this.velocity.y = y;

        this.setFace("O_O");

        this.scene.tweens.killTweensOf([this.doll, this.faceText]);

        this.scene.tweens.add({
            targets: [this.doll, this.faceText],
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 80,
            yoyo: true,
            ease: "Back.easeOut"
        });
    }

    update(deltaSeconds) {
        if (!this.isActive || !this.doll) {
            return;
        }

        this.elapsedMs += deltaSeconds * 1000;
        this.trailTimer += deltaSeconds;

        this.velocity.y += GAME_CONFIG.doll.gravity * deltaSeconds;
        this.position.x += this.velocity.x * deltaSeconds;
        this.position.y += this.velocity.y * deltaSeconds;

        const airFactor = Phaser.Math.Clamp(Math.abs(this.velocity.y) / 900, 0.15, 1);
        this.doll.angle += GAME_CONFIG.doll.rotationSpeed * airFactor * 60 * deltaSeconds;

        if (this.position.y >= this.groundY - GAME_CONFIG.doll.startYOffsetFromGround) {
            this.position.y = this.groundY - GAME_CONFIG.doll.startYOffsetFromGround;

            if (Math.abs(this.velocity.y) > GAME_CONFIG.doll.minBounceVelocity) {
                this.velocity.y = -Math.abs(this.velocity.y) * GAME_CONFIG.doll.bounceDamping;
                this.velocity.x *= 0.92;
                this.setFace(">_<");
                this.playBounceFeedback();
            } else {
                this.velocity.y = 0;
                this.velocity.x *= GAME_CONFIG.doll.friction;
                this.setFace("x_x");
            }
        }

        if (this.hasLaunched && this.velocity.y < -60) {
            this.setFace("XD");
        } else if (this.hasLaunched && this.velocity.y > 220) {
            this.setFace("D:");
        }

        if (this.trailTimer >= 0.045 && Math.abs(this.velocity.x) > 80) {
            this.trailTimer = 0;
            this.spawnTrail();
        }

        this.syncVisuals();

        const shouldStopByVelocity =
            Math.abs(this.velocity.x) <= GAME_CONFIG.doll.stopVelocityX &&
            Math.abs(this.velocity.y) <= 1 &&
            this.position.y >= this.groundY - GAME_CONFIG.doll.startYOffsetFromGround - 0.1;

        const shouldStopByTime = this.elapsedMs >= GAME_CONFIG.doll.maxFlightTimeMs;

        if (shouldStopByVelocity || shouldStopByTime) {
            this.stopMovement();
        }
    }

    stopMovement() {
        if (!this.isActive) {
            return;
        }

        this.isActive = false;
        this.velocity.set(0, 0);
        this.setFace("x_x");
        this.syncVisuals();

        if (typeof this.onMovementComplete === "function") {
            this.onMovementComplete();
        }
    }

    spawnTrail() {
        const dot = this.scene.add.circle(this.position.x, this.position.y + 4, 6, 0xe2e8f0, 0.35);
        this.trails.push(dot);

        this.scene.tweens.add({
            targets: dot,
            alpha: 0,
            scaleX: 0.35,
            scaleY: 0.35,
            duration: 250,
            onComplete: () => {
                const index = this.trails.indexOf(dot);
                if (index >= 0) {
                    this.trails.splice(index, 1);
                }
                dot.destroy();
            }
        });
    }

    playBounceFeedback() {
        this.scene.tweens.killTweensOf([this.doll, this.faceText]);

        this.scene.tweens.add({
            targets: [this.doll, this.faceText],
            scaleX: 1.14,
            scaleY: 0.82,
            duration: 80,
            yoyo: true,
            ease: "Quad.easeOut"
        });
    }

    syncVisuals() {
        if (!this.doll || !this.shadow || !this.faceText) {
            return;
        }

        this.doll.setPosition(this.position.x, this.position.y);
        this.faceText.setPosition(this.position.x, this.position.y);

        const shadowScale = Phaser.Math.Clamp(
            1 - ((this.groundY - this.position.y) / 260),
            0.45,
            1
        );

        this.shadow.setPosition(this.position.x, this.groundY + 18);
        this.shadow.setScale(shadowScale, shadowScale);
    }

    setFace(value) {
        if (this.faceText) {
            this.faceText.setText(value);
        }
    }

    getGroundY() {
        return this.scene.scale.height - GAME_CONFIG.world.groundOffsetFromBottom;
    }

    relayout() {
        const previousGroundY = this.groundY;
        const nextGroundY = this.getGroundY();
        const diff = nextGroundY - previousGroundY;

        this.groundY = nextGroundY;
        this.position.y += diff;

        this.syncVisuals();
    }

    clearTrails() {
        for (let i = 0; i < this.trails.length; i++) {
            this.trails[i]?.destroy();
        }
        this.trails.length = 0;
    }

    destroy() {
        this.clearTrails();

        this.shadow?.destroy();
        this.doll?.destroy();
        this.faceText?.destroy();

        this.shadow = null;
        this.doll = null;
        this.faceText = null;
    }
}