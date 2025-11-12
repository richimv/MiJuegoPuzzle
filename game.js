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
        // --- Actualización del Jugador ---
        this.updateBoard(this.player, deltaTime);

        // --- Actualización de la IA (si existe) ---
        if (this.ai) {
            this.updateBoard(this.ai, deltaTime);
        }

        // --- Actualización del Gestor de Basura ---
        this.garbageManager.updateWaveController();

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
        // Comprobación de seguridad: no hacer nada si el tablero no existe.
        if (!board) return;

        // Si el tablero está en la fase de animación de limpieza, solo actualizamos su temporizador.
        if (board.isResolving) {
            board.clearTimer -= deltaTime;
            if (board.clearTimer <= 0) {
                board.clearBlocks();
                board.isResolving = false;
            }
            return; // No hacer nada más hasta que la animación termine.
        }

        // 1. Nueva lógica de gravedad unificada.
        const isAnythingFalling = board.updateGravityAndFallingBlocks(deltaTime, this.audioManager);
        this.garbageManager.updatePendingGarbage(board, deltaTime); // Actualizamos el temporizador de la basura aquí.

        // 2. Si nada está cayendo, podemos continuar con la lógica de juego.
        if (!isAnythingFalling) {
            // 4. Buscar y manejar combinaciones.
            const clearedCount = board.handleMatches();
            if (clearedCount > 0) {
                board.isResolving = true;
                board.clearTimer = 400; // Iniciar temporizador para la animación de limpieza.
                board.comboCount++;
                if (board.isPlayer) {
                    this.player.score += clearedCount * 10 * board.comboCount;
                    this.audioManager.play('clear');
                    if (board.comboCount > 1) this.audioManager.play('combo');                    
                    if (this.gameMode === 'VS_CPU') this.garbageManager.accumulateGarbage(this.player, clearedCount, board.comboCount);
                } else { // Es la IA
                    this.garbageManager.accumulateGarbage(this.ai, clearedCount, board.comboCount);
                }

                return; // Salimos para que la animación de limpieza ocurra.
            }

            // 5. Si no hubo combinaciones, reseteamos el contador de combo.
            if (board.comboCount > 0 && this.gameMode === 'VS_CPU') {
                this.garbageManager.sendAccumulatedGarbage(board);
                board.comboCount = 0;
            }

            // 5.5. Si no hay combinaciones y nada cae, procesar la siguiente oleada de basura.
            board.handleIncomingGarbage(this.garbageManager, this.audioManager);

            // 6. Si el tablero es del jugador, manejar la subida del tablero.
            if (board.isPlayer) {
                // Solo se puede subir el tablero si no hay basura pendiente
                const canRaise = this.garbageManager.getPendingGarbage(board.isPlayer).length === 0;
                if (board.updateRaise(deltaTime, canRaise) === 'gameover') {
                    this.gameOver('AI');
                    return;
                }
            } else { // Es la IA
                // 7. La IA solo piensa si el tablero no se está resolviendo.
                if (!board.isResolving) {
                    board.update(deltaTime, isAnythingFalling);
                    // Si la IA no puede hacer un movimiento, sube su pila.
                    if (board.raiseStack() === 'gameover') {
                        return; // La IA pierde si la pila llega al tope.
                    }
                }
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
        // Esta línea soluciona el problema de no saber dónde está el límite.
        context.strokeStyle = '#FFFFFF'; // Un color visible, como el borde exterior
        context.lineWidth = 1; // Una línea delgada es suficiente
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

        // --- DIBUJAR BASURA PENDIENTE Y TEMPORIZADOR ---
        const queue = this.garbageManager.getPendingGarbage(board.isPlayer);
        const holdTimer = this.garbageManager.getGarbageHoldTimer(board.isPlayer);
        const totalGarbage = queue.reduce((sum, chunk) => sum + chunk.length, 0);

        if (totalGarbage > 0 && holdTimer > 0) {
            // --- ¡NUEVO INDICADOR DE BASURA! ---
            const indicatorX = 5; // Margen izquierdo
            const indicatorWidth = 15;
            const maxIndicatorHeight = offsetY - 10; // Altura máxima disponible

            // La altura del indicador es proporcional a la basura. Cada 2 filas completas llenan la barra.
            const garbageRows = totalGarbage / GRID_WIDTH;
            const indicatorHeight = Math.min(maxIndicatorHeight, (garbageRows / (GARBAGE_PREVIEW_ROWS * 2)) * maxIndicatorHeight);

            // El color cambia según la cantidad de basura
            let indicatorColor = '#4CAF50'; // Verde (poco peligro)
            if (garbageRows >= 3) indicatorColor = '#FFC107'; // Amarillo (peligro medio)
            if (garbageRows >= 6) indicatorColor = '#F44336'; // Rojo (peligro alto)

            // Hacer que parpadee cuando el tiempo se acaba
            const isBlinking = holdTimer < 1000 && Math.floor(holdTimer / 100) % 2 === 0;
            if (!isBlinking) {
                // Dibujar fondo de la barra
                context.fillStyle = 'rgba(0, 0, 0, 0.5)';
                context.fillRect(indicatorX, maxIndicatorHeight - indicatorHeight + 5, indicatorWidth, indicatorHeight);

                // Dibujar barra de progreso de basura
                context.fillStyle = indicatorColor;
                context.fillRect(indicatorX, maxIndicatorHeight - indicatorHeight + 5, indicatorWidth, indicatorHeight);

                // Dibujar borde de la barra
                context.strokeStyle = '#FFF';
                context.strokeRect(indicatorX, 5, indicatorWidth, maxIndicatorHeight);
            }

            // Dibujar el número de bloques
            context.fillStyle = 'white';
            context.font = `bold ${board.blockSize * 0.6}px sans-serif`;
            context.textAlign = 'left';
            context.textBaseline = 'middle';
            context.fillText(totalGarbage, indicatorX + indicatorWidth + 10, offsetY / 2);
        }
    }
}
