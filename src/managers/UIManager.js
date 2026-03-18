import BetPanel from "../ui/BetPanel.js";
import HudPanel from "../ui/HudPanel.js";
import ResultPanel from "../ui/ResultPanel.js";
import { GAME_STATES } from "./GameStateManager.js";
import { GAME_CONFIG } from "../data/gameConfig.js";

export default class UIManager {
    constructor(scene) {
        this.scene = scene;

        this.betPanel = null;
        this.hudPanel = null;
        this.resultPanel = null;
    }

    createAll() {
        this.betPanel = new BetPanel(this.scene, GAME_CONFIG.round);
        this.hudPanel = new HudPanel(this.scene);
        this.resultPanel = new ResultPanel(this.scene);
    }

    bindEvents(roundManager) {
        this.betPanel.onStart = () => {
            roundManager.startPrototypeRound();
        };

        this.resultPanel.onReplay = () => {
            roundManager.replay();
        };
    }

    updateByState(state) {
        switch (state) {
            case GAME_STATES.BETTING:
                this.betPanel.setVisible(true);
                this.hudPanel.setVisible(false);
                this.resultPanel.setVisible(false);
                break;

            case GAME_STATES.STARTING:
            case GAME_STATES.KICKING:
            case GAME_STATES.FLYING:
            case GAME_STATES.ROUND_END:
                this.betPanel.setVisible(false);
                this.hudPanel.setVisible(true);
                this.resultPanel.setVisible(false);
                break;

            case GAME_STATES.RESULT:
                this.betPanel.setVisible(false);
                this.hudPanel.setVisible(false);
                this.resultPanel.setVisible(true);
                break;

            case GAME_STATES.PAUSED:
                break;
        }
    }

    getCurrentBet() {
        return this.betPanel?.bet ?? GAME_CONFIG.round.defaultBet;
    }

    updateMultiplier(value) {
        this.hudPanel?.setMultiplier(value);
    }

    updateCombo(payload) {
        this.hudPanel?.setCombo(
            payload?.comboCount ?? 0,
            payload?.comboWindowRatio ?? 0
        );
    }

    showResult(result) {
        this.resultPanel?.show(result);
    }

    applyRoundResult(result) {
        if (!this.betPanel) return;

        this.betPanel.balance += result.payout - result.betAmount;
        this.betPanel.balance = Math.max(0, this.betPanel.balance);
        this.betPanel.refresh();
    }
}