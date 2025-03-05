// Constants
const PADDLE_HEIGHT = 100;
const PADDLE_WIDTH = 15;
const PADDLE_SPEED = 8;
const BALL_RADIUS = 10;
const INITIAL_BALL_SPEED = 5;
const MAX_SCORE = 3;

// Game state
let canvas, ctx;
let player1Score = 0;
let player2Score = 0;
let player1Y, player2Y;
let ballX, ballY, ballSpeedX, ballSpeedY;
let keysPressed = {};
let gameRunning = false;
let gameOver = false;
let winner = null;

// Initialize the game
function initPongGame() {
    canvas = document.getElementById('pong-canvas');
    ctx = canvas.getContext('2d');
    
    // Set canvas dimensions
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Initialize paddles and ball positions
    resetPositions();
    
    // Focus on canvas to capture key events
    canvas.tabIndex = 1000;
    canvas.focus();
    
    // Add event listener to start button (alternative to spacebar)
    const startBtn = document.getElementById('start-game-btn');
    if (startBtn) {
        startBtn.addEventListener('click', function() {
            if (!gameRunning && !gameOver) {
                gameRunning = true;
                document.getElementById('game-message').classList.add('d-none');
                gameLoop();
            }
        });
    }
    
    // Debug message to console
    console.log("Pong game initialized");
    
    // Set up input - use window for better key capture
    window.addEventListener('keydown', function(e) {
        console.log("Key pressed:", e.key);
        keysPressed[e.key] = true;
        
        // Prevent scrolling with arrow keys, W, and S while game is active
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || 
            e.key === 'w' || e.key === 'W' || 
            e.key === 's' || e.key === 'S') {
            e.preventDefault();
        }
        
        // Start/pause the game with spacebar
        if ((e.key === ' ' || e.key === 'Spacebar') && !gameOver) {
            e.preventDefault(); // Prevent page scrolling
            console.log("Space pressed, game running:", gameRunning);
            
            if (!gameRunning) {
                gameRunning = true;
                document.getElementById('game-message').classList.add('d-none');
                console.log("Starting game loop");
                gameLoop();
            } else {
                gameRunning = false;
                document.getElementById('game-message').classList.remove('d-none');
                document.getElementById('game-message').innerHTML = '<h3 class="text-center">Pausa</h3><p class="text-center mb-0">Presiona ESPACIO para continuar</p>';
            }
        }
    });
    
    window.addEventListener('keyup', function(e) {
        keysPressed[e.key] = false;
    });
    
    // Render initial state
    draw();
}

function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
}

function resetPositions() {
    // Position paddles
    player1Y = canvas.height / 2 - PADDLE_HEIGHT / 2;
    player2Y = canvas.height / 2 - PADDLE_HEIGHT / 2;
    
    // Position ball in center
    ballX = canvas.width / 2;
    ballY = canvas.height / 2;
    
    // Random ball direction
    const angle = (Math.random() * Math.PI / 4) + Math.PI / 8; // angle between PI/8 and 3PI/8
    const direction = Math.random() < 0.5 ? 1 : -1;
    ballSpeedX = direction * INITIAL_BALL_SPEED * Math.cos(angle);
    ballSpeedY = INITIAL_BALL_SPEED * Math.sin(angle) * (Math.random() < 0.5 ? 1 : -1);
}

// Main game loop
function gameLoop() {
    if (!gameRunning) return;
    
    update();
    draw();
    
    if (!gameOver) {
        requestAnimationFrame(gameLoop);
    }
}

// Update game state
function update() {
    // Move player 1 (W/S keys)
    if (keysPressed['w'] || keysPressed['W']) {
        player1Y = Math.max(0, player1Y - PADDLE_SPEED);
    }
    if (keysPressed['s'] || keysPressed['S']) {
        player1Y = Math.min(canvas.height - PADDLE_HEIGHT, player1Y + PADDLE_SPEED);
    }
    
    // Move player 2 (arrow keys)
    if (keysPressed['ArrowUp']) {
        player2Y = Math.max(0, player2Y - PADDLE_SPEED);
    }
    if (keysPressed['ArrowDown']) {
        player2Y = Math.min(canvas.height - PADDLE_HEIGHT, player2Y + PADDLE_SPEED);
    }
    
    // Move ball
    ballX += ballSpeedX;
    ballY += ballSpeedY;
    
    // Ball collision with top and bottom walls
    if (ballY < BALL_RADIUS || ballY > canvas.height - BALL_RADIUS) {
        ballSpeedY = -ballSpeedY;
        // Ensure ball stays in bounds
        if (ballY < BALL_RADIUS) ballY = BALL_RADIUS;
        if (ballY > canvas.height - BALL_RADIUS) ballY = canvas.height - BALL_RADIUS;
    }
    
    // Ball collision with paddles
    // Left paddle (player 1)
    if (ballX - BALL_RADIUS < PADDLE_WIDTH && 
        ballY > player1Y && 
        ballY < player1Y + PADDLE_HEIGHT) {
        
        ballX = PADDLE_WIDTH + BALL_RADIUS; // Prevent ball from getting stuck
        ballSpeedX = -ballSpeedX * 1.05; // Slightly increase speed on bounce
        
        // Adjust angle based on where the ball hits the paddle
        const hitPosition = (ballY - player1Y) / PADDLE_HEIGHT;
        ballSpeedY = (hitPosition - 0.5) * 10; // -5 to +5 depending on hit position
    }
    
    // Right paddle (player 2)
    if (ballX + BALL_RADIUS > canvas.width - PADDLE_WIDTH && 
        ballY > player2Y && 
        ballY < player2Y + PADDLE_HEIGHT) {
        
        ballX = canvas.width - PADDLE_WIDTH - BALL_RADIUS; // Prevent ball from getting stuck
        ballSpeedX = -ballSpeedX * 1.05; // Slightly increase speed
        
        // Adjust angle based on where the ball hits the paddle
        const hitPosition = (ballY - player2Y) / PADDLE_HEIGHT;
        ballSpeedY = (hitPosition - 0.5) * 10; // -5 to +5 depending on hit position
    }
    
    // Ball out of bounds (scoring)
    if (ballX < 0) {
        // Player 2 scores
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
        // Player 1 scores
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

// Draw game elements
function draw() {
    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw center line
    ctx.strokeStyle = '#FFFFFF';
    ctx.setLineDash([10, 15]);
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw paddles
    ctx.fillStyle = '#FFFFFF';
    // Left paddle (Player 1)
    ctx.fillRect(0, player1Y, PADDLE_WIDTH, PADDLE_HEIGHT);
    // Right paddle (Player 2)
    ctx.fillRect(canvas.width - PADDLE_WIDTH, player2Y, PADDLE_WIDTH, PADDLE_HEIGHT);
    
    // Draw ball
    ctx.beginPath();
    ctx.arc(ballX, ballY, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
}

function updateScoreDisplay() {
    document.getElementById('player1-score').textContent = player1Score;
    document.getElementById('player2-score').textContent = player2Score;
}

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

function showGameOver() {
    document.getElementById('game-message').classList.remove('d-none');
    document.getElementById('game-message').innerHTML = `
        <h3 class="text-center">¡Fin del Juego!</h3>
        <p class="text-center">Jugador ${winner} Gana ${player1Score}-${player2Score}</p>
        <button id="restart-btn" class="btn btn-primary d-block mx-auto mt-2">Jugar de Nuevo</button>
    `;
    
    // Add event listener to restart button
    setTimeout(() => {
        const restartBtn = document.getElementById('restart-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', function() {
                console.log("Restart button clicked");
                restartGame();
            });
        } else {
            console.error("Restart button not found");
        }
    }, 100);
}

function restartGame() {
    player1Score = 0;
    player2Score = 0;
    updateScoreDisplay();
    resetPositions();
    gameOver = false;
    gameRunning = false;
    winner = null;
    
    document.getElementById('game-message').innerHTML = '<h3 class="text-center">¿Listo?</h3><p class="text-center mb-0">Presiona ESPACIO para comenzar</p>';
}

// Monitor when canvas loses focus and handle key events properly
window.addEventListener('blur', function() {
    keysPressed = {};
    if (gameRunning && !gameOver) {
        gameRunning = false;
        document.getElementById('game-message').classList.remove('d-none');
        document.getElementById('game-message').innerHTML = '<h3 class="text-center">Pausa</h3><p class="text-center mb-0">Presiona ESPACIO para continuar</p>';
    }
});
