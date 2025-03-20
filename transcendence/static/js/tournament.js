// static/js/tournament.js
(() => {
    let socket = null;
    let tournamentToken = null;
    let participants = [];
    let myUserId = null;
    let isInitialized = false;

    function initTournament() {
        if (isInitialized) {
            console.log("[DEBUG] Torneo ya inicializado, saltando inicialización...");
            return;
        }

        console.log("[DEBUG] Inicializando torneo...");

        // Limpiar estado previo
        cleanupTournament();

        // Obtener el ID del usuario actual
        myUserId = getUserId();
        if (!myUserId) {
            console.error("[ERROR] No se pudo obtener el ID del usuario, esperando...");
            // Intentar obtenerlo de nuevo después de un pequeño retraso
            setTimeout(() => {
                myUserId = getUserId();
                if (myUserId) {
                    proceedWithInitialization();
                } else {
                    showError("No estás autenticado. Por favor, inicia sesión.");
                }
            }, 500); // Esperar 500ms por si el dato se carga tarde
            return;
        }

        proceedWithInitialization();
    }

    function proceedWithInitialization() {
        console.log("[DEBUG] Procediendo con inicialización, userId:", myUserId);
        isInitialized = true;

        // Configurar WebSocket
        connectWebSocket();

        // Configurar botones
        setupTournamentButtons();
    }

    function getUserId() {
        // Intentar obtener de la variable global
        if (typeof currentUserId !== 'undefined' && currentUserId !== '') {
            return currentUserId;
        }
        // Fallback: buscar en el DOM si está inyectado en algún elemento
        const userIdElement = document.querySelector('[data-user-id]');
        if (userIdElement) {
            return userIdElement.dataset.userId;
        }
        return null;
    }

    function cleanupTournament() {
        if (socket && socket.readyState !== WebSocket.CLOSED) {
            socket.close();
            socket = null;
        }
        tournamentToken = null;
        participants = [];
        isInitialized = false;
        updateTournamentUI();
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
                action: 'create_tournament',
                user_id: myUserId
            }));
        }
    }

    function updateTournamentUI() {
        const tournamentContainer = document.getElementById('tournament-container');
        if (!tournamentContainer) return;

        let html = '';
        if (tournamentToken) {
            html += `<p class="text-center">Token de invitación: <strong>${tournamentToken}</strong></p>`;
            html += '<div class="row">';
            html += '<div class="col-md-6"><h4>Equipo Izquierdo</h4><ul class="list-group">';
            const leftTeam = participants.slice(0, 2);
            leftTeam.forEach(p => {
                html += `<li class="list-group-item">${p.intra_login} ${p.id === myUserId ? '(Tú)' : ''}</li>`;
            });
            for (let i = leftTeam.length; i < 2; i++) {
                html += '<li class="list-group-item text-muted">Esperando jugador...</li>';
            }
            html += '</ul></div>';

            html += '<div class="col-md-6"><h4>Equipo Derecho</h4><ul class="list-group">';
            const rightTeam = participants.slice(2, 4);
            rightTeam.forEach(p => {
                html += `<li class="list-group-item">${p.intra_login} ${p.id === myUserId ? '(Tú)' : ''}</li>`;
            });
            for (let i = rightTeam.length; i < 2; i++) {
                html += '<li class="list-group-item text-muted">Esperando jugador...</li>';
            }
            html += '</ul></div></div>';
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
            createBtn.addEventListener('click', () => {
                console.log("[DEBUG] Creando torneo...");
                createTournament();
            });
        }
    }

    // Escuchar evento DOMContentLoaded para carga inicial
    document.addEventListener('DOMContentLoaded', initTournament);

    // Escuchar evento HTMX para carga dinámica del partial
    document.addEventListener('htmx:afterSwap', (event) => {
        if (event.target.id === 'tournament-container' || event.target.closest('#tournament-container')) {
            console.log("[DEBUG] Partial de torneo cargado vía HTMX, inicializando...");
            initTournament();
        }
    });

    window.initTournament = initTournament;
    window.cleanupTournament = cleanupTournament;
})();