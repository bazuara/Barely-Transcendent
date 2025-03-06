// Constantes del juego
const PADDLE_HEIGHT = 100;
const PADDLE_WIDTH = 15;
const BALL_RADIUS = 10;

// Estado del juego
let canvas, ctx;
let player1Y = 0.5;  // Posición inicial de la paleta del jugador 1 (normalizada)
let player2Y = 0.5;  // Posición inicial de la paleta del jugador 2 (normalizada)
let ballX = 0.5;     // Posición inicial de la pelota (normalizada)
let ballY = 0.5;

// WebSocket
let socket;
let roomId = null;
let isWaitingForOpponent = true;  // Indica si el jugador está esperando a un oponente

// Inicializar el juego
function initOnlineGame() {
    console.log("[DEBUG] Inicializando juego online...");

    // Obtener el canvas y el contexto
    canvas = document.getElementById('pong-canvas');
    ctx = canvas.getContext('2d');

    // Configurar el canvas
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Capturar eventos de teclado
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Mostrar mensaje de espera
    showWaitingMessage();

    // Iniciar el bucle de renderizado
    requestAnimationFrame(gameLoop);

    // Conectar al WebSocket
    connectWebSocket();
}

// Mostrar mensaje de espera
function showWaitingMessage() {
    console.log("[DEBUG] Mostrando mensaje de espera...");
    const gameMessage = document.getElementById('game-message');
    gameMessage.innerHTML = `
        <h3 class="text-center">Esperando a otro jugador...</h3>
        <div class="spinner-border text-light" role="status">
            <span class="visually-hidden">Cargando...</span>
        </div>
    `;
    gameMessage.classList.remove('d-none');
}

// Conectar al WebSocket
function connectWebSocket() {
    console.log("[DEBUG] Conectando al WebSocket...");

    // Conectar al WebSocket
    socket = new WebSocket(`ws://${window.location.host}/ws/pong/`);

    // Manejar eventos del WebSocket
    socket.onopen = function(event) {
        console.log("[DEBUG] Conexión WebSocket abierta.");
        console.log("[DEBUG] Enviando solicitud de emparejamiento...");
        socket.send(JSON.stringify({
            type: "join_queue",
            user_id: 999999  // Cambia esto por el ID del usuario real
        }));
    };

    socket.onmessage = function(event) {
        console.log("[DEBUG] Mensaje recibido del servidor:", event.data);
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };

    socket.onclose = function(event) {
        console.log("[DEBUG] Conexión WebSocket cerrada.");
    };

    socket.onerror = function(error) {
        console.error("[DEBUG] Error en la conexión WebSocket:", error);
    };
}

// Manejar mensajes del WebSocket
function handleWebSocketMessage(data) {
    console.log("[DEBUG] Procesando mensaje del WebSocket:", data);

    switch (data.type) {
        case 'game_start':
            console.log("[DEBUG] La partida ha comenzado.");
            isWaitingForOpponent = false;  // Ya no está esperando

            // Actualizar la URL con el room_id
            const newUrl = `${window.location.pathname}?room_id=${data.room_id}`;
            window.history.pushState({}, '', newUrl);

            // Conectar al WebSocket con el room_id proporcionado
            connectWebSocket(data.room_id);

            // Ocultar el mensaje de espera
            document.getElementById('game-message').classList.add('d-none');
            break;

        case 'update_paddle':
            console.log("[DEBUG] Actualizando posición de la paleta:", data);
            // Actualizar la posición de la paleta del otro jugador
            if (data.player === 'player1') {
                player1Y = data.paddle_position;
            } else if (data.player === 'player2') {
                player2Y = data.paddle_position;
            }
            break;

        case 'update_ball':
            console.log("[DEBUG] Actualizando posición de la pelota:", data);
            // Actualizar la posición de la pelota
            ballX = data.ball_position_x;
            ballY = data.ball_position_y;
            break;

        case 'game_over':
            console.log("[DEBUG] La partida ha terminado.");
            break;

        default:
            console.warn("[DEBUG] Mensaje WebSocket no reconocido:", data);
    }
}

// Enviar movimiento de la paleta al servidor
function sendPaddleMovement(player, position) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("[DEBUG] Enviando movimiento de la paleta:", { player, position });
        const message = {
            action: 'move_paddle',
            player: player,
            paddle_position: position
        };
        socket.send(JSON.stringify(message));
    }
}

// Manejar eventos de teclado
function handleKeyDown(event) {
    if (isWaitingForOpponent) {
        // Ignorar eventos de teclado mientras se espera a un oponente
        return;
    }

    if (event.key === 'w' || event.key === 'W') {
        // Mover la paleta del jugador 1 hacia arriba
        player1Y = Math.max(0, player1Y - 0.02);
        sendPaddleMovement('player1', player1Y);
    } else if (event.key === 's' || event.key === 'S') {
        // Mover la paleta del jugador 1 hacia abajo
        player1Y = Math.min(1, player1Y + 0.02);
        sendPaddleMovement('player1', player1Y);
    }
}

function handleKeyUp(event) {
    // Puedes añadir lógica adicional si es necesario
}

// Redimensionar el canvas
function resizeCanvas() {
    console.log("[DEBUG] Redimensionando canvas...");
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
}

// Bucle de renderizado
function gameLoop() {
    // Limpiar el canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dibujar las paletas
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, player1Y * canvas.height, PADDLE_WIDTH, PADDLE_HEIGHT);
    ctx.fillRect(canvas.width - PADDLE_WIDTH, player2Y * canvas.height, PADDLE_WIDTH, PADDLE_HEIGHT);

    // Dibujar la pelota
    ctx.beginPath();
    ctx.arc(ballX * canvas.width, ballY * canvas.height, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Solicitar el siguiente frame
    requestAnimationFrame(gameLoop);
}

// Iniciar el juego cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    console.log("[DEBUG] DOM completamente cargado.");
    const playOnlineBtn = document.getElementById('play-online-btn');
    if (playOnlineBtn) {
        playOnlineBtn.addEventListener('click', function() {
            console.log("[DEBUG] Botón 'Jugar Online' pulsado.");
            document.getElementById('game-container').classList.remove('d-none');
            initOnlineGame();
        });
    }
});
