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
    }

    createAll() {
        this.hudPanel = new HudPanel(this.scene);
        this.initHtmlUI();
    }

    initHtmlUI() {
        if (!this.root) return;
        this.root.innerHTML = "";
        this.createHeader();
        this.createBetPanel();
        this.createResultOverlay();
        this.updateBet(this.bet);
        this.updateBalance(this.balance);
    }

    createHeader() {
        const header = document.createElement("div");
        header.className = "game-header";
        header.innerHTML = `
            <div class="logo-text">DOLVIN BASH</div>
        `;
        this.root.prepend(header);
    }

    createBetPanel() {
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
                <button id="ui-btn-play" class="btn-main">PLAY</button>
            </div>

            <div class="bet-section desktop-only" style="text-align: right;">
                <span class="bet-label">Multiplier</span>
                <span id="ui-multiplier" class="bet-value warning">x1.00</span>
            </div>
        `;
        this.root.appendChild(betPanel);

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
    }

    createResultOverlay() {
        const overlay = document.createElement("div");
        overlay.className = "result-overlay";
        overlay.id = "ui-result-overlay";
        overlay.style.pointerEvents = "none"; // Safe default
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

    updateByState(state) {
        const betPanel = document.getElementById("ui-bet-panel");
        const overlay = document.getElementById("ui-result-overlay");

        switch (state) {
            case GAME_STATES.BETTING:
                if (betPanel) betPanel.style.opacity = "1";
                if (betPanel) betPanel.style.pointerEvents = "auto";
                if (overlay) overlay.classList.remove("visible");
                this.hudPanel.setVisible(false);
                break;
            case GAME_STATES.FLYING:
                this.hudPanel.setVisible(true);
                if (betPanel) betPanel.style.pointerEvents = "none";
                break;
            case GAME_STATES.RESULT:
                if (overlay) overlay.classList.add("visible");
                this.hudPanel.setVisible(false);
                break;
        }
    }

    changeBet(delta) {
        this.bet = Phaser.Math.Clamp(this.bet + delta, GAME_CONFIG.round.minBet, GAME_CONFIG.round.maxBet);
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
    }

    updateMultiplier(value) {
        this.multiplier = value;
        const formatted = `x${Number(value).toFixed(2)}`;
        
        const el = document.getElementById("ui-multiplier");
        if (el) el.textContent = formatted;

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

    getCurrentBet() { return this.bet; }
    getSpeedMode() { return "NORMAL"; }
    getVolatility() { return "NORMAL"; }
    updateCombo(payload) { this.hudPanel?.setCombo(payload?.comboCount, payload?.comboWindowRatio); }
}
