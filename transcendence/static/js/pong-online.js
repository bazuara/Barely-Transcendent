// Estado del juego para la versión online 
// (usamos diferentes nombres para evitar conflictos con pong.js)
let canvas, ctx;
let myPaddleY = 0.5;       // Mi paleta (siempre a la izquierda visualmente)
let opponentPaddleY = 0.5; // Paleta del oponente (siempre a la derecha visualmente)
let targetOpponentPaddleY = 0.5; // Posición objetivo para interpolación
let onlineBallX = 0.5;     // Posición actual de la pelota (normalizada)
let onlineBallY = 0.5;
let targetBallX = 0.5;     // Posición objetivo de la pelota para interpolación
let targetBallY = 0.5;
let player1Score = 0;      // Puntuación del jugador 1
let player2Score = 0;      // Puntuación del jugador 2

// Variables para control de actualizaciones
let lastPaddleUpdate = 0;  // Último momento en que se envió una actualización de paleta
let lastFrameTime = 0;     // Para cálculos de deltaTime

// WebSocket
let socket;
let roomId = null;
let isWaitingForOpponent = true;  // Indica si el jugador está esperando a un oponente
let playerNumber = null; // Para saber si somos el jugador 1 o 2
let gameInitialized = false; // Para evitar inicializaciones múltiples

// Constantes para interpolación
const PADDLE_INTERPOLATION_SPEED = 0.3; // Velocidad para paletas
const BALL_INTERPOLATION_SPEED = 0.5;   // Velocidad más alta para la pelota, más responsiva

// Inicializar el juego
function initOnlineGame() {
    // Evitar inicializaciones múltiples
    if (gameInitialized) {
        console.log("[DEBUG] El juego ya está inicializado, ignorando llamada");
        return;
    }
    
    gameInitialized = true;
    console.log("[DEBUG] Inicializando juego online...");

    // Asignación manual del jugador
    // Intentar obtener playerNumber del localStorage o cookies
    playerNumber = parseInt(localStorage.getItem('pongPlayerNumber') || '0');

    // Si no hay valor guardado, asignar uno basado en el momento actual
    if (!playerNumber) {
        // Si el timestamp actual es par, eres jugador 1, si es impar, jugador 2
        // Esto asegura que dos ventanas abiertas al mismo tiempo tendrán distintos números
        playerNumber = (Date.now() % 2) + 1;
        localStorage.setItem('pongPlayerNumber', playerNumber.toString());
    }

    console.log(`[DEBUG] ¡Asignación manual! Soy el jugador ${playerNumber}`);

    // Actualizar la UI para mostrar qué jugador soy
    const playerIndicator = document.createElement('div');
    playerIndicator.className = 'position-absolute top-0 start-0 bg-dark bg-opacity-75 text-white p-2';
    playerIndicator.innerText = `Eres el jugador ${playerNumber}`;
    document.getElementById('game-container').appendChild(playerIndicator);

    // Obtener el canvas y el contexto
    canvas = document.getElementById('pong-canvas');
    ctx = canvas.getContext('2d');

    // Configurar el canvas
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Configurar manejo de teclas
    const keysPressed = {};
    
    window.addEventListener('keydown', function(event) {
        keysPressed[event.key] = true;
    });
    
    window.addEventListener('keyup', function(event) {
        keysPressed[event.key] = false;
    });
    
    // Agregar intervalo para movimiento suave de las paletas
    setInterval(function() {
        if (isWaitingForOpponent) return;
        
        const paddleStep = 0.025; // Paso controlado
        let hasMoved = false;
        
        if (keysPressed['w'] || keysPressed['W'] || keysPressed['ArrowUp']) {
            myPaddleY = Math.max(0, myPaddleY - paddleStep);
            hasMoved = true;
        }
        if (keysPressed['s'] || keysPressed['S'] || keysPressed['ArrowDown']) {
            myPaddleY = Math.min(1, myPaddleY + paddleStep);
            hasMoved = true;
        }
        
        // Solo enviar si realmente se movió
        if (hasMoved) {
            sendPaddleMovement(playerNumber === 1 ? 'player1' : 'player2', myPaddleY);
        }
    }, 20); // 50 fps

    // Mostrar mensaje de espera
    showWaitingMessage();

    // Iniciar el bucle de renderizado
    requestAnimationFrame(gameLoop);

    // Conectar al WebSocket (solo una vez)
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

    // Si ya hay una conexión activa, cerrarla primero
    if (socket && socket.readyState !== WebSocket.CLOSED) {
        console.log("[DEBUG] Ya existe una conexión WebSocket activa, cerrándola primero");
        socket.close();
    }

    // Conectar al WebSocket
    socket = new WebSocket(`ws://${window.location.host}/ws/pong/`);

    // Manejar eventos del WebSocket
    socket.onopen = function(event) {
        console.log("[DEBUG] Conexión WebSocket abierta.");
        
        setTimeout(function() {
            if (socket && socket.readyState === WebSocket.OPEN) {
                console.log("[DEBUG] Enviando solicitud de emparejamiento...");
                socket.send(JSON.stringify({
                    type: "join_queue",
                    room_id: roomId,
                    user_id: 999999  // Cambia esto por el ID del usuario real
                }));
            }
        }, 100);
    };

    socket.onmessage = function(event) {
        console.log("[DEBUG] Mensaje recibido del servidor:", event.data);
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };

    socket.onclose = function(event) {
        console.log("[DEBUG] Conexión WebSocket cerrada. Código:", event.code);
        
        // Mostrar mensaje si no fue una desconexión planeada
        if (!event.wasClean) {
            const gameMessage = document.getElementById('game-message');
            gameMessage.innerHTML = `
                <h3 class="text-center">Se perdió la conexión</h3>
                <p class="text-center">Inténtalo de nuevo más tarde</p>
                <button class="btn btn-primary mt-3" onclick="window.location.reload()">Reintentar</button>
            `;
            gameMessage.classList.remove('d-none');
        }
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
            roomId = data.room_id;

            // Nota: No sobreescribimos playerNumber aquí, porque ya lo asignamos manualmente
            console.log(`[DEBUG] Manteniendo asignación manual como jugador ${playerNumber}`);

            // Actualizar la URL con el room_id sin recargar la página
            const newUrl = `${window.location.pathname}?room_id=${data.room_id}`;
            window.history.pushState({}, '', newUrl);

            // Ocultar el mensaje de espera
            document.getElementById('game-message').classList.add('d-none');
            break;

        case 'waiting':
            console.log("[DEBUG] Esperando a otro jugador...");
            isWaitingForOpponent = true;
            
            // Asegurarse de que el mensaje de espera esté visible
            const gameMessage = document.getElementById('game-message');
            gameMessage.classList.remove('d-none');
            gameMessage.innerHTML = `
                <h3 class="text-center">Esperando a otro jugador...</h3>
                <div class="spinner-border text-light" role="status">
                    <span class="visually-hidden">Cargando...</span>
                </div>
            `;
            break;

        case 'update_paddle':
            // Determinar si es un movimiento propio o del oponente
            const isMyPaddle = (playerNumber === 1 && data.player === 'player1') || 
                              (playerNumber === 2 && data.player === 'player2');
            
            if (isMyPaddle) {
                // Es mi propia paleta - aplicar directamente
                myPaddleY = data.paddle_position;
            } else {
                // Es la paleta del oponente - actualizar objetivo para interpolación
                targetOpponentPaddleY = data.paddle_position;
            }
            break;

        case 'update_ball':
            // Si soy el jugador 2, necesito invertir la coordenada X para mostrar correctamente la pelota
            // desde mi perspectiva (esto solo afecta la visualización, no la lógica de juego)
            if (playerNumber === 2) {
                targetBallX = 1 - data.ball_position_x;
            } else {
                targetBallX = data.ball_position_x;
            }
            
            targetBallY = data.ball_position_y;
            break;

        case 'update_score':
            player1Score = data.player1_score;
            player2Score = data.player2_score;
            
            // Actualizar la puntuación en la interfaz si hay elementos HTML para ello
            const score1Element = document.getElementById('player1-score');
            const score2Element = document.getElementById('player2-score');
            
            if (score1Element && score2Element) {
                // Para el jugador 2, invertimos la visualización de las puntuaciones
                if (playerNumber === 2) {
                    score1Element.textContent = player2Score;
                    score2Element.textContent = player1Score;
                } else {
                    score1Element.textContent = player1Score;
                    score2Element.textContent = player2Score;
                }
            }
            
            // Al marcar un punto, reset inmediato de posiciones
            // para evitar "saltos" cuando la pelota se reinicia
            if (targetBallX === 0.5 && targetBallY === 0.5) {
                onlineBallX = 0.5;
                onlineBallY = 0.5;
            }
            break;

        // Modificar la sección del case 'game_over' en handleWebSocketMessage:

        case 'game_over':
            console.log("[DEBUG] La partida ha terminado.", data);
            isWaitingForOpponent = true;
            
            // Determinar el mensaje adecuado según la perspectiva del jugador
            let gameOverMessage;
            let winner = data.winner;
            let iWon = false;
            
            if (winner === 0) {
                gameOverMessage = data.message || 'La partida ha terminado';
            } else {
                // Determinar si este jugador ganó
                if (playerNumber === 1) {
                    iWon = (winner === 1);
                } else { // playerNumber === 2
                    iWon = (winner === 2);
                }
                
                if (iWon) {
                    gameOverMessage = '¡Has ganado! 🎉';
                } else {
                    gameOverMessage = 'Has perdido. ¡Mejor suerte la próxima vez!';
                }
            }
            
            // Mostrar mensaje de fin de juego
            const endGameMessage = document.getElementById('game-message');
            endGameMessage.innerHTML = `
                <h3 class="text-center">¡Fin del juego!</h3>
                <p class="text-center">${gameOverMessage}</p>
                <p class="text-center">Puntuación final: ${player1Score} - ${player2Score}</p>
                <button class="btn btn-primary mt-3" onclick="window.location.reload()">Jugar de nuevo</button>
            `;
            endGameMessage.classList.remove('d-none');
            
            // Enviar estadísticas al backend
            if (socket && socket.readyState === WebSocket.OPEN) {
                let myScore = playerNumber === 1 ? player1Score : player2Score;
                let playerId = playerNumber === 1 ? data.player1_id : data.player2_id;
                
                if (playerId) {
                    socket.send(JSON.stringify({
                        action: 'game_over',
                        player_id: playerId,
                        points_scored: myScore,
                        has_won: iWon
                    }));
                    console.log(`[DEBUG] Enviando estadísticas: jugador=${playerId}, puntos=${myScore}, victoria=${iWon}`);
                }
            }
            break;


        case 'error':
            console.error("[DEBUG] Error del servidor:", data.message);
            // Mostrar el error al usuario
            const errorMessage = document.getElementById('game-message');
            errorMessage.innerHTML = `
                <h3 class="text-center">Error</h3>
                <p class="text-center">${data.message}</p>
                <button class="btn btn-primary mt-3" onclick="window.location.reload()">Reintentar</button>
            `;
            errorMessage.classList.remove('d-none');
            break;

        default:
            console.warn("[DEBUG] Mensaje WebSocket no reconocido:", data);
    }
}

// Enviar movimiento de la paleta al servidor
function sendPaddleMovement(player, position) {
    if (socket && socket.readyState === WebSocket.OPEN && roomId) {
        // Limitamos las actualizaciones a 20 por segundo para reducir lag
        const now = Date.now();
        if (now - lastPaddleUpdate >= 50) { // 50ms = 20 FPS
            lastPaddleUpdate = now;
            
            const message = {
                action: 'move_paddle',
                room_id: roomId,
                player: player,
                paddle_position: position
            };
            socket.send(JSON.stringify(message));
        }
    }
}

// Redimensionar el canvas
function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
}

// Función de interpolación para movimiento suave
function lerp(start, end, factor) {
    return start + (end - start) * factor;
}

// Bucle de renderizado con interpolación
function gameLoop(timestamp) {
    // Calcular delta time para animaciones consistentes
    if (!lastFrameTime) lastFrameTime = timestamp;
    const deltaTime = Math.min(50, timestamp - lastFrameTime) / 1000; // En segundos, limitado a 50ms
    lastFrameTime = timestamp;
    
    // Interpolación de posiciones para movimiento suave
    // Interpolar posición de la paleta del oponente suavemente
    opponentPaddleY = lerp(opponentPaddleY, targetOpponentPaddleY, PADDLE_INTERPOLATION_SPEED * deltaTime * 60);
    
    // Interpolar posición de la pelota más rápidamente
    onlineBallX = lerp(onlineBallX, targetBallX, BALL_INTERPOLATION_SPEED * deltaTime * 60);
    onlineBallY = lerp(onlineBallY, targetBallY, BALL_INTERPOLATION_SPEED * deltaTime * 60);

    // Limpiar el canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Obtenemos las constantes de tamaño del juego
    const paddleWidth = 15;
    const paddleHeight = 100;
    const ballRadius = 10;

    // Dibujar las paletas
    ctx.fillStyle = '#00FF00'; // Mi paleta en verde
    
    // Siempre dibujar mi paleta a la izquierda
    ctx.fillRect(0, myPaddleY * canvas.height - paddleHeight/2, paddleWidth, paddleHeight);
    
    // Dibujar la paleta del oponente a la derecha
    ctx.fillStyle = '#FFFFFF'; // Paleta del oponente en blanco
    ctx.fillRect(
        canvas.width - paddleWidth, 
        opponentPaddleY * canvas.height - paddleHeight/2, 
        paddleWidth, 
        paddleHeight
    );

    // Dibujar la pelota
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(onlineBallX * canvas.width, onlineBallY * canvas.height, ballRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Dibujar puntuación
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    
    let myScore, opponentScore;
    if (playerNumber === 1) {
        myScore = player1Score;
        opponentScore = player2Score;
    } else {
        myScore = player2Score;
        opponentScore = player1Score;
    }
    
    ctx.fillText(`${myScore} - ${opponentScore}`, canvas.width / 2, 30);

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
