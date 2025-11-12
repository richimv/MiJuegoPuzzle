import { Board } from './board.js';
import { GRID_WIDTH, GRID_HEIGHT, BLOCK_TYPES, MANUAL_RAISE_SPEED } from './constants.js';

/**
 * Una IA más avanzada que puede planificar movimientos de varios pasos.
 */
export class AI extends Board {
    constructor(difficulty = 'EASY') {
        super(false); // No es el jugador
        this.difficulty = difficulty;
        this.reactionTime = difficulty === 'HARD' ? 50 : 250; // ms
        this.actionTimer = this.reactionTime;

        // --- El "Cerebro" de la IA ---
        this.plan = []; // Una secuencia de acciones a realizar. Ej: [{action: 'move', x: 1, y: 5}, {action: 'swap', x: 1, y: 5}]
        this.isExecutingPlan = false;
    }

    update(deltaTime, isAnythingFalling) {
        if (this.isResolving || isAnythingFalling) {
            this.actionTimer = this.reactionTime;
            this.plan = []; // Si el tablero cambia, el plan antiguo es inválido.
            this.isExecutingPlan = false;
            return;
        }

        this.actionTimer -= deltaTime;
        if (this.actionTimer > 0) return;

        this.actionTimer = this.reactionTime;

        // Si ya tiene un plan, lo ejecuta.
        if (this.isExecutingPlan) {
            this.executeNextStep();
            return;
        }

        // Si no tiene plan, crea uno.
        this.createPlan();
    }

    createPlan() {
        // 1. Buscar la mejor oportunidad en el tablero.
        const opportunity = this.findBestOpportunity();

        if (opportunity) {
            // 2. Si encuentra una, crea la secuencia de movimientos (el plan).
            const { blockPos, targetPos } = opportunity;

            // Generar la ruta de swaps para mover el bloque.
            let currentX = blockPos.x;
            const direction = Math.sign(targetPos.x - blockPos.x);

            while (currentX !== targetPos.x) {
                const swapX = direction > 0 ? currentX : currentX - 1;
                this.plan.push({ action: 'swap', x: swapX, y: blockPos.y });
                currentX += direction;
            }

            // El último paso es el swap final que crea la combinación.
            this.plan.push({ action: 'swap', x: targetPos.x, y: targetPos.y });

            this.isExecutingPlan = true;
            this.executeNextStep(); // Ejecutar el primer paso inmediatamente.
        }
    }

    executeNextStep() {
        if (this.plan.length === 0) {
            this.isExecutingPlan = false;
            return;
        }

        const step = this.plan.shift();
        this.cursor.x = step.x;
        this.cursor.y = step.y;
        this.swapBlocks(step.x, step.y);
    }

    findBestOpportunity() {
        let bestOpportunity = null;

        // Recorrer cada bloque del tablero.
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                const block = this.grid[x][y];
                // La IA ahora puede considerar mover bloques que están quietos ('idle').
                if (!block || block.state !== 'idle') continue;

                // Para este bloque, ¿cuál es el mejor lugar para moverlo?
                // Comprobaremos si al moverlo a otra columna se crea una combinación.
                for (let targetX = 0; targetX < GRID_WIDTH; targetX++) {
                    if (targetX === x) continue; // No tiene sentido moverlo a su misma columna.

                    // ¿Es posible moverlo? (¿hay un camino libre?)
                    if (!this.isPathClear(x, targetX, y)) continue;

                    // Simular el estado del tablero si moviéramos el bloque.
                    const tempGrid = this.grid.map(col => col.slice());
                    const movedBlock = tempGrid[x][y];
                    tempGrid[x][y] = null; // Dejamos un hueco

                    // Simular la caída del bloque en la nueva columna.
                    let targetY = y;
                    while (targetY + 1 < GRID_HEIGHT && tempGrid[targetX][targetY + 1] === null) {
                        targetY++;
                    }
                    tempGrid[targetX][targetY] = movedBlock;

                    // Ahora, con este tablero simulado, ¿se crea una combinación?
                    if (this.checkForMatchInGrid(tempGrid, targetX, targetY)) {
                        // ¡Oportunidad encontrada!
                        // Por ahora, nos quedamos con la primera que encontremos.
                        // Una IA más avanzada podría evaluar la "calidad" de la oportunidad.
                        return {
                            blockPos: { x, y },
                            targetPos: { x: targetX, y: y } // El objetivo es la columna, la fila es la misma para el swap inicial.
                        };
                    }
                }
            }
        }

        // Si no se encontró ninguna oportunidad de movimiento complejo, buscar un simple swap adyacente.
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH - 1; x++) {
                this.swapBlocks(x, y, true);
                // Ahora la IA también comprueba si el swap crea una combinación con bloques que caen.
                const createsMatch = this.checkForMatchAt(x, y, true) || this.checkForMatchAt(x + 1, y, true);
                this.swapBlocks(x, y, true); // Deshacer
                if (createsMatch) {
                    return {
                        blockPos: { x, y },
                        targetPos: { x, y } // El objetivo es la misma posición, solo se hace un swap.
                    };
                }
            }
        }

        return bestOpportunity;
    }

    isPathClear(startX, endX, y) {
        const direction = Math.sign(endX - startX);
        for (let x = startX + direction; x !== endX + direction; x += direction) {
            // El camino solo está libre si las casillas están vacías.
            if (this.grid[x][y] !== null) {
                return false;
            }
        }
        return true;
    }

    checkForMatchInGrid(grid, x, y) {
        const block = grid[x]?.[y];
        if (!block) return false;
        const type = block.type;

        // Comprobación Horizontal
        let hCount = 1;
        for (let i = 1; grid[x - i]?.[y]?.type === type; i++) hCount++;
        for (let i = 1; grid[x + i]?.[y]?.type === type; i++) hCount++;
        if (hCount >= 3) return true;

        // Comprobación Vertical
        let vCount = 1;
        for (let i = 1; grid[x]?.[y - i]?.type === type; i++) vCount++;
        for (let i = 1; grid[x]?.[y + i]?.type === type; i++) vCount++;
        if (vCount >= 3) return true;

        return false;
    }

    checkForMatchAt(x, y, isSimulation = false) {
        const block = this.grid[x]?.[y];
        // En simulación, podemos considerar bloques que caen. En juego normal, solo los quietos.
        const canCheck = block && (isSimulation || block.state === 'idle');
        if (!canCheck) return false;

        const type = block.type;

        // Comprobación Horizontal
        let hCount = 1;
        // Un bloque vecino cuenta si es del mismo tipo y no está desapareciendo.
        for (let i = 1; this.grid[x - i]?.[y]?.type === type && this.grid[x-i][y].state !== 'clearing'; i++) hCount++;
        for (let i = 1; this.grid[x + i]?.[y]?.type === type && this.grid[x+i][y].state !== 'clearing'; i++) hCount++;
        if (hCount >= 3) return true;

        // Comprobación Vertical
        let vCount = 1;
        for (let i = 1; this.grid[x]?.[y - i]?.type === type && this.grid[x][y-i].state !== 'clearing'; i++) vCount++;
        for (let i = 1; this.grid[x]?.[y + i]?.type === type && this.grid[x][y+i].state !== 'clearing'; i++) vCount++;
        if (vCount >= 3) return true;

        return false;
    }

    // La IA sube su tablero cuando no encuentra movimientos.
    // Devuelve 'gameover' si la pila llega al tope.
    raiseStack() {
        for (let x = 0; x < GRID_WIDTH; x++) {
            if (this.grid[x][0] !== null) {
                return 'gameover'; // La IA ha perdido.
            }
        }

        for (let y = 0; y < GRID_HEIGHT - 1; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                this.grid[x][y] = this.grid[x][y + 1];
            }
        }

        for (let x = 0; x < GRID_WIDTH; x++) {
            const type = Math.floor(Math.random() * BLOCK_TYPES.length);
            this.grid[x][GRID_HEIGHT - 1] = { type, state: 'idle', visualY: (GRID_HEIGHT - 1) * this.blockSize };
        }
    }
}