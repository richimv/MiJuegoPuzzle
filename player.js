import { Board } from './board.js';
import { GRID_WIDTH, GRID_HEIGHT, BLOCK_SIZE, RAISE_INTERVAL, MANUAL_RAISE_SPEED, BLOCK_TYPES } from './constants.js';

export class Player extends Board {
    constructor() {
        super(true); // Es el jugador
        this.score = 0;
        this.isManualRaising = false;
        this.raiseProgress = 0;
        this.currentRaiseInterval = RAISE_INTERVAL;
    }

    handleKeyPress(key, audioManager) {
        switch (key) {
            case 'ArrowLeft': if (this.cursor.x > 0) this.cursor.x--; break;
            case 'ArrowRight': if (this.cursor.x < GRID_WIDTH - 2) this.cursor.x++; break;
            case 'ArrowUp': if (this.cursor.y > 0) this.cursor.y--; break;
            case 'ArrowDown': if (this.cursor.y < GRID_HEIGHT - 1) this.cursor.y++; break;
            case ' ':
                if (this.swapBlocks(this.cursor.x, this.cursor.y)) {
                    audioManager.play('swap');
                }
                break;
            case 'Shift': this.isManualRaising = true; break;
        }
    }

    handleKeyUp(key) {
        if (key === 'Shift') this.isManualRaising = false;
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

    raiseStack() {
        // Comprobar Game Over
        for (let x = 0; x < GRID_WIDTH; x++) {
            if (this.grid[x][0] !== null) {
                return 'gameover';
            }
        }
        // Mover bloques hacia arriba
        for (let y = 0; y < GRID_HEIGHT - 1; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                this.grid[x][y] = this.grid[x][y + 1];
            }
        }
        // Generar nueva fila
        const newRowTypes = [];
        for (let x = 0; x < GRID_WIDTH; x++) {
            let type;
            let valid = false;
            while (!valid) {
                type = Math.floor(Math.random() * BLOCK_TYPES.length);
                const matchH = x >= 2 && newRowTypes[x - 1] === type && newRowTypes[x - 2] === type;
                if (!matchH) valid = true;
            }
            newRowTypes[x] = type;
        }

        for (let x = 0; x < GRID_WIDTH; x++) {
            const type = newRowTypes[x];
            this.grid[x][GRID_HEIGHT - 1] = { type, state: 'idle', visualY: (GRID_HEIGHT - 1) * this.blockSize };
        }
        if (this.cursor.y > 0) this.cursor.y--;
        return 'raised';
    }

    updateGameSpeed() {
        if (this.score > 10000) this.currentRaiseInterval = 2000;
        else if (this.score > 5000) this.currentRaiseInterval = 3000;
        else if (this.score > 2000) this.currentRaiseInterval = 4000;
    }
}