import { TIME_ATTACK_DURATION } from './constants.js';

export class UIManager {
    constructor() {
        this.scoreEl = document.getElementById('score');
        this.comboEl = document.getElementById('combo');
        this.opponentStatusEl = document.getElementById('opponent-status'); // Not used yet, but good to have
        this.vsCpuUi = document.getElementById('vs-cpu-ui');
        this.timerContainer = document.getElementById('timer-container');
        this.timerEl = document.getElementById('timer');
        this.menuOverlay = document.getElementById('menu-overlay');
        this.startEasyButton = document.getElementById('start-easy-button');
        this.startHardButton = document.getElementById('start-hard-button');
        this.startTimeAttackButton = document.getElementById('start-time-attack-button');
        this.gameOverOverlay = document.getElementById('game-over-overlay');
        this.gameOverMessageEl = document.getElementById('game-over-message');
        this.finalScoreEl = document.getElementById('final-score');
        this.playAgainButton = document.getElementById('play-again-button');
    }

    // Método para configurar los listeners de los botones del menú
    setupMenuListeners(onStartGame) {
        this.startEasyButton.addEventListener('click', () => onStartGame({ mode: 'VS_CPU', difficulty: 'EASY' }));
        this.startHardButton.addEventListener('click', () => onStartGame({ mode: 'VS_CPU', difficulty: 'HARD' }));
        this.startTimeAttackButton.addEventListener('click', () => onStartGame({ mode: 'TIME_ATTACK' }));
        this.playAgainButton.addEventListener('click', () => onStartGame()); // El gestor del juego recordará las últimas opciones
    }

    // Método para mostrar/ocultar elementos de la UI según el modo de juego
    setGameModeUI(gameMode) {
        this.menuOverlay.style.display = 'none';
        this.gameOverOverlay.style.display = 'none';

        if (gameMode === 'VS_CPU') {
            this.vsCpuUi.style.display = 'block';
            this.timerContainer.style.display = 'none';
        } else if (gameMode === 'TIME_ATTACK') {
            this.vsCpuUi.style.display = 'none';
            this.timerContainer.style.display = 'block';
        } else { // Estado por defecto o menú
            this.vsCpuUi.style.display = 'none';
            this.timerContainer.style.display = 'none';
        }
    }

    // Método para actualizar la puntuación y el combo
    updateGameStats(playerScore, playerCombo) {
        this.scoreEl.innerText = playerScore;
        this.comboEl.innerText = `x${playerCombo}`;
    }

    // Método para actualizar la visualización del temporizador
    updateTimer(timerMs) {
        const totalSeconds = Math.max(0, Math.ceil(timerMs / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        this.timerEl.innerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    // Método para mostrar la pantalla de Game Over
    showGameOver(message, finalScore, gameMode) {
        this.finalScoreEl.innerText = finalScore;
        if (gameMode === 'TIME_ATTACK') {
            this.gameOverMessageEl.innerText = "Time's Up!";
        } else {
            this.gameOverMessageEl.innerText = message;
        }
        this.gameOverOverlay.style.display = 'flex';
    }

    // Método para ocultar la pantalla de Game Over
    hideGameOver() {
        this.gameOverOverlay.style.display = 'none';
    }

    // Método para mostrar la pantalla del menú
    showMenu() {
        this.menuOverlay.style.display = 'flex';
    }
}