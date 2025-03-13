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

// Variables para información de jugadores
let player1Data = null;    // Datos del jugador 1
let player2Data = null;    // Datos del jugador 2
let myPlayerNumber = null; // Si soy jugador 1 o 2

// Variables para control de actualizaciones
let lastPaddleUpdate = 0;  // Último momento en que se envió una actualización de paleta
let lastFrameTime = 0;     // Para cálculos de deltaTime

// WebSocket
let socket;
let roomId = null;
let isWaitingForOpponent = true;  // Indica si el jugador está esperando a un oponente
let playerNumber = null; // Para saber si somos el jugador 1 o 2
let gameInitialized = false; // Para evitar inicializaciones múltiples
let keysPressed = {};    // Para tracking de teclas presionadas

// Variable para el intervalo de movimiento de la paleta
let paddleMoveInterval = null;

// Variables para control de animación
let animationFrameId = null; // Para poder cancelar el loop de animación

// Constantes para interpolación
const PADDLE_INTERPOLATION_SPEED = 0.3; // Velocidad para paletas
const BALL_INTERPOLATION_SPEED = 0.5;   // Velocidad más alta para la pelota, más responsiva

// Función para obtener el ID del usuario actual
function getUserId() {
    // Intentar obtener de la variable global que establecemos en la plantilla
    if (typeof currentUserId !== 'undefined' && currentUserId !== '') {
        return currentUserId;
    }
    
    // Fallback: usar un ID genérico si no hay usuario
    return "guest-" + Math.floor(Math.random() * 10000);
}

// Limpiar el estado del juego online
function cleanupOnlineGame() {
    console.log("[DEBUG] Limpiando estado del juego online...");
    
    // Detener el bucle de animación si está activo
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    // Cerrar el WebSocket si está abierto
    if (socket && socket.readyState !== WebSocket.CLOSED) {
        console.log("[DEBUG] Cerrando conexión WebSocket existente");
        socket.close();
        socket = null;
    }
    
    // Limpiar el intervalo de movimiento de la paleta
    if (paddleMoveInterval) {
        clearInterval(paddleMoveInterval);
        paddleMoveInterval = null;
        console.log("[DEBUG] Intervalo de movimiento de paleta eliminado");
    }
    
    // Resetear variables del juego
    myPaddleY = 0.5;
    opponentPaddleY = 0.5;
    targetOpponentPaddleY = 0.5;
    onlineBallX = 0.5;
    onlineBallY = 0.5;
    targetBallX = 0.5;
    targetBallY = 0.5;
    player1Score = 0;
    player2Score = 0;
    roomId = null;
    isWaitingForOpponent = true;
    playerNumber = null;
    gameInitialized = false;
    lastPaddleUpdate = 0;
    lastFrameTime = 0;
    player1Data = null;
    player2Data = null;
    myPlayerNumber = null;
    keysPressed = {};
    
    // Eliminar indicadores visuales específicos del modo online
    const playerIndicator = document.querySelector('.player-indicator');
    if (playerIndicator) {
        playerIndicator.remove();
    }
    
    // Resetear puntajes en la interfaz
    const score1Element = document.getElementById('player1-score');
    const score2Element = document.getElementById('player2-score');
    if (score1Element && score2Element) {
        score1Element.textContent = "0";
        score2Element.textContent = "0";
    }
    
    // Resetear información de jugadores
    const player1Name = document.getElementById('player1-name');
    const player1Avatar = document.getElementById('player1-avatar');
    const player2Name = document.getElementById('player2-name');
    const player2Avatar = document.getElementById('player2-avatar');
    
    if (player1Name) {
        player1Name.textContent = "";
        player1Name.classList.remove('text-primary');
    }
    if (player1Avatar) {
        player1Avatar.src = "";
        player1Avatar.style.display = "none";
    }
    if (player2Name) {
        player2Name.textContent = "";
        player2Name.classList.remove('text-primary');
    }
    if (player2Avatar) {
        player2Avatar.src = "";
        player2Avatar.style.display = "none";
    }
    
    // Limpiar el canvas si existe
    if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    // Eliminar todos los event listeners de teclado (que podrían causar bugs)
    window.onkeydown = null;
    window.onkeyup = null;
    
    console.log("[DEBUG] Limpieza del juego online completada");
    
    // Devolver una promesa resuelta para poder hacer await si es necesario
    return Promise.resolve();
}

// Inicializar el juego
function initOnlineGame() {
    // Limpiar cualquier estado previo (juego local o online anterior)
    cleanupOnlineGame();
    
    // Si existe una función de limpieza para el juego local, llamarla
    if (typeof cleanupLocalGame === 'function') {
        cleanupLocalGame();
    }
    
    gameInitialized = true;
    console.log("[DEBUG] Inicializando juego online...");

    // Obtener el canvas y el contexto
    canvas = document.getElementById('pong-canvas');
    if (!canvas) {
        console.error("[ERROR] No se encontró el elemento canvas 'pong-canvas'");
        return;
    }
    ctx = canvas.getContext('2d');

    // Configurar el canvas
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Configurar manejo de teclas
    keysPressed = {};
    
    window.addEventListener('keydown', function(event) {
        keysPressed[event.key] = true;
    });
    
    window.addEventListener('keyup', function(event) {
        keysPressed[event.key] = false;
    });
    
    // Limpiar el intervalo anterior si existe
    if (paddleMoveInterval) {
        clearInterval(paddleMoveInterval);
        paddleMoveInterval = null;
    }
    
    // Crear un nuevo intervalo para el movimiento de la paleta
    paddleMoveInterval = setInterval(function() {
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
        if (hasMoved && playerNumber) { // Asegurarse de que playerNumber esté definido
            sendPaddleMovement(playerNumber === 1 ? 'player1' : 'player2', myPaddleY);
        }
    }, 20); // 50 fps

    // Mostrar mensaje de espera
    showWaitingMessage();

    // Iniciar el bucle de renderizado
    animationFrameId = requestAnimationFrame(gameLoop);

    // Conectar al WebSocket (solo una vez)
    connectWebSocket();
}

// Mostrar mensaje de espera
function showWaitingMessage() {
    console.log("[DEBUG] Mostrando mensaje de espera...");
    const gameMessage = document.getElementById('game-message');
    if (!gameMessage) {
        console.error("[ERROR] No se encontró el elemento 'game-message'");
        return;
    }
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

    // Conectar usando WebSocket normal (ws)
    const wsUrl = `ws://${window.location.host}/ws/pong/`;
    
    console.log(`[DEBUG] Conectando a WebSocket: ${wsUrl}`);
    
    // Conectar al WebSocket
    socket = new WebSocket(wsUrl);

    // Manejar eventos del WebSocket
    socket.onopen = function(event) {
        console.log("[DEBUG] Conexión WebSocket abierta.");
        
        setTimeout(function() {
            if (socket && socket.readyState === WebSocket.OPEN) {
                const userId = getUserId();
                console.log(`[DEBUG] Enviando solicitud de emparejamiento para el usuario ${userId}...`);
                socket.send(JSON.stringify({
                    type: "join_queue",
                    room_id: roomId,
                    user_id: userId  // Usar el ID real del usuario
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
            if (gameMessage) {
                gameMessage.innerHTML = `
                    <h3 class="text-center">Se perdió la conexión</h3>
                    <p class="text-center">Inténtalo de nuevo más tarde</p>
                `;
                gameMessage.classList.remove('d-none');
            }
        }
    };

    socket.onerror = function(error) {
        console.error("[DEBUG] Error en la conexión WebSocket:", error);
    };
}

// Actualizar la información de los jugadores en la interfaz
function updatePlayerInfo() {
    const player1Name = document.getElementById('player1-name');
    const player1Avatar = document.getElementById('player1-avatar');
    const player2Name = document.getElementById('player2-name');
    const player2Avatar = document.getElementById('player2-avatar');
    
    // Determinar qué información mostrar en cada lado basado en la perspectiva del jugador actual
    let leftPlayerData, rightPlayerData;
    
    if (myPlayerNumber === 1) {
        // Soy el jugador 1, así que me muestro a la izquierda
        leftPlayerData = player1Data;
        rightPlayerData = player2Data;
    } else {
        // Soy el jugador 2, así que me muestro a la izquierda
        leftPlayerData = player2Data;
        rightPlayerData = player1Data;
    }
    
    // Actualizar la información del lado izquierdo (siempre el jugador actual)
    if (leftPlayerData && player1Name && player1Avatar) {
        player1Name.textContent = leftPlayerData.intra_login || 'Jugador ' + (myPlayerNumber === 1 ? '1' : '2');
        player1Name.classList.add('text-primary'); // Resaltar siempre mi nombre
        
        if (leftPlayerData.intra_picture) {
            player1Avatar.src = leftPlayerData.intra_picture;
            player1Avatar.style.display = "block";
        } else {
            player1Avatar.style.display = "none";
        }
    }
    
    // Actualizar la información del lado derecho (siempre el oponente)
    if (rightPlayerData && player2Name && player2Avatar) {
        player2Name.textContent = rightPlayerData.intra_login || 'Jugador ' + (myPlayerNumber === 1 ? '2' : '1');
        player2Name.classList.remove('text-primary'); // Nunca resaltar al oponente
        
        if (rightPlayerData.intra_picture) {
            player2Avatar.src = rightPlayerData.intra_picture;
            player2Avatar.style.display = "block";
        } else {
            player2Avatar.style.display = "none";
        }
    }
}

// Manejar mensajes del WebSocket
function handleWebSocketMessage(data) {
    console.log("[DEBUG] Procesando mensaje del WebSocket:", data);

    switch (data.type) {
        case 'game_start':
            console.log("[DEBUG] La partida ha comenzado.");
            isWaitingForOpponent = false;  // Ya no está esperando
            roomId = data.room_id;

            // Determinar el número de jugador basado en los IDs recibidos
            const userIdForGame = getUserId();
            
            if (userIdForGame === data.player1.id) {
                playerNumber = 1;
                myPlayerNumber = 1;
            } else if (userIdForGame === data.player2.id) {
                playerNumber = 2;
                myPlayerNumber = 2;
            } else {
                console.error("[ERROR] No se pudo determinar el número de jugador. Mi ID:", userIdForGame, "IDs recibidos:", data.player1.id, data.player2.id);
                playerNumber = Math.random() < 0.5 ? 1 : 2; // Fallback por si acaso
                myPlayerNumber = playerNumber;
            }
            
            // Guardar información de los jugadores
            player1Data = data.player1;
            player2Data = data.player2;
            
            // Actualizar la información de los jugadores en la interfaz
            updatePlayerInfo();
            
            console.log(`[DEBUG] Asignado como jugador ${playerNumber}`);

            // Actualizar la URL con el room_id sin recargar la página
            const newUrl = `${window.location.pathname}?room_id=${data.room_id}`;
            window.history.pushState({}, '', newUrl);

            // Ocultar el mensaje de espera
            const gameMessage = document.getElementById('game-message');
            if (gameMessage) {
                gameMessage.classList.add('d-none');
            }
            break;

        case 'waiting':
            console.log("[DEBUG] Esperando a otro jugador...");
            isWaitingForOpponent = true;
            
            // Asegurarse de que el mensaje de espera esté visible
            const waitingMessage = document.getElementById('game-message');
            if (waitingMessage) {
                waitingMessage.classList.remove('d-none');
                waitingMessage.innerHTML = `
                    <h3 class="text-center">Esperando a otro jugador...</h3>
                    <div class="spinner-border text-light" role="status">
                        <span class="visually-hidden">Cargando...</span>
                    </div>
                `;
            }
            break;

        case 'update_paddle':
            // Determinar si es un movimiento propio o del oponente
            const isMyPaddle = (playerNumber === 1 && data.player === 'player1') || 
                              (playerNumber === 2 && data.player === 'player2');
            
            if (isMyPaddle) {
                // Es mi propia paleta - aplicar solo si hay una discrepancia significativa
                if (Math.abs(myPaddleY - data.paddle_position) > 0.1) {
                    console.log("[DEBUG] Corrigiendo desincronización de MI paleta:", 
                                myPaddleY, "->", data.paddle_position);
                    myPaddleY = data.paddle_position;
                } else {
                    // Ignorar pequeñas diferencias para reducir procesamiento innecesario
                    console.log("[DEBUG] Ignorando eco de servidor para MI paleta");
                }
            } else {
                // Es la paleta del oponente - actualizar objetivo para interpolación
                targetOpponentPaddleY = data.paddle_position;
                console.log("[DEBUG] Actualizando paleta del OPONENTE a:", data.paddle_position);
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
                // Cada jugador ve su puntuación a la izquierda
                if (myPlayerNumber === 1) {
                    score1Element.textContent = player1Score;
                    score2Element.textContent = player2Score;
                } else {
                    score1Element.textContent = player2Score;
                    score2Element.textContent = player1Score;
                }
            }
            
            // Al marcar un punto, reset inmediato de posiciones
            // para evitar "saltos" cuando la pelota se reinicia
            if (targetBallX === 0.5 && targetBallY === 0.5) {
                onlineBallX = 0.5;
                onlineBallY = 0.5;
            }
            break;

        case 'game_over':
            console.log("[DEBUG] La partida ha terminado.", data);
            isWaitingForOpponent = true;
            
            // Determinar el mensaje adecuado según la perspectiva del jugador
            let gameOverMessage;
            let winner = data.winner;
            
            // Determinar correctamente si este cliente ganó la partida
            // El ganador es "player1" (winner=1) o "player2" (winner=2)
            const currentId = getUserId();
            const winningPlayerId = winner === 1 ? data.player1_id : data.player2_id;
            const iWon = currentId === winningPlayerId;
            
            // Obtener el nombre del jugador actual y del oponente
            let myName = myPlayerNumber === 1 ? 
                (player1Data ? player1Data.intra_login : 'Jugador 1') : 
                (player2Data ? player2Data.intra_login : 'Jugador 2');
                
            let opponentName = myPlayerNumber === 1 ? 
                (player2Data ? player2Data.intra_login : 'Jugador 2') : 
                (player1Data ? player1Data.intra_login : 'Jugador 1');
            
            if (winner === 0) {
                gameOverMessage = data.message || 'La partida ha terminado';
            } else {
                if (iWon) {
                    gameOverMessage = '¡Has ganado! 🎉';
                } else {
                    gameOverMessage = `¡${opponentName} ha ganado! Mejor suerte la próxima vez.`;
                }
            }
            
            // Mostrar mensaje de fin de juego
            const endGameMessage = document.getElementById('game-message');
            if (endGameMessage) {
                endGameMessage.innerHTML = `
                    <h3 class="text-center">¡Fin del juego!</h3>
                    <p class="text-center">${gameOverMessage}</p>
                    <p class="text-center">Puntuación final: ${player1Score} - ${player2Score}</p>
                `;
                endGameMessage.classList.remove('d-none');
            }
            
            // Enviar estadísticas al backend
            if (socket && socket.readyState === WebSocket.OPEN) {
                let myScore = playerNumber === 1 ? player1Score : player2Score;
                
                socket.send(JSON.stringify({
                    action: 'game_over',
                    player_id: currentId,
                    points_scored: myScore,
                    has_won: iWon
                }));
                console.log(`[DEBUG] Enviando estadísticas: jugador=${currentId}, puntos=${myScore}, victoria=${iWon}`);
            }
            break;

        case 'error':
            console.error("[DEBUG] Error del servidor:", data.message);
            // Mostrar el error al usuario
            const errorMessage = document.getElementById('game-message');
            if (errorMessage) {
                errorMessage.innerHTML = `
                    <h3 class="text-center">Error</h3>
                    <p class="text-center">${data.message}</p>
                `;
                errorMessage.classList.remove('d-none');
            }
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
    if (!canvas) return;
    
    const container = canvas.parentElement;
    if (!container) return;
    
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
}

// Función de interpolación para movimiento suave
function lerp(start, end, factor) {
    return start + (end - start) * factor;
}

// Bucle de renderizado con interpolación
function gameLoop(timestamp) {
    // Guardar el ID para poder cancelarlo después
    animationFrameId = requestAnimationFrame(gameLoop);
    
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

    // Verificar que el canvas exista antes de dibujar
    if (!canvas || !ctx) {
        console.error("[ERROR] Canvas o contexto no encontrado en gameLoop");
        return;
    }

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
    
    // ctx.fillText(`${myScore} - ${opponentScore}`, canvas.width / 2, 30);
}

// Exportar las funciones para uso global
window.initOnlineGame = initOnlineGame;
window.cleanupOnlineGame = cleanupOnlineGame;

// Configurar event listeners al cargar el documento
document.addEventListener('DOMContentLoaded', function() {
    console.log("[DEBUG] DOM completamente cargado (carga inicial).");
    setupPongButtons();
});

// Escuchar el evento personalizado desde el partial
document.addEventListener('pongPartialLoaded', function() {
    console.log("[DEBUG] Evento pongPartialLoaded detectado, configurando botones...");
    setupPongButtons();
});

// Función para configurar botones de Pong
function setupPongButtons() {
    const playOnlineBtn = document.getElementById('play-online-btn');
    if (playOnlineBtn) {
        // Eliminar listeners previos para evitar duplicados
        const newButton = playOnlineBtn.cloneNode(true);
        playOnlineBtn.parentNode.replaceChild(newButton, playOnlineBtn);
        
        newButton.addEventListener('click', async function() {
            console.log("[DEBUG] Botón 'Jugar Online' pulsado.");
            
            // Limpiar cualquier estado previo completamente
            await cleanupOnlineGame();
            
            // Si existe una función de limpieza para el juego local, llamarla
            if (typeof cleanupLocalGame === 'function') {
                await cleanupLocalGame();
            }
            
            const gameContainer = document.getElementById('game-container');
            if (gameContainer) {
                gameContainer.classList.remove('d-none');
            }
            
            // Asegurarse de que el mensaje se muestra inmediatamente
            const gameMessage = document.getElementById('game-message');
            if (gameMessage) {
                gameMessage.innerHTML = `
                    <h3 class="text-center">Esperando a otro jugador...</h3>
                    <div class="spinner-border text-light" role="status">
                        <span class="visually-hidden">Cargando...</span>
                    </div>
                `;
                gameMessage.classList.remove('d-none');
            }
            
            // Pequeña pausa para permitir que la interfaz se actualice
            setTimeout(function() {
                initOnlineGame();
            }, 50);
        });
    }
    
    const playLocalBtn = document.getElementById('play-local-btn');
    if (playLocalBtn) {
        // Eliminar listeners previos para evitar duplicados
        const newButton = playLocalBtn.cloneNode(true);
        playLocalBtn.parentNode.replaceChild(newButton, playLocalBtn);
        
        newButton.addEventListener('click', async function() {
            console.log("[DEBUG] Botón 'Jugar Local' pulsado.");
            
            // Limpiar cualquier estado de juego online previo
            await cleanupOnlineGame();
            
            const gameContainer = document.getElementById('game-container');
            if (gameContainer) {
                gameContainer.classList.remove('d-none');
            }
            
            // Asegurarse de que el mensaje se muestra inmediatamente
            const gameMessage = document.getElementById('game-message');
            if (gameMessage) {
                gameMessage.innerHTML = `
                    <h3 class="text-center">¿Listo?</h3>
                    <p class="text-center mb-0">Presiona ESPACIO para comenzar</p>
                `;
                gameMessage.classList.remove('d-none');
            }
            
            // Pequeña pausa para permitir que la interfaz se actualice
            setTimeout(function() {
                if (typeof initPongGame === 'function') {
                    initPongGame();
                } else {
                    console.error("initPongGame function not found!");
                }
            }, 50);
        });
    }
}