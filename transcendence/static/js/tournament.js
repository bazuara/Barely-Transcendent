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
                    &nbsp;<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" style="width: 16px; height: 16px; vertical-align: middle;"><path fill="#FFD43B" d="M309 106c11.4-7 19-19.7 19-34c0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34L209.7 220.6c-9.1 18.2-32.7 23.4-48.6 10.7L72 160c5-6.7 8-15 8-24c0-22.1-17.9-40-40-40S0 113.9 0 136s17.9 40 40 40c.2 0 .5 0 .7 0L86.4 427.4c5.5 30.4 32 52.6 63 52.6l277.2 0c30.9 0 57.4-22.1 63-52.6L535.3 176c.2 0 .5 0 .7 0c22.1 0 40-17.9 40-40s-17.9-40-40-40s-40 17.9-40 40c0 9 3 17.3 8 24l-89.1 71.3c-15.9 12.7-39.5 7.5-48.6-10.7L309 106z"/></svg>&nbsp; ${match1[0].games_won || 0}&nbsp;
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="width: 16px; height: 16px; vertical-align: middle;"><path fill="#74C0FC" d="M416 288c-50.1 0-93.6 28.8-114.6 70.8L68.9 126.3l.6-.6 60.1-60.1c87.5-87.5 229.3-87.5 316.8 0c67.1 67.1 82.7 166.3 46.8 248.3C471.8 297.6 445 288 416 288zM49.3 151.9L290.1 392.7c-1.4 7.5-2.1 15.3-2.1 23.3c0 23.2 6.2 44.9 16.9 63.7c-3 .2-6.1 .3-9.2 .3l-2.7 0c-33.9 0-66.5-13.5-90.5-37.5l-9.8-9.8c-13.1-13.1-34.6-12.4-46.8 1.7L88.2 501c-5.8 6.7-14.2 10.7-23 11s-17.5-3.1-23.8-9.4l-32-32C3.1 464.3-.3 455.7 0 446.9s4.3-17.2 11-23l66.6-57.7c14-12.2 14.8-33.7 1.7-46.8l-9.8-9.8C45.5 285.5 32 252.9 32 219l0-2.7c0-22.8 6.1-44.9 17.3-64.3zM416 320a96 96 0 1 1 0 192 96 96 0 1 1 0-192z"/></svg>&nbsp; ${match1[0].total_points || 0}
                </li>`;
                html += '<li class="list-group-item text-center">VS</li>';
                html += '<li class="list-group-item text-muted">Esperando jugador 2...</li>';
            } else {
                html += `<li class="list-group-item d-flex align-items-center">
                    <img src="${match1[0].intra_picture || '/static/default-avatar.png'}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px; object-fit: cover;">
                    ${match1[0].intra_login} ${match1[0].id === creatorId ? '<span class="badge bg-primary ms-2">Creador</span>' : ''}
                    &nbsp;<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" style="width: 16px; height: 16px; vertical-align: middle;"><path fill="#FFD43B" d="M309 106c11.4-7 19-19.7 19-34c0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34L209.7 220.6c-9.1 18.2-32.7 23.4-48.6 10.7L72 160c5-6.7 8-15 8-24c0-22.1-17.9-40-40-40S0 113.9 0 136s17.9 40 40 40c.2 0 .5 0 .7 0L86.4 427.4c5.5 30.4 32 52.6 63 52.6l277.2 0c30.9 0 57.4-22.1 63-52.6L535.3 176c.2 0 .5 0 .7 0c22.1 0 40-17.9 40-40s-17.9-40-40-40s-40 17.9-40 40c0 9 3 17.3 8 24l-89.1 71.3c-15.9 12.7-39.5 7.5-48.6-10.7L309 106z"/></svg>&nbsp; ${match1[0].games_won || 0}&nbsp;
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="width: 16px; height: 16px; vertical-align: middle;"><path fill="#74C0FC" d="M416 288c-50.1 0-93.6 28.8-114.6 70.8L68.9 126.3l.6-.6 60.1-60.1c87.5-87.5 229.3-87.5 316.8 0c67.1 67.1 82.7 166.3 46.8 248.3C471.8 297.6 445 288 416 288zM49.3 151.9L290.1 392.7c-1.4 7.5-2.1 15.3-2.1 23.3c0 23.2 6.2 44.9 16.9 63.7c-3 .2-6.1 .3-9.2 .3l-2.7 0c-33.9 0-66.5-13.5-90.5-37.5l-9.8-9.8c-13.1-13.1-34.6-12.4-46.8 1.7L88.2 501c-5.8 6.7-14.2 10.7-23 11s-17.5-3.1-23.8-9.4l-32-32C3.1 464.3-.3 455.7 0 446.9s4.3-17.2 11-23l66.6-57.7c14-12.2 14.8-33.7 1.7-46.8l-9.8-9.8C45.5 285.5 32 252.9 32 219l0-2.7c0-22.8 6.1-44.9 17.3-64.3zM416 320a96 96 0 1 1 0 192 96 96 0 1 1 0-192z"/></svg>&nbsp; ${match1[0].total_points || 0}
                </li>`;
                html += '<li class="list-group-item text-center">VS</li>';
                html += `<li class="list-group-item d-flex align-items-center">
                    <img src="${match1[1].intra_picture || '/static/default-avatar.png'}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px; object-fit: cover;">
                    ${match1[1].intra_login} ${match1[1].id === creatorId ? '<span class="badge bg-primary ms-2">Creador</span>' : ''}
                    &nbsp;<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" style="width: 16px; height: 16px; vertical-align: middle;"><path fill="#FFD43B" d="M309 106c11.4-7 19-19.7 19-34c0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34L209.7 220.6c-9.1 18.2-32.7 23.4-48.6 10.7L72 160c5-6.7 8-15 8-24c0-22.1-17.9-40-40-40S0 113.9 0 136s17.9 40 40 40c.2 0 .5 0 .7 0L86.4 427.4c5.5 30.4 32 52.6 63 52.6l277.2 0c30.9 0 57.4-22.1 63-52.6L535.3 176c.2 0 .5 0 .7 0c22.1 0 40-17.9 40-40s-17.9-40-40-40s-40 17.9-40 40c0 9 3 17.3 8 24l-89.1 71.3c-15.9 12.7-39.5 7.5-48.6-10.7L309 106z"/></svg>&nbsp; ${match1[1].games_won || 0}&nbsp;
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="width: 16px; height: 16px; vertical-align: middle;"><path fill="#74C0FC" d="M416 288c-50.1 0-93.6 28.8-114.6 70.8L68.9 126.3l.6-.6 60.1-60.1c87.5-87.5 229.3-87.5 316.8 0c67.1 67.1 82.7 166.3 46.8 248.3C471.8 297.6 445 288 416 288zM49.3 151.9L290.1 392.7c-1.4 7.5-2.1 15.3-2.1 23.3c0 23.2 6.2 44.9 16.9 63.7c-3 .2-6.1 .3-9.2 .3l-2.7 0c-33.9 0-66.5-13.5-90.5-37.5l-9.8-9.8c-13.1-13.1-34.6-12.4-46.8 1.7L88.2 501c-5.8 6.7-14.2 10.7-23 11s-17.5-3.1-23.8-9.4l-32-32C3.1 464.3-.3 455.7 0 446.9s4.3-17.2 11-23l66.6-57.7c14-12.2 14.8-33.7 1.7-46.8l-9.8-9.8C45.5 285.5 32 252.9 32 219l0-2.7c0-22.8 6.1-44.9 17.3-64.3zM416 320a96 96 0 1 1 0 192 96 96 0 1 1 0-192z"/></svg>&nbsp; ${match1[1].total_points || 0}
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
                    &nbsp;<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" style="width: 16px; height: 16px; vertical-align: middle;"><path fill="#FFD43B" d="M309 106c11.4-7 19-19.7 19-34c0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34L209.7 220.6c-9.1 18.2-32.7 23.4-48.6 10.7L72 160c5-6.7 8-15 8-24c0-22.1-17.9-40-40-40S0 113.9 0 136s17.9 40 40 40c.2 0 .5 0 .7 0L86.4 427.4c5.5 30.4 32 52.6 63 52.6l277.2 0c30.9 0 57.4-22.1 63-52.6L535.3 176c.2 0 .5 0 .7 0c22.1 0 40-17.9 40-40s-17.9-40-40-40s-40 17.9-40 40c0 9 3 17.3 8 24l-89.1 71.3c-15.9 12.7-39.5 7.5-48.6-10.7L309 106z"/></svg>&nbsp; ${match2[0].games_won || 0}&nbsp;
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="width: 16px; height: 16px; vertical-align: middle;"><path fill="#74C0FC" d="M416 288c-50.1 0-93.6 28.8-114.6 70.8L68.9 126.3l.6-.6 60.1-60.1c87.5-87.5 229.3-87.5 316.8 0c67.1 67.1 82.7 166.3 46.8 248.3C471.8 297.6 445 288 416 288zM49.3 151.9L290.1 392.7c-1.4 7.5-2.1 15.3-2.1 23.3c0 23.2 6.2 44.9 16.9 63.7c-3 .2-6.1 .3-9.2 .3l-2.7 0c-33.9 0-66.5-13.5-90.5-37.5l-9.8-9.8c-13.1-13.1-34.6-12.4-46.8 1.7L88.2 501c-5.8 6.7-14.2 10.7-23 11s-17.5-3.1-23.8-9.4l-32-32C3.1 464.3-.3 455.7 0 446.9s4.3-17.2 11-23l66.6-57.7c14-12.2 14.8-33.7 1.7-46.8l-9.8-9.8C45.5 285.5 32 252.9 32 219l0-2.7c0-22.8 6.1-44.9 17.3-64.3zM416 320a96 96 0 1 1 0 192 96 96 0 1 1 0-192z"/></svg>&nbsp; ${match2[0].total_points || 0}
                </li>`;
                html += '<li class="list-group-item text-center">VS</li>';
                html += '<li class="list-group-item text-muted">Esperando jugador 4...</li>';
            } else {
                html += `<li class="list-group-item d-flex align-items-center">
                    <img src="${match2[0].intra_picture || '/static/default-avatar.png'}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px; object-fit: cover;">
                    ${match2[0].intra_login} ${match2[0].id === creatorId ? '<span class="badge bg-primary ms-2">Creador</span>' : ''}
                    &nbsp;<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" style="width: 16px; height: 16px; vertical-align: middle;"><path fill="#FFD43B" d="M309 106c11.4-7 19-19.7 19-34c0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34L209.7 220.6c-9.1 18.2-32.7 23.4-48.6 10.7L72 160c5-6.7 8-15 8-24c0-22.1-17.9-40-40-40S0 113.9 0 136s17.9 40 40 40c.2 0 .5 0 .7 0L86.4 427.4c5.5 30.4 32 52.6 63 52.6l277.2 0c30.9 0 57.4-22.1 63-52.6L535.3 176c.2 0 .5 0 .7 0c22.1 0 40-17.9 40-40s-17.9-40-40-40s-40 17.9-40 40c0 9 3 17.3 8 24l-89.1 71.3c-15.9 12.7-39.5 7.5-48.6-10.7L309 106z"/></svg>&nbsp; ${match2[0].games_won || 0}&nbsp;
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="width: 16px; height: 16px; vertical-align: middle;"><path fill="#74C0FC" d="M416 288c-50.1 0-93.6 28.8-114.6 70.8L68.9 126.3l.6-.6 60.1-60.1c87.5-87.5 229.3-87.5 316.8 0c67.1 67.1 82.7 166.3 46.8 248.3C471.8 297.6 445 288 416 288zM49.3 151.9L290.1 392.7c-1.4 7.5-2.1 15.3-2.1 23.3c0 23.2 6.2 44.9 16.9 63.7c-3 .2-6.1 .3-9.2 .3l-2.7 0c-33.9 0-66.5-13.5-90.5-37.5l-9.8-9.8c-13.1-13.1-34.6-12.4-46.8 1.7L88.2 501c-5.8 6.7-14.2 10.7-23 11s-17.5-3.1-23.8-9.4l-32-32C3.1 464.3-.3 455.7 0 446.9s4.3-17.2 11-23l66.6-57.7c14-12.2 14.8-33.7 1.7-46.8l-9.8-9.8C45.5 285.5 32 252.9 32 219l0-2.7c0-22.8 6.1-44.9 17.3-64.3zM416 320a96 96 0 1 1 0 192 96 96 0 1 1 0-192z"/></svg>&nbsp; ${match2[0].total_points || 0}
                </li>`;
                html += '<li class="list-group-item text-center">VS</li>';
                html += `<li class="list-group-item d-flex align-items-center">
                    <img src="${match2[1].intra_picture || '/static/default-avatar.png'}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px; object-fit: cover;">
                    ${match2[1].intra_login} ${match2[1].id === creatorId ? '<span class="badge bg-primary ms-2">Creador</span>' : ''}
                    &nbsp;<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" style="width: 16px; height: 16px; vertical-align: middle;"><path fill="#FFD43B" d="M309 106c11.4-7 19-19.7 19-34c0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34L209.7 220.6c-9.1 18.2-32.7 23.4-48.6 10.7L72 160c5-6.7 8-15 8-24c0-22.1-17.9-40-40-40S0 113.9 0 136s17.9 40 40 40c.2 0 .5 0 .7 0L86.4 427.4c5.5 30.4 32 52.6 63 52.6l277.2 0c30.9 0 57.4-22.1 63-52.6L535.3 176c.2 0 .5 0 .7 0c22.1 0 40-17.9 40-40s-17.9-40-40-40s-40 17.9-40 40c0 9 3 17.3 8 24l-89.1 71.3c-15.9 12.7-39.5 7.5-48.6-10.7L309 106z"/></svg>&nbsp; ${match2[1].games_won || 0}&nbsp;
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="width: 16px; height: 16px; vertical-align: middle;"><path fill="#74C0FC" d="M416 288c-50.1 0-93.6 28.8-114.6 70.8L68.9 126.3l.6-.6 60.1-60.1c87.5-87.5 229.3-87.5 316.8 0c67.1 67.1 82.7 166.3 46.8 248.3C471.8 297.6 445 288 416 288zM49.3 151.9L290.1 392.7c-1.4 7.5-2.1 15.3-2.1 23.3c0 23.2 6.2 44.9 16.9 63.7c-3 .2-6.1 .3-9.2 .3l-2.7 0c-33.9 0-66.5-13.5-90.5-37.5l-9.8-9.8c-13.1-13.1-34.6-12.4-46.8 1.7L88.2 501c-5.8 6.7-14.2 10.7-23 11s-17.5-3.1-23.8-9.4l-32-32C3.1 464.3-.3 455.7 0 446.9s4.3-17.2 11-23l66.6-57.7c14-12.2 14.8-33.7 1.7-46.8l-9.8-9.8C45.5 285.5 32 252.9 32 219l0-2.7c0-22.8 6.1-44.9 17.3-64.3zM416 320a96 96 0 1 1 0 192 96 96 0 1 1 0-192z"/></svg>&nbsp; ${match2[1].total_points || 0}
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
