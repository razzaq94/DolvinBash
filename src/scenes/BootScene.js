export default class BootScene extends Phaser.Scene {
    constructor() {
        super("BootScene");
    }

    preload() {
        console.log("[BootScene] preload");
    }

    create() {
        console.log("[BootScene] create");
        this.scene.start("PreloadScene");
    }
}