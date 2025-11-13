// c:\Users\ricar\Downloads\MiJuegoPuzzle-main\garbageManager.js
import { GRID_WIDTH, BLOCK_TYPES, GARBAGE_DROP_DELAY } from './constants.js';

export class GarbageManager {
    constructor(audioManager, screenShakeManager) {
        this.audioManager = audioManager;
        this.screenShakeManager = screenShakeManager;

        this.playerPendingAttack = 0;
        this.aiPendingAttack = 0;
        this.playerPendingGarbage = [];
        this.aiPendingGarbage = [];
        this.playerGarbageHoldTimer = 0;
        this.aiGarbageHoldTimer = 0;
        this.playerGarbageDropTimer = 0;
        this.aiGarbageDropTimer = 0;
    }

    reset() {
        this.playerPendingAttack = 0;
        this.aiPendingAttack = 0;
        this.playerPendingGarbage = [];
        this.aiPendingGarbage = [];
        this.playerGarbageHoldTimer = 0;
        this.aiGarbageHoldTimer = 0;
        this.playerGarbageDropTimer = 0;
        this.aiGarbageDropTimer = 0;
    }

    accumulateGarbage(senderBoard, clearedCount, comboCount) {
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
        if (garbageAmount >= 4) this.screenShakeManager.triggerShake(200);
        if (garbageAmount <= 0) return;

        if (senderBoard.isPlayer) {
            this.playerPendingAttack += garbageAmount;
        } else {
            this.aiPendingAttack += garbageAmount;
        }
    }

    sendAccumulatedGarbage(senderBoard) {
        const isPlayerSender = senderBoard.isPlayer;
        let attackAmount = isPlayerSender ? this.playerPendingAttack : this.aiPendingAttack;
        if (attackAmount <= 0) return;

        // Cancelar con el ataque pendiente del oponente
        let opponentAttack = isPlayerSender ? this.aiPendingAttack : this.playerPendingAttack;
        const cancelAmount = Math.min(attackAmount, opponentAttack);
        attackAmount -= cancelAmount;
        opponentAttack -= cancelAmount;

        this[isPlayerSender ? 'playerPendingAttack' : 'aiPendingAttack'] = 0; // El ataque se ha consumido
        this[isPlayerSender ? 'aiPendingAttack' : 'playerPendingAttack'] = opponentAttack; // Actualizar el ataque del oponente

        // Si queda basura por enviar, se crea un único paquete y se añade a la cola del oponente.
        if (attackAmount > 0) {
            const targetBoard = isPlayerSender ? { isPlayer: false } : { isPlayer: true };
            const targetQueue = targetBoard.isPlayer ? this.playerPendingGarbage : this.aiPendingGarbage;
            const newChunk = Array.from({ length: attackAmount }, () => ({ type: Math.floor(Math.random() * BLOCK_TYPES.length) }));
            targetQueue.push(newChunk);
            this[targetBoard.isPlayer ? 'playerGarbageHoldTimer' : 'aiGarbageHoldTimer'] = 2000;
            if (targetBoard.isPlayer) this.audioManager.play('garbage_alert');
        }
    }

    updatePendingGarbage(board, deltaTime) {
        const queue = board.isPlayer ? this.playerPendingGarbage : this.aiPendingGarbage;
        const holdTimerRef = board.isPlayer ? 'playerGarbageHoldTimer' : 'aiGarbageHoldTimer';
        
        if (queue.length > 0 && this[holdTimerRef] > 0) {
            this[holdTimerRef] -= deltaTime;
            return; // No dejamos caer nada mientras el temporizador esté activo.
        }
        this[holdTimerRef] = 0; // Asegurarse de que sea 0.
        // La lógica de soltar la basura ahora está en Board.handleIncomingGarbage
        // para asegurar que solo ocurra cuando el tablero está estable.
    }

    getPendingGarbage(isPlayer) {
        return isPlayer ? this.playerPendingGarbage : this.aiPendingGarbage;
    }

    getGarbageHoldTimer(isPlayer) {
        return isPlayer ? this.playerGarbageHoldTimer : this.aiGarbageHoldTimer;
    }
}