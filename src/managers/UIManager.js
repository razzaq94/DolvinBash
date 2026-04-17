import HudPanel from "../ui/HudPanel.js";
import { GAME_STATES } from "./GameStateManager.js";
import { GAME_CONFIG } from "../data/gameConfig.js";

export default class UIManager {
    constructor(scene) {
        this.scene = scene;
        this.hudPanel = null;
        this.root = document.getElementById("ui-root");

        this.balance = GAME_CONFIG.round.startingBalance;
        this.bet = GAME_CONFIG.round.defaultBet;
        this.multiplier = 1;

        this.onBetChange = null;
        this.onStart = null;
        this.onReplay = null;
        this.onStopAutoPlay = null;

        this.quickBetOverlay = null;
        this.quickBetPanel = null;

        this.autoPlayCount = 1;
        this.autoPlayOverlay = null;
        this.autoPlayRemaining = 0;
        this.autoPlaySelected = false;

        this.speedMode = GAME_CONFIG.round.defaultSpeedMode || "NORMAL";
        this.speedOverlay = null;
        this.awaitingExternalStart = false;
        this.translations = {};
    }

    createAll() {
        this.hudPanel = new HudPanel(this.scene);
        this.initHtmlUI();
        this.layoutHud();
    }

    layoutHud() {
        this.hudPanel?.layout();
        // Web fonts / --ui-scale can change header height after first paint; sync on next frame.
        if (typeof requestAnimationFrame !== "undefined") {
            requestAnimationFrame(() => this.hudPanel?.layout());
        }
    }

    initHtmlUI() {
        if (!this.root) return;
        this.root.innerHTML = "";
        this.loadUiPrefs();
        const hostMap = (window.__dolvinTranslations && typeof window.__dolvinTranslations === "object")
            ? window.__dolvinTranslations
            : null;
        if (hostMap) {
            this.translations = { ...this.translations, ...hostMap };
        }
        this.createPrePlayLogos();
        this.createHeader();
        this.createBetPanel();
        this.createResultOverlay();
        this.createInsufficientOverlay();
        this.updateBet(this.bet);
        this.updateBalance(this.balance);
        this.applyTranslations();
    }

    loadUiPrefs() {
        try {
            const savedSpeed = String(window.localStorage?.getItem("dolvin_speedMode") || "").toUpperCase();
            if (savedSpeed && GAME_CONFIG.speedModes?.[savedSpeed]) {
                this.speedMode = savedSpeed;
            }
            const muted = String(window.localStorage?.getItem("dolvin_muted") || "") === "1";
            this.scene.audioManager?.setEnabled?.(!muted);
        } catch {
            // ignore storage errors
        }
    }

    saveUiPrefs() {
        try {
            window.localStorage?.setItem("dolvin_speedMode", String(this.speedMode || "NORMAL"));
            const muted = !this.scene.audioManager?.isEnabled?.();
            window.localStorage?.setItem("dolvin_muted", muted ? "1" : "0");
        } catch {
            // ignore storage errors
        }
    }

    tr(key, fallback = "") {
        const raw = this.translations?.[key];
        if (typeof raw === "string" && raw.trim().length) {
            return raw;
        }
        return fallback;
    }

    setTranslations(map) {
        if (!map || typeof map !== "object") return;
        this.translations = { ...this.translations, ...map };
        this.applyTranslations();
    }

    applyTranslations() {
        const setText = (id, key, fallback) => {
            const el = document.getElementById(id);
            if (el) el.textContent = this.tr(key, fallback);
        };
        setText("ui-label-balance-top", "balance", "Balance");
        setText("ui-label-multiplier-top", "multiplier", "Multiplier");
        setText("ui-label-balance", "balance", "Balance");
        setText("ui-label-bet", "bet", "Bet");
        setText("ui-label-multiplier", "multiplier", "Multiplier");
        setText("ui-label-res-bet", "bet", "Bet");
        setText("ui-label-res-mult", "multiplier", "Multiplier");
        setText("ui-label-res-dist", "distance", "Distance");
        setText("ui-label-res-payout", "payout", "Payout");
        setText("ui-btn-replay", "replay", "REPLAY");
        setText("ui-insufficient-title", "insufficientBalanceTitle", "INSUFFICIENT BALANCE");
        setText("ui-btn-insufficient-ok", "ok", "OK");
        this.hudPanel?.setLabels?.({
            multiplier: this.tr("multiplier", "Multiplier"),
            combo: this.tr("combo", "Combo")
        });

        const muteBtn = document.getElementById("ui-btn-mute");
        if (muteBtn) {
            const label = this.tr("muteToggle", "Mute / Unmute");
            muteBtn.title = label;
            muteBtn.setAttribute("aria-label", label);
        }

        if (!document.getElementById("ui-result-overlay")?.classList?.contains("visible")) {
            setText("ui-result-title", "roundEnded", "ROUND ENDED");
        }

        this.updatePlayButtonMode();
    }

    getAssetUrl(relativePath) {
        const path = String(window.location.pathname || "/");
        const basePath = path.endsWith("/")
            ? path
            : `${path.slice(0, Math.max(0, path.lastIndexOf("/") + 1))}`;
        const base = `${window.location.origin}${basePath}`;
        return new URL(relativePath, base).toString();
    }

    createHeader() {
        const logoTopSrc = this.getAssetUrl("assets/logo1.png");
        const header = document.createElement("div");
        header.className = "game-header";
        header.innerHTML = `
            <img
                id="ui-logo-top-right"
                class="logo-top-right-image"
                src="${logoTopSrc}"
                alt="Dolwin Bash Logo Top Right"
            />
            <button id="ui-btn-mute" class="mute-btn" title="${this.tr("muteToggle", "Mute / Unmute")}" aria-label="${this.tr("muteToggle", "Mute / Unmute")}" style="margin-left:10px;">🔊</button>
        `;
        this.root.prepend(header);

        const btn = document.getElementById("ui-btn-mute");
        const sync = () => {
            const muted = !this.scene.audioManager?.isEnabled?.();
            if (btn) btn.textContent = muted ? "🔇" : "🔊";
        };
        sync();
        btn?.addEventListener("click", () => {
            this.playUiClick();
            const nextMuted = this.scene.audioManager?.isEnabled?.();
            this.scene.audioManager?.setEnabled?.(!nextMuted);
            this.saveUiPrefs();
            sync();
        });
    }

    createPrePlayLogos() {
        if (!this.root) return;
        const logoMiddleSrc = this.getAssetUrl("assets/logo2.png");
        const wrap = document.createElement("div");
        wrap.className = "preplay-logos";
        wrap.id = "ui-preplay-logos";
        wrap.innerHTML = `
            <img
                id="ui-logo-middle"
                class="logo-middle-image"
                src="${logoMiddleSrc}"
                alt="Dolwin Bash Logo Center"
            />
        `;
        this.root.appendChild(wrap);
    }

    createBetPanel() {
        // Mobile-only: floating Balance + Multiplier boxes right above the bottom bar.
        const mobileFloat = document.createElement("div");
        mobileFloat.className = "mobile-float-stats mobile-only";
        mobileFloat.id = "ui-mobile-float-stats";
        mobileFloat.innerHTML = `
            <div class="mobile-stat glass-panel">
                <div id="ui-label-balance-top" class="bet-label">${this.tr("balance", "Balance")}</div>
                <div id="ui-balance-top" class="bet-value success">0.00</div>
            </div>
            <div class="mobile-stat glass-panel" style="text-align:right;">
                <div id="ui-label-multiplier-top" class="bet-label">${this.tr("multiplier", "Multiplier")}</div>
                <div id="ui-multiplier-top" class="bet-value warning">x1.00</div>
            </div>
        `;

        const wrapper = document.createElement("div");
        wrapper.className = "mobile-bar-wrap";

        const betPanel = document.createElement("div");
        betPanel.className = "bet-panel glass-panel";
        betPanel.id = "ui-bet-panel";
        // data-multiplier attribute for mobile compact view
        betPanel.innerHTML = `
            <div id="ui-top-row" class="bet-section" data-multiplier="x1.00">
                <div style="display:flex; flex-direction:column;">
                    <span id="ui-label-balance" class="bet-label">${this.tr("balance", "Balance")}</span>
                    <span id="ui-balance" class="bet-value success">0.00</span>
                </div>
            </div>
            
            <div class="controls-group">
                <button id="ui-btn-minus" class="btn-mode btn-icon">−</button>
                <div class="bet-section" style="text-align: center;">
                    <span id="ui-label-bet" class="bet-label">${this.tr("bet", "Bet")}</span>
                    <span id="ui-bet" class="bet-value">10</span>
                </div>
                <button id="ui-btn-plus" class="btn-mode btn-icon">+</button>
                <button id="ui-btn-speed" class="btn-mode btn-icon">S</button>
                <button id="ui-btn-autoplay" class="btn-mode btn-icon autoplay-btn"></button>
                <button id="ui-btn-play" class="btn-main">${this.tr("play", "PLAY")}</button>
            </div>

            <div class="bet-section desktop-only" style="text-align: right;">
                <span id="ui-label-multiplier" class="bet-label">${this.tr("multiplier", "Multiplier")}</span>
                <span id="ui-multiplier" class="bet-value warning">x1.00</span>
            </div>
        `;
        wrapper.appendChild(mobileFloat);
        wrapper.appendChild(betPanel);
        this.root.appendChild(wrapper);

        document.getElementById("ui-btn-minus")?.addEventListener("click", () => {
            this.playUiClick();
            this.changeBet(-1);
        });
        document.getElementById("ui-btn-plus")?.addEventListener("click", () => {
            this.playUiClick();
            this.changeBet(1);
        });
        document.getElementById("ui-btn-play")?.addEventListener("click", () => {
            if (this.autoPlayRemaining > 0) {
                this.playUiClick();
                this.onStopAutoPlay?.();
                return;
            }
            this.playUiStart();
            this.onStart?.();
        });

        // Quick select bet
        document.getElementById("ui-bet")?.addEventListener("click", (e) => {
            e.stopPropagation();
            this.playUiClick();
            this.toggleQuickBet();
        });

        document.getElementById("ui-btn-autoplay")?.addEventListener("click", (e) => {
            e.stopPropagation();
            this.playUiClick();
            this.toggleAutoPlay();
        });

        document.getElementById("ui-btn-speed")?.addEventListener("click", (e) => {
            e.stopPropagation();
            this.playUiClick();
            this.toggleSpeed();
        });

        // Initial label state
        this.setAutoPlayRemaining(0);
        this.updateSpeedButton();
        this.updatePlayButtonMode();
    }

    createResultOverlay() {
        const overlay = document.createElement("div");
        overlay.className = "result-overlay";
        overlay.id = "ui-result-overlay";
        overlay.innerHTML = `
            <div class="result-panel glass-panel" style="pointer-events: none;">
                <h2 id="ui-result-title" class="result-title">${this.tr("roundEnded", "ROUND ENDED")}</h2>
                <div class="result-stats">
                    <div class="stat-item"><span id="ui-label-res-bet" class="stat-label">${this.tr("bet", "Bet")}</span><span id="res-bet" class="stat-value">0</span></div>
                    <div class="stat-item"><span id="ui-label-res-mult" class="stat-label">${this.tr("multiplier", "Multiplier")}</span><span id="res-mult" class="stat-value">x0</span></div>
                    <div class="stat-item"><span id="ui-label-res-dist" class="stat-label">${this.tr("distance", "Distance")}</span><span id="res-dist" class="stat-value">0</span></div>
                    <div class="stat-item"><span id="ui-label-res-payout" class="stat-label">${this.tr("payout", "Payout")}</span><span id="res-payout" class="stat-value success">0</span></div>
                </div>
                <button id="ui-btn-replay" class="btn-main" style="width: 100%; pointer-events: auto;">${this.tr("replay", "REPLAY")}</button>
            </div>
        `;
        this.root.appendChild(overlay);
        const replayBtn = document.getElementById("ui-btn-replay");
        let lastReplayTriggerAt = 0;
        const safeTriggerReplay = () => {
            const now = Date.now();
            if (now - lastReplayTriggerAt < 220) return;
            lastReplayTriggerAt = now;
            triggerReplay();
        };
        const triggerReplay = () => {
            if (this.autoPlayRemaining > 0) {
                return;
            }
            this.playUiClick();
            this.onReplay?.();
        };
        replayBtn?.addEventListener("click", safeTriggerReplay);

        // Strong fallback: capture click/pointer/touch at overlay level and fire replay whenever
        // pointer coordinates are inside an expanded replay-button hitbox.
        const getXY = (evt) => {
            if (Number.isFinite(evt?.clientX) && Number.isFinite(evt?.clientY)) {
                return { x: Number(evt.clientX), y: Number(evt.clientY) };
            }
            const t = evt?.changedTouches?.[0] || evt?.touches?.[0];
            if (t && Number.isFinite(t.clientX) && Number.isFinite(t.clientY)) {
                return { x: Number(t.clientX), y: Number(t.clientY) };
            }
            return null;
        };
        const tryTriggerFromPoint = (e) => {
            if (!replayBtn || this.autoPlayRemaining > 0) return;
            const pt = getXY(e);
            if (!pt) return;

            const r = replayBtn.getBoundingClientRect();
            // Moderate expansion: 20px top/bottom, 10px sides.
            const hit = {
                left: r.left - 10,
                right: r.right + 10,
                top: r.top - 20,
                bottom: r.bottom + 20
            };
            if (pt.x >= hit.left && pt.x <= hit.right && pt.y >= hit.top && pt.y <= hit.bottom) {
                e.preventDefault();
                safeTriggerReplay();
            }
        };
        overlay.addEventListener("pointerup", tryTriggerFromPoint, true);
        overlay.addEventListener("click", tryTriggerFromPoint, true);
        overlay.addEventListener("touchend", tryTriggerFromPoint, true);
    }

    createInsufficientOverlay() {
        const overlay = document.createElement("div");
        overlay.className = "result-overlay";
        overlay.id = "ui-insufficient-overlay";
        overlay.innerHTML = `
            <div class="result-panel glass-panel" style="max-width: 380px;">
                <h2 id="ui-insufficient-title" class="result-title" style="font-size: 34px; color: var(--accent-danger);">${this.tr("insufficientBalanceTitle", "INSUFFICIENT BALANCE")}</h2>
                <div id="ui-insufficient-msg" class="stat-value" style="margin-bottom: 18px; text-align: center;">
                    ${this.tr("insufficientBalanceHint", "Please reduce bet amount.")}
                </div>
                <button id="ui-btn-insufficient-ok" class="btn-main" style="width: 100%;">${this.tr("ok", "OK")}</button>
            </div>
        `;
        this.root.appendChild(overlay);
        document.getElementById("ui-btn-insufficient-ok")?.addEventListener("click", () => {
            this.playUiClick();
            this.hideInsufficientBalance();
        });
    }

    showInsufficientBalance(betAmount, balanceAmount) {
        const overlay = document.getElementById("ui-insufficient-overlay");
        const msg = document.getElementById("ui-insufficient-msg");
        if (msg) {
            const template = this.tr("insufficientBalanceDetail", "Bet {bet} is greater than balance {balance}.");
            msg.textContent = template
                .replace("{bet}", Number(betAmount).toFixed(2))
                .replace("{balance}", Number(balanceAmount).toFixed(2));
        }
        if (overlay) overlay.classList.add("visible");
    }

    hideInsufficientBalance() {
        const overlay = document.getElementById("ui-insufficient-overlay");
        if (overlay) overlay.classList.remove("visible");
    }

    bindEvents(roundManager) {
        this.onStart = () => roundManager.requestRoundStart?.();
        this.onReplay = () => roundManager.replay();
        this.onStopAutoPlay = () => roundManager.stopAutoPlay?.();
    }

    setAwaitingExternalStart(awaiting) {
        this.awaitingExternalStart = !!awaiting;
        this.updatePlayButtonMode();
        const isBetting = !!this.scene.gameStateManager?.isState?.(GAME_STATES.BETTING);
        if (isBetting) {
            this.setPrePlayControlsEnabled(true);
        }
    }

    updatePlayButtonMode() {
        const playBtn = document.getElementById("ui-btn-play");
        if (!playBtn) return;
        const isAutoRunning = this.autoPlayRemaining > 0;
        const canStartNow = !!this.scene.gameStateManager?.isState?.(GAME_STATES.BETTING);
        const waiting = this.awaitingExternalStart && !isAutoRunning;
        playBtn.textContent = isAutoRunning
            ? "✕"
            : waiting
                ? this.tr("waiting", "WAIT...")
                : this.tr("play", "PLAY");
        playBtn.title = isAutoRunning
            ? this.tr("stopAutoplay", "Stop autoplay")
            : waiting
                ? this.tr("waitingServer", "Waiting for server...")
                : this.tr("play", "Play");
        playBtn.setAttribute("aria-label", playBtn.title);
        if (isAutoRunning) {
            playBtn.style.pointerEvents = "auto";
            playBtn.style.opacity = "";
            playBtn.disabled = false;
        } else {
            // After stopping autoplay mid-round, PLAY should stay non-interactable until BETTING.
            const canUse = canStartNow && !waiting;
            playBtn.style.pointerEvents = canUse ? "auto" : "none";
            playBtn.style.opacity = canUse ? "" : "0.6";
            playBtn.disabled = !canUse;
        }
    }

    setPrePlayControlsEnabled(enabled) {
        const canUseControls = enabled && !this.awaitingExternalStart;
        const ids = [
            "ui-btn-minus",
            "ui-btn-plus",
            "ui-btn-speed",
            "ui-btn-autoplay",
            "ui-btn-play",
            "ui-bet"
        ];
        ids.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            if ("disabled" in el) {
                el.disabled = !canUseControls;
            }
            el.style.pointerEvents = canUseControls ? "auto" : "none";
            el.style.opacity = canUseControls ? "" : "0.6";
        });
        // If autoplay is running, play button acts as an always-clickable stop (✕).
        if (this.autoPlayRemaining > 0) {
            const playBtn = document.getElementById("ui-btn-play");
            if (playBtn) {
                playBtn.style.pointerEvents = "auto";
                playBtn.style.opacity = "";
                playBtn.disabled = false;
            }
        }
        // Volume button should always stay interactable.
        const muteBtn = document.getElementById("ui-btn-mute");
        if (muteBtn) {
            muteBtn.style.pointerEvents = "auto";
            muteBtn.style.opacity = "";
            if ("disabled" in muteBtn) muteBtn.disabled = false;
        }
    }

    updateByState(state) {
        const betPanel = document.getElementById("ui-bet-panel");
        const overlay = document.getElementById("ui-result-overlay");
        const autoRunning = this.autoPlayRemaining > 0;
        const isPrePlay = state === GAME_STATES.BETTING;
        const middleLogo = document.getElementById("ui-logo-middle");
        const topRightLogo = document.getElementById("ui-logo-top-right");
        if (middleLogo) middleLogo.style.display = isPrePlay ? "block" : "none";
        if (topRightLogo) topRightLogo.style.display = isPrePlay ? "block" : "none";

        switch (state) {
            case GAME_STATES.BETTING:
                this.setPrePlayControlsEnabled(true);
                if (betPanel) betPanel.style.opacity = "1";
                if (betPanel) betPanel.style.pointerEvents = "auto";
                if (overlay) overlay.classList.remove("visible");
                this.hideInsufficientBalance();
                this.hudPanel.setVisible(false);
                break;
            case GAME_STATES.FLYING:
                this.setPrePlayControlsEnabled(false);
                this.hudPanel.setVisible(true);
                if (betPanel) betPanel.style.pointerEvents = autoRunning ? "auto" : "none";
                break;
            case GAME_STATES.KICKING:
            case GAME_STATES.ROUND_END:
                this.setPrePlayControlsEnabled(false);
                if (betPanel) betPanel.style.pointerEvents = autoRunning ? "auto" : "none";
                this.hudPanel.setVisible(true);
                break;
            case GAME_STATES.RESULT:
                this.setPrePlayControlsEnabled(false);
                if (overlay) overlay.classList.add("visible");
                // Prevent ANY clicks on UI beneath the result overlay.
                if (betPanel) betPanel.style.pointerEvents = "none";
                if (betPanel) betPanel.style.opacity = "0.65";
                this.hudPanel.setVisible(false);
                break;
        }
        this.updatePlayButtonMode();
    }

    changeBet(delta) {
        this.bet = Phaser.Math.Clamp(this.bet + delta, GAME_CONFIG.round.minBet, GAME_CONFIG.round.maxBet);
        this.updateBet(this.bet);
    }

    setBet(value) {
        const v = Number(value);
        if (!Number.isFinite(v)) return;
        this.bet = Phaser.Math.Clamp(v, GAME_CONFIG.round.minBet, GAME_CONFIG.round.maxBet);
        this.updateBet(this.bet);
    }

    updateBet(bet) {
        const el = document.getElementById("ui-bet");
        if (el) el.textContent = bet;
    }

    updateBalance(balance) {
        this.balance = balance;
        const el = document.getElementById("ui-balance");
        if (el) el.textContent = Number(balance).toFixed(2);
        const elTop = document.getElementById("ui-balance-top");
        if (elTop) elTop.textContent = Number(balance).toFixed(2);
    }

    updateMultiplier(value) {
        this.multiplier = value;
        const formatted = `x${Number(value).toFixed(2)}`;
        
        const el = document.getElementById("ui-multiplier");
        if (el) el.textContent = formatted;
        const elTop = document.getElementById("ui-multiplier-top");
        if (elTop) elTop.textContent = formatted;

        this.hudPanel?.setMultiplier(value);
    }

    showResult(result) {
        const titleEl = document.getElementById("ui-result-title");
        if (titleEl) {
            titleEl.textContent = result.hitHazard
                ? this.tr("roundOver", "ROUND OVER")
                : this.tr("youWon", "YOU WON!");
            titleEl.style.color = result.hitHazard ? "var(--accent-danger)" : "var(--accent-success)";
        }

        const stats = {
            "res-bet": result.betAmount,
            "res-mult": `x${Number(result.finalMultiplier || result.multiplier).toFixed(2)}`,
            "res-dist": `${Math.round(result.distance)}m`,
            "res-payout": result.payout
        };

        for (const [id, val] of Object.entries(stats)) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        }

        document.getElementById("ui-result-overlay")?.classList.add("visible");
    }

    applyRoundResult(result) {
        this.balance += (result.payout - result.betAmount);
        this.balance = Math.max(0, this.balance);
        this.updateBalance(this.balance);
    }

    playUiClick() {
        this.scene.audioManager?.play("sfx_click", { volume: 0.35 });
    }

    playUiStart() {
        this.scene.audioManager?.play("sfx_start", { volume: 0.5 });
    }

    toggleQuickBet() {
        if (this.quickBetOverlay) {
            this.closeQuickBet();
            return;
        }
        this.openQuickBet();
    }

    openQuickBet() {
        if (!this.root || this.quickBetOverlay) return;

        const overlay = document.createElement("div");
        overlay.className = "quickbet-overlay";
        overlay.addEventListener("click", () => this.closeQuickBet());

        const panel = document.createElement("div");
        panel.className = "quickbet-panel glass-panel";
        panel.addEventListener("click", (e) => e.stopPropagation());

        const title = document.createElement("div");
        title.className = "quickbet-title";
        title.textContent = this.tr("quickBet", "Quick Bet");

        const grid = document.createElement("div");
        grid.className = "quickbet-grid";

        const values = [1, 2, 5, 10, 20, 30, 40, 50, 80, 100, 120, 150, 200];
        values.forEach((val) => {
            const btn = document.createElement("button");
            btn.className = "quickbet-btn btn-mode";
            btn.textContent = String(val);
            btn.addEventListener("click", () => {
                this.playUiClick();
                this.setBet(val);
                this.closeQuickBet();
            });
            grid.appendChild(btn);
        });

        panel.appendChild(title);
        panel.appendChild(grid);
        overlay.appendChild(panel);
        this.root.appendChild(overlay);

        this.quickBetOverlay = overlay;
        this.quickBetPanel = panel;
    }

    closeQuickBet() {
        if (this.quickBetOverlay) {
            this.quickBetOverlay.remove();
        }
        this.quickBetOverlay = null;
        this.quickBetPanel = null;
    }

    toggleAutoPlay() {
        if (this.autoPlayOverlay) {
            this.closeAutoPlay();
            return;
        }
        this.openAutoPlay();
    }

    openAutoPlay() {
        if (!this.root || this.autoPlayOverlay) return;

        const overlay = document.createElement("div");
        overlay.className = "quickbet-overlay";
        overlay.addEventListener("click", () => this.closeAutoPlay());

        const panel = document.createElement("div");
        panel.className = "autoplay-panel glass-panel";
        panel.addEventListener("click", (e) => e.stopPropagation());

        const header = document.createElement("div");
        header.className = "autoplay-header";

        const title = document.createElement("div");
        title.className = "autoplay-title";
        title.textContent = this.tr("autoplaySettings", "Autoplay settings");

        const closeBtn = document.createElement("button");
        closeBtn.className = "autoplay-close";
        closeBtn.type = "button";
        closeBtn.textContent = "×";
        const closeLabel = this.tr("close", "Close");
        closeBtn.title = closeLabel;
        closeBtn.setAttribute("aria-label", closeLabel);
        closeBtn.addEventListener("click", () => {
            this.playUiClick();
            this.closeAutoPlay();
        });

        header.appendChild(title);
        header.appendChild(closeBtn);

        const grid = document.createElement("div");
        grid.className = "autoplay-grid";
        let draftAutoPlayCount = Math.max(1, Math.min(1000, Number(this.autoPlayCount) || 1));

        const values = [1, 10, 20, 50, 100, 250, 500, 750, 1000];
        values.forEach((val) => {
            const btn = document.createElement("button");
            btn.className = "autoplay-chip";
            btn.type = "button";
            btn.textContent = String(val);
            grid.appendChild(btn);
        });

        const sliderRow = document.createElement("div");
        sliderRow.className = "autoplay-slider-row";

        const sliderLabel = document.createElement("div");
        sliderLabel.className = "autoplay-subtitle";
        sliderLabel.textContent = this.tr("autoplaySpins", "Numbers of autospins:");

        const slider = document.createElement("input");
        slider.className = "autoplay-slider";
        slider.type = "range";
        slider.min = "1";
        slider.max = "1000";
        slider.step = "1";
        slider.value = String(draftAutoPlayCount);

        const sliderValue = document.createElement("div");
        sliderValue.className = "autoplay-value";
        sliderValue.textContent = String(draftAutoPlayCount);

        const syncValue = (next) => {
            const v = Math.max(1, Math.min(1000, Number(next) || 1));
            draftAutoPlayCount = v;
            slider.value = String(v);
            sliderValue.textContent = String(v);
            updateStartLabel();
        };

        slider.addEventListener("input", () => {
            this.playUiClick();
            syncValue(slider.value);
        });

        // Ensure chips update slider/value too
        grid.querySelectorAll("button.autoplay-chip").forEach((btn) => {
            btn.addEventListener("click", () => {
                this.playUiClick();
                syncValue(btn.textContent);
            });
        });

        const actions = document.createElement("div");
        actions.className = "autoplay-actions";

        const startBtn = document.createElement("button");
        startBtn.className = "btn-main autoplay-start";
        startBtn.type = "button";
        startBtn.textContent = `${this.tr("startAutoplay", "Start autoplay")} (${draftAutoPlayCount})`;
        const updateStartLabel = () => {
            startBtn.textContent = `${this.tr("startAutoplay", "Start autoplay")} (${draftAutoPlayCount})`;
        };
        slider.addEventListener("input", updateStartLabel);
        grid.querySelectorAll("button.autoplay-chip").forEach((btn) => btn.addEventListener("click", updateStartLabel));

        startBtn.addEventListener("click", () => {
            this.playUiStart();
            this.autoPlayCount = draftAutoPlayCount;
            this.autoPlaySelected = true;
            this.setAutoPlayRemaining(0);
            this.closeAutoPlay();
            this.onStart?.();
        });

        actions.appendChild(startBtn);

        sliderRow.appendChild(slider);
        sliderRow.appendChild(sliderValue);

        panel.appendChild(header);
        panel.appendChild(sliderLabel);
        panel.appendChild(grid);
        panel.appendChild(sliderRow);
        panel.appendChild(actions);
        overlay.appendChild(panel);
        this.root.appendChild(overlay);

        this.autoPlayOverlay = overlay;
    }

    closeAutoPlay() {
        if (this.autoPlayOverlay) {
            this.autoPlayOverlay.remove();
        }
        this.autoPlayOverlay = null;
    }

    toggleSpeed() {
        if (this.speedOverlay) {
            this.closeSpeed();
            return;
        }
        this.openSpeed();
    }

    openSpeed() {
        if (!this.root || this.speedOverlay) return;

        const overlay = document.createElement("div");
        overlay.className = "quickbet-overlay";
        overlay.addEventListener("click", () => this.closeSpeed());

        const panel = document.createElement("div");
        panel.className = "quickbet-panel glass-panel";
        panel.addEventListener("click", (e) => e.stopPropagation());

        const title = document.createElement("div");
        title.className = "quickbet-title";
        title.textContent = this.tr("speed", "Speed");

        const grid = document.createElement("div");
        grid.className = "quickbet-grid";

        const order = ["SLOW", "NORMAL", "FAST", "ULTRA"];
        order.forEach((mode) => {
            if (!GAME_CONFIG.speedModes?.[mode]) return;
            const btn = document.createElement("button");
            btn.className = "quickbet-btn btn-mode";
            btn.type = "button";
            btn.textContent = mode;
            if (mode === this.speedMode) {
                btn.style.borderColor = "rgba(74, 222, 128, 0.65)";
            }
            btn.addEventListener("click", () => {
                this.playUiClick();
                this.speedMode = mode;
                this.saveUiPrefs();
                this.updateSpeedButton();
                this.closeSpeed();
            });
            grid.appendChild(btn);
        });

        panel.appendChild(title);
        panel.appendChild(grid);
        overlay.appendChild(panel);
        this.root.appendChild(overlay);
        this.speedOverlay = overlay;
    }

    closeSpeed() {
        if (this.speedOverlay) {
            this.speedOverlay.remove();
        }
        this.speedOverlay = null;
    }

    updateSpeedButton() {
        const el = document.getElementById("ui-btn-speed");
        if (!el) return;
        const mode = String(this.speedMode || "NORMAL").toUpperCase();
        // Compact like reference: show current mode short.
        el.textContent =
            mode === "SLOW" ? "S" :
            mode === "FAST" ? "F" :
            mode === "ULTRA" ? "U" :
            "N";
        el.title = this.tr("speedButtonTitle", "Speed: {mode}").replace("{mode}", mode);
    }

    setAutoPlayRemaining(remaining) {
        const r = Math.max(0, Number(remaining) || 0);
        this.autoPlayRemaining = r;
        const el = document.getElementById("ui-btn-autoplay");
        if (!el) return;
        const replayBtn = document.getElementById("ui-btn-replay");
        if (replayBtn) {
            const lockReplay = r > 0;
            replayBtn.disabled = lockReplay;
            replayBtn.style.pointerEvents = lockReplay ? "none" : "auto";
            replayBtn.style.opacity = lockReplay ? "0.6" : "";
        }

        // Reference style: show ONLY number when active/selected; icon is always present.
        if (r > 0) {
            el.textContent = String(r);
            return;
        }

        // When not running: show selected count ONLY if user selected something.
        el.textContent = this.autoPlaySelected ? String(this.autoPlayCount) : "";
        this.updatePlayButtonMode();
    }

    clearAutoPlaySelection() {
        this.autoPlaySelected = false;
        this.autoPlayRemaining = 0;
        const el = document.getElementById("ui-btn-autoplay");
        if (el) el.textContent = "";
        this.updatePlayButtonMode();
    }

    getCurrentBet() { return this.bet; }
    getCurrentBalance() { return this.balance; }
    getAutoPlayCount() { return this.autoPlayCount; }
    getAutoPlaySelected() { return !!this.autoPlaySelected; }
    getSpeedMode() { return this.speedMode || "NORMAL"; }
    getVolatility() { return "NORMAL"; }
    updateCombo(payload) { this.hudPanel?.setCombo(payload?.comboCount, payload?.comboWindowRatio); }
}
