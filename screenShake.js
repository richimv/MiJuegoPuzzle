// c:\Users\ricar\Downloads\MiJuegoPuzzle-main\screenShake.js
export class ScreenShake {
    constructor() {
        this.shakeDuration = 0;
    }

    triggerShake(duration) {
        // No acumular, simplemente tomar la duración más larga.
        this.shakeDuration = Math.max(this.shakeDuration, duration);
    }

    update(deltaTime) {
        if (this.shakeDuration > 0) {
            this.shakeDuration -= deltaTime;
        }
    }

    getShakeOffset() {
        if (this.shakeDuration > 0) {
            const magnitude = 4; // Píxeles de desplazamiento
            return { x: (Math.random() - 0.5) * magnitude, y: (Math.random() - 0.5) * magnitude };
        }
        return { x: 0, y: 0 };
    }
}