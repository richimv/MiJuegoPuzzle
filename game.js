import { Player } from './player.js';
import { AI } from './ai.js';
import { AudioManager } from './audio.js';
import { UIManager } from './uiManager.js';
import { InputHandler } from './inputHandler.js';
import { ScreenShake } from './screenShake.js';
import { GarbageManager } from './garbageManager.js';
import { GRID_WIDTH, BLOCK_TYPES, CURSOR_COLOR, TIME_ATTACK_DURATION } from './constants.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const aiCanvas = document.getElementById('aiCanvas');
const aiCtx = aiCanvas.getContext('2d');

/**
 * Clase principal del juego, reescrita para mayor claridad y estabilidad.
 */
export class Game {
    constructor() {
        this.gameState = 'MENU';
        this.audioManager = new AudioManager();
        this.uiManager = new UIManager();
        this.inputHandler = new InputHandler(this, this.audioManager); // Pasa la instancia del juego y el gestor de audio
        this.screenShake = new ScreenShake();
        this.garbageManager = new GarbageManager(this.audioManager, this.screenShake);

        this.uiManager.setupMenuListeners(this.start.bind(this)); // Pasa el método start al gestor de UI
        this.uiManager.showMenu(); // Mostrar el menú al iniciar el juego.

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    start(options = this.lastGameOptions) { // Por defecto, usa las últimas opciones para "jugar de nuevo"
        // Si no hay opciones (p. ej., primer clic en "Jugar de nuevo"), no hacer nada.
        if (!options) return;

        this.lastGameOptions = options; // Almacena las opciones para "jugar de nuevo"
        this.gameMode = options.mode;
        this.uiManager.setGameModeUI(this.gameMode);
        this.uiManager.hideGameOver();

        this.gameState = 'PLAYING';
        this.lastTime = 0;
        this.player = new Player();
        this.ai = null;
        this.garbageManager.reset();
        this.screenShake.shakeDuration = 0; // Reinicia la duración de la sacudida

        if (this.gameMode === 'VS_CPU') {
            this.ai = new AI(options.difficulty);
        } else if (this.gameMode === 'TIME_ATTACK') {
            this.timer = TIME_ATTACK_DURATION * 1000;
        }

        this.audioManager.loadSounds();
    }

    gameOver(winner) {
        if (this.gameState === 'GAME_OVER') return;
        this.gameState = 'GAME_OVER';
        const message = winner === 'PLAYER' ? '¡Has Ganado!' : 'Game Over';
        this.uiManager.showGameOver(message, this.player.score, this.gameMode);
    }

    gameLoop(timestamp) {
        requestAnimationFrame(this.gameLoop.bind(this));

        if (!this.lastTime) this.lastTime = timestamp;
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // Actualizar sacudida de pantalla
        this.screenShake.update(deltaTime);

        if (this.gameState === 'PLAYING') {
            this.update(deltaTime);
        }

        this.render();
    }

    update(deltaTime) {
        this.updateBoard(this.player, deltaTime);
        if (this.ai) this.updateBoard(this.ai, deltaTime);

        // --- Actualización del Temporizador (si aplica) ---
        if (this.gameMode === 'TIME_ATTACK') {
            this.timer -= deltaTime;
            if (this.timer <= 0) {
                this.timer = 0;
                this.gameOver(); // Sin ganador específico
            }
        }
    }

    updateBoard(board, deltaTime) {
        if (!board) return;

        if (board.isResolving) {
            board.clearTimer -= deltaTime;
            if (board.clearTimer <= 0) {
                board.clearBlocks();
                board.isResolving = false;
            }
            return;
        }

        const isAnythingFalling = board.updateGravityAndFallingBlocks(deltaTime, this.audioManager);

        // Si un combo ha terminado (no hay más limpiezas pero el contador es > 0), enviar la basura.
        if (board.comboCount > 0 && board.handleMatches() === 0 && !isAnythingFalling) {
            this.garbageManager.sendAccumulatedGarbage(board);
            board.comboCount = 0;
        }

        if (!isAnythingFalling) {
            const clearedCount = board.handleMatches();
            if (clearedCount > 0) {
                board.isResolving = true;
                board.clearTimer = 400;
                board.comboCount++;

                if (board.isPlayer) {
                    this.player.score += clearedCount * 10 * board.comboCount;
                    if (this.gameMode === 'VS_CPU') {
                        this.garbageManager.accumulateGarbage(this.player, clearedCount, board.comboCount);
                    }
                } else {
                    this.garbageManager.accumulateGarbage(this.ai, clearedCount, board.comboCount);
                }
                return;
            }

            board.handleIncomingGarbage(this.garbageManager, this.audioManager);

            if (board.isPlayer) {
                if (board.updateRaise(deltaTime, true) === 'gameover') {
                    this.gameOver('AI');
                }
            } else {
                board.update(deltaTime); // Llamamos al método update de la IA.
            }
        }
    }

    render() {
        const { x: shakeX, y: shakeY } = this.screenShake.getShakeOffset();

        // Dibuja el tablero del jugador, aplicando la sacudida si es necesario.
        ctx.save();
        ctx.translate(shakeX, shakeY);
        this.renderBoard(ctx, this.player);
        ctx.restore();

        // Dibuja el tablero de la IA.
        this.renderBoard(aiCtx, this.ai);

        this.updateUI();
    }

    updateUI() {
        if (this.player) {
            // La puntuación y el combo ahora se actualizan desde el bucle principal
            this.uiManager.updateGameStats(this.player.score, this.player.comboCount);
        }
        if (this.gameMode === 'TIME_ATTACK') {
            this.uiManager.updateTimer(this.timer);
        }
    }
    
    renderBoard(context, board) {
        context.clearRect(0, 0, context.canvas.width, context.canvas.height);
        if (!board) return; // No dibujar si el tablero no existe.

        const GARBAGE_PREVIEW_ROWS = 3;
        const offsetY = GARBAGE_PREVIEW_ROWS * board.blockSize;

        for (let x = 0; x < board.grid.length; x++) {
            for (let y = 0; y < board.grid[x].length; y++) {
                const block = board.grid[x][y];
                if (!block) continue;

                const color = BLOCK_TYPES[block.type];
                let yPos = block.state === 'falling' ? block.visualY : y * board.blockSize;
                yPos += offsetY; // Aplicar offset a todos los bloques del tablero
    
                context.fillStyle = color;
                if (block.state === 'clearing') {
                    const elapsed = Date.now() - block.clearTime;
                    const shrinkFactor = Math.min(1, elapsed / 400);
                    const size = board.blockSize * (1 - shrinkFactor);
                    const offset = (board.blockSize - size) / 2;
                    context.clearRect(x * board.blockSize, yPos, board.blockSize, board.blockSize); // Limpiar en la posición correcta
                    context.fillRect(x * board.blockSize + offset, yPos + offset, size, size);
                } else {
                    context.fillRect(x * board.blockSize, yPos, board.blockSize, board.blockSize);
                }

                context.strokeStyle = '#333';
                context.strokeRect(x * board.blockSize, yPos, board.blockSize, board.blockSize);
            }
        }

        // --- DIBUJAR LÍMITE SUPERIOR DEL TABLERO ---
        context.strokeStyle = '#FFFFFF';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(0, offsetY);
        context.lineTo(context.canvas.width, offsetY);
        context.stroke();

        // Dibujar cursor
        if (board.cursor) {
            context.strokeStyle = CURSOR_COLOR;
            context.lineWidth = 2;
            context.strokeRect(board.cursor.x * board.blockSize, board.cursor.y * board.blockSize + offsetY, board.blockSize * 2, board.blockSize);
        }

        // El indicador de basura se dibuja en una capa separada o como parte de la UI general si es necesario.
        // Por ahora, lo mantenemos simple.
    }
}
