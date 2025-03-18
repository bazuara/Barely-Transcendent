// static/js/pong-init.js
function initializePong() {
    console.log("Initializing Pong scripts");

    // Verificar si los listeners ya están configurados
    if (window.pongInitialized) {
        console.log("Pong already initialized");
        return;
    }

    // Configurar el botón de juego local
    const playLocalBtn = document.getElementById('play-local-btn');
    if (playLocalBtn) {
        playLocalBtn.addEventListener('click', function() {
            console.log("Local play button clicked");
            document.getElementById('game-container').classList.remove('d-none');
            document.getElementById('game-message').classList.remove('d-none');
            
            setTimeout(function() {
                if (typeof initPongGame === 'function') {
                    initPongGame();
                } else {
                    console.error("initPongGame function not found. Is pong.js loaded properly?");
                }
            }, 100);
        });
    } else {
        console.error("Play local button not found");
    }

    // Configurar el botón de juego online
    const playOnlineBtn = document.getElementById('play-online-btn');
    if (playOnlineBtn) {
        playOnlineBtn.addEventListener('click', function() {
            console.log("Online play button clicked");
            document.getElementById('game-container').classList.remove('d-none');
            document.getElementById('game-message').classList.remove('d-none');
            
            setTimeout(function() {
                if (typeof initOnlineGame === 'function') {
                    initOnlineGame();
                } else {
                    console.error("initOnlineGame function not found. Is pong-online.js loaded properly?");
                }
            }, 100);
        });
    } else {
        console.error("Play online button not found");
    }

    // Marcar como inicializado
    window.pongInitialized = true;
}

// Ejecutar la inicialización cuando el script se carga
initializePong();