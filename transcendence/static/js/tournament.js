(() => {
    let socket = null;
    let tournamentToken = null;
    let participants = [];
    let creatorId = null;
    let showStartButton = false;
    let tournamentFinished = false;

    function initTournament(forceReinit = false) {
        if (!forceReinit && window.tournamentInitialized) {
            console.log("[DEBUG] Torneo ya inicializado, saltando inicialización...");
            return;
        }

        console.log("[DEBUG] Inicializando torneo...");
        cleanupTournament();
        connectWebSocket();
        setupTournamentButtons();
        window.tournamentInitialized = true;
        tournamentFinished = false; // Resetear al iniciar

        document.addEventListener('htmx:beforeRequest', handleNavigation);
    }

    function cleanupTournament() {
        if (socket && socket.readyState !== WebSocket.CLOSED) {
            socket.close();
            socket = null;
            console.log("[DEBUG] WebSocket cerrado al salir del torneo");
        }
        tournamentToken = null;
        participants = [];
        creatorId = null;
        showStartButton = false;
        tournamentFinished = false; // Resetear al limpiar
        updateTournamentUI();
        window.cleanupTournamentGame(); // Limpiar el juego también
        window.tournamentInitialized = false;
    }

    function handleNavigation(event) {
        const target = event.detail.target;
        if (!target.closest('#tournament-container') && window.tournamentInitialized) {
            console.log("[DEBUG] Navegando fuera del torneo, limpiando...");
            cleanupTournament();
            document.removeEventListener('htmx:beforeRequest', handleNavigation);
        }
    }

    function connectWebSocket() {
        const wsUrl = `ws://${window.location.host}/ws/tournament/`;
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log("[DEBUG] Conexión WebSocket para torneo abierta.");
            setTimeout(() => {
                console.log("[DEBUG] WebSocket listo para enviar mensajes.");
            }, 100);
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log("[DEBUG] Mensaje WebSocket recibido:", data);
            handleWebSocketMessage(data);
        };

        socket.onclose = (event) => {
            console.log("[DEBUG] Conexión WebSocket para torneo cerrada:", event.code);
        };

        socket.onerror = (error) => {
            console.error("[DEBUG] Error en WebSocket de torneo:", error);
        };
    }

    function handleWebSocketMessage(data) {
        switch (data.type) {
            case 'tournament_info':
                if (!tournamentFinished) {
                    tournamentToken = data.token;
                    participants = data.participants;
                    creatorId = data.creator;
                    showStartButton = data.show_start_button || false;
                    console.log("[DEBUG] Actualización recibida - Token:", tournamentToken, "Creador:", creatorId, "Show Start Button:", showStartButton);
                    updateTournamentUI();
                } else {
                    console.log("[DEBUG] Ignorando tournament_info porque el torneo ya terminó");
                }
                break;
            case 'start_tournament':
                if (!tournamentFinished) {
                    console.log("[DEBUG] Iniciando partida del torneo - Match ID:", data.match_id, "Oponente ID:", data.opponent_id, "User ID:", data.user_id);
                    startTournamentMatch(data.match_id, data.opponent_id, data.user_id);
                } else {
                    console.log("[DEBUG] Ignorando start_tournament porque el torneo ya terminó");
                }
                break;
            case 'countdown_to_final':
                if (!tournamentFinished) {
                    console.log("[DEBUG] Contador para la final - Segundos restantes:", data.seconds, "Final Match ID:", data.final_match_id);
                    showCountdown(data.seconds, data.final_match_id);
                } else {
                    console.log("[DEBUG] Ignorando countdown_to_final porque el torneo ya terminó");
                }
                break;
            case 'tournament_results':
                console.log("[DEBUG] Resultados del torneo recibidos:", data.results);
                tournamentFinished = true;
                // Limpiar el estado del juego sin cerrar el WebSocket
                window.cleanupTournamentGame();
                // Forzar la limpieza del contenedor del juego
                const gameContainer = document.getElementById('game-container');
                if (gameContainer) {
                    gameContainer.classList.add('d-none');
                }
                // Mostrar resultados
                displayTournamentResults(data.results);
                break;
            case 'error':
                showError(data.message);
                break;
        }
    }

    function createTournament() {
        if (socket && socket.readyState === WebSocket.OPEN) {
            console.log("[DEBUG] Creando torneo...");
            // Resetear el estado del torneo terminado
            tournamentFinished = false; // A ver si con esto soluciono lo de crear torneo después de que termina uno
            setTimeout(() => {
                socket.send(JSON.stringify({
                    action: 'create_tournament'
                }));
            }, 200);
        } else {
            console.warn("[WARN] WebSocket no está abierto, intentando reconectar...");
            connectWebSocket();
            setTimeout(createTournament, 100);
        }
    }

    function joinTournament(token) {
        if (!token || token.length !== 8) {
            showError("Por favor, ingresa un token válido de 8 caracteres.");
            return;
        }

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                action: 'join_tournament',
                token: token
            }));
        } else {
            console.warn("[WARN] WebSocket no está abierto, intentando reconectar...");
            connectWebSocket();
            setTimeout(() => joinTournament(token), 100);
        }
    }

    function startTournament() {
        if (socket && socket.readyState === WebSocket.OPEN) {
            console.log("[DEBUG] Botón 'Comenzar Torneo' pulsado para el torneo:", tournamentToken);
            socket.send(JSON.stringify({
                action: 'start_tournament',
                token: tournamentToken
            }));
        } else {
            console.warn("[WARN] WebSocket no está abierto, intentando reconectar...");
            connectWebSocket();
            setTimeout(startTournament, 100);
        }
    }

    function startTournamentMatch(matchId, opponentId, userId) {
        if (tournamentFinished) {
            console.log("[DEBUG] Ignorando inicio de partida porque el torneo ya terminó");
            return;
        }
        if (typeof window.startTournamentMatch === 'function') {
            window.startTournamentMatch(matchId, opponentId, userId);
        } else {
            console.error("[ERROR] tournament-game.js no está cargado o startTournamentMatch no está definido.");
            showError("Error al iniciar la partida. Por favor, recarga la página.");
        }
    }

    function showCountdown(seconds, finalMatchId) {
        const tournamentContainer = document.getElementById('tournament-container');
        if (!tournamentContainer) {
            console.error("[ERROR] No se encontró #tournament-container en el DOM");
            return;
        }

        console.log("[DEBUG] Mostrando countdown:", seconds, "segundos para", finalMatchId);
        tournamentContainer.innerHTML = `
            <div class="text-center">
                <h3>¡Preparándose para la final!</h3>
                <p>La final comenzará en ${seconds} segundos...</p>
            </div>
        `;
    }

    function updateTournamentUI() {
        const tournamentContainer = document.getElementById('tournament-container');
        if (!tournamentContainer) {
            console.error("[ERROR] No se encontró #tournament-container en el DOM");
            return;
        }
    
        let html = '';
        if (tournamentToken) {
            html += `<p class="text-center">Token de invitación: <strong>${tournamentToken}</strong></p>`;
            html += '<p class="text-center text-muted">Ambos matches se juegan simultáneamente. Los ganadores avanzarán a la final.</p>';
            html += '<div class="row justify-content-center">';
    
            html += '<div class="col-md-6 mb-3"><h4>Match 1</h4><ul class="list-group">';
            const match1 = participants.slice(0, 2);
            if (match1.length === 0) {
                html += '<li class="list-group-item text-muted">Esperando jugador 1...</li>';
                html += '<li class="list-group-item text-center">VS</li>';
                html += '<li class="list-group-item text-muted">Esperando jugador 2...</li>';
            } else if (match1.length === 1) {
                html += `<li class="list-group-item d-flex align-items-center">
                    <img src="${match1[0].intra_picture || '/static/default-avatar.png'}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px; object-fit: cover;">
                    ${match1[0].intra_login} ${match1[0].id === creatorId ? '<span class="badge bg-primary ms-2">Creador</span>' : ''}
                </li>`;
                html += '<li class="list-group-item text-center">VS</li>';
                html += '<li class="list-group-item text-muted">Esperando jugador 2...</li>';
            } else {
                html += `<li class="list-group-item d-flex align-items-center">
                    <img src="${match1[0].intra_picture || '/static/default-avatar.png'}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px; object-fit: cover;">
                    ${match1[0].intra_login} ${match1[0].id === creatorId ? '<span class="badge bg-primary ms-2">Creador</span>' : ''}
                </li>`;
                html += '<li class="list-group-item text-center">VS</li>';
                html += `<li class="list-group-item d-flex align-items-center">
                    <img src="${match1[1].intra_picture || '/static/default-avatar.png'}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px; object-fit: cover;">
                    ${match1[1].intra_login} ${match1[1].id === creatorId ? '<span class="badge bg-primary ms-2">Creador</span>' : ''}
                </li>`;
            }
            html += '</ul></div>';
    
            html += '<div class="col-md-6 mb-3"><h4>Match 2</h4><ul class="list-group">';
            const match2 = participants.slice(2, 4);
            if (match2.length === 0) {
                html += '<li class="list-group-item text-muted">Esperando jugador 3...</li>';
                html += '<li class="list-group-item text-center">VS</li>';
                html += '<li class="list-group-item text-muted">Esperando jugador 4...</li>';
            } else if (match2.length === 1) {
                html += `<li class="list-group-item d-flex align-items-center">
                    <img src="${match2[0].intra_picture || '/static/default-avatar.png'}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px; object-fit: cover;">
                    ${match2[0].intra_login} ${match2[0].id === creatorId ? '<span class="badge bg-primary ms-2">Creador</span>' : ''}
                </li>`;
                html += '<li class="list-group-item text-center">VS</li>';
                html += '<li class="list-group-item text-muted">Esperando jugador 4...</li>';
            } else {
                html += `<li class="list-group-item d-flex align-items-center">
                    <img src="${match2[0].intra_picture || '/static/default-avatar.png'}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px; object-fit: cover;">
                    ${match2[0].intra_login} ${match2[0].id === creatorId ? '<span class="badge bg-primary ms-2">Creador</span>' : ''}
                </li>`;
                html += '<li class="list-group-item text-center">VS</li>';
                html += `<li class="list-group-item d-flex align-items-center">
                    <img src="${match2[1].intra_picture || '/static/default-avatar.png'}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px; object-fit: cover;">
                    ${match2[1].intra_login} ${match2[1].id === creatorId ? '<span class="badge bg-primary ms-2">Creador</span>' : ''}
                </li>`;
            }
            html += '</ul></div>';
    
            html += '</div>';
    
            if (showStartButton) {
                html += '<div class="text-center mt-3">';
                const isFull = participants.length === 4;
                html += `<button id="start-tournament-btn" class="btn btn-success" ${!isFull ? 'disabled' : ''}>Comenzar Torneo</button>`;
                html += '</div>';
            }
        } else {
            html = '<p class="text-center">Crea un torneo o únete a uno con un token.</p>';
        }
    
        tournamentContainer.innerHTML = html;
        setupStartButton();
    }

    function displayTournamentResults(results) {
        const tournamentContainer = document.getElementById('tournament-container');
        if (!tournamentContainer) {
            console.error("[ERROR] No se encontró #tournament-container en el DOM");
            return;
        }
    
        let html = '<h3 class="text-center">Resultados del Torneo</h3>';
        html += '<div class="row justify-content-center">';
    
        // Match 1
        html += '<div class="col-md-4 mb-3"><h4>Match 1</h4><ul class="list-group">';
        results.match1.players.forEach(player => {
            html += `<li class="list-group-item d-flex align-items-center">
                <img src="${player.intra_picture || '/static/default-avatar.png'}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px; object-fit: cover;">
                ${player.intra_login} ${player.id === results.match1.winner.id ? '<span class="badge bg-success ms-2">Ganador</span>' : ''}
            </li>`;
        });
        html += '</ul></div>';
    
        // Match 2
        html += '<div class="col-md-4 mb-3"><h4>Match 2</h4><ul class="list-group">';
        results.match2.players.forEach(player => {
            html += `<li class="list-group-item d-flex align-items-center">
                <img src="${player.intra_picture || '/static/default-avatar.png'}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px; object-fit: cover;">
                ${player.intra_login} ${player.id === results.match2.winner.id ? '<span class="badge bg-success ms-2">Ganador</span>' : ''}
            </li>`;
        });
        html += '</ul></div>';
    
        // Final
        html += '<div class="col-md-4 mb-3"><h4>Final</h4><ul class="list-group">';
        results.final.players.forEach(player => {
            html += `<li class="list-group-item d-flex align-items-center">
                <img src="${player.intra_picture || '/static/default-avatar.png'}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px; object-fit: cover;">
                ${player.intra_login} ${player.id === results.final.winner.id ? '<span class="badge bg-success ms-2">Ganador</span>' : ''}
            </li>`;
        });
        html += '</ul></div>';
    
        html += '</div>';
    
        tournamentContainer.innerHTML = html;
    }

    function showError(message) {
        const tournamentContainer = document.getElementById('tournament-container');
        if (tournamentContainer) {
            tournamentContainer.innerHTML = `<p class="text-danger text-center">${message}</p>`;
        }
    }

    function setupTournamentButtons() {
        const createBtn = document.getElementById('create-tournament-btn');
        if (createBtn) {
            const newCreateBtn = createBtn.cloneNode(true);
            createBtn.parentNode.replaceChild(newCreateBtn, createBtn);
            newCreateBtn.addEventListener('click', () => {
                console.log("[DEBUG] Creando torneo...");
                createTournament();
            });
        }

        const joinBtn = document.getElementById('join-tournament-btn');
        const tokenInput = document.getElementById('tournament-token-input');
        if (joinBtn && tokenInput) {
            const newJoinBtn = joinBtn.cloneNode(true);
            joinBtn.parentNode.replaceChild(newJoinBtn, joinBtn);
            newJoinBtn.addEventListener('click', () => {
                const token = tokenInput.value.trim();
                console.log("[DEBUG] Intentando unirse al torneo con token:", token);
                joinTournament(token);
            });
        }
    }

    function setupStartButton() {
        const startBtn = document.getElementById('start-tournament-btn');
        if (startBtn) {
            const newStartBtn = startBtn.cloneNode(true);
            startBtn.parentNode.replaceChild(newStartBtn, startBtn);
            newStartBtn.addEventListener('click', () => {
                startTournament();
            });
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        console.log("[DEBUG] DOM completamente cargado, intentando inicializar torneo...");
        initTournament();
    });

    window.initTournament = initTournament;
    window.cleanupTournament = cleanupTournament;
})();
