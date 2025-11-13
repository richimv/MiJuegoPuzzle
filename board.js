import { GRID_WIDTH, GRID_HEIGHT, BLOCK_TYPES, FALL_SPEED, BLOCK_SIZE, AI_BLOCK_SIZE } from './constants.js';

/**
 * Clase base para un tablero de juego. Contiene la lógica común
 * para el jugador y la IA.
 */
export class Board {
    constructor(isPlayer) {
        this.isPlayer = isPlayer;
        this.blockSize = isPlayer ? BLOCK_SIZE : AI_BLOCK_SIZE;
        this.grid = [];
        this.comboCount = 0;
        this.isResolving = false;
        this.clearTimer = 0; // Temporizador para la animación de limpieza.
        this.blocksToClear = [];
        this.cursor = { x: 2, y: 5 };

        this.populateGrid();
        // Bucle para asegurar que el tablero inicial no tenga combinaciones.
        // Esto es crucial para evitar que la IA se bloquee al inicio.
        while (this.handleMatches(true) > 0) {
            this.clearBlocks(); // Elimina los bloques marcados como 'cleared'
            this._applyInitialGravity(); // Aplica gravedad de forma síncrona para la inicialización
        }
        this.isResolving = false; // Asegurarse de que el tablero esté activo al inicio.
    }

    populateGrid() {
        this.grid = [];
        for (let x = 0; x < GRID_WIDTH; x++) {
            this.grid[x] = [];
            for (let y = 0; y < GRID_HEIGHT; y++) {
                if (y < GRID_HEIGHT / 2) {
                    this.grid[x][y] = null;
                } else {
                    // Simplificamos la generación. El bucle de juego manejará cualquier match inicial.
                    const type = Math.floor(Math.random() * BLOCK_TYPES.length);
                    this.grid[x][y] = { type, state: 'idle', visualY: y * this.blockSize };
                }
            }
        }
    }

    swapBlocks(x, y, isSimulation = false) {
        const block1 = this.grid[x]?.[y];
        const block2 = this.grid[x + 1]?.[y];


        const performSwap = (fromX, toX, y) => {
            const movingBlock = this.grid[fromX][y];
            this.grid[toX][y] = { ...movingBlock, visualY: y * this.blockSize }; // Copia con visualY correcto
            this.grid[fromX][y] = null;
            return true;
        };

        // --- Lógica de Swap ---

        // En simulación, el intercambio siempre es posible para la IA.
        if (isSimulation) {
            // Añadimos una guarda para prevenir errores si la IA intenta un swap fuera de los límites.
            if (x < 0 || x + 1 >= GRID_WIDTH) {
                return false;
            }
            // Asegurarse de que los bloques existan antes de intercambiarlos.
            if (block1 && block2) {
                [this.grid[x][y], this.grid[x + 1][y]] = [block2, block1];
            }
            return true;
        }

        // Caso 1: Intercambio de un bloque quieto (block1) a un espacio vacío (a la derecha).
        // Esta es la condición clave que permite deslizar bloques bajo otros que caen.
        if (block1?.state === 'idle' && !block2) {
            // --- ¡TU PROPUESTA RADICAL IMPLEMENTADA! ---
            // Validamos que la coordenada de destino no esté "visualmente" ocupada por un bloque en caída.
            const targetVisualY = y * this.blockSize;
            for (let checkY = 0; checkY < GRID_HEIGHT; checkY++) {
                const fallingBlock = this.grid[x + 1][checkY];
                if (fallingBlock?.state === 'falling' && Math.abs(fallingBlock.visualY - targetVisualY) < this.blockSize) {
                    return false; // ¡Coordenada ocupada! Movimiento bloqueado.
                }
            }
            return performSwap(x, x + 1, y);
        }

        // Caso 2: Intercambio de un bloque quieto (block2) a un espacio vacío (a la izquierda).
        if (block2?.state === 'idle' && !block1) {
            const targetVisualY = y * this.blockSize;
            for (let checkY = 0; checkY < GRID_HEIGHT; checkY++) {
                const fallingBlock = this.grid[x][checkY];
                if (fallingBlock?.state === 'falling' && Math.abs(fallingBlock.visualY - targetVisualY) < this.blockSize) {
                    return false; // ¡Coordenada ocupada! Movimiento bloqueado.
                }
            }
            return performSwap(x + 1, x, y);
        }

        // Caso 3: Intercambio entre dos bloques quietos.
        if (block1?.state === 'idle' && block2?.state === 'idle') {
            [this.grid[x][y], this.grid[x + 1][y]] = [block2, block1]; // Swap simple
            return true;
        }

        // Si ninguna de las condiciones se cumple, el intercambio es inválido.
        return false;
    }

    _applyInitialGravity() {
        // Gravedad síncrona para la inicialización: compactar columnas hacia abajo rápidamente.
        for (let x = 0; x < GRID_WIDTH; x++) {
            let writeY = GRID_HEIGHT - 1;
            for (let readY = GRID_HEIGHT - 1; readY >= 0; readY--) {
                if (this.grid[x][readY]) {
                    if (writeY !== readY) {
                        this.grid[x][writeY] = this.grid[x][readY];
                        this.grid[x][readY] = null;
                    }
                    writeY--;
                }
            }
        }
    }


    /**
     * Nueva función unificada que maneja toda la lógica de gravedad y caída.
     * Se aplica a cada bloque de forma individual para un comportamiento consistente.
     */
    updateGravityAndFallingBlocks(deltaTime, audioManager) {
        let anythingFalling = false;

        // PASE 1: Detección de Caída
        // Identificamos todos los bloques que deberían empezar a caer.
        for (let y = GRID_HEIGHT - 2; y >= 0; y--) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                const block = this.grid[x][y];
                if (!block || block.state === 'clearing') continue;

                // Si el bloque está quieto y la casilla de abajo está vacía, empieza a caer.
                if (block.state === 'idle' && this.grid[x][y + 1] === null) {
                    block.state = 'falling';
                }
            }
        }

        // PASE 2: Animación y Aterrizaje
        // Ahora animamos y aterrizamos todos los bloques marcados como 'falling'.
        for (let y = GRID_HEIGHT - 2; y >= 0; y--) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                const block = this.grid[x][y];
                if (!block || block.state !== 'falling') continue;

                anythingFalling = true;
                const targetVisualY = (y + 1) * this.blockSize;

                // Mover visualmente el bloque.
                block.visualY += FALL_SPEED * (deltaTime / 1000);

                // Comprobar si ha aterrizado.
                if (block.visualY >= targetVisualY) {
                    // Mover el bloque en la matriz.
                    if (this.grid[x][y + 1] === null) {
                        this.grid[x][y + 1] = block;
                        this.grid[x][y] = null;
                        block.state = 'idle';
                        block.visualY = targetVisualY;
                        if (this.isPlayer && audioManager) audioManager.play('fall');
                    } else {
                        // La casilla de destino se ocupó mientras caía. Detenerse donde está.
                        block.state = 'idle';
                        block.visualY = y * this.blockSize;
                    }
                }
            }
        }

        return anythingFalling;
    }

    handleMatches(isInitialCheck = false) {
        const clearingState = isInitialCheck ? 'cleared' : 'clearing';
        const matchGrid = Array(GRID_WIDTH).fill(null).map(() => Array(GRID_HEIGHT).fill(false));

        // Horizontal matches
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH - 2; ) {
                const b1 = this.grid[x][y];
                // --- CORRECCIÓN CLAVE --- Un bloque solo puede hacer match si está quieto ('idle').
                const canCheck = b1 && b1.state === 'idle';
                if (canCheck) {
                    let matchLength = 1;
                    while (x + matchLength < GRID_WIDTH &&
                           this.grid[x + matchLength][y]?.type === b1.type && 
                           (isInitialCheck || this.grid[x + matchLength][y]?.state === 'idle') && this.grid[x + matchLength][y]?.state !== 'clearing') {
                        matchLength++;
                    }
                    if (matchLength >= 3) {
                        for (let i = 0; i < matchLength; i++) matchGrid[x + i][y] = true;
                    }
                    x += matchLength;
                } else {
                    x++;
                }
            }
        }

        // Vertical matches
        for (let x = 0; x < GRID_WIDTH; x++) {
            for (let y = 0; y < GRID_HEIGHT - 2; ) {
                const b1 = this.grid[x][y];
                // --- CORRECCIÓN CLAVE --- Un bloque solo puede hacer match si está quieto ('idle').
                const canCheck = b1 && b1.state === 'idle';
                if (canCheck) {
                    let matchLength = 1;
                    while (y + matchLength < GRID_HEIGHT &&
                           this.grid[x][y + matchLength]?.type === b1.type && 
                           (isInitialCheck || this.grid[x][y + matchLength]?.state === 'idle') && this.grid[x][y + matchLength]?.state !== 'clearing') {
                        matchLength++;
                    }
                    if (matchLength >= 3) {
                        for (let i = 0; i < matchLength; i++) matchGrid[x][y + i] = true;
                    }
                    y += matchLength;
                } else {
                    y++;
                }
            }
        }

        // Apply clearing state
        for (let x = 0; x < GRID_WIDTH; x++) {
            for (let y = 0; y < GRID_HEIGHT; y++) {
                if (matchGrid[x][y]) {
                    const block = this.grid[x][y];
                    if (block) {
                        block.state = clearingState;
                        if (!isInitialCheck) block.clearTime = Date.now();
                    }
                }
            }
        }

        const clearedBlocks = this.grid.flat().filter(b => b?.state === clearingState);

        // La lógica de transformación de basura se ha eliminado.
        // Los bloques de basura ahora caen como bloques de colores y se comportan normalmente.

        return clearedBlocks.length;
    }

    clearBlocks() {
        this.blocksToClear = [];
        for (let x = 0; x < GRID_WIDTH; x++) {
            for (let y = 0; y < GRID_HEIGHT; y++) {
                if (this.grid[x][y]?.state === 'clearing' || this.grid[x][y]?.state === 'cleared') {
                    this.grid[x][y] = null;
                }
            }
        }
    }

    findBlockPosition(blockToFind) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            for (let y = 0; y < GRID_HEIGHT; y++) {
                if (this.grid[x][y] === blockToFind) {
                    return { x, y };
                }
            }
        }
        return null;
    }

    handleIncomingGarbage(garbageManager, audioManager) {
        const queue = garbageManager.getPendingGarbage(this.isPlayer);
        const holdTimer = garbageManager.getGarbageHoldTimer(this.isPlayer);

        // Solo soltar basura si la cola tiene algo y el temporizador de espera ha terminado.
        if (queue.length > 0 && holdTimer <= 0) {
            const garbageChunk = queue.shift(); // Tomamos el paquete
            if (!garbageChunk) return;

            // Lógica de distribución que estaba en GarbageManager, ahora aquí.
            const totalBlocks = garbageChunk.length;
            let columns = Array.from({ length: GRID_WIDTH }, (_, i) => i);
            // Barajar columnas para que los bloques restantes caigan en lugares aleatorios.
            for (let i = columns.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [columns[i], columns[j]] = [columns[j], columns[i]];
            }

            for (let i = 0; i < totalBlocks; i++) {
                const blockInfo = garbageChunk[i];
                const columnX = columns[i % GRID_WIDTH]; // Usar módulo para filas completas

                // --- ¡NUEVA LÓGICA DE COLOCACIÓN SEGURA! ---
                // Encontrar la posición más alta ocupada en la columna para determinar el "suelo".
                let groundY = -1;
                for (let y = 0; y < GRID_HEIGHT; y++) {
                    if (this.grid[columnX][y] !== null) {
                        groundY = y;
                        break; // Encontramos el bloque más alto, no necesitamos seguir buscando.
                    }
                }

                // Colocar el nuevo bloque de basura justo encima del "suelo".
                const landingY = groundY === -1 ? GRID_HEIGHT -1 : groundY - 1;
                if (landingY >= 0) { // Asegurarse de que haya espacio en la columna.
                    this.grid[columnX][landingY] = { type: blockInfo.type, state: 'idle', visualY: -this.blockSize };
                }
            }
            if (this.isPlayer) audioManager.play('garbage_drop');
        }
    }

    updateRaise(deltaTime, canRaise) {
        if (canRaise) {
            const speed = this.isManualRaising ? MANUAL_RAISE_SPEED : (this.blockSize / (this.currentRaiseInterval / 1000));
            this.raiseProgress += speed * (deltaTime / 1000);
        }

        if (this.raiseProgress >= this.blockSize) {
            const result = this.raiseStack();
            this.raiseProgress -= this.blockSize;
            return result;
        }
    }
}