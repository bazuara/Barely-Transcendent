(() => {
    let socket = null;
    let tournamentToken = null;
    let participants = [];
    let creatorId = null; // Almacenar el ID del creador

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

        // Limpiar al navegar fuera de la página
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
        updateTournamentUI();
        window.tournamentInitialized = false;
    }

    function handleNavigation(event) {
        // Si la solicitud HTMX no apunta a algo dentro de #tournament-container, asumimos que salimos
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
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
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
                tournamentToken = data.token;
                participants = data.participants;
                creatorId = data.creator; // Guardar el ID del creador
                console.log("[DEBUG] Actualización recibida - Token:", tournamentToken, "Creador:", creatorId);
                updateTournamentUI();
                break;
            case 'error':
                showError(data.message);
                break;
        }
    }

    function createTournament() {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                action: 'create_tournament'
            }));
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

    function updateTournamentUI() {
        const tournamentContainer = document.getElementById('tournament-container');
        if (!tournamentContainer) return;

        let html = '';
        if (tournamentToken) {
            html += `<p class="text-center">Token de invitación: <strong>${tournamentToken}</strong></p>`;
            html += '<p class="text-center text-muted">Ambos matches se juegan simultáneamente. Los ganadores avanzarán a la final.</p>';
            html += '<div class="row justify-content-center">';

            // Match 1
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
                    (Ganados: ${match1[0].games_won || 0}, Puntos: ${match1[0].total_points || 0})
                </li>`;
                html += '<li class="list-group-item text-center">VS</li>';
                html += '<li class="list-group-item text-muted">Esperando jugador 2...</li>';
            } else {
                html += `<li class="list-group-item d-flex align-items-center">
                    <img src="${match1[0].intra_picture || '/static/default-avatar.png'}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px; object-fit: cover;">
                    ${match1[0].intra_login} ${match1[0].id === creatorId ? '<span class="badge bg-primary ms-2">Creador</span>' : ''}
                    (Ganados: ${match1[0].games_won || 0}, Puntos: ${match1[0].total_points || 0})
                </li>`;
                html += '<li class="list-group-item text-center">VS</li>';
                html += `<li class="list-group-item d-flex align-items-center">
                    <img src="${match1[1].intra_picture || '/static/default-avatar.png'}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px; object-fit: cover;">
                    ${match1[1].intra_login} ${match1[1].id === creatorId ? '<span class="badge bg-primary ms-2">Creador</span>' : ''}
                    (Ganados: ${match1[1].games_won || 0}, Puntos: ${match1[1].total_points || 0})
                </li>`;
            }
            html += '</ul></div>';

            // Match 2
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
                    (Ganados: ${match2[0].games_won || 0}, Puntos: ${match2[0].total_points || 0})
                </li>`;
                html += '<li class="list-group-item text-center">VS</li>';
                html += '<li class="list-group-item text-muted">Esperando jugador 4...</li>';
            } else {
                html += `<li class="list-group-item d-flex align-items-center">
                    <img src="${match2[0].intra_picture || '/static/default-avatar.png'}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px; object-fit: cover;">
                    ${match2[0].intra_login} ${match2[0].id === creatorId ? '<span class="badge bg-primary ms-2">Creador</span>' : ''}
                    (Ganados: ${match2[0].games_won || 0}, Puntos: ${match2[0].total_points || 0})
                </li>`;
                html += '<li class="list-group-item text-center">VS</li>';
                html += `<li class="list-group-item d-flex align-items-center">
                    <img src="${match2[1].intra_picture || '/static/default-avatar.png'}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px; object-fit: cover;">
                    ${match2[1].intra_login} ${match2[1].id === creatorId ? '<span class="badge bg-primary ms-2">Creador</span>' : ''}
                    (Ganados: ${match2[1].games_won || 0}, Puntos: ${match2[1].total_points || 0})
                </li>`;
            }
            html += '</ul></div>';

            html += '</div>';
        }
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

    document.addEventListener('DOMContentLoaded', () => {
        console.log("[DEBUG] DOM completamente cargado, intentando inicializar torneo...");
        initTournament();
    });

    window.initTournament = initTournament;
    window.cleanupTournament = cleanupTournament;
})();
