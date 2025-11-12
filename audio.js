/**
 * Gestor de audio para cargar y reproducir efectos de sonido.
 */
export class AudioManager {
    constructor() {
        this.sounds = {};
        this.isMuted = false; // Podríamos añadir un botón para silenciar en el futuro
        this.unlocked = false;
    }

    loadSounds() {
        const soundFiles = {
            swap: './sounds/swap.wav',
            clear: './sounds/clear.wav',
            combo: './sounds/combo.wav',
            fall: './sounds/fall.wav',
            garbage_alert: './sounds/garbage_alert.wav',
            garbage_drop: './sounds/garbage_drop.wav'
        };

        for (const key in soundFiles) {
            this.sounds[key] = new Audio(soundFiles[key]);
            this.sounds[key].volume = 0.5; // Ajustar volumen si es necesario
        }
    }

    unlock() {
        if (this.unlocked) return;
        this.unlocked = true;
        // Una técnica común para desbloquear el audio es reproducir un sonido silencioso.
        // Pero para nuestro caso, simplemente activar la bandera en la primera interacción es suficiente.
        console.log("Audio context unlocked by user interaction.");
    }

    play(soundName) {
        if (!this.isMuted && this.unlocked && this.sounds[soundName]) {
            this.sounds[soundName].currentTime = 0; // Reiniciar el sonido para poder reproducirlo rápidamente
            this.sounds[soundName].play();
        }
    }
}