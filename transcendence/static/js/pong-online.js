// static/js/pong-online.js
(() => {
    let canvas, ctx;
    let myPaddleY = 0.5;
    let opponentPaddleY = 0.5;
    let targetOpponentPaddleY = 0.5;
    let onlineBallX = 0.5;
    let onlineBallY = 0.5;
    let targetBallX = 0.5;
    let targetBallY = 0.5;
    let player1Score = 0;
    let player2Score = 0;

    let player1Data = null;
    let player2Data = null;
    let myPlayerNumber = null;

    let lastPaddleUpdate = 0;
    let lastFrameTime = 0;

    let socket;
    let roomId = null;
    let isWaitingForOpponent = true;
    let playerNumber = null;
    let gameInitialized = false;
    let keysPressed = {};

    let paddleMoveInterval = null;
    let animationFrameId = null;

    const PADDLE_INTERPOLATION_SPEED = 0.3;
    const BALL_INTERPOLATION_SPEED = 0.5;

    function cleanupOnlineGame() {
        console.log("[DEBUG] Limpiando estado del juego online...");
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        if (socket && socket.readyState !== WebSocket.CLOSED) {
            console.log("[DEBUG] Cerrando conexión WebSocket existente");
            socket.close();
            socket = null;
        }
        const gameMessage = document.getElementById('game-message');
        if (gameMessage) {
            gameMessage.innerHTML = `
                <h3 class="text-center">¿Listo?</h3>
                <p class="text-center mb-0">Presiona ESPACIO para comenzar</p>
            `;
        }
        if (paddleMoveInterval) {
            clearInterval(paddleMoveInterval);
            paddleMoveInterval = null;
            console.log("[DEBUG] Intervalo de movimiento de paleta eliminado");
        }
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
        const playerIndicator = document.querySelector('.player-indicator');
        if (playerIndicator) {
            playerIndicator.remove();
        }
        const score1Element = document.getElementById('player1-score');
        const score2Element = document.getElementById('player2-score');
        if (score1Element && score2Element) {
            score1Element.textContent = "0";
            score2Element.textContent = "0";
        }
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
        if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        window.onkeydown = null;
        window.onkeyup = null;
        console.log("[DEBUG] Limpieza del juego online completada");
        return Promise.resolve();
    }

    function initOnlineGame() {
        cleanupOnlineGame();
        if (typeof cleanupLocalGame === 'function') {
            cleanupLocalGame();
        }
        gameInitialized = true;
        console.log("[DEBUG] Inicializando juego online...");
        canvas = document.getElementById('pong-canvas');
        if (!canvas) {
            console.error("[ERROR] No se encontró el elemento canvas 'pong-canvas'");
            return;
        }
        ctx = canvas.getContext('2d');
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        keysPressed = {};
        window.addEventListener('keydown', function(event) {
            keysPressed[event.key] = true;
        });
        window.addEventListener('keyup', function(event) {
            keysPressed[event.key] = false;
        });
        if (paddleMoveInterval) {
            clearInterval(paddleMoveInterval);
            paddleMoveInterval = null;
        }
        paddleMoveInterval = setInterval(function() {
            if (isWaitingForOpponent) return;
            const paddleStep = 0.025;
            let hasMoved = false;
            if (keysPressed['w'] || keysPressed['W'] || keysPressed['ArrowUp']) {
                myPaddleY = Math.max(0, myPaddleY - paddleStep);
                hasMoved = true;
            }
            if (keysPressed['s'] || keysPressed['S'] || keysPressed['ArrowDown']) {
                myPaddleY = Math.min(1, myPaddleY + paddleStep);
                hasMoved = true;
            }
            if (hasMoved && playerNumber) {
                sendPaddleMovement(playerNumber === 1 ? 'player1' : 'player2', myPaddleY);
            }
        }, 20);
        showWaitingMessage();
        animationFrameId = requestAnimationFrame(gameLoop);
        connectWebSocket();
    }

    function showWaitingMessage() {
        console.log("[DEBUG] Mostrando mensaje de espera...");
        const gameMessage = document.getElementById('game-message');
        if (!gameMessage) {
            console.error("[ERROR] No se encontró el elemento 'game-message'");
            return;
        }
        gameMessage.innerHTML = `
            <h3 class="text-center">Esperando a otro jugador...</h3>
            <div class="d-flex justify-content-center align-items-center vh-10">
                <div class="spinner-border text-light" role="status"></div>
            </div>
        `;
        gameMessage.classList.remove('d-none');
    }

    function connectWebSocket() {
        console.log("[DEBUG] Conectando al WebSocket...");
        if (socket && socket.readyState !== WebSocket.CLOSED) {
            console.log("[DEBUG] Ya existe una conexión WebSocket activa, cerrándola primero");
            socket.close();
        }
        const wsUrl = `wss://${window.location.host}/ws/pong/`;
        console.log(`[DEBUG] Conectando a WebSocket: ${wsUrl}`);
        socket = new WebSocket(wsUrl);
        socket.onopen = function(event) {
            console.log("[DEBUG] Conexión WebSocket abierta.");
            setTimeout(function() {
                if (socket && socket.readyState === WebSocket.OPEN) {
                    console.log("[DEBUG] Enviando solicitud de emparejamiento...");
                    socket.send(JSON.stringify({
                        type: "join_queue",
                        room_id: roomId
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

    function updatePlayerInfo() {
        const player1Name = document.getElementById('player1-name');
        const player1Avatar = document.getElementById('player1-avatar');
        const player2Name = document.getElementById('player2-name');
        const player2Avatar = document.getElementById('player2-avatar');
        
        let leftPlayerData = myPlayerNumber === 1 ? player1Data : player2Data; // Yo a la izquierda
        let rightPlayerData = myPlayerNumber === 1 ? player2Data : player1Data; // Oponente a la derecha
        
        if (leftPlayerData && player1Name && player1Avatar) {
            player1Name.textContent = leftPlayerData.intra_login || 'Jugador ' + myPlayerNumber;
            player1Name.classList.add('text-primary');
            if (leftPlayerData.intra_picture) {
                player1Avatar.src = leftPlayerData.intra_picture;
                player1Avatar.style.display = "block";
            } else {
                player1Avatar.style.display = "none";
            }
        }
        if (rightPlayerData && player2Name && player2Avatar) {
            player2Name.textContent = rightPlayerData.intra_login || 'Jugador ' + (myPlayerNumber === 1 ? 2 : 1);
            player2Name.classList.remove('text-primary');
            if (rightPlayerData.intra_picture) {
                player2Avatar.src = rightPlayerData.intra_picture;
                player2Avatar.style.display = "block";
            } else {
                player2Avatar.style.display = "none";
            }
        }
    }

    function handleWebSocketMessage(data) {
        console.log("[DEBUG] Procesando mensaje del WebSocket:", data);

        switch (data.type) {
            case 'game_start':
                console.log("[DEBUG] La partida ha comenzado.");
                console.log("[DEBUG] Mensaje completo recibido:", JSON.stringify(data));
                isWaitingForOpponent = false;
                roomId = data.room_id;

                // Convertir todo a string para evitar problemas de tipo
                const userId = String(data.user_id);
                const player1Id = String(data.player1.id);
                const player2Id = String(data.player2.id);

                if (userId === player1Id) {
                    playerNumber = 1;
                    myPlayerNumber = 1;
                } else if (userId === player2Id) {
                    playerNumber = 2;
                    myPlayerNumber = 2;
                } else {
                    console.error("[ERROR] No se pudo determinar el número de jugador.");
                    console.error("[DEBUG] user_id:", userId, "player1.id:", player1Id, "player2.id:", player2Id);
                    return;
                }

                player1Data = data.player1;
                player2Data = data.player2;

                updatePlayerInfo();
                console.log(`[DEBUG] Asignado como jugador ${playerNumber}`);
                const gameMessage = document.getElementById('game-message');
                if (gameMessage) {
                    gameMessage.classList.add('d-none');  // Ocultar el mensaje
                }
                break;

            case 'waiting':
                console.log("[DEBUG] Esperando a otro jugador...");
                isWaitingForOpponent = true;
                const waitingMessage = document.getElementById('game-message');
                if (waitingMessage) {
                    waitingMessage.classList.remove('d-none');
                    waitingMessage.innerHTML = `
                        <h3 class="text-center">Esperando a otro jugador...</h3>
                        <div class="d-flex justify-content-center align-items-center vh-10">
                            <div class="spinner-border text-light" role="status"></div>
                        </div>
                    `;
                }
                break;

            case 'update_paddle':
                const isMyPaddle = (playerNumber === 1 && data.player === 'player1') || 
                                (playerNumber === 2 && data.player === 'player2');
                if (isMyPaddle) {
                    if (Math.abs(myPaddleY - data.paddle_position) > 0.1) {
                        console.log("[DEBUG] Corrigiendo desincronización de MI paleta:", 
                                    myPaddleY, "->", data.paddle_position);
                        myPaddleY = data.paddle_position;
                    } else {
                        console.log("[DEBUG] Ignorando eco de servidor para MI paleta");
                    }
                } else {
                    targetOpponentPaddleY = data.paddle_position;
                    console.log("[DEBUG] Actualizando paleta del OPONENTE a:", data.paddle_position);
                }
                break;

            case 'update_ball':
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
                const score1Element = document.getElementById('player1-score');
                const score2Element = document.getElementById('player2-score');
                if (score1Element && score2Element) {
                    if (myPlayerNumber === 1) {
                        score1Element.textContent = player1Score;
                        score2Element.textContent = player2Score;
                    } else {
                        score1Element.textContent = player2Score;
                        score2Element.textContent = player1Score;
                    }
                }
                if (targetBallX === 0.5 && targetBallY === 0.5) {
                    onlineBallX = 0.5;
                    onlineBallY = 0.5;
                }
                break;

            case 'game_over':
                console.log("[DEBUG] La partida ha terminado.", data);
                isWaitingForOpponent = true;
                
                let gameOverMessage;
                let winner = data.winner;
                const iWon = winner === myPlayerNumber;
                
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
                
                const endGameMessage = document.getElementById('game-message');
                if (endGameMessage) {
                    endGameMessage.innerHTML = `
                        <h3 class="text-center">¡Fin del juego!</h3>
                        <p class="text-center">${gameOverMessage}</p>
                        <p class="text-center">Puntuación final: ${player1Score} - ${player2Score}</p>
                    `;
                    endGameMessage.classList.remove('d-none');
                }
                
                if (socket && socket.readyState === WebSocket.OPEN) {
                    let myScore = myPlayerNumber === 1 ? player1Score : player2Score;
                    socket.send(JSON.stringify({
                        action: 'game_over',
                        player_id: myPlayerNumber === 1 ? data.player1_id : data.player2_id,
                        points_scored: myScore,
                        has_won: iWon
                    }));
                    console.log(`[DEBUG] Enviando estadísticas: jugador=${myPlayerNumber === 1 ? data.player1_id : data.player2_id}, puntos=${myScore}, victoria=${iWon}`);
                }
                const cleanUrl = window.location.pathname;
                window.history.pushState({}, '', cleanUrl);
                console.log("[DEBUG] URL limpiada a:", cleanUrl);
                break;

            case 'error':
                console.error("[DEBUG] Error del servidor:", data.message);
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

    function sendPaddleMovement(player, position) {
        if (socket && socket.readyState === WebSocket.OPEN && roomId) {
            const now = Date.now();
            if (now - lastPaddleUpdate >= 50) {
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

    function resizeCanvas() {
        if (!canvas) return;
        const container = canvas.parentElement;
        if (!container) return;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }

    function lerp(start, end, factor) {
        return start + (end - start) * factor;
    }

    function gameLoop(timestamp) {
        animationFrameId = requestAnimationFrame(gameLoop);
        if (!lastFrameTime) lastFrameTime = timestamp;
        const deltaTime = Math.min(50, timestamp - lastFrameTime) / 1000;
        lastFrameTime = timestamp;
        
        opponentPaddleY = lerp(opponentPaddleY, targetOpponentPaddleY, PADDLE_INTERPOLATION_SPEED * deltaTime * 60);
        onlineBallX = lerp(onlineBallX, targetBallX, BALL_INTERPOLATION_SPEED * deltaTime * 60);
        onlineBallY = lerp(onlineBallY, targetBallY, BALL_INTERPOLATION_SPEED * deltaTime * 60);

        if (!canvas || !ctx) {
            console.error("[ERROR] Canvas o contexto no encontrado en gameLoop");
            return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const paddleWidth = 15;
        const paddleHeight = 100;
        const ballRadius = 10;

        ctx.fillStyle = '#00FF00';
        ctx.fillRect(0, myPaddleY * canvas.height - paddleHeight/2, paddleWidth, paddleHeight);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(
            canvas.width - paddleWidth, 
            opponentPaddleY * canvas.height - paddleHeight/2, 
            paddleWidth, 
            paddleHeight
        );

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(onlineBallX * canvas.width, onlineBallY * canvas.height, ballRadius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        let myScore = myPlayerNumber === 1 ? player1Score : player2Score;
        let opponentScore = myPlayerNumber === 1 ? player2Score : player1Score;
    }

    window.initOnlineGame = initOnlineGame;
    window.cleanupOnlineGame = cleanupOnlineGame;

    document.addEventListener('DOMContentLoaded', function() {
        console.log("[DEBUG] DOM completamente cargado (carga inicial).");
        setupPongButtons();
    });

    document.addEventListener('pongPartialLoaded', function() {
        console.log("[DEBUG] Evento pongPartialLoaded detectado, configurando botones...");
        setupPongButtons();
    });

    function setupPongButtons() {
        const playOnlineBtn = document.getElementById('play-online-btn');
        if (playOnlineBtn) {
            const newButton = playOnlineBtn.cloneNode(true);
            playOnlineBtn.parentNode.replaceChild(newButton, playOnlineBtn);
            newButton.addEventListener('click', async function() {
                console.log("[DEBUG] Botón 'Jugar Online' pulsado.");
                await cleanupOnlineGame();
                if (typeof cleanupLocalGame === 'function') {
                    await cleanupLocalGame();
                }
                const gameContainer = document.getElementById('game-container');
                if (gameContainer) {
                    gameContainer.classList.remove('d-none');
                }
                const gameMessage = document.getElementById('game-message');
                if (gameMessage) {
                    gameMessage.innerHTML = `
                        <h3 class="text-center">Esperando a otro jugador...</h3>
                        <div class="d-flex justify-content-center align-items-center vh-10">
                            <div class="spinner-border text-light" role="status"></div>
                        </div>
                    `;
                    gameMessage.classList.remove('d-none');
                }
                setTimeout(function() {
                    initOnlineGame();
                }, 50);
            });
        }
        
        const playLocalBtn = document.getElementById('play-local-btn');
        if (playLocalBtn) {
            const newButton = playLocalBtn.cloneNode(true);
            playLocalBtn.parentNode.replaceChild(newButton, playLocalBtn);
            newButton.addEventListener('click', async function() {
                console.log("[DEBUG] Botón 'Jugar Local' pulsado.");
                await cleanupOnlineGame();
                const gameContainer = document.getElementById('game-container');
                if (gameContainer) {
                    gameContainer.classList.remove('d-none');
                }
                const gameMessage = document.getElementById('game-message');
                if (gameMessage) {
                    gameMessage.innerHTML = `
                        <h3 class="text-center">¿Listo?</h3>
                        <p class="text-center mb-0">Presiona ESPACIO para comenzar</p>
                    `;
                    gameMessage.classList.remove('d-none');
                }
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
})();
