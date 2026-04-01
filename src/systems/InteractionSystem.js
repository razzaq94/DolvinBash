import { GAME_CONFIG } from "../data/gameConfig.js";

export default class InteractionSystem {
    constructor(scene, dollController) {
        this.scene = scene;
        this.audioManager = scene.audioManager;
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
        this.skyMultipliers = [];
        this.allItems = [];

        this.onMultiplierChanged = null;
        this.onComboChanged = null;
        this.onHazardHit = null;

        this.activePatternId = "";
        this.speedMode = GAME_CONFIG.round.defaultSpeedMode || "NORMAL";
        this.volatility = GAME_CONFIG.round.defaultVolatility || "NORMAL";
        this.speedTuning = GAME_CONFIG.speedModes?.[this.speedMode] || GAME_CONFIG.speedModes?.NORMAL || {};
        this.volatilityTuning = GAME_CONFIG.volatilityModes?.[this.volatility] || GAME_CONFIG.volatilityModes?.NORMAL || {};
        this.maxMultiplier = 999;
        this.nextHazardSpawnX = 2500; 
        this.decorationHazards = []; // Pool for scenery-based hazards
        this.proceduralBombs = [];
        this.nextBombSpawnX = 900;
        this.prevDollX = null;
        this.prevDollY = null;
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
        const { scale, offsetX } = this.getPatternLayout();

        for (let i = 0; i < pattern.items.length; i++) {
            const itemData = pattern.items[i];
            const x = Math.round((itemData.x * scale) + offsetX);
            const yOffset = itemData.yOffset;
            const y = groundY + yOffset;

            let item = null;

            if (itemData.type === "pickup") {
                item = this.createCircleObject(
                    x,
                    y,
                    18,
                    0x22c55e,
                    itemData.label || "+1",
                    "pickup",
                    yOffset
                );

                item.effect = this.parseEffectString(itemData.label || "+1");
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
                item.effect = this.parseEffectString(itemData.label || "B");
                this.bombs.push(item);
            } else if (itemData.type === "hazard") {
                // Decorative hazards were merged into the background; skip them entirely.
                const v = String(itemData.variant || "").toLowerCase();
                const isRoadOnly = (v === "hole" || v === "trafficcone" || v === "roadblocker");
                if (!isRoadOnly) continue;

                const hazardVisual = this.getHazardVisual(itemData.variant);
                item = this.createHazardObject(
                    x,
                    y,
                    hazardVisual.width,
                    hazardVisual.height,
                    hazardVisual.texture,
                    itemData.label || hazardVisual.label,
                    "hazard",
                    yOffset,
                    itemData.variant
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

                item.variant = "bat";
                this.bats.push(item);
            }

            if (item) {
                this.allItems.push(item);
            }
        }

        if (GAME_CONFIG.debug.enableLogs) {
            console.log(`[InteractionSystem] loaded pattern: ${this.activePatternId}`);
        }

        this.spawnSkyMultipliers(groundY);
        this.spawnEnvironmentDecoration(groundY);
        this.initBombStream(groundY);
        this.spawnStarterPickup();
        this.reset();
    }

    initBombStream(groundY) {
        if (!this.proceduralBombs.length) {
            // Bigger pool so bombs can stay dense throughout.
            const poolCount = 90;
            for (let i = 0; i < poolCount; i++) {
                const item = this.createCircleObject(
                    -600,
                    groundY - 220,
                    20,
                    0xef4444,
                    "÷2",
                    "bomb",
                    -220
                );
                item.effect = { type: "divide", value: 2 };
                item.active = false;
                item.shape.setVisible(false);
                item.text.setVisible(false);
                item.sprite?.setVisible(false);
                this.proceduralBombs.push(item);
                this.bombs.push(item);
                this.allItems.push(item);
            }
        }

        const camera = this.scene.cameras.main;
        const cameraRight = (camera?.scrollX ?? 0) + this.scene.scale.width;
        const skyStartX = GAME_CONFIG.skyMultipliers?.startX ?? 520;
        // Start bombs earlier and keep stream dense.
        this.nextBombSpawnX = Math.max(this.nextBombSpawnX, skyStartX + 120, cameraRight + 260);
    }

    spawnStarterPickup() {
        // Guaranteed hit at the start to ensure player doesn't lose immediately
        const startX = GAME_CONFIG.doll.startX || 180;
        const groundY = this.getGroundY();
        const startY = groundY - (GAME_CONFIG.doll.startYOffsetFromGround || 48);

        // Position it right in the trajectory of a standard kick (approx 0.4s after launch)
        const hitX = startX + 320;
        const hitY = startY - 180;

        const item = this.createCircleObject(
            hitX,
            hitY,
            24, // Slightly larger for easier hit
            0xfacc15, // Golden color
            "x2.0",
            "pickup",
            hitY - groundY
        );

        item.effect = { type: "multiply", value: 2 };
        this.pickups.push(item);
        this.allItems.push(item);
    }

    getPatternLayout() {
        const layout = this.scene.getViewportLayout?.();
        const width = this.scene.scale.width;
        const isMobile = layout ? layout.isMobile : width < 900;

        // Compress early interaction spacing on small screens so the first items
        // show up sooner in the visible area.
        return {
            scale: isMobile ? 0.82 : 1,
            offsetX: isMobile ? 32 : (layout ? Math.max(0, layout.stageLeft - 18) : 0)
        };
    }

    createCircleObject(x, y, radius, color, label, type, yOffset) {
        // Shape is hidden but kept for collision debug/hitbox logic
        const shape = this.scene.add.circle(x, y, radius, color).setStrokeStyle(2, 0x0f172a).setVisible(false);
        const glow = this.scene.add.circle(x, y, radius + 15, color, 0.35);
        const isMultiplier = String(label).toLowerCase().includes("x");
        const fillColor = isMultiplier ? "#fff200" : "#ffffff";
        const shadowColor = isMultiplier ? "#a16207" : "#000000"; // Deep gold/brown for x-multipliers

        const text = this.scene.add.text(x, y, label, {
            fontFamily: '"Luckiest Guy", cursive',
            fontSize: "34px",
            color: fillColor,
            stroke: shadowColor,
            strokeThickness: 2,
            shadow: {
                offsetX: 3,
                offsetY: 3,
                color: shadowColor,
                blur: 0,
                stroke: true,
                fill: true
            }
        }).setOrigin(0.5);

        const item = { type, x, y, yOffset, radius, shape, glow, text, active: true, color };
 
        // Hide all "bubbles" (glows) to satisfy "numbers only" requirement
        glow.setVisible(false);
        
        if (isMultiplier) {
            item.extraGlow = this.scene.add.circle(x, y, radius + 10, 0xffea00, 0.25).setDepth(29).setVisible(false);
        }

        glow.setDepth(type === "bomb" ? 32 : 30);
        shape.setDepth(type === "bomb" ? 33 : 31);
        text.setDepth(type === "bomb" ? 34 : 32);

        // Bombs use a sprite (user-provided) instead of the label text.
        if (type === "bomb" && this.scene.textures.exists("hazard_bomb")) {
            const sprite = this.scene.add.image(x, y, "hazard_bomb");
            const targetSize = radius * 2.25;
            const scale = Math.min(
                targetSize / (sprite.width || 1),
                targetSize / (sprite.height || 1)
            );
            sprite.setScale(scale);
            // Front of everything (doll is depth ~36)
            sprite.setDepth(60);
            // Move with camera naturally on both axes.
            sprite.setScrollFactor(1, 1);
            item.sprite = sprite;
            text.setVisible(false);

            // Bomb glow + pulse like other nodes
            glow.setVisible(true);
            glow.setFillStyle(0xef4444, 0.28);
            glow.setDepth(59);
            glow.setScrollFactor(1, 1);

            // Keep bombs static too (no pulsing)
            item.pulseTween?.stop?.();
            item.pulseTween = null;
        }

        // Move with camera naturally on both axes.
        shape.setScrollFactor(1, 1);
        glow.setScrollFactor(1, 1);
        text.setScrollFactor(1, 1);

        // Keep numbers static (no floating/pulsing motion)

        return item;
    }

    createSkyMultiplierObject(x, y, nodeCfg, yOffset) {
        const radius = GAME_CONFIG.skyMultipliers?.nodeRadius ?? 20;
        const color = nodeCfg.color ?? 0xfacc15;
        
        // Solid shape hidden as per client feedback
        const shape = this.scene.add.circle(x, y, radius, color, 0.94).setStrokeStyle(2, 0x0f172a, 0.9).setVisible(false);
        const glow = this.scene.add.circle(x, y, radius + 18, color, 0.35);

        const isMultiplier = String(nodeCfg.label || "x2").toLowerCase().includes("x");
        const fillColor = isMultiplier ? "#fff200" : "#ffffff";
        const shadowColor = isMultiplier ? "#a16207" : "#000000";

        const text = this.scene.add.text(x, y, nodeCfg.label || "x2", {
            fontFamily: '"Luckiest Guy", cursive',
            fontSize: "48px",
            color: fillColor,
            stroke: shadowColor,
            strokeThickness: 2,
            shadow: {
                offsetX: 4,
                offsetY: 4,
                color: shadowColor,
                blur: 0,
                stroke: true,
                fill: true
            }
        }).setOrigin(0.5);

        // Enhance the glow behind multipliers (now hidden as per request)
        glow.setDepth(26);
        glow.setVisible(false);
        shape.setDepth(27);
        text.setDepth(28);

        const item = {
            type: "sky_multiplier",
            variant: nodeCfg.id || "node",
            x,
            y,
            yOffset,
            radius,
            shape,
            glow,
            text,
            active: true,
            bonus: nodeCfg.bonus ?? 0,
            penalty: nodeCfg.penalty ?? 0,
            motion: nodeCfg.motion || "forward",
            forceX: nodeCfg.forceX ?? 0,
            forceY: nodeCfg.forceY ?? -260,
            color,
            savedEffect: this.calculateNodeEffect(nodeCfg)
        };

        // Keep numbers static (no floating/pulsing motion)

        return item;
    }

    createHazardObject(x, y, width, height, texture, label, type, yOffset, variant = null) {
        // Use sprite if texture exists, otherwise fallback to rectangle
        let visual;
        let finalTexture = texture;
        if (variant === "water" && Math.random() > 0.5) {
            finalTexture = "hazard_water_2";
        }

        const isHole = variant === "hole";
        // Client requirement: only cone/roadblocker sit on road center.
        const isRoadObstacle = (variant === "trafficcone" || variant === "roadblocker" || variant === "hole");
        const isBackgroundObject = type === "hazard" && !isHole;

        if (finalTexture && this.scene.textures.exists(finalTexture)) {
            visual = this.scene.add.image(x, y, finalTexture);
            // Fit to defined width/height but keep aspect ratio roughly
            const scaleX = width / visual.width;
            const scaleY = height / visual.height;
            visual.setScale(Math.min(scaleX, scaleY));
            
            visual.setOrigin(0.5, 1);
            if (isRoadObstacle) {
                // Road-aligned obstacles
                // Push a bit lower so it sits centered on the road strip
                const yCfg = GAME_CONFIG.roadObstacleY || {};
                const offset =
                    variant === "hole" ? (yCfg.hole ?? 10)
                    : variant === "trafficcone" ? (yCfg.trafficcone ?? 34)
                    : variant === "roadblocker" ? (yCfg.roadblocker ?? 34)
                    : 34;
                visual.y = this.getGroundY() + offset;
            } else {
                // Side-walk / background strip level
                const layout = this.scene.getViewportLayout?.();
                // Larger offset on mobile so sidewalk hazards never sit on the road.
                const sidewalkOffset = layout?.isMobile ? 130 : 34;
                visual.y = this.getGroundY() - sidewalkOffset;
            }
        } else {
            visual = this.scene.add.rectangle(x, y, width, height, 0xff0000).setStrokeStyle(2, 0x0f172a);
        }

        const text = this.scene.add.text(x, y - height, label, {
            fontSize: "18px",
            color: "#ffffff"
        }).setOrigin(0.5).setVisible(false);

        // Sidewalk objects behind doll; road center obstacles level with road.
        const depth = isRoadObstacle ? 29 : 25;
        visual.setDepth(depth);
        text.setDepth(depth + 1);

        // Move with camera naturally on both axes.
        visual.setScrollFactor(1, 1);
        text.setScrollFactor(1, 1);

        const isGroundObject = type === "hazard";

        return {
            type,
            x,
            y: visual.y,
            yOffset,
            width,
            height,
            variant,
            shape: visual,
            text,
            isGroundObject,
            isHole,
            isRoadObstacle,
            active: true
        };
    }

    createRectObject(x, y, width, height, color, label, type, yOffset, variant = null) {
        const shape = this.scene.add.rectangle(x, y, width, height, color).setStrokeStyle(2, 0x0f172a);
        const text = this.scene.add.text(x, y, label, {
            fontFamily: '"Bubblegum Sans", cursive',
            fontSize: "42px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 4,
            shadow: { offsetX: 3, offsetY: 3, color: "rgba(0,0,0,0.5)", blur: 2, stroke: true, fill: true }
        }).setOrigin(0.5).setDepth(20).setVisible(false);

        if (type === "bat") {
            shape.setDepth(35);
            text.setDepth(36);
        }

        // Move with camera naturally on both axes.
        shape.setScrollFactor(1, 1);
        text.setScrollFactor(1, 1);

        return {
            type,
            x,
            y,
            yOffset,
            width,
            height,
            variant,
            shape,
            text,
            active: true
        };
    }

    getHazardVisual(variant) {
        switch (variant) {
            case "tree":
                return { width: 120, height: 240, texture: "hazard_tree", label: "TREE" };
            case "lamp_post":
                return { width: 60, height: 180, texture: "hazard_lamp_post", label: "LAMP" };
            case "pole":
                return { width: 40, height: 80, texture: "hazard_pole", label: "POLE" };
            case "trafficcone":
                return { width: 96, height: 150, texture: "hazard_trafficcone", label: "CONE" };
            case "roadblocker":
                return { width: 280, height: 165, texture: "hazard_roadblocker", label: "BLOCK" };
            case "hole":
                return { width: 140, height: 40, texture: "hazard_hole", label: "HOLE" };
            case "water":
                return { width: 160, height: 50, texture: "hazard_water", label: "WATER" };
            default:
                return { width: 36, height: 76, color: 0xf59e0b, label: "!" };
        }
    }

    getHazardRule(variant) {
        const rules = GAME_CONFIG.encounters?.hazardRules || {};
        return rules[variant] || rules.default || {
            severity: "major",
            multiplierPenalty: 0,
            bounceImpulseX: -180,
            bounceImpulseY: -240
        };
    }

    parseEffectString(raw) {
        const str = String(raw || "").trim().toLowerCase();

        if (str.startsWith("x")) {
            const val = Number.parseFloat(str.slice(1));
            if (Number.isFinite(val) && val > 0) return { type: "multiply", value: val };
        }

        if (str.startsWith("+")) {
            const val = Number.parseFloat(str.slice(1));
            if (Number.isFinite(val) && val > 0) return { type: "add", value: val };
        }

        if (str.startsWith("-")) {
            const val = Number.parseFloat(str.slice(1));
            if (Number.isFinite(val) && val > 0) return { type: "subtract", value: val };
        }

        if (str.startsWith("/") || str.startsWith("÷")) {
            const val = Number.parseFloat(str.slice(1));
            if (Number.isFinite(val) && val > 1) return { type: "divide", value: val };
        }

        if (str === "b" || str === "bomb") {
            return { type: "subtract", value: 1 };
        }

        return { type: "add", value: 1 };
    }

    spawnSkyMultipliers(groundY) {
        const cfg = GAME_CONFIG.skyMultipliers;
        if (!cfg?.enabled || !Array.isArray(cfg.pool) || cfg.pool.length === 0) {
            return;
        }

        const minCount = Math.max(1, cfg.minCount ?? 5);
        const maxCount = Math.max(minCount, cfg.maxCount ?? 8);
        const count = Phaser.Math.Between(minCount, maxCount);
        const startX = cfg.startX ?? 520;
        const stepX = 36;
        this.nextSkySpawnX = startX;

        for (let i = 0; i < count; i++) {
            const baseX = this.nextSkySpawnX + Phaser.Math.Between(-20, 44);
            const spawn = this.findSkySpawnAroundBase(baseX, cfg);
            const x = spawn.x;
            const yOffset = spawn.yOffset;
            const y = groundY + yOffset;
            this.nextSkySpawnX = x + stepX + Phaser.Math.Between(2, 18);

            const nodeCfg = this.pickSkyNodeConfig(cfg.pool);
            const item = this.createSkyMultiplierObject(x, y, nodeCfg, yOffset);
            this.skyMultipliers.push(item);
            this.allItems.push(item);
        }
    }

    getRandomSkyGap(cfg) {
        const minGap = Math.max(18, cfg?.minGap ?? 0);
        const maxGap = Math.max(minGap, cfg?.maxGap ?? 0);
        if (maxGap === minGap && minGap <= 40) {
            return Phaser.Math.Between(12, 34);
        }
        return Phaser.Math.Between(minGap, maxGap);
    }

    findSkySpawnAroundBase(baseX, cfg, excludeItem = null) {
        const groundY = this.getGroundY();
        let fallback = {
            x: baseX,
            yOffset: this.getRandomSkyYOffset(cfg)
        };

        for (let i = 0; i < 40; i++) {
            const x = baseX + Phaser.Math.Between(-28, 28);
            const yOffset = this.getRandomSkyYOffset(cfg);
            const y = groundY + yOffset;
            fallback = { x, yOffset };
            if (this.isSkyPositionFree(x, y, excludeItem)) {
                return fallback;
            }
        }

        // Strict no-overlap guarantee:
        // if local jittered attempts fail, keep moving forward until a free slot appears.
        let probeX = Math.max(baseX, fallback.x);
        for (let i = 0; i < 220; i++) {
            probeX += 10;
            const yOffset = this.getRandomSkyYOffset(cfg);
            const y = groundY + yOffset;
            if (this.isSkyPositionFree(probeX, y, excludeItem)) {
                return { x: probeX, yOffset };
            }
        }

        // Last safety: push much farther ahead at a safe row.
        const safeYOffset = this.getRandomSkyYOffset(cfg);
        return { x: probeX + 40, yOffset: safeYOffset };
    }

    getRandomSkyYOffset(cfg) {
        const minYOffset = cfg?.minYOffset ?? -450;
        const maxYOffset = cfg?.maxYOffset ?? -180;
        const groundY = this.getGroundY();
        const layout = this.scene.getViewportLayout?.();

        // Keep nodes fully inside visible play area (avoid top/bottom cuts).
        const safeTopY = layout ? (layout.stageTop + 64) : (groundY + minYOffset);
        const safeBottomY = layout ? (layout.stageBottom - 150) : (groundY + maxYOffset);

        const boundedMinYOffset = Phaser.Math.Clamp(
            Math.round(safeTopY - groundY),
            minYOffset,
            maxYOffset
        );
        const boundedMaxYOffset = Phaser.Math.Clamp(
            Math.round(safeBottomY - groundY),
            boundedMinYOffset,
            maxYOffset
        );

        // Row-based scatter: covers full screen height, still looks random.
        // Rows keep spacing organized while jitter avoids rigid lines.
        const totalRange = Math.max(1, boundedMaxYOffset - boundedMinYOffset);
        const rowCount = 7;
        const rowStep = totalRange / Math.max(1, rowCount - 1);
        const rowIndex = Phaser.Math.Between(0, rowCount - 1);
        const rowBase = boundedMinYOffset + (rowIndex * rowStep);
        const jitter = Phaser.Math.Between(-14, 14);
        return Phaser.Math.Clamp(Math.round(rowBase + jitter), boundedMinYOffset, boundedMaxYOffset);
    }

    spawnEnvironmentDecoration(groundY) {
        // Decorative sidewalk hazards were merged into the background (no longer spawned).
        // We still need a pool to procedurally spawn *road colliders* (hole/cone/blocker).
        this.nextHazardSpawnX = 2500;

        if (!this.decorationHazards.length) {
            this.decorationHazards = [];
            const count = 24;
            for (let i = 0; i < count; i++) {
                const visual = this.getHazardVisual("trafficcone");
                const item = this.createHazardObject(
                    -600,
                    groundY,
                    visual.width,
                    visual.height,
                    visual.texture,
                    visual.label,
                    "hazard",
                    0,
                    "trafficcone"
                );
                item.active = false;
                item.hasCollided = false;
                item.shape.setVisible(false);
                item.text.setVisible(false);
                this.decorationHazards.push(item);
                this.hazards.push(item);
                this.allItems.push(item);
            }
        }
    }

    pickSkyNodeConfig(pool) {
        let totalWeight = 0;
        for (let i = 0; i < pool.length; i++) {
            totalWeight += Math.max(0, pool[i].weight ?? 1);
        }

        if (totalWeight <= 0) {
            return pool[Phaser.Math.Between(0, pool.length - 1)];
        }

        let roll = Phaser.Math.Between(1, Math.max(1, Math.round(totalWeight)));
        for (let i = 0; i < pool.length; i++) {
            roll -= Math.max(0, pool[i].weight ?? 1);
            if (roll <= 0) {
                return pool[i];
            }
        }

        return pool[pool.length - 1];
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
        this.setObjectsActive(this.skyMultipliers, true);

        this.emitMultiplierChanged();
        this.emitComboChanged();
    }

    setRoundTuning({ speedMode = "NORMAL", volatility = "NORMAL" } = {}) {
        this.speedMode = speedMode;
        this.volatility = volatility;
        this.speedTuning = GAME_CONFIG.speedModes?.[speedMode] || GAME_CONFIG.speedModes?.NORMAL || {};
        this.volatilityTuning = GAME_CONFIG.volatilityModes?.[volatility] || GAME_CONFIG.volatilityModes?.NORMAL || {};
    }

    update(deltaSeconds) {
        if (!this.interactionsEnabled || !this.dollController?.doll) {
            return;
        }

        const dollX = this.dollController.position.x;
        const dollY = this.dollController.position.y;
        const prevDollX = (this.prevDollX ?? dollX);
        const prevDollY = (this.prevDollY ?? dollY);
        this.maintainSkyMultiplierStream(dollX);
        this.maintainHazardStream(dollX);
        this.maintainBombStream(dollX);
        this.updateComboTimer(deltaSeconds);

        const dollCircleRadius = this.getDollCircleRadius();

        // Once the doll is on the ground, we don't allow any more "number" collisions
        // (prevents going back up from late sky hits while rolling on the road).
        const groundY = this.getGroundY();
        const collisionThreshold = groundY - (GAME_CONFIG.doll.collisionYOffsetFromGround ?? 10);
        const isOnGroundNow = dollY >= (collisionThreshold - 1);

        // Resolve circle collisions using swept "best hit" to avoid wrong/missed hits
        // when multiple nodes are close together.
        const pickupHit = isOnGroundNow ? null : this.findBestCircleHitSwept(this.pickups, prevDollX, prevDollY, dollX, dollY, dollCircleRadius);
        if (pickupHit) {
            const item = pickupHit;
            const effect = item.effect || { type: "add", value: 1 };
            // Trail color theme (reference): + green, x yellow, - red
            const trailTheme =
                effect.type === "multiply" ? "x"
                : effect.type === "subtract" ? "minus"
                : "plus";
            this.dollController.setTrailTheme?.(trailTheme, 0);

            // Same-color hit effect at collision point
            const pickupFxType =
                effect.type === "multiply" ? "sky_x"
                : effect.type === "subtract" ? "sky_minus"
                : "sky_plus";
            this.spawnImpactParticles(pickupFxType, item.x, item.y);
            this.addCombo();

            let comboBonus = 0;
            if (
                GAME_CONFIG.combo.enabled &&
                this.comboCount > 0 &&
                this.comboCount % GAME_CONFIG.combo.bonusEveryHits === 0
            ) {
                comboBonus = GAME_CONFIG.combo.bonusAmount;
            }

            const prevMultiplier = this.multiplier;

            if (effect.type === "multiply") {
                this.multiplier = this.clampMultiplier(this.multiplier * effect.value);
            } else if (effect.type === "add") {
                this.multiplier = this.clampMultiplier(this.multiplier + effect.value + comboBonus);
            }

            this.consumeObject(item);
            this.popObject(item.shape, item.text, 0x22c55e);
            this.scene.audioManager?.play("sfx_pickup", { volume: 0.4 });
            // Keep small generic sparkle too (optional)
            this.spawnImpactParticles("pickup", item.x, item.y);
            this.applyRandomCollisionImpulse("pickup");

            const labelVal = effect.type === "multiply" ? `x${effect.value}` : `+${effect.value}`;
            const floatingValue = comboBonus > 0 ? `${labelVal} (+${comboBonus})` : labelVal;

            // Use Bubblegum colors: Blue for x multipliers, Green for + additions
            const floatColor = effect.type === "multiply" ? "#60a5fa" : "#4ade80";
            this.showFloatingText(item.x, item.y - 26, floatingValue, floatColor);
            this.dollController.onGameplayInteraction?.("pickup");

            if (comboBonus > 0) {
                this.showFloatingText(item.x, item.y - 58, `COMBO +${comboBonus}`, "#a855f7"); // Purple
            }

            if (this.multiplier !== prevMultiplier) {
                this.emitMultiplierChanged();
                this.dollController.updateScoreValue?.(this.multiplier);
            }
        }

        // Swept collision for bombs to prevent "miss" at high speed.
        if (!isOnGroundNow) {
            this.checkCircleCollisionsSwept(this.bombs, prevDollX, prevDollY, dollX, dollY, dollCircleRadius, (item) => {
            const effect = item.effect || { type: "subtract", value: 1 };
            this.resetCombo();

            const prevMultiplier = this.multiplier;

            // Bombs: always ÷2 on hit
            if (effect.type === "divide" || effect.type === "subtract" || effect.type === "multiply") {
                const divisor = 2;
                this.multiplier = this.clampMultiplier(this.multiplier / divisor);
                this.showFloatingText(item.x, item.y - 26, `÷${Number(divisor.toFixed(2))}`, "#f87171");
            } else {
                // Default: small penalty
                const divisor = 2;
                this.multiplier = this.clampMultiplier(this.multiplier / divisor);
                this.showFloatingText(item.x, item.y - 26, `÷${Number(divisor.toFixed(2))}`, "#f87171");
            }

            this.consumeObject(item);
            this.popObject(item.shape, item.text, 0xef4444);
            this.scene.audioManager?.play("sfx_hazard", { volume: 0.55 });
            // Explosion exactly at collision point
            this.spawnImpactParticles("bomb", dollX, dollY);
            this.applyRandomCollisionImpulse("hazard");
            this.dollController.onGameplayInteraction?.("bomb");
            this.dollController.setTrailTheme?.("minus", 0);

            if (this.multiplier !== prevMultiplier) {
                this.emitMultiplierChanged();
                this.dollController.updateScoreValue?.(this.multiplier);
            }
            });
        }



        // Professional collision core:
        // - bats: tighter torso
        // - road obstacles: slightly larger + swept to avoid landing/roll misses
        const dollWTorso = (this.dollController.doll?.displayWidth || 120) * 0.30;
        const dollHTorso = (this.dollController.doll?.displayHeight || 120) * 0.36;
        const dollWRoad = (this.dollController.doll?.displayWidth || 120) * 0.44;
        const dollHRoad = (this.dollController.doll?.displayHeight || 120) * 0.50;

        // Bat interactions (rect collision)
        this.checkRectCollisions(this.bats, dollX, dollY, dollWTorso, dollHTorso, (item) => {
            if (item.hasCollided) return;
            item.hasCollided = true;

            this.spawnImpactParticles("bat", dollX, dollY);
            this.scene.audioManager?.play("sfx_hazard", { volume: 0.5 });

            const dir = (this.dollController.velocity.x ?? 1) >= 0 ? 1 : -1;
            this.dollController.forceDiveDown?.(dir);
            this.dollController.onGameplayInteraction?.("bat");
            this.dollController.setTrailTheme?.("minus", 0);

            this.consumeObject(item);
        });

        // Road obstacle collisions: swept + near-ground to prevent landing misses.
        const roadHit = this.findBestRectHitSwept(
            this.hazards,
            prevDollX,
            prevDollY,
            dollX,
            dollY,
            dollWRoad,
            dollHRoad,
            (it) => (it.variant === "hole" || it.variant === "trafficcone" || it.variant === "roadblocker")
        );

        if (roadHit && !roadHit.hasCollided) {
            const item = roadHit;
            const groundY = this.getGroundY();
            const collisionThreshold = groundY - (GAME_CONFIG.doll.collisionYOffsetFromGround ?? 10);
            const isOnGround = dollY >= (collisionThreshold - 1);
            const nearGround = dollY >= (collisionThreshold - 28);

            // Mark collided first to avoid double-processing in same frame.
            item.hasCollided = true;

            // Always treat these as hazards (trail red, hurt, etc.)
            this.spawnImpactParticles("hazard", item.x, item.y);
            this.dollController.onGameplayInteraction?.("hazard");
            this.dollController.setTrailTheme?.("minus", 0);
            this.resetCombo();

            // Only trigger when grounded/near-ground (prevents weird mid-air hits).
            if (!isOnGround && !nearGround) {
                // Let it pass; we only want road hits close to the floor.
            } else if (item.variant === "hole") {
                this.dollController.disableTrailsNow?.();
                this.interactionsEnabled = false;
                this.scene.audioManager?.play("sfx_hazard", { volume: 0.8 });
                this.onHazardHit?.(item, true);
            } else {
                // trafficcone / roadblocker -> instant dead/stop
                this.interactionsEnabled = false;
                this.scene.audioManager?.play("sfx_hazard", { volume: 0.8 });
                this.onHazardHit?.(item, true);
                this.dollController.stopImmediatelyDead?.();
            }
        }

        let bestImpulse = null;
        let hasDrop = false;

        const skyHit = isOnGroundNow ? null : this.findBestCircleHitSwept(this.skyMultipliers, prevDollX, prevDollY, dollX, dollY, dollCircleRadius);
        if (skyHit) {
            const item = skyHit;
            // CRITICAL: snapshot effect/label/pos BEFORE recycling (recycle mutates text + savedEffect).
            const hitX = item.x;
            const hitY = item.y;
            const skyEffect = this.getSkyMultiplierEffect(item);
            const rawLabelAtHit = String(item?.text?.text || "").trim();
            const isMinus = (skyEffect.type === "subtract") || rawLabelAtHit.startsWith("-");

            const hitParticleType =
                skyEffect.type === "multiply" ? "sky_x"
                : skyEffect.type === "add" ? "sky_plus"
                : "sky_minus";

            // Enforce: "-1" always behaves like an obstacle hit (downward), regardless of motion config.
            const impulse = isMinus
                ? { ...this.getSkyCollisionImpulse({ ...item, motion: "backward" }), label: "MINUS DROP" }
                : this.getSkyCollisionImpulse(item);

            // Now consume visuals at the collision location (use snapshot coords)
            this.consumeObject(item);
            this.popObject(item.shape, item.text, item.color ?? 0xfacc15);
            this.spawnImpactParticles(hitParticleType, hitX, hitY);

            // Prioritization logic: if we hit a DROP, it MUST win the frame
            if (impulse.label === "DROP!" || impulse.label === "MINUS DROP") {
                hasDrop = true;
                bestImpulse = impulse;
            } else if (!hasDrop) {
                bestImpulse = impulse;
            }

            this.scene.shakeMinor?.();
            const prevMultiplier = this.multiplier;

            let logLabel = impulse.label;

            if (skyEffect.type === "multiply") {
                this.scene.audioManager?.play("sfx_pickup", { volume: 0.4 });
                const multiplyFactor = Math.max(1, Number(skyEffect.value) || 1);
                this.multiplier = this.clampMultiplier(this.multiplier * multiplyFactor);
                this.showFloatingText(hitX, hitY - 26, `x${Number(multiplyFactor.toFixed(2))}`, "#60a5fa"); // Blue
                logLabel = `MULTIPLY x${multiplyFactor}`;
            } else if (skyEffect.type === "add") {
                this.scene.audioManager?.play("sfx_pickup", { volume: 0.4 });
                const addAmount = Number(skyEffect.value) || 0;
                this.multiplier = this.clampMultiplier(this.multiplier + addAmount);
                this.showFloatingText(hitX, hitY - 26, `+${Number(addAmount.toFixed(2))}`, "#4ade80"); // Green
                logLabel = `ADD +${addAmount}`;
            } else if (skyEffect.type === "subtract") {
                const subtractAmount = Number(skyEffect.value) || 0;
                this.multiplier = this.clampMultiplier(this.multiplier - subtractAmount);
                this.showFloatingText(hitX, hitY - 26, `-${Number(subtractAmount.toFixed(2))}`, "#f43f5e"); // Red
                logLabel = `MINUS -${subtractAmount}`;
            }

            this.showFloatingText(hitX, hitY - 56, logLabel, "#fde047"); // Gold
            if (isMinus) {
                // Treat -1 like an obstacle hit: hurt sound + impact expression + forced downward impulse.
                this.scene.audioManager?.play("sfx_hazard", { volume: 0.55 });
                this.dollController.onGameplayInteraction?.("hazard");
                this.dollController.setTrailTheme?.("minus", 0);
            } else {
                this.dollController.onGameplayInteraction?.("sky");
                this.dollController.setTrailTheme?.(skyEffect.type === "multiply" ? "x" : "plus", 0);
            }

            if (this.multiplier !== prevMultiplier) {
                this.emitMultiplierChanged();
                this.dollController.updateScoreValue?.(this.multiplier);
            }

            // Only after applying the correct effect/impulse, recycle the node.
            this.recycleSkyMultiplier(item, dollX);
        }

        if (bestImpulse) {
            const forceReset = (bestImpulse.label === "DROP!" || bestImpulse.label === "MINUS DROP");
            this.dollController.applyImpulse(bestImpulse.x, bestImpulse.y, forceReset);
        }

        // Update swept collision baseline
        this.prevDollX = dollX;
        this.prevDollY = dollY;
    }

    maintainBombStream(dollX = 0) {
        if (!this.proceduralBombs.length) return;

        const camera = this.scene.cameras.main;
        const cameraLeft = camera?.scrollX ?? 0;
        const cameraRight = cameraLeft + this.scene.scale.width;

        // Despawn behind
        const despawnX = cameraLeft - 420;
        for (let i = 0; i < this.proceduralBombs.length; i++) {
            const item = this.proceduralBombs[i];
            if (item.active && item.x < despawnX) {
                item.active = false;
                item.shape.setVisible(false);
                item.text.setVisible(false);
                item.sprite?.setVisible(false);
                item.glow?.setVisible(false);
            }
        }

        // Spawn ahead in the same sky lane as multipliers
        const spawnLimitX = cameraRight + 2200;
        const groundY = this.getGroundY();
        const skyCfg = GAME_CONFIG.skyMultipliers || {};
        const minYOffset = skyCfg.minYOffset ?? -450;
        const maxYOffset = skyCfg.maxYOffset ?? -180;

        while (this.nextBombSpawnX < spawnLimitX) {
            let candidate = null;
            for (let i = 0; i < this.proceduralBombs.length; i++) {
                if (!this.proceduralBombs[i].active) {
                    candidate = this.proceduralBombs[i];
                    break;
                }
            }

            if (!candidate) {
                // If all active, recycle the furthest behind
                for (let i = 0; i < this.proceduralBombs.length; i++) {
                    const item = this.proceduralBombs[i];
                    if (!candidate || item.x < candidate.x) candidate = item;
                }
            }

            if (candidate) {
                let placed = false;
                let x = 0;
                let y = 0;
                let yOffset = 0;

                for (let attempt = 0; attempt < 6; attempt++) {
                    yOffset = Phaser.Math.Between(minYOffset, maxYOffset);
                    x = this.nextBombSpawnX + Phaser.Math.Between(-40, 60);
                    y = groundY + yOffset;

                    if (this.isBombSpotClear(x, y, 130)) {
                        placed = true;
                        break;
                    }
                }

                if (!placed) {
                    // Skip this slot to avoid overlapping with numbers.
                    this.nextBombSpawnX += Phaser.Math.Between(140, 220);
                    continue;
                }

                // Always ÷2 as per gameplay spec.
                candidate.effect = { type: "divide", value: 2 };
                candidate.text.setText("÷2");

                candidate.x = x;
                candidate.y = y;
                candidate.yOffset = yOffset;
                candidate.active = true;

                candidate.shape.setPosition(x, y);
                candidate.text.setPosition(x, y);
                candidate.sprite?.setPosition(x, y);
                candidate.glow?.setPosition(x, y);

                candidate.shape.setVisible(false);
                candidate.text.setVisible(false);
                candidate.sprite?.setVisible(true);
                candidate.glow?.setVisible(true);
            }

            // Higher quantity throughout the game: smaller gaps.
            this.nextBombSpawnX += Phaser.Math.Between(120, 220);
        }
    }

    getSkyCollisionImpulse(item) {
        const currentVX = this.dollController.velocity.x;
        const currentVY = this.dollController.velocity.y;
        const motion = item.motion || "forward";
        let minForward = 320;
        let xMin = 110;
        let xMax = 210;
        let upMin = 220;
        let upMax = 350;
        let label = "BOOST";

        if (motion === "up_forward") {
            minForward = 340;
            xMin = 130;
            xMax = 230;
            upMin = 250;
            upMax = 390;
            label = "UP BOOST";
        } else if (motion === "burst_up") {
            minForward = 360;
            xMin = 160;
            xMax = 280;
            upMin = 300;
            upMax = 460;
            label = "BURST";
        } else if (motion === "forward") {
            minForward = 340;
            xMin = 140;
            xMax = 240;
            upMin = 200;
            upMax = 320;
            label = "FORWARD";
        } else if (motion === "backward") {
            minForward = 300;
            xMin = 90;
            xMax = 170;
            // Minus hits should drop flight trajectory, not bounce upward.
            upMin = 220;
            upMax = 320;
            label = "MINUS DROP";
        } else if (motion === "force_drop" || motion === "downward") {
            // Aggressive downward plunge for hurdles
            minForward = 100;
            xMin = 20;
            xMax = 50;
            upMin = 1050; // Decisively high downward force
            upMax = 1250;
            label = "DROP!";
        }

        const randomForward = Phaser.Math.Between(xMin, xMax);
        const randomUp = Phaser.Math.Between(upMin, upMax);

        // Target a consistent forward speed range instead of adding indefinitely
        // Normalizing speed: Instead of always increasing, we push towards a "sweet spot"
        // This makes the game feel constant and smooth rather than constantly accelerating.
        const targetX = (currentVX * 0.45) + (minForward + randomForward) * 0.55;
        const nextX = Phaser.Math.Clamp(targetX, 420, 560); // Narrower range for "constant" feel

        // Simplified: If label is DROP!, nextY is positive (down)
        const isDownward = (label === "DROP!" || label === "MINUS DROP");
        const nextY = isDownward
            ? (
                label === "MINUS DROP"
                    ? Phaser.Math.Clamp(randomUp, 320, 720)   // softer downward for -1
                    : Phaser.Math.Clamp(randomUp, 920, 1400)  // explicit downward plunge
            )
            : Phaser.Math.Clamp((-randomUp) + (currentVY * 0.03), -700, -150);

        return { x: nextX, y: nextY, label };
    }

    recycleSkyMultiplier(item, dollX = 0) {
        const cfg = GAME_CONFIG.skyMultipliers;
        if (!cfg?.enabled || !item || !item.shape || !item.text) {
            return;
        }

        const camera = this.scene.cameras.main;
        const cameraRight = (camera?.scrollX ?? 0) + this.scene.scale.width;

        // Use a queue system: always spawn ahead of the current furthest point
        const spawnBase = Math.max(this.nextSkySpawnX, cameraRight + 120);
        const stepX = this.getRandomSkyGap(cfg);
        const spawn = this.findSkySpawnAroundBase(spawnBase + stepX, cfg, item);
        const nextX = spawn.x;
        const nextYOffset = spawn.yOffset;
        this.nextSkySpawnX = nextX + Phaser.Math.Between(6, 26);

        const groundY = this.getGroundY();
        const nodeCfg = this.pickSkyNodeConfig(cfg.pool);

        item.x = nextX;
        item.yOffset = nextYOffset;
        item.y = groundY + nextYOffset;
        item.motion = nodeCfg.motion || "forward";
        item.color = nodeCfg.color ?? 0xfacc15;
        item.bonus = nodeCfg.bonus ?? 0;
        item.penalty = nodeCfg.penalty ?? 0;
        item.variant = nodeCfg.id || "node";
        item.forceX = nodeCfg.forceX ?? 0;
        item.forceY = nodeCfg.forceY ?? -260;
        item.savedEffect = this.calculateNodeEffect(nodeCfg);

        item.shape.setPosition(item.x, item.y);
        item.shape.setVisible(false); // Hide the solid ball

        item.glow?.setPosition(item.x, item.y);
        item.glow?.setVisible(false);
        item.text.setPosition(item.x, item.y);
        const rawLabel = String(nodeCfg.label || "x2").trim().toLowerCase();
        const isMultiplier = rawLabel.includes("x");

        // Keep the same number style throughout gameplay (no random restyling over time)
        const mainColor = isMultiplier ? "#fff200" : "#ffffff";
        const strokeColor = isMultiplier ? "#a16207" : "#000000";

        item.text.setText(nodeCfg.label || "x2");
        item.text.setStyle({
            fontFamily: '"Luckiest Guy", cursive',
            fontSize: "48px",
            color: mainColor,
            stroke: strokeColor,
            strokeThickness: 2,
            shadow: {
                offsetX: 4,
                offsetY: 4,
                color: strokeColor,
                blur: 0,
                stroke: true,
                fill: true
            }
        });
        item.extraGlow?.setVisible(false);
        item.text.setScale(1);
        item.text.setAlpha(1);
        item.text.setVisible(true);
        item.text.setDepth(28);

        // Keep numbers static (no floating/pulsing motion)
        if (item.pulseTween) {
            item.pulseTween.stop();
            item.pulseTween = null;
        }

        item.active = true;
    }

    maintainHazardStream(dollX) {
        // Requirement: don't spawn ground obstacles until the doll is actually rolling on the ground.
        const groundY = this.getGroundY();
        const collisionThreshold = groundY - (GAME_CONFIG.doll.collisionYOffsetFromGround ?? 10);
        const isOnGround = (this.dollController?.position?.y ?? 0) >= (collisionThreshold - 1);
        const isRolling = isOnGround && Math.abs(this.dollController?.velocity?.x ?? 0) > 60;
        if (!isRolling) {
            return;
        }

        const camera = this.scene.cameras.main;
        const cameraLeft = camera?.scrollX ?? 0;
        const cameraRight = cameraLeft + this.scene.scale.width;
        
        // 1. Despawn far-behind items
        const despawnX = cameraLeft - 400;
        for (let i = 0; i < this.decorationHazards.length; i++) {
            const item = this.decorationHazards[i];
            if (item.active && item.x < despawnX) {
                item.active = false;
                item.shape.setVisible(false);
                item.text.setVisible(false);
            }
        }

        // 2. Procedural Spawning (random): sometimes spawn nothing.
        // Trigger by distance travelled, but *position* the obstacle on the right side of the viewport.
        if (dollX < this.nextHazardSpawnX) return;

        // Chance to spawn an obstacle this time (otherwise "nothing" spawns).
        const spawnChance = 0.92;
        const shouldSpawn = Math.random() < spawnChance;

        if (shouldSpawn) {
            // Find an inactive item from the pool
            let candidate = null;
            for (let i = 0; i < this.decorationHazards.length; i++) {
                if (!this.decorationHazards[i].active) {
                    candidate = this.decorationHazards[i];
                    break;
                }
            }

            // If no inactive item, pick the furthest behind (absolute recycle)
            if (!candidate) {
                for (let i = 0; i < this.decorationHazards.length; i++) {
                    const item = this.decorationHazards[i];
                    if (!candidate || item.x < candidate.x) {
                        candidate = item;
                    }
                }
            }

            if (candidate) {
                const viewW = Math.max(1, this.scene.scale.width);
                // Spawn only at the right corner.
                const rightCornerX = cameraRight - Math.round(viewW * 0.08);
                const spawnX = Math.max(dollX + 240, rightCornerX);
                this.placeHazardProcedural(candidate, spawnX);
            }
        }

        // Next trigger distance: random gaps so it doesn't feel patterned.
        this.nextHazardSpawnX = dollX + Phaser.Math.Between(820, 1650);
    }

    placeHazardProcedural(item, x) {
        // NOTE: Cats removed from the game.
        // Road colliders: trafficcone/roadblocker/hole.
        const variants = ["trafficcone", "roadblocker", "hole"];
        const weights = [45, 35, 20]; // 100 total (more variety)
        let roll = Phaser.Math.Between(1, 100);
        let variant = "trafficcone";
        
        for (let i = 0; i < variants.length; i++) {
            roll -= weights[i];
            if (roll <= 0) {
                variant = variants[i];
                break;
            }
        }

        const visual = this.getHazardVisual(variant);
        const groundY = this.getGroundY();
        
        item.variant = variant;
        item.isHole = (variant === "hole");
        item.x = x;
        
        if (variant === "hole" || variant === "trafficcone" || variant === "roadblocker") {
            const yCfg = GAME_CONFIG.roadObstacleY || {};
            const offset =
                variant === "hole" ? (yCfg.hole ?? 10)
                : variant === "trafficcone" ? (yCfg.trafficcone ?? 34)
                : (yCfg.roadblocker ?? 34);
            item.y = groundY + offset;
        } else {
            const layout = this.scene.getViewportLayout?.();
            const sidewalkOffset = layout?.isMobile ? 130 : 34;
            item.y = groundY - sidewalkOffset;
        }

        item.hasCollided = false;
        item.active = true;

        // Visual update
        item.width = visual.width;
        item.height = visual.height;
        item.shape.setTexture(visual.texture);
        item.shape.setPosition(item.x, item.y);
        
        const scaleX = visual.width / item.shape.width;
        const scaleY = visual.height / item.shape.height;
        item.shape.setScale(Math.min(scaleX, scaleY));

        item.text.setText(variant.toUpperCase());
        item.text.setPosition(item.x, item.y - (visual.height || 0));
        
        item.shape.setVisible(true);
        item.text.setVisible(false);
        
        const isRoadItem = (variant === "hole" || variant === "trafficcone" || variant === "roadblocker");
        const depth = isRoadItem ? 29 : 25;
        item.shape.setDepth(depth);
        item.text.setDepth(depth + 1);
    }

    maintainSkyMultiplierStream(dollX = 0) {
        if (!this.skyMultipliers.length) {
            return;
        }

        const camera = this.scene.cameras.main;
        const cameraLeft = camera?.scrollX ?? 0;
        const despawnX = cameraLeft - 220;

        for (let i = 0; i < this.skyMultipliers.length; i++) {
            const item = this.skyMultipliers[i];
            if (!item?.active) continue;

            if (item.x < despawnX) {
                this.recycleSkyMultiplier(item, dollX);
            }
        }

        // Keep a random but continuous stream ahead.
        const nearAheadMinX = dollX - 140;
        const nearAheadMaxX = dollX + 760;
        let aheadCount = 0;

        for (let i = 0; i < this.skyMultipliers.length; i++) {
            const item = this.skyMultipliers[i];
            if (!item?.active) continue;
            if (item.x >= nearAheadMinX && item.x <= nearAheadMaxX) {
                aheadCount += 1;
            }
        }

        const requiredAhead = 6;
        if (aheadCount >= requiredAhead) {
            return;
        }

        const needed = requiredAhead - aheadCount;
        for (let n = 0; n < needed; n++) {
            let bestCandidate = null;
            for (let i = 0; i < this.skyMultipliers.length; i++) {
                const item = this.skyMultipliers[i];
                if (!item?.active) continue;
                if (item.x < nearAheadMinX) {
                    if (!bestCandidate || item.x < bestCandidate.x) {
                        bestCandidate = item;
                    }
                }
            }

            if (!bestCandidate) {
                break;
            }

            this.recycleSkyMultiplier(bestCandidate, dollX);
        }
    }

    findRandomSkySpawnPosition(range, excludeItem = null) {
        const cfg = GAME_CONFIG.skyMultipliers || {};
        const minYOffset = cfg.minYOffset ?? -360;
        const maxYOffset = cfg.maxYOffset ?? -120;
        const minX = Math.round(Math.min(range.minX, range.maxX));
        const maxX = Math.round(Math.max(range.minX, range.maxX));
        const groundY = this.getGroundY();
        const fallbackY = range.fallbackY ?? (groundY - 220);
        const targetYOffset = Phaser.Math.Clamp(fallbackY - groundY, minYOffset, maxYOffset);

        let fallback = {
            x: Phaser.Math.Between(minX, maxX),
            yOffset: Phaser.Math.Clamp(
                Math.round(targetYOffset + Phaser.Math.Between(-100, 100)),
                minYOffset,
                maxYOffset
            )
        };

        for (let i = 0; i < 30; i++) {
            const x = Phaser.Math.Between(minX, maxX);
            const yOffset = Phaser.Math.Clamp(
                Math.round(targetYOffset + Phaser.Math.Between(-100, 100)),
                minYOffset,
                maxYOffset
            );
            const y = groundY + yOffset;
            fallback = { x, yOffset };

            if (this.isSkyPositionFree(x, y, excludeItem)) {
                return fallback;
            }
        }

        return fallback;
    }

    isSkyPositionFree(x, y, excludeItem = null) {
        const cfg = GAME_CONFIG.skyMultipliers || {};
        const nodeRadius = cfg.nodeRadius ?? 20;
        const candidateHalfW = Math.max(24, nodeRadius + 16);
        const candidateHalfH = Math.max(20, nodeRadius + 12);
        const minGap = 10; // slightly bigger gap; strict no-overlap

        for (let i = 0; i < this.skyMultipliers.length; i++) {
            const item = this.skyMultipliers[i];
            if (!item || !item.active || item === excludeItem) continue;

            const dx = item.x - x;
            const dy = item.y - y;

            const itemHalfW = Math.max(
                candidateHalfW,
                ((item.text?.displayWidth ?? 0) * 0.5) + 2
            );
            const itemHalfH = Math.max(
                candidateHalfH,
                ((item.text?.displayHeight ?? 0) * 0.5) + 2
            );

            const overlapX = Math.abs(dx) < (candidateHalfW + itemHalfW + minGap);
            const overlapY = Math.abs(dy) < (candidateHalfH + itemHalfH + minGap);

            if (overlapX && overlapY) {
                return false;
            }
        }

        return true;
    }

    calculateNodeEffect(nodeCfg) {
        const label = String(nodeCfg.label || "").toLowerCase();
        if (label.startsWith("x")) {
            return { type: "multiply", value: Number.parseFloat(label.slice(1)) || 2 };
        }
        if (label.startsWith("+")) {
            return { type: "add", value: Number.parseFloat(label.slice(1)) || 1 };
        }
        if (label.startsWith("-")) {
            return { type: "subtract", value: Number.parseFloat(label.slice(1)) || 1 };
        }
        if (nodeCfg.bonus) return { type: "add", value: nodeCfg.bonus };
        if (nodeCfg.penalty) return { type: "subtract", value: nodeCfg.penalty };
        return { type: "add", value: 1 };
    }

    getSkyMultiplierEffect(item) {
        // Guaranteed deterministic effect lookup
        if (item.savedEffect) {
            return item.savedEffect;
        }

        const rawLabel = String(item?.text?.text || "").trim().toLowerCase();

        if (rawLabel.startsWith("x")) {
            const factor = Number.parseFloat(rawLabel.slice(1));
            if (Number.isFinite(factor) && factor > 0) {
                return { type: "multiply", value: factor };
            }
        }

        if (rawLabel.startsWith("+")) {
            const add = Number.parseFloat(rawLabel.slice(1));
            if (Number.isFinite(add) && add > 0) {
                return { type: "add", value: add };
            }
        }

        if (rawLabel.startsWith("-")) {
            const subtract = Number.parseFloat(rawLabel.slice(1));
            if (Number.isFinite(subtract) && subtract > 0) {
                return { type: "subtract", value: subtract };
            }
        }

        if (item.bonus > 0) {
            return { type: "add", value: item.bonus };
        }

        if (item.penalty > 0 || rawLabel.includes("drop") || rawLabel.includes("-")) {
            const val = item.penalty || 1;
            return { type: "subtract", value: val };
        }

        return { type: "add", value: item.bonus || 1 };
    }

    getScaledSkyFactor(value, isBonus) {
        const safeValue = Math.max(0, Number(value) || 0);
        const scale = isBonus
            ? (this.volatilityTuning.bonusMultiplier ?? 1)
            : (this.volatilityTuning.penaltyMultiplier ?? 1);

        return Number((safeValue * scale).toFixed(2));
    }

    spawnImpactParticles(type, x, y) {
        if (type === "pickup") {
            for (let i = 0; i < 5; i++) {
                const star = this.scene.add.text(x, y, "*", {
                    fontSize: "18px",
                    color: "#fde047"
                }).setOrigin(0.5);
                const targetX = x + Phaser.Math.Between(-30, 30);
                const targetY = y + Phaser.Math.Between(-36, -12);

                this.scene.tweens.add({
                    targets: star,
                    x: targetX,
                    y: targetY,
                    alpha: 0,
                    duration: 320,
                    ease: "Quad.easeOut",
                    onComplete: () => star.destroy()
                });
            }
            return;
        }

        if (type === "bomb") {
            const ring = this.scene.add.circle(x, y, 16, 0xef4444, 0.55);
            this.scene.tweens.add({
                targets: ring,
                radius: 72,
                alpha: 0,
                duration: 260,
                ease: "Quad.easeOut",
                onComplete: () => ring.destroy()
            });
            for (let i = 0; i < 10; i++) {
                const p = this.scene.add.circle(x, y, Phaser.Math.Between(2, 5), 0xfca5a5, 0.9);
                const targetX = x + Phaser.Math.Between(-90, 90);
                const targetY = y + Phaser.Math.Between(-80, 60);
                this.scene.tweens.add({
                    targets: p,
                    x: targetX,
                    y: targetY,
                    alpha: 0,
                    duration: 320,
                    ease: "Quad.easeOut",
                    onComplete: () => p.destroy()
                });
            }
            return;
        }

        if (type === "bat") {
            const slash = this.scene.add.rectangle(x, y, 12, 56, 0x60a5fa, 0.8)
                .setAngle(-26);
            this.scene.tweens.add({
                targets: slash,
                x: x + 48,
                y: y + 30,
                alpha: 0,
                duration: 180,
                ease: "Sine.easeOut",
                onComplete: () => slash.destroy()
            });
            return;
        }

        if (type === "hazard") {
            for (let i = 0; i < 4; i++) {
                const star = this.scene.add.text(x, y, "*", {
                    fontSize: "16px",
                    color: "#f8fafc"
                }).setOrigin(0.5);
                const targetX = x + Phaser.Math.Between(-26, 26);
                const targetY = y + Phaser.Math.Between(-34, -6);
                this.scene.tweens.add({
                    targets: star,
                    x: targetX,
                    y: targetY,
                    alpha: 0,
                    duration: 300,
                    ease: "Quad.easeOut",
                    onComplete: () => star.destroy()
                });
            }
        }

        if (type === "sky") {
            const burst = this.scene.add.circle(x, y, 10, 0xfde68a, 0.6);
            this.scene.tweens.add({
                targets: burst,
                radius: 60,
                alpha: 0,
                duration: 260,
                ease: "Quad.easeOut",
                onComplete: () => burst.destroy()
            });
        }

        // Colored glow on multiplier hit (reference-like round burst + sparkles)
        if (type === "sky_plus" || type === "sky_x" || type === "sky_minus") {
            const color =
                type === "sky_plus" ? 0x22c55e :   // green
                type === "sky_x" ? 0xfacc15 :      // yellow (more solid)
                0xdc2626;                          // red (more solid)

            // Make it clearly visible at the exact collision point
            const ring = this.scene.add.circle(x, y, 14, color, 0.78).setDepth(900);
            const ring2 = this.scene.add.circle(x, y, 11, color, 0.52).setDepth(899);
            const core = this.scene.add.circle(x, y, 8, color, 0.98).setDepth(901);

            this.scene.tweens.add({
                targets: [ring, ring2],
                radius: 72,
                alpha: 0,
                duration: 680,
                ease: "Quad.easeOut",
                onComplete: () => {
                    ring.destroy();
                    ring2.destroy();
                }
            });
            this.scene.tweens.add({
                targets: core,
                radius: 30,
                alpha: 0,
                duration: 640,
                ease: "Quad.easeOut",
                onComplete: () => core.destroy()
            });

            // Sparkle burst (like reference stars)
            const sparkleColor =
                type === "sky_plus" ? "#4ade80" :
                type === "sky_x" ? "#fde047" :
                "#fb7185";

            for (let i = 0; i < 10; i++) {
                const star = this.scene.add.text(x, y, "✦", {
                    fontSize: `${Phaser.Math.Between(16, 26)}px`,
                    color: sparkleColor
                }).setOrigin(0.5).setDepth(902);

                const targetX = x + Phaser.Math.Between(-110, 110);
                const targetY = y + Phaser.Math.Between(-90, 90);
                const spin = Phaser.Math.Between(-180, 180);

                this.scene.tweens.add({
                    targets: star,
                    x: targetX,
                    y: targetY,
                    angle: spin,
                    alpha: 0,
                    scale: 0.6,
                    duration: Phaser.Math.Between(700, 980),
                    ease: "Quad.easeOut",
                    onComplete: () => star.destroy()
                });
            }
            return;
        }
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

    applyRandomCollisionImpulse(type = "default") {
        if (!this.dollController?.applyImpulse) {
            return;
        }

        const currentVX = this.dollController.velocity.x || 0;
        const currentVY = this.dollController.velocity.y || 0;

        // Base physics values
        let forwardMin = 240;
        let extraForwardMin = 70;
        let extraForwardMax = 150;
        let upMin = 120;
        let upMax = 240;

        if (type === "hazard") {
            forwardMin = 220;
            extraForwardMin = 40;
            extraForwardMax = 100;
            upMin = 80;
            upMax = 160;
        } else if (type === "sky") {
            forwardMin = 290;
            extraForwardMin = 100;
            extraForwardMax = 200;
            upMin = 160;
            upMax = 300;
        }

        const randomForward = Phaser.Math.Between(extraForwardMin, extraForwardMax);
        const randomUp = Phaser.Math.Between(upMin, upMax);
        const isHazard = (type === "hazard");

        const nextX = isHazard 
            ? currentVX * 0.9 // Keep 90% of forward speed instead of resetting
            : Phaser.Math.Clamp(Math.max(currentVX, forwardMin) + randomForward, 220, 920);
        
        // If it's a hazard hit, force a VERY subtle downward nudge
        const nextY = isHazard 
            ? Phaser.Math.Between(80, 140) // Substantially softer downward nudge
            : Phaser.Math.Clamp((-randomUp) + (currentVY * 0.1), -720, -80);

        // Ground pickups never force a drop, they always boost or maintain speed
        this.dollController.applyImpulse(nextX, nextY, isHazard);
    }

    clampMultiplier(value) {
        const rounded = Number((value ?? 1).toFixed(2));
        return Phaser.Math.Clamp(rounded, 1, this.maxMultiplier);
    }

    getDollCircleRadius() {
        const doll = this.dollController?.doll;
        const w = doll?.displayWidth || 120;
        const h = doll?.displayHeight || 120;
        // Small core circle for pickups/numbers to avoid "far" triggers.
        return Math.max(14, Math.min(24, Math.min(w, h) * 0.16));
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

    checkCircleCollisionsSwept(items, prevX, prevY, nextX, nextY, dollRadius, callback) {
        const ax = prevX;
        const ay = prevY;
        const bx = nextX;
        const by = nextY;
        const abx = bx - ax;
        const aby = by - ay;
        const abLenSq = (abx * abx) + (aby * aby);

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item?.active) continue;

            const r = (dollRadius + (item.radius ?? 0));
            const px = item.x;
            const py = item.y;

            // If doll didn't move, fall back to normal check
            if (abLenSq <= 0.000001) {
                const dist = Phaser.Math.Distance.Between(nextX, nextY, px, py);
                if (dist <= r) callback(item);
                continue;
            }

            // Project point onto segment AB
            const apx = px - ax;
            const apy = py - ay;
            let t = ((apx * abx) + (apy * aby)) / abLenSq;
            t = Phaser.Math.Clamp(t, 0, 1);
            const cx = ax + (abx * t);
            const cy = ay + (aby * t);

            const dist = Phaser.Math.Distance.Between(cx, cy, px, py);
            if (dist <= r) {
                callback(item);
            }
        }
    }

    findBestCircleHitSwept(items, prevX, prevY, nextX, nextY, dollRadius) {
        const ax = prevX;
        const ay = prevY;
        const bx = nextX;
        const by = nextY;
        const abx = bx - ax;
        const aby = by - ay;
        const abLenSq = (abx * abx) + (aby * aby);

        let bestItem = null;
        let bestDist = Infinity;
        let bestT = Infinity;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item?.active) continue;

            const r = (dollRadius + (item.radius ?? 0));
            const px = item.x;
            const py = item.y;

            // If doll didn't move, fall back to point distance
            if (abLenSq <= 0.000001) {
                const dist = Phaser.Math.Distance.Between(nextX, nextY, px, py);
                if (dist <= r && dist < bestDist) {
                    bestDist = dist;
                    bestT = 0;
                    bestItem = item;
                }
                continue;
            }

            const apx = px - ax;
            const apy = py - ay;
            let t = ((apx * abx) + (apy * aby)) / abLenSq;
            t = Phaser.Math.Clamp(t, 0, 1);
            const cx = ax + (abx * t);
            const cy = ay + (aby * t);
            const dist = Phaser.Math.Distance.Between(cx, cy, px, py);

            if (dist <= r) {
                // Prefer closest to path; tie-break by earliest along the segment.
                if (dist < bestDist - 0.001 || (Math.abs(dist - bestDist) <= 0.001 && t < bestT)) {
                    bestDist = dist;
                    bestT = t;
                    bestItem = item;
                }
            }
        }

        return bestItem;
    }

    isBombSpotClear(x, y, minDist = 120) {
        const minDistSq = minDist * minDist;
        const checkLists = [this.skyMultipliers, this.pickups, this.bombs];

        for (let l = 0; l < checkLists.length; l++) {
            const items = checkLists[l];
            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                if (!it?.active) continue;
                if (it.x == null || it.y == null) continue;
                // Don't compare with itself; caller handles candidate being inactive before spawn.
                const dx = (x - it.x);
                const dy = (y - it.y);
                if ((dx * dx) + (dy * dy) < minDistSq) {
                    return false;
                }
            }
        }
        return true;
    }

    checkRectCollisions(items, dollX, dollY, dollHalfW, dollHalfH, callback) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.active || item.hasCollided) continue;

            const originY = item.shape?.originY ?? 0.5;
            
            // Professional obstacle hitboxes: tighter and grounded.
            const isTall = (item.variant === "tree" || item.variant === "lamp_post" || item.variant === "pole");
            const isHole = (item.variant === "hole");
            const isWater = (item.variant === "water");
            const isRoadBlock = (item.variant === "trafficcone" || item.variant === "roadblocker");
            
            const wFactor = isHole ? 0.42 : (isTall ? 0.36 : (isWater ? 0.70 : (isRoadBlock ? 0.55 : 0.62)));
            const hFactor = isHole ? 0.42 : (isTall ? 0.92 : (isWater ? 0.52 : (isRoadBlock ? 0.55 : 0.66)));

            const itemHalfW = (item.width * wFactor) * 0.5;
            const itemHalfH = (item.height * hFactor) * 0.5;

            const left = item.x - itemHalfW;
            const right = item.x + itemHalfW;
            const top = item.y - item.height * originY + (item.height * (1 - hFactor) * 0.5);
            const bottom = item.y + item.height * (1 - originY) - (item.height * (1 - hFactor) * 0.5);

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

    // Swept AABB collision to prevent "miss" at high speed (landing/rolling into road obstacles).
    // Returns the first hit item (closest along the swept path), or null.
    findBestRectHitSwept(items, x0, y0, x1, y1, dollHalfW, dollHalfH, filterFn = null) {
        let bestItem = null;
        let bestT = Infinity;

        const dx = x1 - x0;
        const dy = y1 - y0;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.active || item.hasCollided) continue;
            if (filterFn && !filterFn(item)) continue;

            const originY = item.shape?.originY ?? 0.5;

            const isTall = (item.variant === "tree" || item.variant === "lamp_post" || item.variant === "pole");
            const isHole = (item.variant === "hole");
            const isWater = (item.variant === "water");
            const isRoadBlock = (item.variant === "trafficcone" || item.variant === "roadblocker");

            const wFactor = isHole ? 0.42 : (isTall ? 0.36 : (isWater ? 0.70 : (isRoadBlock ? 0.55 : 0.62)));
            const hFactor = isHole ? 0.42 : (isTall ? 0.92 : (isWater ? 0.52 : (isRoadBlock ? 0.55 : 0.66)));

            const itemHalfW = (item.width * wFactor) * 0.5;
            const itemHalfH = (item.height * hFactor) * 0.5;

            const left = item.x - itemHalfW;
            const right = item.x + itemHalfW;
            const top = item.y - item.height * originY + (item.height * (1 - hFactor) * 0.5);
            const bottom = item.y + item.height * (1 - originY) - (item.height * (1 - hFactor) * 0.5);

            // Expand obstacle AABB by doll extents (Minkowski sum) and raycast point through it.
            const exLeft = left - dollHalfW;
            const exRight = right + dollHalfW;
            const exTop = top - dollHalfH;
            const exBottom = bottom + dollHalfH;

            let tEnter = 0;
            let tExit = 1;

            if (Math.abs(dx) < 1e-6) {
                if (x0 < exLeft || x0 > exRight) continue;
            } else {
                const invDx = 1 / dx;
                let tx1 = (exLeft - x0) * invDx;
                let tx2 = (exRight - x0) * invDx;
                if (tx1 > tx2) [tx1, tx2] = [tx2, tx1];
                tEnter = Math.max(tEnter, tx1);
                tExit = Math.min(tExit, tx2);
                if (tEnter > tExit) continue;
            }

            if (Math.abs(dy) < 1e-6) {
                if (y0 < exTop || y0 > exBottom) continue;
            } else {
                const invDy = 1 / dy;
                let ty1 = (exTop - y0) * invDy;
                let ty2 = (exBottom - y0) * invDy;
                if (ty1 > ty2) [ty1, ty2] = [ty2, ty1];
                tEnter = Math.max(tEnter, ty1);
                tExit = Math.min(tExit, ty2);
                if (tEnter > tExit) continue;
            }

            if (tEnter >= 0 && tEnter <= 1 && tEnter < bestT) {
                bestT = tEnter;
                bestItem = item;
            }
        }

        return bestItem;
    }

    consumeObject(item) {
        item.active = false;
        item.shape.setVisible(false);
        item.glow?.setVisible(false);
        item.extraGlow?.setVisible(false);
        item.text.setVisible(false);
        item.sprite?.setVisible(false);
    }

    setObjectsActive(items, isActive) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            item.active = isActive;
            
            // Hazards should be visible if active.
            // Pickups/Multipliers keep the "shape" (box/circle) hidden to favor numbers-only style.
            if (item.type === "hazard" || item.type === "bat") {
                item.shape.setVisible(isActive);
            } else {
                item.shape.setVisible(false);
            }

            item.glow?.setVisible(isActive && item.type === "bomb"); 
            item.extraGlow?.setVisible(false);
            item.text.setVisible(isActive && item.type !== "bomb" && item.type !== "hazard" && item.type !== "bat");
            item.sprite?.setVisible(isActive && item.type === "bomb");

            item.shape.setScale(item.type === "hazard" ? item.shape.scale : 1);
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

    showFloatingText(x, y, value, color) {
        // Redesigned to use the doll's score stack for a "stacked" effect without much gap,
        // matching the reference game's style.
        this.dollController?.addScoreItem?.(value, color);
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
        const layout = this.scene.getViewportLayout?.();
        const sidewalkOffset = layout?.isMobile ? 130 : 34;

        for (let i = 0; i < this.allItems.length; i++) {
            const item = this.allItems[i];
            
            if (item.isGroundObject) {
                if (item.isHole) {
                    item.y = groundY + 4;
                } else {
                    item.y = groundY - sidewalkOffset; // Sidewalk/grass level (mobile-safe)
                }
            } else {
                item.y = groundY + item.yOffset;
            }

            item.shape.y = item.y;
            item.text.y = item.y - (item.height || 0);
        }
    }

    clearAll() {
        for (let i = 0; i < this.allItems.length; i++) {
            this.allItems[i].shape?.destroy();
            this.allItems[i].glow?.destroy();
            this.allItems[i].extraGlow?.destroy();
            this.allItems[i].text?.destroy();
            this.allItems[i].sprite?.destroy();
        }

        this.pickups.length = 0;
        this.bombs.length = 0;
        this.hazards.length = 0;
        this.bats.length = 0;
        this.skyMultipliers.length = 0;
        this.decorationHazards.length = 0;
        this.proceduralBombs.length = 0;
        this.allItems.length = 0;
        this.activePatternId = "";
    }

    destroy() {
        this.clearAll();
    }
}