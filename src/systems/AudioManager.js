export default class AudioManager {
    constructor(scene) {
        this.scene = scene;
        this.sounds = new Map();
        this.enabled = true;
    }

    /**
     * Play a sound by key
     * @param {string} key - Sound key defined in PreloadScene
     * @param {object} config - Phaser audio config (volume, loop, etc)
     */
    play(key, config = { volume: 0.5 }) {
        if (!this.enabled) return null;
        
        try {
            const sound = this.scene.sound.add(key, config);
            sound.play();
            return sound;
        } catch (error) {
            console.warn(`[AudioManager] Failed to play sound: ${key}`, error);
            return null;
        }
    }

    /**
     * Play a random sound from a list
     * @param {string[]} keys 
     * @param {object} config 
     */
    playRandom(keys, config = { volume: 0.5 }) {
        if (!keys || keys.length === 0) return;
        const key = keys[Math.floor(Math.random() * keys.length)];
        this.play(key, config);
    }

    stop(key) {
        this.scene.sound.stopByKey(key);
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.scene.sound.stopAll();
        }
    }
}
