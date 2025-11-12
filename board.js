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
            [this.grid[x][y], this.grid[x + 1][y]] = [block2, block1];
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
 
        const gridChanges = []; // Almacena los cambios de la grilla para aplicarlos al final.

        // FASE 1: Determinar el targetY para todos los bloques que deben caer.
        for (let x = 0; x < GRID_WIDTH; x++) {
            const blocksInColumn = [];
            // Recopilar todos los bloques no-null y no-clearing de la columna, preservando su Y original.
            for (let y = 0; y < GRID_HEIGHT; y++) {
                const block = this.grid[x][y];
                if (block && block.state !== 'clearing') {
                    blocksInColumn.push({ block: block, originalY: y });
                }
            }

            // Ahora, determinar el targetY para cada bloque en su posición compactada.
            // La lista blocksInColumn está ordenada de arriba hacia abajo (por originalY).
            // El primer bloque (el más alto) aterrizará en Y = 0.
            // El segundo bloque aterrizará en Y = 1, y así sucesivamente.
            for (let i = 0; i < blocksInColumn.length; i++) {
                const { block, originalY } = blocksInColumn[i];
                // --- ¡CORRECCIÓN CLAVE! ---
                // Los bloques deben compactarse en la parte inferior del tablero, no en la superior.
                // Si hay N bloques, el primero (i=0) debe ir a (GRID_HEIGHT - N), el último a (GRID_HEIGHT - 1).
                const calculatedTargetY = GRID_HEIGHT - blocksInColumn.length + i;
                if (block.targetY !== calculatedTargetY) block.targetY = calculatedTargetY;
            } 
        }

        // FASE 2: Animar y registrar los aterrizajes de los bloques que están cayendo.
        // Iterar de abajo hacia arriba para procesar los aterrizajes correctamente.
        for (let x = 0; x < GRID_WIDTH; x++) {
            for (let y = GRID_HEIGHT - 1; y >= 0; y--) { // Iterar de abajo hacia arriba
                const block = this.grid[x][y];
                if (block) {
                    // Iniciar caída si es necesario
                    if (block.state === 'idle' && y !== block.targetY) {
                        block.state = 'falling';
                        // --- GRAVEDAD CONSISTENTE ---
                        block.visualY = y * this.blockSize; // Inicia la animación desde la posición lógica actual.
                    }

                    if (block.state === 'falling') {
                    anythingFalling = true;
                    const targetVisualY = block.targetY * this.blockSize;                    // Mover visualmente el bloque.
                    block.visualY += FALL_SPEED * (deltaTime / 1000);

                    // Comprobar si ha aterrizado.
                    if (block.visualY >= targetVisualY) {
                        block.visualY = targetVisualY; // Ajustar a la posición exacta.
                        block.state = 'idle';
                        
                        // Si el bloque se ha movido de su posición original en la grilla
                        if (y !== block.targetY) {
                            gridChanges.push({ x, oldY: y, newY: block.targetY, block });
                            // --- ¡CORRECCIÓN CLAVE! ---
                            this.grid[x][y] = null;
                        }
                        delete block.targetY; // Limpiar la propiedad para futuras caídas.

                        if (this.isPlayer && audioManager) audioManager.play('fall');
                    }
                    }
                }
            }
        }

        // FASE 3: Aplicar todos los cambios de la grilla de una vez.
        // Esto evita problemas de sobrescritura durante la iteración de la Fase 2.
        for (const change of gridChanges) {
            // Es crucial que el destino esté vacío o sea el mismo bloque.
            if (this.grid[change.x][change.newY] === null || this.grid[change.x][change.newY] === change.block) {
                this.grid[change.x][change.newY] = change.block;
                // Solo borramos el antiguo si no ha sido ocupado por otro cambio.
                if (this.grid[change.x][change.oldY] === change.block) {
                    this.grid[change.x][change.oldY] = null;
                }
            } else {
                console.error(`Gravity error (Phase 3): Block at (${change.x},${change.oldY}) tried to land at (${change.x},${change.newY}) but it was occupied by a different block.`);
                // Fallback: el bloque se queda en su posición original, pero deja de caer.
                change.block.state = 'idle';
                change.block.visualY = change.oldY * this.blockSize;
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

                // Colocar el bloque en la parte superior de la columna.
                // La gravedad se encargará del resto en el siguiente ciclo.
                for (let y = 0; y < GRID_HEIGHT; y++) {
                    if (this.grid[columnX][y] === null) {
                        this.grid[columnX][y] = { type: blockInfo.type, state: 'falling', visualY: -this.blockSize };
                        break;
                    }
                }
            }
            if (this.isPlayer) audioManager.play('garbage_drop');
        }
    }
}