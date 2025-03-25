(() => {
    let canvas, ctx;
    let myPaddleY = 0.5;
    let opponentPaddleY = 0.5;
    let targetOpponentPaddleY = 0.5;
    let ballX = 0.5;
    let ballY = 0.5;
    let targetBallX = 0.5;
    let targetBallY = 0.5;
    let myScore = 0;
    let opponentScore = 0;

    let myPlayerNumber = null;
    let myId = null;
    let opponentId = null;

    let socket = null;
    let matchId = null;
    let gameInitialized = false;
    let keysPressed = {};
    let lastPaddleUpdate = 0;
    let lastFrameTime = 0;

    let paddleMoveInterval = null;
    let animationFrameId = null;

    const PADDLE_INTERPOLATION_SPEED = 0.3;
    const BALL_INTERPOLATION_SPEED = 0.5;
    const PADDLE_WIDTH = 15;
    const PADDLE_HEIGHT = 100;
    const BALL_RADIUS = 10;

    function cleanupTournamentGame() {
        console.log("[DEBUG] Limpiando estado del juego de torneo...");
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        if (socket && socket.readyState !== WebSocket.CLOSED) {
            socket.close();
            socket = null;
            console.log("[DEBUG] WebSocket de torneo cerrado");
        }
        if (paddleMoveInterval) {
            clearInterval(paddleMoveInterval);
            paddleMoveInterval = null;
        }
        myPaddleY = 0.5;
        opponentPaddleY = 0.5;
        targetOpponentPaddleY = 0.5;
        ballX = 0.5;
        ballY = 0.5;
        targetBallX = 0.5;
        targetBallY = 0.5;
        myScore = 0;
        opponentScore = 0;
        myPlayerNumber = null;
        myId = null;
        opponentId = null;
        matchId = null;
        gameInitialized = false;
        keysPressed = {};
        lastPaddleUpdate = 0;
        lastFrameTime = 0;
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) gameContainer.classList.add('d-none');
        const gameMessage = document.getElementById('game-message');
        if (gameMessage) gameMessage.classList.add('d-none');
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
        if (player1Name) player1Name.textContent = "";
        if (player1Avatar) player1Avatar.style.display = "none";
        if (player2Name) player2Name.textContent = "";
        if (player2Avatar) player2Avatar.style.display = "none";
        if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        window.removeEventListener('keydown', window.keydownHandler);
        window.removeEventListener('keyup', window.keyupHandler);
    }

    function startTournamentMatch(matchIdParam, opponentIdParam, userIdParam) {
        console.log("[DEBUG] Iniciando partida de torneo - Match ID:", matchIdParam, "Oponente ID:", opponentIdParam, "User ID:", userIdParam);
        cleanupTournamentGame();
        matchId = matchIdParam;
        opponentId = opponentIdParam;
        myId = userIdParam;
        gameInitialized = true;

        canvas = document.getElementById('pong-canvas');
        if (!canvas) {
            console.error("[ERROR] No se encontró el elemento canvas 'pong-canvas'");
            return;
        }
        ctx = canvas.getContext('2d');
        // Establecer dimensiones iniciales
        canvas.width = 800;
        canvas.height = 600;
        window.addEventListener('resize', resizeCanvas);

        keysPressed = {};
        window.keydownHandler = (event) => {
            keysPressed[event.key] = true;
        };
        window.keyupHandler = (event) => {
            keysPressed[event.key] = false;
        };
        window.addEventListener('keydown', window.keydownHandler);
        window.addEventListener('keyup', window.keyupHandler);

        paddleMoveInterval = setInterval(() => {
            if (!gameInitialized) return;
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
            if (hasMoved && myPlayerNumber) {
                sendPaddleMovement();
            }
        }, 20);

        const gameContainer = document.getElementById('game-container');
        if (gameContainer) gameContainer.classList.remove('d-none');

        const player1Name = document.getElementById('player1-name');
        const player2Name = document.getElementById('player2-name');
        const player1Avatar = document.getElementById('player1-avatar');
        const player2Avatar = document.getElementById('player2-avatar');
        if (player1Name && player2Name && player1Avatar && player2Avatar) {
            player1Name.textContent = `Jugador ${userIdParam}`;
            player2Name.textContent = `Jugador ${opponentIdParam}`;
            player1Avatar.src = '/static/default-avatar.png';
            player2Avatar.src = '/static/default-avatar.png';
            player1Avatar.style.display = 'inline';
            player2Avatar.style.display = 'inline';
        }

        showWaitingMessage();
        connectWebSocket();
    }

    function showWaitingMessage() {
        const gameMessage = document.getElementById('game-message');
        if (gameMessage) {
            gameMessage.innerHTML = `
                <h3 class="text-center">Esperando al oponente...</h3>
                <div class="d-flex justify-content-center align-items-center vh-10">
                    <div class="spinner-border text-light" role="status"></div>
                </div>
            `;
            gameMessage.classList.remove('d-none');
        }
    }

    function connectWebSocket() {
        const wsUrl = `ws://${window.location.host}/ws/tournament-match/${matchId}/`;
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log("[DEBUG] Conexión WebSocket de torneo abierta:", wsUrl);
            socket.send(JSON.stringify({
                'action': 'join'
            }));
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log("[DEBUG] Mensaje WebSocket recibido:", data);
            handleWebSocketMessage(data);
        };

        socket.onclose = (event) => {
            console.log("[DEBUG] Conexión WebSocket de torneo cerrada:", event.code);
            const gameMessage = document.getElementById('game-message');
            if (gameMessage && !event.wasClean) {
                gameMessage.innerHTML = `
                    <h3 class="text-center">Se perdió la conexión</h3>
                    <p class="text-center">Inténtalo de nuevo más tarde</p>
                `;
                gameMessage.classList.remove('d-none');
            }
            gameInitialized = false;
        };

        socket.onerror = (error) => {
            console.error("[DEBUG] Error en WebSocket de torneo:", error);
        };
    }

    function handleWebSocketMessage(data) {
        if (data.type === 'game_update') {
            const state = data.state;
            const message = data.message;

            if (!myPlayerNumber && myId && state.players[myId]) {
                myPlayerNumber = state.players[myId];
                console.log("[DEBUG] Asignado como jugador:", myPlayerNumber);
            }

            // Iniciar el juego cuando ambos jugadores están listos
            if (state.ready === 2 && !animationFrameId) {
                console.log("[DEBUG] Ambos jugadores listos, iniciando juego");
                const gameMessage = document.getElementById('game-message');
                if (gameMessage) {
                    gameMessage.classList.add('d-none');
                }
                animationFrameId = requestAnimationFrame(gameLoop);
            }

            // Actualizar posiciones y puntajes según el número de jugador
            if (myPlayerNumber === 1) {
                myPaddleY = state.paddle1.y; // Ya normalizado entre 0 y 1
                targetOpponentPaddleY = state.paddle2.y;
                myScore = state.paddle1.score;
                opponentScore = state.paddle2.score;
            } else if (myPlayerNumber === 2) {
                myPaddleY = state.paddle2.y;
                targetOpponentPaddleY = state.paddle1.y;
                myScore = state.paddle2.score;
                opponentScore = state.paddle1.score;
            }
            targetBallX = state.ball.x;
            targetBallY = state.ball.y;

            const score1Element = document.getElementById('player1-score');
            const score2Element = document.getElementById('player2-score');
            if (score1Element && score2Element) {
                score1Element.textContent = myScore;
                score2Element.textContent = opponentScore;
            }

            // Mostrar resultado final cuando el juego termina
            if (state.game_over) {
                console.log("[DEBUG] Juego terminado, mostrando resultado");
                const gameMessage = document.getElementById('game-message');
                if (gameMessage) {
                    const winnerMessage = myScore >= 5 ? '¡Has ganado!' : 'El oponente ha ganado';
                    gameMessage.innerHTML = `
                        <h3 class="text-center">¡Fin de la partida!</h3>
                        <p class="text-center">${winnerMessage}</p>
                        <p class="text-center">Puntuación: ${myScore} - ${opponentScore}</p>
                    `;
                    gameMessage.classList.remove('d-none');
                }
                gameInitialized = false;
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }
            }
        }
    }

    function sendPaddleMovement() {
        if (socket && socket.readyState === WebSocket.OPEN) {
            const now = Date.now();
            if (now - lastPaddleUpdate >= 50) {
                lastPaddleUpdate = now;
                let direction;
                if (keysPressed['w'] || keysPressed['W'] || keysPressed['ArrowUp']) {
                    direction = 'up';
                } else if (keysPressed['s'] || keysPressed['S'] || keysPressed['ArrowDown']) {
                    direction = 'down';
                }
                if (direction) {
                    socket.send(JSON.stringify({
                        'action': 'move',
                        'direction': direction
                    }));
                }
            }
        }
    }

    function resizeCanvas() {
        if (!canvas) return;
        const container = canvas.parentElement;
        if (!container) return;
        canvas.width = container.clientWidth;
        // No establecer canvas.height, dejarlo al CSS (400px)
    }

    function lerp(start, end, factor) {
        return start + (end - start) * factor;
    }

    function gameLoop(timestamp) {
        if (!gameInitialized) return;
        if (!lastFrameTime) lastFrameTime = timestamp;
        const deltaTime = Math.min(50, timestamp - lastFrameTime) / 1000;
        lastFrameTime = timestamp;

        opponentPaddleY = lerp(opponentPaddleY, targetOpponentPaddleY, PADDLE_INTERPOLATION_SPEED * deltaTime * 60);
        ballX = lerp(ballX, targetBallX, BALL_INTERPOLATION_SPEED * deltaTime * 60);
        ballY = lerp(ballY, targetBallY, BALL_INTERPOLATION_SPEED * deltaTime * 60);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const paddleWidth = 15;
        const paddleHeight = 100;
        const ballRadius = 10;

        // Dibujar mi paleta (izquierda)
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(0, myPaddleY * canvas.height - paddleHeight / 2, paddleWidth, paddleHeight);

        // Dibujar paleta del oponente (derecha)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(
            canvas.width - paddleWidth,
            opponentPaddleY * canvas.height - paddleHeight / 2,
            paddleWidth,
            paddleHeight
        );

        // Dibujar pelota
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(ballX * canvas.width, ballY * canvas.height, ballRadius, 0, Math.PI * 2);
        ctx.fill();

        animationFrameId = requestAnimationFrame(gameLoop);
    }

    window.startTournamentMatch = startTournamentMatch;
    window.cleanupTournamentGame = cleanupTournamentGame;
})();
