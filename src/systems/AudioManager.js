export default class AudioManager {
    constructor(scene) {
        this.scene = scene;
        this.sounds = new Map();
        this.enabled = true;
    }

    isEnabled() {
        return !!this.enabled;
    }

    tryUnlock() {
        const sm = this.scene?.sound;
        const ctx = sm?.context;
        if (!ctx) return;
        if (ctx.state === "suspended") {
            try {
                ctx.resume();
            } catch {
                // ignore
            }
        }
    }

    /**
     * Play a sound by key
     * @param {string} key - Sound key defined in PreloadScene
     * @param {object} config - Phaser audio config (volume, loop, etc)
     */
    play(key, config = { volume: 0.5 }) {
        if (!this.enabled) return null;
        this.tryUnlock();
        
        try {
            const loop = !!config?.loop;
            if (loop) {
                let s = this.sounds.get(key);
                if (!s) {
                    s = this.scene.sound.add(key, config);
                    this.sounds.set(key, s);
                } else {
                    s.setVolume?.(config?.volume ?? s.volume ?? 1);
                    s.setRate?.(config?.rate ?? s.rate ?? 1);
                    s.setLoop?.(true);
                }
                if (!s.isPlaying) {
                    s.play();
                }
                return s;
            }

            // One-shots: create and destroy on complete to prevent sound leaks.
            const s = this.scene.sound.add(key, config);
            s.once?.("complete", () => {
                try { s.destroy(); } catch { /* ignore */ }
            });
            s.play();
            return s;
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
        const s = this.sounds.get(key);
        if (s) {
            try { s.destroy(); } catch { /* ignore */ }
            this.sounds.delete(key);
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.scene.sound.stopAll();
            // destroy cached looped sounds so they restart cleanly when unmuted
            for (const [, s] of this.sounds) {
                try { s.destroy(); } catch { /* ignore */ }
            }
            this.sounds.clear();
        }
    }
}
