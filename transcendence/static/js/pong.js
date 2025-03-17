// Variables globales para tracking del estado del juego
let animationFrameId = null;
let gameKeyDownHandler = null;
let gameKeyUpHandler = null;
let gameResizeHandler = null;
let isGameInitialized = false;

function initPongGame() {
    console.log("[DEBUG] Iniciando juego local...");
    
    // Asegurarse de limpiar cualquier estado previo
    cleanupLocalGame();
    cleanupOnlineGame();
    
    // Marcar que el juego está inicializándose
    isGameInitialized = true;
    
    // Constantes del juego
    const PADDLE_HEIGHT = 100;
    const PADDLE_WIDTH = 15;
    const PADDLE_SPEED = 8;
    const BALL_RADIUS = 10;
    const INITIAL_BALL_SPEED = 5;
    const MAX_SCORE = 3;

    // Estado del juego
    let canvas, ctx;
    let player1Score = 0;
    let player2Score = 0;
    let player1Y, player2Y;
    let ballX, ballY, ballSpeedX, ballSpeedY;
    let keysPressed = {};
    let gameRunning = false;
    let gameOver = false;
    let winner = null;

    // Definir los manejadores de eventos para poder eliminarlos después
    gameKeyDownHandler = function(event) {
        keysPressed[event.key] = true;
        
        // Prevenir el comportamiento predeterminado de las flechas arriba y abajo
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
        }
        
        if ((event.key === ' ' || event.key === 'Spacebar') && !gameOver) {
            event.preventDefault();
            if (!gameRunning) {
                gameRunning = true;
                document.getElementById('game-message').classList.add('d-none');
                gameLoop();
            } else {
                gameRunning = false;
                document.getElementById('game-message').classList.remove('d-none');
                document.getElementById('game-message').innerHTML = '<h3 class="text-center">Pausa</h3><p class="text-center mb-0">Presiona ESPACIO para continuar</p>';
            }
        }
    };
    
    gameKeyUpHandler = function(event) {
        keysPressed[event.key] = false;
    };
    
    gameResizeHandler = function() {
        if (canvas) {
            const container = canvas.parentElement;
            if (container) {
                canvas.width = container.clientWidth;
                canvas.height = container.clientHeight;
                
                // Redibujar el estado actual si el juego está pausado
                if (!gameRunning && isGameInitialized) {
                    draw();
                }
            }
        }
    };

    // Inicializar el juego
    function init() {
        canvas = document.getElementById('pong-canvas');
        if (!canvas) {
            console.error("[ERROR] No se encontró el elemento canvas");
            return;
        }
        
        ctx = canvas.getContext('2d');
        
        // Configurar el canvas
        gameResizeHandler();
        window.addEventListener('resize', gameResizeHandler);
        
        // Inicializar posiciones
        resetPositions();
        
        // Enfocar el canvas para capturar eventos de teclado
        canvas.tabIndex = 1000;
        canvas.focus();
        
        // Configurar eventos de teclado (guardando referencias para limpieza posterior)
        window.addEventListener('keydown', gameKeyDownHandler);
        window.addEventListener('keyup', gameKeyUpHandler);
        
        // Renderizar el estado inicial
        draw();
    }

    // Reiniciar posiciones
    function resetPositions() {
        if (!canvas) return;
        
        player1Y = canvas.height / 2 - PADDLE_HEIGHT / 2;
        player2Y = canvas.height / 2 - PADDLE_HEIGHT / 2;
        ballX = canvas.width / 2;
        ballY = canvas.height / 2;
        const angle = (Math.random() * Math.PI / 4) + Math.PI / 8;
        const direction = Math.random() < 0.5 ? 1 : -1;
        ballSpeedX = direction * INITIAL_BALL_SPEED * Math.cos(angle);
        ballSpeedY = INITIAL_BALL_SPEED * Math.sin(angle) * (Math.random() < 0.5 ? 1 : -1);
    }

    // Bucle principal del juego
    function gameLoop() {
        // Si el juego no está en ejecución o ya no está inicializado, salir
        if (!gameRunning || !isGameInitialized) return;
        
        update();
        draw();
        
        if (!gameOver && isGameInitialized) {
            animationFrameId = requestAnimationFrame(gameLoop);
        }
    }

    // Actualizar el estado del juego
    function update() {
        // Mover paleta del jugador 1 (W/S)
        if (keysPressed['w'] || keysPressed['W']) {
            player1Y = Math.max(0, player1Y - PADDLE_SPEED);
        }
        if (keysPressed['s'] || keysPressed['S']) {
            player1Y = Math.min(canvas.height - PADDLE_HEIGHT, player1Y + PADDLE_SPEED);
        }
        
        // Mover paleta del jugador 2 (flechas)
        if (keysPressed['ArrowUp']) {
            player2Y = Math.max(0, player2Y - PADDLE_SPEED);
        }
        if (keysPressed['ArrowDown']) {
            player2Y = Math.min(canvas.height - PADDLE_HEIGHT, player2Y + PADDLE_SPEED);
        }
        
        // Mover la pelota
        ballX += ballSpeedX;
        ballY += ballSpeedY;
        
        // Rebotar en las paredes superior e inferior
        if (ballY < BALL_RADIUS || ballY > canvas.height - BALL_RADIUS) {
            ballSpeedY = -ballSpeedY;
            if (ballY < BALL_RADIUS) ballY = BALL_RADIUS;
            if (ballY > canvas.height - BALL_RADIUS) ballY = canvas.height - BALL_RADIUS;
        }
        
        // Rebotar en las paletas
        if (ballX - BALL_RADIUS < PADDLE_WIDTH && ballY > player1Y && ballY < player1Y + PADDLE_HEIGHT) {
            ballX = PADDLE_WIDTH + BALL_RADIUS;
            ballSpeedX = -ballSpeedX * 1.05;
            const hitPosition = (ballY - player1Y) / PADDLE_HEIGHT;
            ballSpeedY = (hitPosition - 0.5) * 10;
        }
        if (ballX + BALL_RADIUS > canvas.width - PADDLE_WIDTH && ballY > player2Y && ballY < player2Y + PADDLE_HEIGHT) {
            ballX = canvas.width - PADDLE_WIDTH - BALL_RADIUS;
            ballSpeedX = -ballSpeedX * 1.05;
            const hitPosition = (ballY - player2Y) / PADDLE_HEIGHT;
            ballSpeedY = (hitPosition - 0.5) * 10;
        }
        
        // Verificar si la pelota sale del campo
        if (ballX < 0) {
            player2Score++;
            updateScoreDisplay();
            checkWinner();
            resetPositions();
            gameRunning = false;
            document.getElementById('game-message').classList.remove('d-none');
            if (!gameOver) {
                document.getElementById('game-message').innerHTML = `<h3 class="text-center">¡Punto para Jugador 2!</h3><p class="text-center mb-0">Presiona ESPACIO para continuar</p>`;
            }
        } else if (ballX > canvas.width) {
            player1Score++;
            updateScoreDisplay();
            checkWinner();
            resetPositions();
            gameRunning = false;
            document.getElementById('game-message').classList.remove('d-none');
            if (!gameOver) {
                document.getElementById('game-message').innerHTML = `<h3 class="text-center">¡Punto para Jugador 1!</h3><p class="text-center mb-0">Presiona ESPACIO para continuar</p>`;
            }
        }
    }

    // Dibujar el estado del juego
    function draw() {
        if (!ctx || !canvas) return;
        
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = '#FFFFFF';
        ctx.setLineDash([10, 15]);
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, 0);
        ctx.lineTo(canvas.width / 2, canvas.height);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, player1Y, PADDLE_WIDTH, PADDLE_HEIGHT);
        ctx.fillRect(canvas.width - PADDLE_WIDTH, player2Y, PADDLE_WIDTH, PADDLE_HEIGHT);
        
        ctx.beginPath();
        ctx.arc(ballX, ballY, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    }

    // Actualizar la puntuación en la interfaz
    function updateScoreDisplay() {
        const score1Element = document.getElementById('player1-score');
        const score2Element = document.getElementById('player2-score');
        
        if (score1Element && score2Element) {
            score1Element.textContent = player1Score;
            score2Element.textContent = player2Score;
        }
    }

    // Verificar si hay un ganador
    function checkWinner() {
        if (player1Score >= MAX_SCORE) {
            gameOver = true;
            winner = 1;
            showGameOver();
        } else if (player2Score >= MAX_SCORE) {
            gameOver = true;
            winner = 2;
            showGameOver();
        }
    }

    // Mostrar el mensaje de fin de partida
    function showGameOver() {
        const gameMessage = document.getElementById('game-message');
        if (gameMessage) {
            gameMessage.classList.remove('d-none');
            gameMessage.innerHTML = `
                <h3 class="text-center">¡Fin del Juego!</h3>
                <p class="text-center">Jugador ${winner} Gana ${player1Score}-${player2Score}</p>
                <button id="restart-btn" class="btn btn-primary d-block mx-auto mt-2">Jugar de Nuevo</button>
            `;
            
            const restartBtn = document.getElementById('restart-btn');
            if (restartBtn) {
                restartBtn.addEventListener('click', function() {
                    restartGame();
                });
            }
        }
    }

    // Reiniciar el juego
    function restartGame() {
        player1Score = 0;
        player2Score = 0;
        updateScoreDisplay();
        resetPositions();
        gameOver = false;
        gameRunning = false;
        winner = null;
        
        const gameMessage = document.getElementById('game-message');
        if (gameMessage) {
            gameMessage.innerHTML = '<h3 class="text-center">¿Listo?</h3><p class="text-center mb-0">Presiona ESPACIO para comenzar</p>';
        }
    }

    // Iniciar el juego
    init();
}

// Función para limpiar el estado del juego local
function cleanupLocalGame() {
    console.log("[DEBUG] Limpiando estado del juego local...");
    
    // Marcar el juego como no inicializado para detener cualquier loop activo
    isGameInitialized = false;
    
    // Cancelar el bucle de animación si está activo
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        console.log("[DEBUG] Animación cancelada");
    }
    
    // Eliminar los event listeners específicos del juego
    if (gameKeyDownHandler) {
        window.removeEventListener('keydown', gameKeyDownHandler);
        gameKeyDownHandler = null;
        console.log("[DEBUG] Event listener keydown eliminado");
    }
    
    if (gameKeyUpHandler) {
        window.removeEventListener('keyup', gameKeyUpHandler);
        gameKeyUpHandler = null;
        console.log("[DEBUG] Event listener keyup eliminado");
    }
    
    if (gameResizeHandler) {
        window.removeEventListener('resize', gameResizeHandler);
        gameResizeHandler = null;
        console.log("[DEBUG] Event listener resize eliminado");
    }
    
    // Resetear las puntuaciones en la interfaz
    const score1Element = document.getElementById('player1-score');
    const score2Element = document.getElementById('player2-score');
    if (score1Element && score2Element) {
        score1Element.textContent = "0";
        score2Element.textContent = "0";
    }
    
    // Limpiar el canvas si existe
    const canvas = document.getElementById('pong-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            console.log("[DEBUG] Canvas limpiado");
        }
    }
    
    console.log("[DEBUG] Limpieza del juego local completada");
    
    // Devolver una promesa resuelta para poder usar await
    return Promise.resolve();
}

// Exportar las funciones para que puedan ser llamadas desde fuera
window.initPongGame = initPongGame;
window.cleanupLocalGame = cleanupLocalGame;
