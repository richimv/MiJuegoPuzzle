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
        // Lógica de subida de tablero, igual que el jugador.
        this.isManualRaising = false;
        this.raiseProgress = 0;
        this.currentRaiseInterval = 5000; // La IA sube a un ritmo constante
    }

    // La IA ahora usa el mismo método `update` que el tablero base.
    update(deltaTime) {
        const isBoardStable = !this.isResolving && !this.grid.flat().some(b => b?.state === 'falling');

        if (!isBoardStable) {
            this.actionTimer = this.reactionTime;
            return;
        }

        this.actionTimer -= deltaTime;
        if (this.actionTimer > 0) return;

        this.actionTimer = this.reactionTime;
        
        // La IA solo piensa y actúa si el tablero está estable.
        if (this.isExecutingPlan) {
            this.executeNextStep();
        } else if (isBoardStable) { 
            // Solo crea un nuevo plan si no está ejecutando uno Y el tablero está estable.
            this.createPlan();
        }

        // La IA ahora sube su tablero a un ritmo constante, como el jugador.
        if (!this.isExecutingPlan && isBoardStable) {
            // La IA no tiene basura pendiente, por lo que siempre puede subir.
            if (this.updateRaise(deltaTime, true) === 'gameover') return 'gameover';
        }
    }

    createPlan() {
        // 1. Buscar la mejor oportunidad en el tablero.
        const opportunity = this.findBestOpportunity();

        if (opportunity) {
            // 2. Si encuentra una, crea la secuencia de movimientos (el plan).
            const { blockPos, targetPos } = opportunity;

            // Si es un simple swap adyacente
            if (blockPos.x === targetPos.x && blockPos.y === targetPos.y) {
                this.plan.push({ action: 'move_cursor', x: blockPos.x, y: blockPos.y });
                this.plan.push({ action: 'swap' });
            } else {
                // Lógica para movimientos más complejos (no implementada aún)
                // Por ahora, solo hacemos el swap simple.
                this.plan.push({ action: 'move_cursor', x: blockPos.x, y: blockPos.y });
                this.plan.push({ action: 'swap' });
            }
            
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
        if (step.action === 'move_cursor') {
            this.cursor.x = step.x;
            this.cursor.y = step.y;
        } else if (step.action === 'swap') {
            this.swapBlocks(this.cursor.x, this.cursor.y, true); // La IA simula el swap
        }
    }

    findBestOpportunity() {
        let bestOpportunity = null;
        let bestScore = -1;

        // La IA ahora se centra en encontrar el mejor SWAP adyacente.
        // La lógica de movimiento complejo era defectuosa y causaba la parálisis.
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH - 1; x++) {
                // Solo considerar swaps con bloques que existen y están quietos.
                const b1 = this.grid[x][y];
                const b2 = this.grid[x+1][y];
                if (!b1 || !b2 || b1.state !== 'idle' || b2.state !== 'idle') {
                    continue;
                }

                // Simular el swap
                this.swapBlocks(x, y, true);
                
                // Evaluar la calidad de la jugada
                const score = this.evaluateBoardState();

                // Deshacer el swap
                this.swapBlocks(x, y, true); 
                
                if (score > bestScore) {
                    bestScore = score;
                    bestOpportunity = {
                        blockPos: { x, y },
                        targetPos: { x, y } // El objetivo es la misma posición para un swap simple.
                    };
                }
            }
        }

        return bestOpportunity;
    }

    evaluateBoardState() {
        // Esta es una función de evaluación simple. Una IA más avanzada tendría una lógica más compleja.
        // Por ahora, solo cuenta el número de bloques que harían match.
        const { clearingBlocks } = this.findMatchesInCurrentState();
        return clearingBlocks.length;
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

    findMatchesInCurrentState() {
        const matchGrid = Array(GRID_WIDTH).fill(null).map(() => Array(GRID_HEIGHT).fill(false));
        let clearingBlocks = [];

        // Horizontal
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH - 2; x++) {
                const b1 = this.grid[x][y];
                if (b1 && this.grid[x+1]?.[y]?.type === b1.type && this.grid[x+2]?.[y]?.type === b1.type) {
                    matchGrid[x][y] = true;
                    matchGrid[x+1][y] = true;
                    matchGrid[x+2][y] = true;
                }
            }
        }

        // Vertical
        for (let x = 0; x < GRID_WIDTH; x++) {
            for (let y = 0; y < GRID_HEIGHT - 2; y++) {
                const b1 = this.grid[x][y];
                if (b1 && this.grid[x]?.[y+1]?.type === b1.type && this.grid[x]?.[y+2]?.type === b1.type) {
                    matchGrid[x][y] = true;
                    matchGrid[x][y+1] = true;
                    matchGrid[x][y+2] = true;
                }
            }
        }

        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                if (matchGrid[x][y]) {
                    clearingBlocks.push(this.grid[x][y]);
                }
            }
        }
        return { clearingBlocks, matchGrid };
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
    
    updateRaise(deltaTime, canRaise) {
        if (canRaise) {
            const speed = (this.blockSize / (this.currentRaiseInterval / 1000));
            this.raiseProgress += speed * (deltaTime / 1000);
        }

        if (this.raiseProgress >= this.blockSize) {
            const result = this.raiseStack();
            this.raiseProgress -= this.blockSize;
            return result;
        }
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