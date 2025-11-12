export const GRID_WIDTH = 6;
export const GRID_HEIGHT = 12;

export const BLOCK_SIZE = 40;
export const AI_BLOCK_SIZE = 20;

export const FALL_SPEED = 350; // Píxeles por segundo (Reducido para mejor jugabilidad)
export const RAISE_INTERVAL = 5000; // El tablero subirá cada 5 segundos
export const MANUAL_RAISE_SPEED = 300; // Píxeles por segundo al mantener Shift

export const BLOCK_COLORS = {
    RED: '#FF0000',
    BLUE: '#0000FF',
    GREEN: '#00FF00',
    YELLOW: '#FFFF00',
    MAGENTA: '#FF00FF'
};

// Generamos el array de tipos a partir del objeto de colores.
// El índice del array corresponderá al tipo de bloque (0: RED, 1: BLUE, etc.)
export const BLOCK_TYPES = Object.values(BLOCK_COLORS);

export const AI_THINK_TIME_EASY = 1500; // ms
export const AI_THINK_TIME_HARD = 500; // ms
export const AI_ACTION_PAUSE = 500; // ms

export const CURSOR_COLOR = '#FFFFFF';

export const TIME_ATTACK_DURATION = 120; // 2 minutos en segundos

export const GARBAGE_DROP_DELAY = 75; // ms entre cada bloque de basura que cae