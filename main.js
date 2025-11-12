import { Game } from './game.js';

// Espera a que todo el contenido del DOM esté completamente cargado y listo.
// Esta es la forma más segura de iniciar scripts que dependen de elementos del HTML.
document.addEventListener('DOMContentLoaded', () => {
    // Crea una nueva instancia del juego para empezar todo.
    const game = new Game();
});