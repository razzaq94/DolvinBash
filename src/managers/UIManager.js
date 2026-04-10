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

        this.quickBetOverlay = null;
        this.quickBetPanel = null;

        this.autoPlayCount = 1;
        this.autoPlayOverlay = null;
        this.autoPlayRemaining = 0;
        this.autoPlaySelected = false;

        this.speedMode = GAME_CONFIG.round.defaultSpeedMode || "NORMAL";
        this.speedOverlay = null;
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
        this.createHeader();
        this.createBetPanel();
        this.createResultOverlay();
        this.updateBet(this.bet);
        this.updateBalance(this.balance);
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

    createHeader() {
        const header = document.createElement("div");
        header.className = "game-header";
        header.innerHTML = `
            <div class="logo-text">DOLWIN &amp; BASH</div>
            <button id="ui-btn-mute" class="mute-btn" title="Mute / Unmute" aria-label="Mute / Unmute" style="margin-left:10px;">🔊</button>
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

    createBetPanel() {
        // Mobile-only: floating Balance + Multiplier boxes right above the bottom bar.
        const mobileFloat = document.createElement("div");
        mobileFloat.className = "mobile-float-stats mobile-only";
        mobileFloat.id = "ui-mobile-float-stats";
        mobileFloat.innerHTML = `
            <div class="mobile-stat glass-panel">
                <div class="bet-label">Balance</div>
                <div id="ui-balance-top" class="bet-value success">0.00</div>
            </div>
            <div class="mobile-stat glass-panel" style="text-align:right;">
                <div class="bet-label">Multiplier</div>
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
                    <span class="bet-label">Balance</span>
                    <span id="ui-balance" class="bet-value success">0.00</span>
                </div>
            </div>
            
            <div class="controls-group">
                <button id="ui-btn-minus" class="btn-mode btn-icon">−</button>
                <div class="bet-section" style="text-align: center;">
                    <span class="bet-label">Bet</span>
                    <span id="ui-bet" class="bet-value">10</span>
                </div>
                <button id="ui-btn-plus" class="btn-mode btn-icon">+</button>
                <button id="ui-btn-speed" class="btn-mode btn-icon">S</button>
                <button id="ui-btn-autoplay" class="btn-mode btn-icon autoplay-btn"></button>
                <button id="ui-btn-play" class="btn-main">PLAY</button>
            </div>

            <div class="bet-section desktop-only" style="text-align: right;">
                <span class="bet-label">Multiplier</span>
                <span id="ui-multiplier" class="bet-value warning">x1.00</span>
            </div>
        `;
        wrapper.appendChild(mobileFloat);
        wrapper.appendChild(betPanel);
        this.root.appendChild(wrapper);

        document.getElementById("ui-btn-minus")?.addEventListener("click", () => {
            this.playUiClick();
            this.changeBet(-10);
        });
        document.getElementById("ui-btn-plus")?.addEventListener("click", () => {
            this.playUiClick();
            this.changeBet(10);
        });
        document.getElementById("ui-btn-play")?.addEventListener("click", () => {
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
    }

    createResultOverlay() {
        const overlay = document.createElement("div");
        overlay.className = "result-overlay";
        overlay.id = "ui-result-overlay";
        overlay.innerHTML = `
            <div class="result-panel glass-panel">
                <h2 id="ui-result-title" class="result-title">ROUND ENDED</h2>
                <div class="result-stats">
                    <div class="stat-item"><span class="stat-label">Bet</span><span id="res-bet" class="stat-value">0</span></div>
                    <div class="stat-item"><span class="stat-label">Multiplier</span><span id="res-mult" class="stat-value">x0</span></div>
                    <div class="stat-item"><span class="stat-label">Distance</span><span id="res-dist" class="stat-value">0</span></div>
                    <div class="stat-item"><span class="stat-label">Payout</span><span id="res-payout" class="stat-value success">0</span></div>
                </div>
                <button id="ui-btn-replay" class="btn-main" style="width: 100%;">REPLAY</button>
            </div>
        `;
        this.root.appendChild(overlay);
        document.getElementById("ui-btn-replay")?.addEventListener("click", () => {
            this.playUiClick();
            this.onReplay?.();
        });
    }

    bindEvents(roundManager) {
        this.onStart = () => roundManager.startPrototypeRound();
        this.onReplay = () => roundManager.replay();
    }

    setPrePlayControlsEnabled(enabled) {
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
                el.disabled = !enabled;
            }
            el.style.pointerEvents = enabled ? "auto" : "none";
            el.style.opacity = enabled ? "" : "0.6";
        });
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

        switch (state) {
            case GAME_STATES.BETTING:
                this.setPrePlayControlsEnabled(true);
                if (betPanel) betPanel.style.opacity = "1";
                if (betPanel) betPanel.style.pointerEvents = "auto";
                if (overlay) overlay.classList.remove("visible");
                this.hudPanel.setVisible(false);
                break;
            case GAME_STATES.FLYING:
                this.setPrePlayControlsEnabled(false);
                this.hudPanel.setVisible(true);
                if (betPanel) betPanel.style.pointerEvents = "none";
                break;
            case GAME_STATES.KICKING:
            case GAME_STATES.ROUND_END:
                this.setPrePlayControlsEnabled(false);
                if (betPanel) betPanel.style.pointerEvents = "none";
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
            titleEl.textContent = result.hitHazard ? "ROUND OVER" : "YOU WON!";
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
        title.textContent = "Quick Bet";

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
        title.textContent = "Autoplay settings";

        const closeBtn = document.createElement("button");
        closeBtn.className = "autoplay-close";
        closeBtn.type = "button";
        closeBtn.textContent = "×";
        closeBtn.addEventListener("click", () => {
            this.playUiClick();
            this.closeAutoPlay();
        });

        header.appendChild(title);
        header.appendChild(closeBtn);

        const grid = document.createElement("div");
        grid.className = "autoplay-grid";

        const values = [1, 10, 20, 50, 100, 250, 500, 750, 1000];
        values.forEach((val) => {
            const btn = document.createElement("button");
            btn.className = "autoplay-chip";
            btn.type = "button";
            btn.textContent = String(val);
            btn.addEventListener("click", () => {
                this.playUiClick();
                this.autoPlayCount = val;
                this.autoPlaySelected = true;
                this.setAutoPlayRemaining(0);
            });
            grid.appendChild(btn);
        });

        const sliderRow = document.createElement("div");
        sliderRow.className = "autoplay-slider-row";

        const sliderLabel = document.createElement("div");
        sliderLabel.className = "autoplay-subtitle";
        sliderLabel.textContent = "Numbers of autospins:";

        const slider = document.createElement("input");
        slider.className = "autoplay-slider";
        slider.type = "range";
        slider.min = "1";
        slider.max = "1000";
        slider.step = "1";
        slider.value = String(this.autoPlayCount || 1);

        const sliderValue = document.createElement("div");
        sliderValue.className = "autoplay-value";
        sliderValue.textContent = String(this.autoPlayCount || 1);

        const syncValue = (next) => {
            const v = Math.max(1, Math.min(1000, Number(next) || 1));
            this.autoPlayCount = v;
            this.autoPlaySelected = true;
            slider.value = String(v);
            sliderValue.textContent = String(v);
            this.setAutoPlayRemaining(0);
        };

        slider.addEventListener("input", () => {
            this.playUiClick();
            syncValue(slider.value);
        });

        // Ensure chips update slider/value too
        grid.querySelectorAll("button.autoplay-chip").forEach((btn) => {
            btn.addEventListener("click", () => syncValue(btn.textContent));
        });

        const actions = document.createElement("div");
        actions.className = "autoplay-actions";

        const startBtn = document.createElement("button");
        startBtn.className = "btn-main autoplay-start";
        startBtn.type = "button";
        startBtn.textContent = `Start autoplay (${this.autoPlayCount || 1})`;
        const updateStartLabel = () => {
            startBtn.textContent = `Start autoplay (${this.autoPlayCount || 1})`;
        };
        slider.addEventListener("input", updateStartLabel);
        grid.querySelectorAll("button.autoplay-chip").forEach((btn) => btn.addEventListener("click", updateStartLabel));

        startBtn.addEventListener("click", () => {
            this.playUiStart();
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
        title.textContent = "Speed";

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
        el.title = `Speed: ${mode}`;
    }

    setAutoPlayRemaining(remaining) {
        const r = Math.max(0, Number(remaining) || 0);
        this.autoPlayRemaining = r;
        const el = document.getElementById("ui-btn-autoplay");
        if (!el) return;

        // Reference style: show ONLY number when active/selected; icon is always present.
        if (r > 0) {
            el.textContent = String(r);
            return;
        }

        // When not running: show selected count ONLY if user selected something.
        el.textContent = this.autoPlaySelected ? String(this.autoPlayCount) : "";
    }

    clearAutoPlaySelection() {
        this.autoPlaySelected = false;
        this.autoPlayRemaining = 0;
        const el = document.getElementById("ui-btn-autoplay");
        if (el) el.textContent = "";
    }

    getCurrentBet() { return this.bet; }
    getAutoPlayCount() { return this.autoPlayCount; }
    getAutoPlaySelected() { return !!this.autoPlaySelected; }
    getSpeedMode() { return this.speedMode || "NORMAL"; }
    getVolatility() { return "NORMAL"; }
    updateCombo(payload) { this.hudPanel?.setCombo(payload?.comboCount, payload?.comboWindowRatio); }
}
