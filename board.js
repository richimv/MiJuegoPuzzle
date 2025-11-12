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
            this.grid[toX][y] = movingBlock;
            this.grid[fromX][y] = null;

            // --- ¡LA LÓGICA CLAVE! ---
            // Después de mover un bloque a un espacio vacío, debemos comprobar si hay un bloque
            // cayendo directamente hacia la columna de destino.
            // Si es así, su nuevo "suelo" es el bloque que acabamos de mover.
            let newFloorY = y; // El "suelo" empieza en la posición del bloque que movimos.
            for (let checkY = y - 1; checkY >= 0; checkY--) {
                const blockAbove = this.grid[toX][checkY];
                if (blockAbove && blockAbove.state === 'falling') {
                    // ¡Encontramos un bloque cayendo! Actualizamos su destino para que aterrice
                    // sobre el nuevo "suelo" que hemos establecido.
                    blockAbove.targetY = newFloorY - 1;
                    // El siguiente bloque que caiga deberá aterrizar sobre este.
                    // Así que actualizamos la posición del "suelo" para la siguiente iteración.
                    newFloorY--;
                } else if (blockAbove) {
                    // Hay otro bloque quieto, así que el que cae no puede estar más arriba.
                    break;
                }
            }
            return true;
        };

        // --- Lógica de Swap ---

        // En simulación, el intercambio siempre es posible para la IA.
        if (isSimulation) {
            [this.grid[x][y], this.grid[x + 1][y]] = [block2, block1];
            return true;
        }

        // Caso 1: Intercambio de un bloque quieto (block1) a un espacio vacío (a la derecha).
        // Esta es la condición clave que permite deslizar bloques bajo otros que caen.
        if (block1?.state === 'idle' && block2 === null) {
            return performSwap(x, x + 1, y);
        }
        // Caso 2: Intercambio de un bloque quieto (block2) a un espacio vacío (a la izquierda).
        if (block2?.state === 'idle' && block1 === null) {
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
 
        // FASE 1: Marcar los bloques que deben caer.
        // Recorremos de abajo hacia arriba para una detección correcta.
        for (let x = 0; x < GRID_WIDTH; x++) {
            let emptySpaces = 0;
            for (let y = GRID_HEIGHT - 1; y >= 0; y--) {
                const block = this.grid[x][y];
                if (block === null) {
                    emptySpaces++;
                } else if (emptySpaces > 0 && block.state === 'idle' && block.targetY === undefined) {
                    // Este bloque está flotando. Marcarlo para la animación de caída.
                    // NO lo movemos en la matriz todavía. Esto es clave.
                    block.visualY = y * this.blockSize;
                    block.state = 'falling';
                    block.targetY = y + emptySpaces;
                }
            }
        }

        // FASE 2: Animar y aterrizar los bloques que están cayendo.
        for (let x = 0; x < GRID_WIDTH; x++) {
            // Importante: Recorrer de arriba hacia abajo para procesar los aterrizajes correctamente.
            for (let y = GRID_HEIGHT - 1; y >= 0; y--) {
                const block = this.grid[x][y];
                if (block && block.state === 'falling') {
                    anythingFalling = true;
                    const targetVisualY = block.targetY * this.blockSize;

                    // Mover visualmente el bloque.
                    block.visualY += FALL_SPEED * (deltaTime / 1000);

                    // Comprobar si ha aterrizado.
                    if (block.visualY >= targetVisualY) {
                        block.visualY = targetVisualY; // Ajustar a la posición exacta.
                        block.state = 'idle';

                        // --- LÓGICA DE ATERRIZAJE CORREGIDA ---
                        // Solo realizamos el movimiento en la matriz si el bloque no está ya en su destino.
                        // Esto es crucial. Si y === block.targetY, significa que el bloque ya está donde debe estar
                        // (posiblemente porque otro bloque lo movió allí en el mismo fotograma).
                        if (y !== block.targetY) {
                            this.grid[x][block.targetY] = block;
                            this.grid[x][y] = null; // Borramos el bloque de su posición actual en el bucle.
                        }
                        delete block.targetY; // Limpiar la propiedad para futuras caídas.

                        if (this.isPlayer && audioManager) audioManager.play('fall');                        
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
                // Un bloque puede ser parte de una combinación si está quieto o cayendo.
                const canCheck = b1 && (isInitialCheck || b1.state === 'idle') && b1.state !== 'clearing';
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
                // Un bloque puede ser parte de una combinación si está quieto o cayendo.
                const canCheck = b1 && (isInitialCheck || b1.state === 'idle') && b1.state !== 'clearing';
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
}