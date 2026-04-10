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
        this.nextHazardSpawnX = 1e9;
        this.roadObstacleStreamUnlocked = false;
        this.decorationHazards = []; // Pool for scenery-based hazards
        this.proceduralBombs = [];
        this.nextBombSpawnX = 900;
        this.proceduralBats = [];
        this.nextBatSpawnX = 900;
        this.prevDollX = null;
        this.prevDollY = null;

        // Debug overlay/logging for air-lane (+1/x/-1) hits.
        this.airHitDebugGfx = null;
    }

    create() {
        this.reset();
    }

    getAirHitDebugCfg() {
        return GAME_CONFIG.debug?.airHitDebug || {};
    }

    ensureAirHitDebugGfx() {
        if (this.airHitDebugGfx) return this.airHitDebugGfx;
        this.airHitDebugGfx = this.scene.add.graphics();
        this.airHitDebugGfx.setDepth(9999);
        this.airHitDebugGfx.setScrollFactor(1, 1);
        return this.airHitDebugGfx;
    }

    clearAirHitDebugOverlay() {
        if (this.airHitDebugGfx) this.airHitDebugGfx.clear();
    }

    isAirHitSuspicious(item) {
        const cfg = this.getAirHitDebugCfg();
        const alphaTh = Number(cfg.suspiciousAlphaThreshold ?? 0.05);
        const text = item?.text;
        if (!text) return true;
        if (!text.visible) return true;
        if ((Number(text.alpha) || 0) <= alphaTh) return true;

        const cam = this.scene.cameras?.main;
        if (!cam) return false;
        const b = text.getBounds?.();
        if (!b) return false;
        const rect = new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
        return !Phaser.Geom.Intersects.RectangleToRectangle(cam.worldView, rect);
    }

    debugAirHit(kind, item, prevX, prevY, hitX, hitY, dollRadius) {
        const cfg = this.getAirHitDebugCfg();
        if (!cfg?.enabled) return;

        const suspicious = this.isAirHitSuspicious(item);
        const cam = this.scene.cameras?.main;
        const view = cam?.worldView;
        const text = item?.text;
        const b = text?.getBounds?.();

        if (cfg.logToConsole) {
            const payload = {
                kind,
                label: String(text?.text || "").trim(),
                itemType: item?.type,
                itemVariant: item?.variant,
                suspicious,
                doll: { prevX, prevY, hitX, hitY, r: dollRadius },
                item: {
                    x: item?.x,
                    y: item?.y,
                    textX: text?.x,
                    textY: text?.y,
                    visible: !!text?.visible,
                    alpha: Number(text?.alpha ?? 1)
                },
                bounds: b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null,
                camera: cam ? { x: cam.scrollX, y: cam.scrollY, w: cam.width, h: cam.height } : null,
                view: view ? { x: view.x, y: view.y, w: view.width, h: view.height } : null
            };
            console.log("[AirHitDebug]", payload);
        }

        if (cfg.drawOverlay) {
            const g = this.ensureAirHitDebugGfx();
            g.clear();
            g.lineStyle(3, suspicious ? 0xff0000 : 0x22c55e, 0.95);
            g.strokeCircle(hitX, hitY, Math.max(6, Number(dollRadius) || 18));
            g.lineStyle(2, 0x60a5fa, 0.75);
            g.strokeCircle(prevX, prevY, 6);
            g.lineBetween(prevX, prevY, hitX, hitY);
            if (b) {
                g.lineStyle(3, 0xfacc15, 0.95);
                g.strokeRect(b.x, b.y, b.width, b.height);
            }
            if (view) {
                g.lineStyle(2, 0xffffff, 0.35);
                g.strokeRect(view.x, view.y, view.width, view.height);
            }
        }

        if (cfg.pauseOnSuspiciousHit && suspicious) {
            this.scene.gameStateManager?.pause?.("debug_air_hit");
        }
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
                item.deferredUntilRolling = false;
                this.hazards.push(item);
            } else if (itemData.type === "bat") {
                item = this.createBatObject(x, y, yOffset, itemData);
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
        this.initBatStream(groundY);
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
        // Always anchor to the *current* camera (do not Math.max with stale world X after replay).
        const layout = this.scene.getViewportLayout?.();
        const isMobile = layout?.isMobile ?? (this.scene.scale?.width ?? 0) < 900;
        this.nextBombSpawnX = Math.max(skyStartX + 120, cameraRight + (isMobile ? 560 : 260));
    }

    initBatStream(groundY) {
        const batCfg = GAME_CONFIG.bat || {};
        const sc = batCfg.stream || {};
        const poolCount = sc.poolCount ?? 90;

        if (!this.proceduralBats.length) {
            for (let i = 0; i < poolCount; i++) {
                const item = this.createBatObject(
                    -600,
                    groundY - 220,
                    -220,
                    { proceduralPool: true, label: "" }
                );
                item.active = false;
                item.hasCollided = false;
                item.shape.setVisible(false);
                item.text.setVisible(false);
                this.proceduralBats.push(item);
                this.bats.push(item);
                this.allItems.push(item);
            }
        }

        const basePhase = sc.spawnPhaseOffsetX ?? 180;
        const phase = basePhase + Phaser.Math.Between(-140, 160);
        // Phase-shift from bomb cursor + per-round jitter so bats don’t line up with bombs.
        this.nextBatSpawnX = this.nextBombSpawnX + phase;
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
        const skyCfg = GAME_CONFIG.skyMultipliers || {};
        const hitRadius = skyCfg.hitRadius ?? Math.round(radius * 0.65);
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
        // Above bat obstacle sprites (~35) so numbers never paint under the bat if edges align.
        text.setDepth(48);

        const item = {
            type: "sky_multiplier",
            variant: nodeCfg.id || "node",
            x,
            y,
            yOffset,
            radius,
            hitRadius,
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

    createBatObject(x, y, yOffset, itemData = {}) {
        const batCfg = GAME_CONFIG.bat || {};
        const proceduralPool = !!itemData.proceduralPool;
        const streamMax = batCfg.streamTargetMaxPx;
        const tw = proceduralPool && typeof streamMax === "number"
            ? streamMax
            : (batCfg.displayWidth ?? 112);
        const th = proceduralPool && typeof streamMax === "number"
            ? streamMax
            : (batCfg.displayHeight ?? 76);
        const keys = [
            batCfg.wingTextureUp || "bat_wing_up",
            batCfg.wingTextureMid || "bat_wing_mid",
            batCfg.wingTextureDown || "bat_wing_down"
        ];

        const text = this.scene.add.text(x, y, itemData?.label || "", {
            fontFamily: '"Bubblegum Sans", cursive',
            fontSize: "42px",
            color: "#ffffff"
        }).setOrigin(0.5).setDepth(36).setVisible(false);

        let shape;
        let batBaseScale = 1;
        if (this.scene.textures.exists(keys[0])) {
            shape = this.scene.add.image(x, y, keys[0]).setOrigin(0.5, 0.5).setDepth(35);
            batBaseScale = Math.min(tw / shape.width, th / shape.height);
            shape.setScale(batBaseScale);
            // HD bat: smooth sub-pixel motion (filtering is set on textures in PreloadScene).
            if (typeof shape.setRoundPixels === "function") {
                shape.setRoundPixels(false);
            }
        } else {
            shape = this.scene.add.rectangle(x, y, tw, th, 0x6b21a8).setStrokeStyle(2, 0x312e81).setDepth(35);
        }

        shape.setScrollFactor(1, 1);
        text.setScrollFactor(1, 1);

        return {
            type: "bat",
            x,
            y,
            yOffset,
            width: tw,
            height: th,
            variant: "bat",
            shape,
            text,
            active: true,
            batTextures: keys,
            batAnimMs: Phaser.Math.Between(0, 400),
            batFrameIndex: 0,
            batBaseScale,
            hasCollided: false,
            isProceduralBat: proceduralPool
        };
    }

    updateBatWingAnimations(deltaSeconds) {
        const batCfg = GAME_CONFIG.bat || {};
        const frameMs = Math.max(40, batCfg.wingFrameMs ?? 128);
        for (let i = 0; i < this.bats.length; i++) {
            const item = this.bats[i];
            if (!item?.active || !item.batTextures?.length || !item.shape?.setTexture) {
                continue;
            }
            if (!this.scene.textures.exists(item.batTextures[0])) {
                continue;
            }
            item.batAnimMs = (item.batAnimMs ?? 0) + deltaSeconds * 1000;
            const frame = Math.floor(item.batAnimMs / frameMs) % 3;
            if (frame === item.batFrameIndex) {
                continue;
            }
            item.batFrameIndex = frame;
            const key = item.batTextures[frame];
            if (this.scene.textures.exists(key)) {
                item.shape.setTexture(key);
                const bs = item.batBaseScale ?? 1;
                if (bs !== 1) {
                    item.shape.setScale(bs);
                }
            }
        }
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

        const layout = this.scene.getViewportLayout?.();
        const isMobile = layout?.isMobile ?? (this.scene.scale?.width ?? 0) < 900;
        const minCount = Math.max(1, isMobile ? (cfg.minCount ?? 5) : (cfg.minCountDesktop ?? cfg.minCount ?? 5));
        const maxCount = Math.max(minCount, isMobile ? (cfg.maxCount ?? 8) : (cfg.maxCountDesktop ?? cfg.maxCount ?? 8));
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

        // Never return an unchecked position — scan forward with multiple Y tries per column.
        for (let j = 0; j < 2500; j++) {
            probeX += 10;
            for (let t = 0; t < 14; t++) {
                const yOffset = this.getRandomSkyYOffset(cfg);
                const y = groundY + yOffset;
                if (this.isSkyPositionFree(probeX, y, excludeItem)) {
                    return { x: probeX, yOffset };
                }
            }
        }

        let scanX = probeX + 200;
        for (let k = 0; k < 8000; k++) {
            scanX += 22;
            const yOffset = this.getRandomSkyYOffset(cfg);
            const y = groundY + yOffset;
            if (this.isSkyPositionFree(scanX, y, excludeItem)) {
                return { x: scanX, yOffset };
            }
        }

        return { x: scanX + 400, yOffset: this.getRandomSkyYOffset(cfg) };
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
        // Pool for procedural road colliders; stream starts only after the doll rolls (maintainHazardStream).
        this.nextHazardSpawnX = 1e9;

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
                item.deferredUntilRolling = false;
                item.isProceduralRoadPool = true;
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

        // Road obstacles should spawn throughout the round (no “wait until rolling” gate).
        this.roadObstacleStreamUnlocked = true;
        this.activateDeferredPatternRoadHazards();
        const streamCfg = GAME_CONFIG.encounters?.roadObstacleStream || {};
        // Stream cursor: start a bit ahead of camera so obstacles are already visible before player reaches them.
        const camera = this.scene.cameras.main;
        const cameraRight = (camera?.scrollX ?? 0) + this.scene.scale.width;
        const runway = streamCfg.firstGapAfterRollMin ?? 480;
        this.nextHazardSpawnX = cameraRight + runway;

        // Pre-fill sky numbers from current screen into next screen before movement starts.
        // This prevents the recurring first-travel empty gap on PC.
        this.prefillSkyFirstAndNextScreen();
    }

    prefillSkyFirstAndNextScreen() {
        if (!this.skyMultipliers.length) return;

        const camera = this.scene.cameras.main;
        const cameraLeft = camera?.scrollX ?? 0;
        const width = this.scene.scale?.width ?? 1280;
        const cameraRight = cameraLeft + width;
        const layout = this.scene.getViewportLayout?.();
        const isMobile = layout?.isMobile ?? width < 900;

        // Dense deterministic fill for first→next screen handoff (client critical path).
        const slotSize = isMobile ? 210 : 120;
        const skyCfg = GAME_CONFIG.skyMultipliers || {};
        const startAhead = isMobile
            ? (skyCfg.prefillStartAheadPx ?? 120)
            : (skyCfg.prefillStartAheadPxDesktop ?? skyCfg.prefillStartAheadPx ?? 180);
        const coverMinX = cameraLeft + Math.max(0, startAhead);
        const coverMaxX = cameraRight + width; // full current + full next screen
        const slotHitRadius = slotSize * 0.38;
        const cfg = GAME_CONFIG.skyMultipliers || {};
        const groundY = this.getGroundY();
        const dollX = this.dollController?.position?.x ?? cameraLeft;

        // Keep stream cursor near the prefilled window so next recycles continue seamlessly.
        this.nextSkySpawnX = Math.max(this.nextSkySpawnX, cameraRight + 140);

        const pickFarthestActive = (targetX) => {
            let best = null;
            let bestDist = -1;
            for (let i = 0; i < this.skyMultipliers.length; i++) {
                const it = this.skyMultipliers[i];
                if (!it?.active) continue;
                const d = Math.abs((it.x ?? 0) - targetX);
                if (d > bestDist) {
                    bestDist = d;
                    best = it;
                }
            }
            return best;
        };

        for (let sx = coverMinX; sx <= coverMaxX; sx += slotSize) {
            let occupied = false;
            for (let i = 0; i < this.skyMultipliers.length; i++) {
                const it = this.skyMultipliers[i];
                if (!it?.active) continue;
                if (Math.abs(it.x - sx) <= slotHitRadius) {
                    occupied = true;
                    break;
                }
            }
            if (occupied) continue;

            const candidate = pickFarthestActive(sx);
            if (!candidate) break;

            // Re-roll node type/effects then pin to slot X.
            this.recycleSkyMultiplier(candidate, dollX, sx);

            let placed = false;
            for (let a = 0; a < 24; a++) {
                const yOffset = this.getRandomSkyYOffset(cfg);
                const y = groundY + yOffset;
                if (!this.isSkyPositionFree(sx, y, candidate)) continue;
                candidate.x = sx;
                candidate.yOffset = yOffset;
                candidate.y = y;
                candidate.shape?.setPosition(candidate.x, candidate.y);
                candidate.glow?.setPosition(candidate.x, candidate.y);
                candidate.text?.setPosition(candidate.x, candidate.y);
                placed = true;
                break;
            }

            if (!placed) {
                // Last resort: keep deterministic X coverage even if Y had no perfect free slot.
                candidate.x = sx;
                candidate.shape?.setX(candidate.x);
                candidate.glow?.setX(candidate.x);
                candidate.text?.setX(candidate.x);
            }
        }
    }

    placeSkyCandidateAtX(candidate, targetX, dollX = 0) {
        if (!candidate) return;
        const cfg = GAME_CONFIG.skyMultipliers || {};
        const groundY = this.getGroundY();
        this.recycleSkyMultiplier(candidate, dollX, targetX);

        let placed = false;
        for (let a = 0; a < 24; a++) {
            const yOffset = this.getRandomSkyYOffset(cfg);
            const y = groundY + yOffset;
            if (!this.isSkyPositionFree(targetX, y, candidate)) continue;
            candidate.x = targetX;
            candidate.yOffset = yOffset;
            candidate.y = y;
            candidate.shape?.setPosition(candidate.x, candidate.y);
            candidate.glow?.setPosition(candidate.x, candidate.y);
            candidate.text?.setPosition(candidate.x, candidate.y);
            placed = true;
            break;
        }

        if (!placed) {
            // Keep deterministic X coverage as hard requirement.
            candidate.x = targetX;
            candidate.shape?.setX(candidate.x);
            candidate.glow?.setX(candidate.x);
            candidate.text?.setX(candidate.x);
        }
    }

    enforceSkyContinuousCoverage(dollX = 0) {
        if (!this.skyMultipliers.length) return;

        const camera = this.scene.cameras.main;
        const cameraLeft = camera?.scrollX ?? 0;
        const width = this.scene.scale?.width ?? 1280;
        const cameraRight = cameraLeft + width;
        const layout = this.scene.getViewportLayout?.();
        const isMobile = layout?.isMobile ?? width < 900;

        // Continuous filled belt: visible screen + strong ahead buffer.
        const coverMinX = cameraLeft - (isMobile ? 20 : 40);
        const coverMaxX = cameraRight + (isMobile ? 1500 : 2600);
        const slotSize = isMobile ? 125 : 82;
        const slotHitRadius = slotSize * 0.42;

        const pickFarthestActive = (targetX) => {
            let best = null;
            let bestDist = -1;
            for (let i = 0; i < this.skyMultipliers.length; i++) {
                const it = this.skyMultipliers[i];
                if (!it?.active) continue;
                const d = Math.abs((it.x ?? 0) - targetX);
                if (d > bestDist) {
                    bestDist = d;
                    best = it;
                }
            }
            return best;
        };

        for (let sx = coverMinX; sx <= coverMaxX; sx += slotSize) {
            let occupied = false;
            for (let i = 0; i < this.skyMultipliers.length; i++) {
                const it = this.skyMultipliers[i];
                if (!it?.active) continue;
                if (Math.abs(it.x - sx) <= slotHitRadius) {
                    occupied = true;
                    break;
                }
            }
            if (occupied) continue;

            const candidate = pickFarthestActive(sx);
            if (!candidate) break;
            this.placeSkyCandidateAtX(candidate, Math.round(sx), dollX);
        }
    }

    isRoadColliderVariant(variant) {
        const v = String(variant || "").toLowerCase();
        return v === "hole" || v === "trafficcone" || v === "roadblocker";
    }

    deactivateRoadCollidersUntilRolling() {
        for (let i = 0; i < this.hazards.length; i++) {
            const item = this.hazards[i];
            if (!this.isRoadColliderVariant(item.variant)) {
                continue;
            }
            item.active = false;
            item.hasCollided = false;
            item.shape?.setVisible(false);
            item.text?.setVisible(false);
        }
    }

    activateDeferredPatternRoadHazards() {
        for (let i = 0; i < this.hazards.length; i++) {
            const item = this.hazards[i];
            if (!item.deferredUntilRolling || !this.isRoadColliderVariant(item.variant)) {
                continue;
            }
            item.active = true;
            item.shape?.setVisible(true);
        }
    }

    pickRoadObstacleSpawnKind() {
        const streamCfg = GAME_CONFIG.encounters?.roadObstacleStream || {};
        const layout = this.scene.getViewportLayout?.();
        const isMobile = layout?.isMobile ?? (this.scene.scale?.width ?? 0) < 900;
        const cfg =
            !isMobile && streamCfg.spawnWeightsDesktop
                ? streamCfg.spawnWeightsDesktop
                : streamCfg.spawnWeights || {};
        const entries = [
            ["nothing", Math.max(0, Number(cfg.nothing) || 0)],
            ["hole", Math.max(0, Number(cfg.hole) || 0)],
            ["trafficcone", Math.max(0, Number(cfg.trafficcone) || 0)],
            ["roadblocker", Math.max(0, Number(cfg.roadblocker) || 0)]
        ];
        let total = 0;
        for (let i = 0; i < entries.length; i++) {
            total += entries[i][1];
        }
        if (total <= 0) {
            return "nothing";
        }
        let roll = Phaser.Math.Between(1, total);
        for (let i = 0; i < entries.length; i++) {
            roll -= entries[i][1];
            if (roll <= 0) {
                return entries[i][0];
            }
        }
        return "nothing";
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

        this.updateBatWingAnimations(deltaSeconds);

        const dollX = this.dollController.position.x;
        const dollY = this.dollController.position.y;
        // CRITICAL: InteractionSystem only starts updating when state becomes FLYING.
        // On the very first frame, prevDollX/Y are null, which would zero the sweep and can miss a bat hit.
        // Back-project by current velocity to preserve a valid swept segment on that first frame.
        const vxNow = Number(this.dollController?.velocity?.x) || 0;
        const vyNow = Number(this.dollController?.velocity?.y) || 0;
        const prevDollX = (this.prevDollX ?? (dollX - vxNow * deltaSeconds));
        const prevDollY = (this.prevDollY ?? (dollY - vyNow * deltaSeconds));
        // Sky stream recycle TELEPORTS pooled nodes. If that runs before collision, the swept test
        // uses prev→current doll motion against NEW positions the player never saw (phantom -1 hits).
        // Maintain sky numbers only after this frame's collisions (see end of update + launch-grace early return).
        this.maintainHazardStream(dollX);
        this.maintainBombStream(dollX);
        this.maintainBatStream(dollX);
        this.updateComboTimer(deltaSeconds);

        const dollCircleRadius = this.getDollCircleRadius();

        // Once the doll is on the ground, we don't allow any more "number" collisions
        // (prevents going back up from late sky hits while rolling on the road).
        const groundY = this.getGroundY();
        const collisionThreshold = groundY - (GAME_CONFIG.doll.collisionYOffsetFromGround ?? 10);
        const isOnGroundNow = dollY >= (collisionThreshold - 1);
        const graceMs = Number(this.dollController?.launchGraceRemainingMs) || 0;
        const allowAirCollectibles = graceMs <= 0;

        const dollWTorso = (this.dollController.doll?.displayWidth || 120) * 0.30;
        const dollHTorso = (this.dollController.doll?.displayHeight || 120) * 0.36;

        // Resolve circle collisions using swept "best hit" to avoid wrong/missed hits
        // when multiple nodes are close together.
        const pickupHit = (isOnGroundNow || !allowAirCollectibles)
            ? null
            : this.findBestAirLaneCircleHit(this.pickups, prevDollX, prevDollY, dollX, dollY, dollCircleRadius);
        if (pickupHit) {
            const item = pickupHit;
            this.debugAirHit("pickup", item, prevDollX, prevDollY, dollX, dollY, dollCircleRadius);
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
            const allowAirHazards = graceMs <= 0;
            if (!allowAirHazards) {
                // Keep baseline up to date and skip early hazard hits (prevents rare "kick fail" feeling).
                this.prevDollX = dollX;
                this.prevDollY = dollY;
                this.maintainSkyMultiplierStream(dollX);
                return;
            }
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

            // Bats: must NEVER miss (mobile low-FPS). Use segmented swept AABB with a forgiving circle-based extent.
            const skyCfg = GAME_CONFIG.skyMultipliers || {};
            const maxSeg = skyCfg.maxSweepSegmentPx ?? 46;
            const batPad = 8;
            const batHalf = Math.max(8, dollCircleRadius + batPad);
            const batHit = this.findBestRectHitSweptSegmented(
                this.bats,
                prevDollX,
                prevDollY,
                dollX,
                dollY,
                batHalf,
                batHalf,
                null,
                maxSeg
            );
            if (batHit && !batHit.hasCollided) {
                batHit.hasCollided = true;
                this.resetCombo();
                this.consumeObject(batHit);
                this.popObject(batHit.shape, batHit.text, 0xa855f7);
                // Stop any lingering win stinger before playing hit SFX.
                this.scene.audioManager?.stop?.("sfx_win");
                this.scene.audioManager?.play("sfx_hazard", { volume: 0.55 });
                this.spawnImpactParticles("bat", dollX, dollY);
                const dir = (this.dollController.velocity.x ?? 1) >= 0 ? 1 : -1;
                this.dollController.forceDiveDown?.(dir);
                this.dollController.onGameplayInteraction?.("bomb");
                this.dollController.setTrailTheme?.("minus", 0);
            }
        }



        // Professional collision core:
        // - road obstacles: doll + obstacle factors from GAME_CONFIG.roadObstacleColliders
        const rc = GAME_CONFIG.roadObstacleColliders || {};
        const dw = this.dollController.doll?.displayWidth || 120;
        const dh = this.dollController.doll?.displayHeight || 120;
        const dollWRoad = dw * (rc.dollHalfWidthFactor ?? 0.32);
        const dollHRoad = dh * (rc.dollHalfHeightFactor ?? 0.38);

        // Road obstacles: swept only when moving enough this frame; otherwise swept rays false-trigger on slow roll.
        const roadMoveSq = (dollX - prevDollX) ** 2 + (dollY - prevDollY) ** 2;
        const roadHit =
            roadMoveSq >= 2.25
                ? this.findBestRectHitSwept(
                    this.hazards,
                    prevDollX,
                    prevDollY,
                    dollX,
                    dollY,
                    dollWRoad,
                    dollHRoad,
                    (it) => (it.variant === "hole" || it.variant === "trafficcone" || it.variant === "roadblocker")
                )
                : this.findStaticRoadOverlap(
                    this.hazards,
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
            // Wider band so hole/cone/blocker never "ghost" through due to a missed ground band.
            const nearGround = dollY >= (collisionThreshold - 72);
            const isRollingOnRoad =
                (isOnGround || nearGround) && Math.abs(this.dollController?.velocity?.x ?? 0) > 18;

            // CRITICAL: only set hasCollided after we commit to a real hit.
            // Old code marked collided even when skipping mid-air → pass-through + fake wins.

            const applyRoadFatal = () => {
                item.hasCollided = true;
                this.spawnImpactParticles("hazard", item.x, item.y);
                this.dollController.onGameplayInteraction?.("hazard");
                this.dollController.setTrailTheme?.("minus", 0);
                this.resetCombo();
            };

            if (item.variant === "hole") {
                if (isOnGround || nearGround) {
                    applyRoadFatal();
                    this.dollController.disableTrailsNow?.();
                    this.interactionsEnabled = false;
                    this.scene.audioManager?.play("sfx_hazard", { volume: 0.8 });
                    this.onHazardHit?.(item, true);
                }
            } else if (item.variant === "trafficcone" || item.variant === "roadblocker") {
                // Cone / barricade: on/near ground + horizontal motion (rolling), not mid-air grazes.
                if ((isOnGround || nearGround) && isRollingOnRoad) {
                    applyRoadFatal();
                    this.interactionsEnabled = false;
                    this.scene.audioManager?.play("sfx_hazard", { volume: 0.8 });
                    this.onHazardHit?.(item, true);
                    this.dollController.stopImmediatelyDead?.();
                }
            }
        }

        let bestImpulse = null;
        let hasDrop = false;

        const skyHit = (isOnGroundNow || !allowAirCollectibles)
            ? null
            : this.findBestAirLaneCircleHit(this.skyMultipliers, prevDollX, prevDollY, dollX, dollY, dollCircleRadius);
        if (skyHit) {
            const item = skyHit;
            this.debugAirHit("sky", item, prevDollX, prevDollY, dollX, dollY, dollCircleRadius);
            // CRITICAL: snapshot effect/label/pos BEFORE recycling (recycle mutates text + savedEffect).
            const hitX = item.x;
            const hitY = item.y;
            const skyEffect = this.getSkyMultiplierEffect(item);
            const rawLabelAtHit = String(item?.text?.text || "").trim();
            const isMinus = (skyEffect.type === "subtract") || rawLabelAtHit.startsWith("-");
            if (isMinus) {
                this.resetCombo();
            } else {
                this.addCombo();
            }

            const hitParticleType =
                skyEffect.type === "multiply" ? "sky_x"
                : skyEffect.type === "add" ? "sky_plus"
                : "sky_minus";

            const timeSinceLaunchMs = Number(this.dollController?.elapsedMs) || 0;
            const allowImmediateDrop = timeSinceLaunchMs >= 420;
            // Prevent rare “kick → straight to ground” feeling: in the first ~0.4s after launch,
            // still apply -1 penalty but do not force a hard drop.
            const impulse = (isMinus && allowImmediateDrop)
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

        // Update swept collision baseline, then repopulate sky stream for *next* frame.
        this.prevDollX = dollX;
        this.prevDollY = dollY;
        this.maintainSkyMultiplierStream(dollX);
    }

    isDesktopProceduralAirThreat() {
        const layout = this.scene.getViewportLayout?.();
        return !(layout?.isMobile ?? (this.scene.scale?.width ?? 0) < 900);
    }

    getBombStreamTuning() {
        const cfg = GAME_CONFIG.proceduralBombStream || {};
        const pc = this.isDesktopProceduralAirThreat();
        return {
            gapMin: pc ? (cfg.gapMinDesktop ?? cfg.gapMin ?? 120) : (cfg.gapMin ?? 120),
            gapMax: pc ? (cfg.gapMaxDesktop ?? cfg.gapMax ?? 220) : (cfg.gapMax ?? 220),
            failMin: pc ? (cfg.unablePlaceGapMinDesktop ?? cfg.unablePlaceGapMin ?? 140) : (cfg.unablePlaceGapMin ?? 140),
            failMax: pc ? (cfg.unablePlaceGapMaxDesktop ?? cfg.unablePlaceGapMax ?? 220) : (cfg.unablePlaceGapMax ?? 220),
            fillAhead: pc ? (cfg.fillAheadPxDesktop ?? cfg.fillAheadPx ?? 2200) : (cfg.fillAheadPx ?? 2200),
            thinChance: Math.max(0, Math.min(100, cfg.spawnThinPercent ?? 0)),
            maxSteps: Math.max(4, cfg.maxSpawnStepsPerFrame ?? 22),
            jx0: cfg.xJitterMin ?? -40,
            jx1: cfg.xJitterMax ?? 60
        };
    }

    getBatStreamTuning() {
        const sc = GAME_CONFIG.bat?.stream || {};
        const bombCfg = GAME_CONFIG.proceduralBombStream || {};
        const pc = this.isDesktopProceduralAirThreat();
        return {
            gapMin: pc ? (sc.gapMinDesktop ?? bombCfg.gapMinDesktop ?? sc.gapMin ?? 120) : (sc.gapMin ?? 120),
            gapMax: pc ? (sc.gapMaxDesktop ?? bombCfg.gapMaxDesktop ?? sc.gapMax ?? 220) : (sc.gapMax ?? 220),
            failMin: pc ? (sc.unablePlaceGapMinDesktop ?? bombCfg.unablePlaceGapMinDesktop ?? 140)
                : (sc.unablePlaceGapMin ?? 140),
            failMax: pc ? (sc.unablePlaceGapMaxDesktop ?? bombCfg.unablePlaceGapMaxDesktop ?? 220)
                : (sc.unablePlaceGapMax ?? 220),
            fillAhead: pc ? (sc.fillAheadPxDesktop ?? sc.fillAheadPx ?? bombCfg.fillAheadPxDesktop ?? 2200)
                : (sc.fillAheadPx ?? bombCfg.fillAheadPx ?? 2200),
            thinChance: Math.max(0, Math.min(100, sc.spawnThinPercent ?? 0)),
            maxSteps: Math.max(4, sc.maxSpawnStepsPerFrame ?? 20),
            jx0: sc.xJitterMin ?? -40,
            jx1: sc.xJitterMax ?? 60
        };
    }

    maintainBombStream(dollX = 0) {
        if (!this.proceduralBombs.length) return;

        const bt = this.getBombStreamTuning();
        const camera = this.scene.cameras.main;
        const cameraLeft = camera?.scrollX ?? 0;
        const cameraRight = cameraLeft + this.scene.scale.width;

        // Despawn behind
        const despawnX = cameraLeft - 1200;
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
        const spawnLimitX = cameraRight + bt.fillAhead;
        const groundY = this.getGroundY();
        const skyCfg = GAME_CONFIG.skyMultipliers || {};
        const minYOffset = skyCfg.minYOffset ?? -450;
        const maxYOffset = skyCfg.maxYOffset ?? -180;

        const jx0 = bt.jx0;
        const jx1 = bt.jx1;
        let stepCount = 0;

        while (this.nextBombSpawnX < spawnLimitX && stepCount < bt.maxSteps) {
            stepCount += 1;

            if (bt.thinChance > 0 && Phaser.Math.Between(0, 99) < bt.thinChance) {
                this.nextBombSpawnX += Phaser.Math.Between(bt.gapMin, bt.gapMax);
                continue;
            }

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

                for (let attempt = 0; attempt < 14; attempt++) {
                    yOffset = Phaser.Math.Between(minYOffset, maxYOffset);
                    x = this.nextBombSpawnX + Phaser.Math.Between(jx0, jx1);
                    y = groundY + yOffset;

                    if (this.isBombSpotClear(x, y, "bomb")) {
                        placed = true;
                        break;
                    }
                }

                if (!placed) {
                    // Skip this slot to avoid overlapping with numbers.
                    this.nextBombSpawnX += Phaser.Math.Between(bt.failMin, bt.failMax);
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

            this.nextBombSpawnX += Phaser.Math.Between(bt.gapMin, bt.gapMax);
        }
    }

    maintainBatStream(dollX = 0) {
        if (!this.proceduralBats.length) return;

        const bt = this.getBatStreamTuning();
        const jx0 = bt.jx0;
        const jx1 = bt.jx1;

        const camera = this.scene.cameras.main;
        const cameraLeft = camera?.scrollX ?? 0;
        const cameraRight = cameraLeft + this.scene.scale.width;

        const despawnX = cameraLeft - 1200;
        for (let i = 0; i < this.proceduralBats.length; i++) {
            const item = this.proceduralBats[i];
            if (item.active && item.x < despawnX) {
                item.active = false;
                item.shape.setVisible(false);
                item.text.setVisible(false);
            }
        }

        const spawnLimitX = cameraRight + bt.fillAhead;
        const groundY = this.getGroundY();
        const skyCfg = GAME_CONFIG.skyMultipliers || {};
        const minYOffset = skyCfg.minYOffset ?? -450;
        const maxYOffset = skyCfg.maxYOffset ?? -180;

        let stepCount = 0;

        while (this.nextBatSpawnX < spawnLimitX && stepCount < bt.maxSteps) {
            stepCount += 1;

            if (bt.thinChance > 0 && Phaser.Math.Between(0, 99) < bt.thinChance) {
                this.nextBatSpawnX += Phaser.Math.Between(bt.gapMin, bt.gapMax);
                continue;
            }

            let candidate = null;
            for (let i = 0; i < this.proceduralBats.length; i++) {
                if (!this.proceduralBats[i].active) {
                    candidate = this.proceduralBats[i];
                    break;
                }
            }

            if (!candidate) {
                for (let i = 0; i < this.proceduralBats.length; i++) {
                    const item = this.proceduralBats[i];
                    if (!candidate || item.x < candidate.x) candidate = item;
                }
            }

            if (candidate) {
                let placed = false;
                let x = 0;
                let y = 0;
                let yOffset = 0;

                for (let attempt = 0; attempt < 14; attempt++) {
                    yOffset = Phaser.Math.Between(minYOffset, maxYOffset);
                    x = this.nextBatSpawnX + Phaser.Math.Between(jx0, jx1);
                    y = groundY + yOffset;

                    if (this.isBombSpotClear(x, y, "bat")) {
                        placed = true;
                        break;
                    }
                }

                if (!placed) {
                    this.nextBatSpawnX += Phaser.Math.Between(bt.failMin, bt.failMax);
                    continue;
                }

                candidate.x = x;
                candidate.y = y;
                candidate.yOffset = yOffset;
                candidate.active = true;
                candidate.hasCollided = false;
                candidate.batAnimMs = Phaser.Math.Between(0, 400);
                candidate.batFrameIndex = 0;

                const keys = candidate.batTextures || [];
                if (candidate.shape?.setTexture && keys[0] && this.scene.textures.exists(keys[0])) {
                    candidate.shape.setTexture(keys[0]);
                    const bs = candidate.batBaseScale ?? 1;
                    candidate.shape.setScale(bs);
                }

                candidate.shape.setPosition(x, y);
                candidate.text.setPosition(x, y);

                candidate.shape.setVisible(true);
                candidate.text.setVisible(false);
            }

            this.nextBatSpawnX += Phaser.Math.Between(bt.gapMin, bt.gapMax);
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

    recycleSkyMultiplier(item, dollX = 0, preferredBaseX = null) {
        const cfg = GAME_CONFIG.skyMultipliers;
        if (!cfg?.enabled || !item || !item.shape || !item.text) {
            return;
        }

        const camera = this.scene.cameras.main;
        const cameraRight = (camera?.scrollX ?? 0) + this.scene.scale.width;
        const layout = this.scene.getViewportLayout?.();
        const isMobile = layout?.isMobile ?? (this.scene.scale?.width ?? 0) < 900;
        const maxLeadFromCamera = isMobile ? 1100 : 1450;
        const clampedCursor = Math.min(this.nextSkySpawnX, cameraRight + maxLeadFromCamera);

        // Use a queue system, but allow targeted refill points for desktop gap-fix.
        const spawnBase = (typeof preferredBaseX === "number")
            ? preferredBaseX
            : Math.max(clampedCursor, cameraRight + 120);
        const stepX = this.getRandomSkyGap(cfg);
        const spawn = this.findSkySpawnAroundBase(spawnBase + stepX, cfg, item);
        const nextX = spawn.x;
        const nextYOffset = spawn.yOffset;
        if (typeof preferredBaseX === "number") {
            // Never move the stream cursor backward when we are just patch-filling a gap.
            this.nextSkySpawnX = Math.max(this.nextSkySpawnX, nextX + Phaser.Math.Between(6, 26));
        } else {
            this.nextSkySpawnX = nextX + Phaser.Math.Between(6, 26);
        }

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
        item.text.setDepth(48);

        // Keep numbers static (no floating/pulsing motion)
        if (item.pulseTween) {
            item.pulseTween.stop();
            item.pulseTween = null;
        }

        item.active = true;
    }

    /** Viewport right edge in world X (same on mobile + desktop — PC center-spawn was too easy to skip past before roll ended). */
    getRoadObstacleSpawnWorldX() {
        const camera = this.scene.cameras.main;
        const cameraLeft = camera?.scrollX ?? 0;
        const viewW = Math.max(1, this.scene.scale.width);
        const cameraRight = cameraLeft + viewW;
        const streamCfg = GAME_CONFIG.encounters?.roadObstacleStream || {};
        const padPx = streamCfg.rightEdgePaddingPx ?? 44;
        const padRatio = streamCfg.rightEdgePaddingRatio ?? 0.07;
        const pad = Math.max(padPx, Math.round(viewW * padRatio));
        return cameraRight - pad;
    }

    maintainHazardStream(dollX) {
        const streamCfg = GAME_CONFIG.encounters?.roadObstacleStream || {};
        const groundY = this.getGroundY();
        // No “rolling” requirement: spawn all round, and keep a prefilled buffer ahead (no pop-in).

        if (!this.roadObstacleStreamUnlocked) {
            this.roadObstacleStreamUnlocked = true;
            this.activateDeferredPatternRoadHazards();
            const camera = this.scene.cameras.main;
            const cameraRight = (camera?.scrollX ?? 0) + this.scene.scale.width;
            const layout = this.scene.getViewportLayout?.();
            const isMobile = layout?.isMobile ?? (this.scene.scale?.width ?? 0) < 900;
            const gmin = isMobile
                ? (streamCfg.firstGapAfterRollMin ?? 480)
                : (streamCfg.firstGapAfterRollMinDesktop ?? streamCfg.firstGapAfterRollMin ?? 480);
            this.nextHazardSpawnX = cameraRight + gmin;
        }

        const camera = this.scene.cameras.main;
        const cameraLeft = camera?.scrollX ?? 0;
        const cameraRight = cameraLeft + this.scene.scale.width;
        
        // 1. Despawn far-behind items
        const despawnX = cameraLeft - 1200;
        for (let i = 0; i < this.decorationHazards.length; i++) {
            const item = this.decorationHazards[i];
            if (item.active && item.x < despawnX) {
                item.active = false;
                item.shape.setVisible(false);
                item.text.setVisible(false);
            }
        }

        // 2. Spawn ahead: keep a filled buffer to avoid sudden pop-in.
        const layout = this.scene.getViewportLayout?.();
        const isMobile = layout?.isMobile ?? (this.scene.scale?.width ?? 0) < 900;
        const gapMin = isMobile ? (streamCfg.gapMin ?? 760) : (streamCfg.gapMinDesktop ?? streamCfg.gapMin ?? 760);
        const gapMax = isMobile ? (streamCfg.gapMax ?? 1700) : (streamCfg.gapMaxDesktop ?? streamCfg.gapMax ?? 1700);
        const fillAhead = isMobile
            ? (streamCfg.fillAheadPx ?? 2000)
            : (streamCfg.fillAheadPxDesktop ?? streamCfg.fillAheadPx ?? 2600);
        const stepCap = Math.max(2, streamCfg.maxSpawnStepsPerFrame ?? 10);
        const spawnLimitX = cameraRight + fillAhead;

        let steps = 0;
        while (this.nextHazardSpawnX < spawnLimitX && steps < stepCap) {
            steps += 1;
            const kind = this.pickRoadObstacleSpawnKind();

            if (kind !== "nothing") {
                let candidate = null;
                for (let i = 0; i < this.decorationHazards.length; i++) {
                    if (!this.decorationHazards[i].active) {
                        candidate = this.decorationHazards[i];
                        break;
                    }
                }

                if (!candidate) {
                    for (let i = 0; i < this.decorationHazards.length; i++) {
                        const item = this.decorationHazards[i];
                        if (!candidate || item.x < candidate.x) {
                            candidate = item;
                        }
                    }
                }

                if (candidate) {
                    // Place at the stream cursor (already ahead), not at the edge at the moment of trigger.
                    const x = this.nextHazardSpawnX + Phaser.Math.Between(-18, 22);
                    this.placeHazardProcedural(candidate, x, kind);
                }
            }

            this.nextHazardSpawnX += Phaser.Math.Between(gapMin, gapMax);
        }
    }

    placeHazardProcedural(item, x, variant) {
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
        const cameraRight = cameraLeft + (this.scene.scale?.width ?? 1280);
        const despawnX = cameraLeft - 900;

        for (let i = 0; i < this.skyMultipliers.length; i++) {
            const item = this.skyMultipliers[i];
            if (!item?.active) continue;

            if (item.x < despawnX) {
                this.recycleSkyMultiplier(item, dollX);
            }
        }

        // Keep a random but continuous stream ahead.
        // PC needs a wider look-ahead window (camera is wider + doll travels fast), otherwise gaps appear.
        const layout = this.scene.getViewportLayout?.();
        const isMobile = layout?.isMobile ?? (this.scene.scale?.width ?? 0) < 900;
        // Guardrail: prevent stream cursor from drifting too far ahead (causes repeat empty bands).
        const maxLeadFromCamera = isMobile ? 1200 : 1500;
        const minLeadFromCamera = 160;
        this.nextSkySpawnX = Phaser.Math.Clamp(
            this.nextSkySpawnX,
            cameraRight + minLeadFromCamera,
            cameraRight + maxLeadFromCamera
        );
        const nearAheadMinX = cameraLeft - 120;
        const nearAheadMaxX = isMobile ? (cameraRight + 860) : (cameraRight + 1500);
        let aheadCount = 0;

        for (let i = 0; i < this.skyMultipliers.length; i++) {
            const item = this.skyMultipliers[i];
            if (!item?.active) continue;
            if (item.x >= nearAheadMinX && item.x <= nearAheadMaxX) {
                aheadCount += 1;
            }
        }

        const requiredAhead = isMobile ? 7 : 12;
        if (aheadCount >= requiredAhead) {
            return;
        }

        const pickRecycleCandidate = () => {
            let candidate = null;
            for (let i = 0; i < this.skyMultipliers.length; i++) {
                const item = this.skyMultipliers[i];
                if (!item?.active) continue;
                if (item.x < nearAheadMinX) {
                    if (!candidate || item.x < candidate.x) candidate = item;
                }
            }
            if (candidate) return candidate;
            for (let i = 0; i < this.skyMultipliers.length; i++) {
                const item = this.skyMultipliers[i];
                if (!item?.active) continue;
                if (item.x > nearAheadMaxX + 260) {
                    if (!candidate || item.x > candidate.x) candidate = item;
                }
            }
            return candidate;
        };

        const needed = requiredAhead - aheadCount;
        for (let n = 0; n < needed; n++) {
            const bestCandidate = pickRecycleCandidate();
            if (!bestCandidate) {
                break;
            }
            const targetBase = Phaser.Math.Between(
                Math.round(nearAheadMinX + 120),
                Math.round(nearAheadMaxX - 80)
            );
            this.recycleSkyMultiplier(bestCandidate, dollX, targetBase);
        }

        // Extra desktop pass: iteratively close large X-gaps in the visible-ahead window.
        // One-pass fill was not enough when a single jump created a very large void.
        const maxGap = isMobile ? 340 : 240;
        const fillBudget = isMobile ? 2 : 5;
        for (let pass = 0; pass < fillBudget; pass++) {
            const ahead = [];
            for (let i = 0; i < this.skyMultipliers.length; i++) {
                const item = this.skyMultipliers[i];
                if (!item?.active) continue;
                if (item.x >= nearAheadMinX && item.x <= nearAheadMaxX) {
                    ahead.push(item);
                }
            }
            ahead.sort((a, b) => a.x - b.x);

            let cursorX = nearAheadMinX;
            let largestGapStart = nearAheadMinX;
            let largestGapEnd = nearAheadMaxX;
            let largestGap = largestGapEnd - largestGapStart;

            for (let i = 0; i < ahead.length; i++) {
                const curX = ahead[i].x;
                const g = curX - cursorX;
                if (g > largestGap) {
                    largestGap = g;
                    largestGapStart = cursorX;
                    largestGapEnd = curX;
                }
                cursorX = curX;
            }
            const tailGap = nearAheadMaxX - cursorX;
            if (tailGap > largestGap) {
                largestGap = tailGap;
                largestGapStart = cursorX;
                largestGapEnd = nearAheadMaxX;
            }

            if (largestGap <= maxGap) {
                break;
            }

            const candidate = pickRecycleCandidate();
            if (!candidate) break;

            // Drop near center of largest gap so each pass halves worst-case emptiness quickly.
            const targetBase = Math.round((largestGapStart + largestGapEnd) * 0.5);
            this.recycleSkyMultiplier(candidate, dollX, targetBase);
        }

        // Absolute requirement: keep sky continuously filled (no gaps).
        this.enforceSkyContinuousCoverage(dollX);
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

        let scanX = minX;
        for (let j = 0; j < 240; j++) {
            scanX += 10;
            const yOffset = Phaser.Math.Clamp(
                Math.round(targetYOffset + Phaser.Math.Between(-80, 80)),
                minYOffset,
                maxYOffset
            );
            const y = groundY + yOffset;
            if (this.isSkyPositionFree(scanX, y, excludeItem)) {
                return { x: scanX, yOffset };
            }
        }

        return fallback;
    }

    getStrictAirThreatGap() {
        return Math.max(8, GAME_CONFIG.skyMultipliers?.strictAirThreatGap ?? 22);
    }

    aabbOverlapCenters(ax, ay, ahw, ahh, bx, by, bhw, bhh) {
        return Math.abs(ax - bx) < ahw + bhw && Math.abs(ay - by) < ahh + bhh;
    }

    getSkyMultiplierSeparationExtents(item) {
        const gap = this.getStrictAirThreatGap();
        const tw = item.text?.displayWidth ?? 48;
        const th = item.text?.displayHeight ?? 48;
        return {
            hw: Math.max(30, tw * 0.5 + gap),
            hh: Math.max(26, th * 0.5 + gap)
        };
    }

    getBombThreatExtentsForSeparation(item) {
        const gap = this.getStrictAirThreatGap() * 0.5;
        if (item.sprite && item.sprite.displayWidth > 0) {
            return {
                hw: item.sprite.displayWidth * 0.5 + gap,
                hh: item.sprite.displayHeight * 0.5 + gap
            };
        }
        const r = (item.radius ?? 20) * 1.12 + gap;
        return { hw: r, hh: r };
    }

    getBatThreatExtentsForSeparation(item) {
        const f = this.getObstacleRectFactors(item);
        const gap = this.getStrictAirThreatGap() * 0.5;
        return {
            hw: (item.width * f.wFactor) * 0.5 + gap,
            hh: (item.height * f.hFactor) * 0.5 + gap
        };
    }

    getBombSpawnCandidateExtents() {
        const g = this.getStrictAirThreatGap();
        const hw = 26 + g * 0.45;
        const hh = 26 + g * 0.45;
        return { hw, hh };
    }

    getBatSpawnCandidateExtents() {
        const g = this.getStrictAirThreatGap();
        const batCfg = GAME_CONFIG.bat || {};
        const w = batCfg.streamTargetMaxPx ?? 96;
        const f = batCfg.hitbox || {};
        const wf = f.wFactor ?? 0.5;
        const hf = f.hFactor ?? 0.52;
        return {
            hw: (w * wf) * 0.5 + g * 0.45,
            hh: (w * hf) * 0.5 + g * 0.45
        };
    }

    isSkyPositionFree(x, y, excludeItem = null) {
        const cfg = GAME_CONFIG.skyMultipliers || {};
        const nodeRadius = cfg.nodeRadius ?? 20;
        const threatPad = this.getStrictAirThreatGap() * 0.5;
        const candidateHalfW = Math.max(24, nodeRadius + 16) + threatPad;
        const candidateHalfH = Math.max(20, nodeRadius + 12) + threatPad;
        const minGap = 10;

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

            // Circle spacing must match gameplay hits: AABB alone can allow two centers close enough
            // that the doll sweeps through a hidden -1 stacked near a +1 / x node.
            const rItem = this.getCircleItemHitRadius(item);
            const rCand = this.getCircleItemHitRadius({
                type: "sky_multiplier",
                hitRadius: cfg.hitRadius,
                radius: nodeRadius
            });
            const minCenterDist = rItem + rCand + Math.max(8, this.getStrictAirThreatGap() * 0.5);
            if (Math.hypot(dx, dy) < minCenterDist) {
                return false;
            }
        }

        for (let i = 0; i < this.bats.length; i++) {
            const it = this.bats[i];
            if (!it?.active) continue;
            const { hw, hh } = this.getBatThreatExtentsForSeparation(it);
            if (this.aabbOverlapCenters(x, y, candidateHalfW, candidateHalfH, it.x, it.y, hw, hh)) {
                return false;
            }
        }

        for (let i = 0; i < this.bombs.length; i++) {
            const it = this.bombs[i];
            if (!it?.active) continue;
            const { hw, hh } = this.getBombThreatExtentsForSeparation(it);
            if (this.aabbOverlapCenters(x, y, candidateHalfW, candidateHalfH, it.x, it.y, hw, hh)) {
                return false;
            }
        }

        for (let i = 0; i < this.pickups.length; i++) {
            const it = this.pickups[i];
            if (!it?.active) continue;
            const pr = (it.radius ?? 18) + this.getStrictAirThreatGap() * 0.5;
            if (this.aabbOverlapCenters(x, y, candidateHalfW, candidateHalfH, it.x, it.y, pr, pr)) {
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

        if (item.penalty > 0 || rawLabel.includes("drop")) {
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

    isDesktopPlayLayout() {
        const layout = this.scene.getViewportLayout?.();
        if (layout) {
            return !layout.isMobile;
        }
        return (this.scene.scale?.width ?? 0) >= 900;
    }

    isMobilePlayLayout() {
        return !this.isDesktopPlayLayout();
    }

    applyMobileCircleHitTweak(item, r) {
        const raw = Number(r) || 0;
        if (raw <= 0) {
            return raw;
        }
        const t = GAME_CONFIG.skyMultipliers?.mobileCircleHitTweak;
        if (!t?.enabled || !this.isMobilePlayLayout()) {
            return raw;
        }
        const ty = item?.type;
        let mul = 1;
        if (ty === "sky_multiplier") {
            mul = t.skyHitMul ?? 1;
        } else if (ty === "pickup") {
            mul = t.pickupHitMul ?? 1;
        } else if (ty === "bomb") {
            mul = t.bombHitMul ?? 1;
        } else {
            return raw;
        }
        return raw * Math.max(1, mul);
    }

    applyDesktopCircleHitTweak(item, r) {
        const raw = Number(r) || 0;
        if (raw <= 0) {
            return raw;
        }
        const t = GAME_CONFIG.skyMultipliers?.desktopCircleHitTweak;
        if (!t?.enabled || !this.isDesktopPlayLayout()) {
            return raw;
        }
        const ty = item?.type;
        let mul = 1;
        if (ty === "sky_multiplier") {
            mul = t.skyHitMul ?? 1;
        } else if (ty === "pickup") {
            mul = t.pickupHitMul ?? 1;
        } else if (ty === "bomb") {
            mul = t.bombHitMul ?? 1;
        } else {
            return raw;
        }
        return raw * Math.max(1, mul);
    }

    getDollCircleRadius() {
        const doll = this.dollController?.doll;
        const w = doll?.displayWidth || 120;
        const h = doll?.displayHeight || 120;
        // Slightly forgiving vs strict mode, still smaller than the full sprite.
        let r = Math.max(13, Math.min(22, Math.min(w, h) * 0.145));
        const mt = GAME_CONFIG.skyMultipliers?.mobileCircleHitTweak;
        if (mt?.enabled && this.isMobilePlayLayout()) {
            const add = Number(mt.dollRadiusAdd) || 0;
            if (add > 0) {
                r = Math.min(24, r + add);
            }
        }
        const t = GAME_CONFIG.skyMultipliers?.desktopCircleHitTweak;
        if (t?.enabled && this.isDesktopPlayLayout()) {
            const add = Number(t.dollRadiusAdd) || 0;
            if (add > 0) {
                r = Math.min(24, r + add);
            }
        }
        return r;
    }

    getCircleItemHitRadius(item) {
        let r;
        if (item?.hitRadius != null) {
            r = Math.max(0, Number(item.hitRadius) || 0);
        } else {
            const skyCfg = GAME_CONFIG.skyMultipliers || {};
            if (item?.type === "sky_multiplier") {
                const base = item.radius ?? skyCfg.nodeRadius ?? 20;
                r = skyCfg.hitRadius ?? Math.max(8, Math.round(base * 0.65));
            } else if (item?.type === "pickup") {
                const scale = skyCfg.pickupHitScale ?? 0.82;
                const base = item.radius ?? 18;
                r = Math.max(8, base * scale);
            } else {
                r = Math.max(0, item?.radius ?? 0);
            }
        }
        const mobileTweaked = this.applyMobileCircleHitTweak(item, r);
        return this.applyDesktopCircleHitTweak(item, mobileTweaked);
    }

    /** Keep logical item position aligned with the rendered Text (single source of truth for hits). */
    syncAirLaneTextWorld(item) {
        if (!item?.text) {
            return;
        }
        item.x = item.text.x;
        item.y = item.text.y;
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
            if (dist <= dollRadius + this.getCircleItemHitRadius(item)) {
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

            const r = (dollRadius + this.getCircleItemHitRadius(item));
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

    /**
     * Air-lane pickups + sky multipliers: discrete samples along prev→current.
     * Hits use Phaser Text world getBounds() vs doll circle only — no extra “node hit radius”
     * (that was larger than the painted glyph and caused client-side ghost +1/−1 hits while falling).
     */
    findBestAirLaneCircleHit(items, prevX, prevY, nextX, nextY, dollRadius) {
        const dx = nextX - prevX;
        const dy = nextY - prevY;
        const lenSq = (dx * dx) + (dy * dy);
        const dr = Math.max(10, Number(dollRadius) || 18);

        const dbg = this.getAirHitDebugCfg();
        const alphaTh = Number(dbg?.suspiciousAlphaThreshold ?? 0.05);
        const cam = this.scene.cameras?.main;
        const view = cam?.worldView;
        const viewPad = 46; // allow slight pre-hit at edges but never off-screen
        const viewRect = view
            ? new Phaser.Geom.Rectangle(view.x - viewPad, view.y - viewPad, view.width + viewPad * 2, view.height + viewPad * 2)
            : null;

        const cached = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item?.active || !item.text) {
                continue;
            }
            this.syncAirLaneTextWorld(item);
            // HARD RULE: air-lane hits must be visible.
            if (!item.text.visible) continue;
            if ((Number(item.text.alpha) || 0) <= alphaTh) continue;
            const b = item.text.getBounds();
            if (!b || b.width <= 1 || b.height <= 1) {
                continue;
            }
            if (viewRect) {
                const br = new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
                if (!Phaser.Geom.Intersects.RectangleToRectangle(viewRect, br)) {
                    continue;
                }
            }
            const rect = new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
            const cx = b.x + b.width * 0.5;
            const cy = b.y + b.height * 0.5;
            cached.push({ item, rect, cx, cy });
        }

        let bestItem = null;
        let bestT = Infinity;
        let bestDist = Infinity;

        const consider = (sx, sy, t) => {
            const circle = new Phaser.Geom.Circle(sx, sy, dr);
            for (let j = 0; j < cached.length; j++) {
                const { item, rect, cx, cy } = cached[j];
                if (!Phaser.Geom.Intersects.CircleToRectangle(circle, rect)) {
                    continue;
                }
                const d = Phaser.Math.Distance.Between(sx, sy, cx, cy);
                if (t < bestT - 1e-9 || (Math.abs(t - bestT) <= 1e-9 && d < bestDist - 0.001)) {
                    bestT = t;
                    bestDist = d;
                    bestItem = item;
                }
            }
        };

        if (lenSq <= 1e-6) {
            consider(nextX, nextY, 1);
            return bestItem;
        }

        const len = Math.sqrt(lenSq);
        const sampleSpan = Math.max(4, Math.min(11, dr * 0.88));
        const n = Math.min(140, Math.max(1, Math.ceil(len / sampleSpan)));

        for (let k = 0; k <= n; k++) {
            const t = k / n;
            consider(prevX + dx * t, prevY + dy * t, t);
        }

        return bestItem;
    }

    /**
     * Bomb/bat procedural spawn: must not overlap sky numbers, pickups, or other bombs/bats (AABB, strict).
     * @param {"bomb"|"bat"} placerType
     */
    isBombSpotClear(x, y, placerType = "bomb") {
        const { hw: chw, hh: chh } = placerType === "bat"
            ? this.getBatSpawnCandidateExtents()
            : this.getBombSpawnCandidateExtents();

        for (let i = 0; i < this.skyMultipliers.length; i++) {
            const it = this.skyMultipliers[i];
            if (!it?.active) continue;
            const { hw, hh } = this.getSkyMultiplierSeparationExtents(it);
            if (this.aabbOverlapCenters(x, y, chw, chh, it.x, it.y, hw, hh)) {
                return false;
            }
        }

        for (let i = 0; i < this.pickups.length; i++) {
            const it = this.pickups[i];
            if (!it?.active) continue;
            const pr = (it.radius ?? 18) + this.getStrictAirThreatGap() * 0.5;
            if (this.aabbOverlapCenters(x, y, chw, chh, it.x, it.y, pr, pr)) {
                return false;
            }
        }

        for (let i = 0; i < this.bombs.length; i++) {
            const it = this.bombs[i];
            if (!it?.active) continue;
            const { hw, hh } = this.getBombThreatExtentsForSeparation(it);
            if (this.aabbOverlapCenters(x, y, chw, chh, it.x, it.y, hw, hh)) {
                return false;
            }
        }

        for (let i = 0; i < this.bats.length; i++) {
            const it = this.bats[i];
            if (!it?.active) continue;
            const { hw, hh } = this.getBatThreatExtentsForSeparation(it);
            if (this.aabbOverlapCenters(x, y, chw, chh, it.x, it.y, hw, hh)) {
                return false;
            }
        }

        return true;
    }

    getObstacleRectFactors(item) {
        if (item.type === "bat" || item.variant === "bat") {
            const hb = GAME_CONFIG.bat?.hitbox || {};
            return {
                wFactor: typeof hb.wFactor === "number" ? hb.wFactor : 0.5,
                hFactor: typeof hb.hFactor === "number" ? hb.hFactor : 0.52
            };
        }

        const v = item.variant;
        const rc = GAME_CONFIG.roadObstacleColliders;
        const roadCfg = rc?.[v];
        if (roadCfg && typeof roadCfg.wFactor === "number") {
            return {
                wFactor: roadCfg.wFactor,
                hFactor: typeof roadCfg.hFactor === "number" ? roadCfg.hFactor : roadCfg.wFactor
            };
        }

        const isTall = (v === "tree" || v === "lamp_post" || v === "pole");
        const isHole = (v === "hole");
        const isWater = (v === "water");
        const isRoadBlock = (v === "trafficcone" || v === "roadblocker");

        const wFactor = isHole ? 0.52 : (isTall ? 0.36 : (isWater ? 0.70 : (isRoadBlock ? 0.82 : 0.62)));
        const hFactor = isHole ? 0.50 : (isTall ? 0.92 : (isWater ? 0.52 : (isRoadBlock ? 0.78 : 0.66)));
        return { wFactor, hFactor };
    }

    checkRectCollisions(items, dollX, dollY, dollHalfW, dollHalfH, callback) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.active || item.hasCollided) continue;

            const originY = item.shape?.originY ?? 0.5;
            const { wFactor, hFactor } = this.getObstacleRectFactors(item);

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

    // When the doll barely moves this frame, swept ray tests can misbehave; use real overlap only.
    findStaticRoadOverlap(items, dollX, dollY, dollHalfW, dollHalfH, filterFn = null) {
        let best = null;
        let bestDist = Infinity;

        const dollLeft = dollX - dollHalfW;
        const dollRight = dollX + dollHalfW;
        const dollTop = dollY - dollHalfH;
        const dollBottom = dollY + dollHalfH;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.active || item.hasCollided) continue;
            if (filterFn && !filterFn(item)) continue;

            const originY = item.shape?.originY ?? 0.5;
            const { wFactor, hFactor } = this.getObstacleRectFactors(item);

            const itemHalfW = (item.width * wFactor) * 0.5;
            const itemHalfH = (item.height * hFactor) * 0.5;
            const left = item.x - itemHalfW;
            const right = item.x + itemHalfW;
            const top = item.y - item.height * originY + (item.height * (1 - hFactor) * 0.5);
            const bottom = item.y + item.height * (1 - originY) - (item.height * (1 - hFactor) * 0.5);

            const overlaps =
                dollRight >= left &&
                dollLeft <= right &&
                dollBottom >= top &&
                dollTop <= bottom;

            if (overlaps) {
                const dist = Math.abs(item.x - dollX);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = item;
                }
            }
        }
        return best;
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
            const { wFactor, hFactor } = this.getObstacleRectFactors(item);

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

    // Prevent "miss" on low-FPS / large delta by splitting the sweep into smaller segments.
    findBestRectHitSweptSegmented(items, x0, y0, x1, y1, dollHalfW, dollHalfH, filterFn = null, maxSegPx = 46) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dist = Math.sqrt((dx * dx) + (dy * dy));
        const seg = Math.max(1, Number(maxSegPx) || 46);
        const segments = Math.max(1, Math.ceil(dist / seg));

        if (segments === 1) {
            return this.findBestRectHitSwept(items, x0, y0, x1, y1, dollHalfW, dollHalfH, filterFn);
        }

        let ax = x0;
        let ay = y0;
        for (let i = 0; i < segments; i++) {
            const t1 = (i + 1) / segments;
            const bx = x0 + dx * t1;
            const by = y0 + dy * t1;
            const hit = this.findBestRectHitSwept(items, ax, ay, bx, by, dollHalfW, dollHalfH, filterFn);
            if (hit) {
                return hit;
            }
            ax = bx;
            ay = by;
        }
        return null;
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

            if (item.type === "hazard") {
                item.shape.setScale(item.shape.scale);
            } else if (item.type === "bat" && item.batBaseScale != null) {
                item.shape.setScale(item.batBaseScale);
            } else {
                item.shape.setScale(1);
            }
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
        this.proceduralBats.length = 0;
        this.allItems.length = 0;
        this.activePatternId = "";
        this.roadObstacleStreamUnlocked = false;
        this.nextHazardSpawnX = 1e9;
        this.nextBombSpawnX = 900;
        this.nextBatSpawnX = 900;
    }

    destroy() {
        this.clearAll();
    }
}