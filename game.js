import { Player } from './player.js';
import { AI } from './ai.js';
import { AudioManager } from './audio.js';
import { GRID_WIDTH, GRID_HEIGHT, BLOCK_TYPES, CURSOR_COLOR, TIME_ATTACK_DURATION, GARBAGE_DROP_DELAY, GARBAGE_TYPE, GARBAGE_COLOR } from './constants.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const aiCanvas = document.getElementById('aiCanvas');
const aiCtx = aiCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const opponentStatusEl = document.getElementById('opponent-status');
const vsCpuUi = document.getElementById('vs-cpu-ui');
const timerContainer = document.getElementById('timer-container');
const timerEl = document.getElementById('timer');
const menuOverlay = document.getElementById('menu-overlay');
const startEasyButton = document.getElementById('start-easy-button');
const startHardButton = document.getElementById('start-hard-button');
const startTimeAttackButton = document.getElementById('start-time-attack-button');
const gameOverOverlay = document.getElementById('game-over-overlay');
const gameOverMessageEl = document.getElementById('game-over-message');
const finalScoreEl = document.getElementById('final-score');
const playAgainButton = document.getElementById('play-again-button');

/**
 * Clase principal del juego, reescrita para mayor claridad y estabilidad.
 */
export class Game {
    constructor() {
        this.gameState = 'MENU';
        this.audioManager = new AudioManager();
        this.setupInputHandlers();
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    setupInputHandlers() {
        document.addEventListener('keydown', (e) => {
            if (this.gameState !== 'PLAYING' || !this.player) return;
            this.audioManager.unlock();
            this.player.handleKeyPress(e.key, this.audioManager);
        });
        document.addEventListener('keyup', (e) => {
            if (this.gameState !== 'PLAYING' || !this.player) return;
            this.player.handleKeyUp(e.key);
        });

        startEasyButton.addEventListener('click', () => this.start({ mode: 'VS_CPU', difficulty: 'EASY' }));
        startHardButton.addEventListener('click', () => this.start({ mode: 'VS_CPU', difficulty: 'HARD' }));
        startTimeAttackButton.addEventListener('click', () => this.start({ mode: 'TIME_ATTACK' }));
        playAgainButton.addEventListener('click', () => this.start(this.lastGameOptions));
    }

    start(options) {
        this.lastGameOptions = options;
        this.gameMode = options.mode;
        menuOverlay.style.display = 'none';
        gameOverOverlay.style.display = 'none';

        this.gameState = 'PLAYING';
        this.lastTime = 0;
        this.player = new Player();
        this.ai = null;
        this.playerPendingGarbage = [];
        this.aiPendingGarbage = [];
        this.playerGarbageHoldTimer = 0;
        this.aiGarbageHoldTimer = 0;
        this.playerGarbageDropTimer = 0;
        this.aiGarbageDropTimer = 0;
        this.shakeDuration = 0;

        if (this.gameMode === 'VS_CPU') {
            this.ai = new AI(options.difficulty);
            aiCanvas.style.display = 'block';
            vsCpuUi.style.display = 'block';
            timerContainer.style.display = 'none';
        } else if (this.gameMode === 'TIME_ATTACK') {
            this.timer = TIME_ATTACK_DURATION * 1000;
            aiCanvas.style.display = 'none';
            vsCpuUi.style.display = 'none';
            timerContainer.style.display = 'block';
        }

        this.audioManager.loadSounds();
    }

    gameOver(winner) {
        if (this.gameState === 'GAME_OVER') return;
        this.gameState = 'GAME_OVER';
        finalScoreEl.innerText = this.player.score;

        if (this.gameMode === 'TIME_ATTACK') {
            gameOverMessageEl.innerText = "Time's Up!";
        } else {
            gameOverMessageEl.innerText = winner === 'PLAYER' ? '¡Has Ganado!' : 'Game Over';
        }
        gameOverOverlay.style.display = 'flex';
    }

    gameLoop(timestamp) {
        requestAnimationFrame(this.gameLoop.bind(this));

        if (!this.lastTime) this.lastTime = timestamp;
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // Actualizar sacudida de pantalla
        if (this.shakeDuration > 0) {
            this.shakeDuration -= deltaTime;
        }

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

        // Un tablero no se actualiza si está en medio de una animación de limpieza.
        if (board.isResolving) return;

        // 0. Añadir basura pendiente si la hay.
        const queue = board.isPlayer ? this.playerPendingGarbage : this.aiPendingGarbage;
        this.updatePendingGarbage(queue, board, deltaTime);

        // 1. Nueva lógica de gravedad unificada.
        const isAnythingFalling = board.updateGravityAndFallingBlocks(deltaTime, this.audioManager);

        // 2. Si nada está cayendo, podemos continuar con la lógica de juego.
        if (!isAnythingFalling) {
            // 4. Buscar y manejar combinaciones.
            const clearedCount = board.handleMatches();
            if (clearedCount > 0) {
                board.isResolving = true;
                board.comboCount++;
                if (board.isPlayer) {
                    this.player.score += clearedCount * 10 * board.comboCount;
                    this.audioManager.play('clear');
                    if (board.comboCount > 1) this.audioManager.play('combo');                    
                    if (this.gameMode === 'VS_CPU') {
                        this.sendGarbage(this.ai, clearedCount, board.comboCount);
                    }
                } else { // Es la IA
                    board.hasNoMoves = false; // La IA hizo un movimiento, ya no está atascada.
                    this.sendGarbage(this.player, clearedCount, board.comboCount);
                }

                // Programar la limpieza final de los bloques después de la animación.
                setTimeout(() => {
                    board.clearBlocks();
                    board.isResolving = false;
                }, 400);

                return; // Salimos para que la animación de limpieza ocurra.
            }

            // 5. Si no hubo combinaciones, reseteamos el contador de combo.
            if (board.comboCount > 0) {
                board.comboCount = 0;
            }

            // 6. Si el tablero es del jugador, manejar la subida del tablero.
            if (board.isPlayer) {
                // Solo se puede subir el tablero si no hay basura pendiente
                const canRaise = queue.length === 0;
                if (board.updateRaise(deltaTime, canRaise) === 'gameover') {
                    this.gameOver('AI');
                    return;
                }
            } else { // Es la IA
                // 7. Actualizar la lógica de pensamiento de la IA y comprobar derrota.
                board.update(deltaTime, isAnythingFalling);
                // La única condición de derrota para la IA ahora es si su tablero se llena al subir.
                if (board.hasLost) {
                    this.gameOver('PLAYER');
                    return;
                }
            }
        }
    }

    sendGarbage(target, clearedCount, comboCount) {
        // --- ¡NUEVO SISTEMA DE BASURA AGRESIVO! ---
        let garbageAmount = 0;

        // 1. Basura por tamaño de la combinación (solo si no es parte de una cadena)
        if (comboCount <= 1) {
            if (clearedCount === 4) garbageAmount = 2;
            else if (clearedCount === 5) garbageAmount = 4;
            else if (clearedCount >= 6) garbageAmount = GRID_WIDTH;
        }

        // 2. Basura por combos en cadena
        if (comboCount >= 2) {
            const comboGarbage = [0, 0, 3, 5, GRID_WIDTH, GRID_WIDTH * 2]; // Basura por combo: 0, 0, 3, 5, 6, 12...
            garbageAmount += comboGarbage[comboCount] || (GRID_WIDTH * 3);
        }

        // 3. Efecto de Sacudida para ataques grandes
        if (garbageAmount >= 4) this.triggerShake(200);
        if (garbageAmount <= 0) return;

        const targetQueue = target.isPlayer ? this.playerPendingGarbage : this.aiPendingGarbage;
        const originQueue = target.isPlayer ? this.aiPendingGarbage : this.playerPendingGarbage;

        // Lógica de cancelación de basura (chunk por chunk)
        while (garbageAmount > 0 && originQueue.length > 0) {
            const opponentChunk = originQueue[0];
            const cancelCount = Math.min(garbageAmount, opponentChunk.length);
            garbageAmount -= cancelCount;
            opponentChunk.splice(0, cancelCount);
            if (opponentChunk.length === 0) originQueue.shift();
        }

        if (garbageAmount > 0) {
            const newChunk = Array.from({ length: garbageAmount }, () => ({ type: Math.floor(Math.random() * BLOCK_TYPES.length) }));
            targetQueue.push(newChunk);
            this[target.isPlayer ? 'playerGarbageHoldTimer' : 'aiGarbageHoldTimer'] = 2000; // 2 segundos de "aguante"
            if (target.isPlayer) this.audioManager.play('garbage_alert');
        }
    }

    updatePendingGarbage(queue, targetBoard, deltaTime) {
        const holdTimerRef = targetBoard.isPlayer ? 'playerGarbageHoldTimer' : 'aiGarbageHoldTimer';
        
        if (queue.length > 0 && this[holdTimerRef] > 0) {
            this[holdTimerRef] -= deltaTime;
            return; // No dejamos caer nada mientras el temporizador esté activo.
        }
        this[holdTimerRef] = 0; // Asegurarse de que sea 0.

        if (queue.length === 0) return;

        const dropTimerRef = targetBoard.isPlayer ? 'playerGarbageDropTimer' : 'aiGarbageDropTimer';
        this[dropTimerRef] += deltaTime;

        if (this[dropTimerRef] >= GARBAGE_DROP_DELAY) {
            this[dropTimerRef] = 0;

            const firstChunk = queue[0];

            // --- ¡NUEVA LÓGICA DE PLANIFICACIÓN! ---
            // Si los bloques de este paquete aún no tienen una columna asignada, planificamos ahora.
            if (firstChunk.length > 0 && firstChunk[0].dropColumn === undefined) {
                // 1. Crear una lista de todas las columnas disponibles y barajarla.
                const columns = Array.from({ length: GRID_WIDTH }, (_, i) => i);
                for (let i = columns.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [columns[i], columns[j]] = [columns[j], columns[i]];
                }
                // 2. Asignar una columna única a cada bloque del paquete.
                firstChunk.forEach((block, index) => {
                    block.dropColumn = columns[index % GRID_WIDTH]; // Usar módulo para evitar errores si hay más de 6 bloques
                });
            }

            const garbageBlockToDrop = firstChunk.shift(); // Saca el primer bloque del primer paquete.

            if (garbageBlockToDrop) {
                this.dropSingleGarbageBlock(targetBoard, garbageBlockToDrop, garbageBlockToDrop.dropColumn);
            }

            // Si el paquete se ha quedado vacío, lo eliminamos de la cola.
            if (firstChunk.length === 0) {
                queue.shift();
            }
        }
    }

    dropSingleGarbageBlock(targetBoard, garbageInfo, columnX) {
        for (let y = 0; y < GRID_HEIGHT; y++) {
            if (targetBoard.grid[columnX][y] === null) {
                targetBoard.grid[columnX][y] = { type: garbageInfo.type, state: 'falling', visualY: -targetBoard.blockSize, targetY: y };
                if (targetBoard.isPlayer) this.audioManager.play('garbage_drop');
                break;
            }
        }
    }    

    triggerShake(duration) {
        // No acumular, simplemente tomar la duración más larga.
        this.shakeDuration = Math.max(this.shakeDuration, duration);
    }

    render() {
        let shakeX = 0;
        let shakeY = 0;
        if (this.shakeDuration > 0) {
            const magnitude = 4; // Píxeles de desplazamiento
            shakeX = (Math.random() - 0.5) * magnitude;
            shakeY = (Math.random() - 0.5) * magnitude;
        }

        // Dibuja el tablero del jugador, aplicando la sacudida si es necesario.
        ctx.save();
        ctx.translate(shakeX, shakeY);
        this.renderBoard(ctx, this.player);
        ctx.restore();

        // Dibuja el tablero de la IA (sin sacudida).
        this.renderBoard(aiCtx, this.ai);

        this.updateUI();
    }

    updateUI() {
        if (this.player) {
            scoreEl.innerText = this.player.score;
            comboEl.innerText = `x${this.player.comboCount}`;
        }
        if (this.gameMode === 'TIME_ATTACK') {
            const totalSeconds = Math.max(0, Math.ceil(this.timer / 1000));
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            timerEl.innerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
        const queue = board.isPlayer ? this.playerPendingGarbage : this.aiPendingGarbage;
        const holdTimer = board.isPlayer ? this.playerGarbageHoldTimer : this.aiGarbageHoldTimer;
        if (queue.length > 0 && holdTimer > 0) {
            context.fillStyle = GARBAGE_COLOR;
            const flatQueue = queue.flat();
            for (let i = 0; i < flatQueue.length; i++) {
                const gx = i % GRID_WIDTH;
                const gy = Math.floor(i / GRID_WIDTH);
                context.fillRect(gx * board.blockSize, gy * board.blockSize, board.blockSize, board.blockSize); // Dibujar en la parte superior, sin offset.
            }
                    // Dibujar barra de temporizador
                    context.fillStyle = '#FF4D4D'; // Rojo para la barra
                    const timerWidth = (holdTimer / 2000) * context.canvas.width;
                    context.fillRect(0, offsetY - 5, timerWidth, 5); // Barra de 5px de alto justo encima del tablero
                }
            }
        }
