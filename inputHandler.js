// c:\Users\ricar\Downloads\MiJuegoPuzzle-main\inputHandler.js
export class InputHandler {
    constructor(gameInstance, audioManager) {
        this.game = gameInstance;
        this.audioManager = audioManager;
        this.setupListeners();
    }

    setupListeners() {
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
    }

    handleKeyDown(e) {
        if (this.game.gameState !== 'PLAYING' || !this.game.player) return;
        this.audioManager.unlock();
        this.game.player.handleKeyPress(e.key, this.audioManager);
    }

    handleKeyUp(e) {
        if (this.game.gameState !== 'PLAYING' || !this.game.player) return;
        this.game.player.handleKeyUp(e.key);
    }
}