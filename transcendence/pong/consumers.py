import json
import asyncio
import random
import uuid
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from users.models import User
from pong.models import Game
from urllib import parse
from web3 import Web3

# Configuración de Web3 para la blockchain
ganache_url = "http://ganache:8545"  # URL de Ganache, ajusta si usas otro nodo
web3 = Web3(Web3.HTTPProvider(ganache_url))

# Verificar conexión
if not web3.is_connected():
    print("[ERROR] No se pudo conectar a la blockchain")

# Cargar el ABI del contrato
with open('/app/build/contracts/Tournament.json') as f:
    contract_json = json.load(f)
    contract_abi = contract_json['abi']

# Leer la dirección del contrato desde el archivo
with open('/app/build/contract_address.txt', 'r') as file:
    contract_address = file.read().strip()
contract = web3.eth.contract(address=contract_address, abi=contract_abi)

# Establecer cuenta predeterminada (usamos la primera cuenta de Ganache)
web3.eth.default_account = web3.eth.accounts[0]

# Estructuras globales para Pong
player_connections = {}  # Mapea IDs de usuario a sus conexiones (PongConsumer)
waiting_players = []     # Lista de IDs de usuario en espera
active_games = {}       # Mapea room_ids a datos del juego

# Estructuras globales para torneos
tournament_rooms = {}    # Mapea token de torneo a datos del torneo
# Mapea IDs de usuario a sus conexiones (TournamentConsumer)
tournament_connections = {}
match_states = {}  # Mapea room_ids a datos del juego

# Función para enviar datos a la blockchain


async def save_tournament_to_blockchain(tournament_data):
    try:
        # Usar los IDs de los jugadores desde los partidos en lugar de participants
        match1_players = tournament_data['matches']['match1']['players']
        match2_players = tournament_data['matches']['match2']['players']

        blockchain_data = {
            "player_id_1": str(match1_players[0]),  # Primer jugador de match1
            "player_id_2": str(match1_players[1]),  # Segundo jugador de match1
            "player_id_3": str(match2_players[0]),  # Primer jugador de match2
            "player_id_4": str(match2_players[1]),  # Segundo jugador de match2
            "score_match_1_2": f"{tournament_data['matches']['match1']['player1_score']}-{tournament_data['matches']['match1']['player2_score']}",
            "score_match_3_4": f"{tournament_data['matches']['match2']['player1_score']}-{tournament_data['matches']['match2']['player2_score']}",
            "score_match_final": f"{tournament_data['matches']['final']['player1_score']}-{tournament_data['matches']['final']['player2_score']}"
        }

        # Enviar transacción al contrato
        tx_hash = contract.functions.saveMatch(
            blockchain_data["player_id_1"],
            blockchain_data["player_id_2"],
            blockchain_data["player_id_3"],
            blockchain_data["player_id_4"],
            blockchain_data["score_match_1_2"],
            blockchain_data["score_match_3_4"],
            blockchain_data["score_match_final"]
        ).transact()

        # Esperar a que la transacción sea minada
        receipt = web3.eth.wait_for_transaction_receipt(tx_hash)
        print(
            f"[DEBUG] Torneo guardado en blockchain. Tx Hash: {tx_hash.hex()}")
        return receipt
    except Exception as e:
        print(f"[ERROR] Error al guardar en blockchain: {e}")
        return None


class PongConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        """Maneja la conexión de un jugador al WebSocket de Pong."""
        session = self.scope.get('session', {})
        user_id = session.get('user_id')

        if not user_id:
            print(f"[DEBUG] No se encontró user_id en la sesión: {session}")
            await self.close(code=4001)
            return

        try:
            self.user = await database_sync_to_async(User.objects.get)(internal_id=user_id)
            print(f"[DEBUG] Usuario autenticado: {self.user.internal_id}")
        except User.DoesNotExist:
            print(f"[DEBUG] Usuario con ID {user_id} no existe")
            await self.close(code=4002)
            return

        await self.accept()
        self.room_id = None
        self.session_id = f"session_{id(self)}"
        player_connections[self.user.internal_id] = self
        print(f"[DEBUG] Conexión registrada para {self.user.internal_id}")

        if self.user.internal_id not in waiting_players:
            waiting_players.append(self.user.internal_id)
            print(
                f"[DEBUG] Jugador {self.user.internal_id} añadido a la cola: {waiting_players}")
            await self.send(text_data=json.dumps({
                'type': 'waiting',
                'message': 'Esperando a otro jugador...'
            }))
        else:
            print(f"[DEBUG] Jugador {self.user.internal_id} ya en cola")
            await self.send(text_data=json.dumps({
                'type': 'waiting',
                'message': 'Ya estás en cola, esperando a otro jugador...'
            }))

        await self.check_matchmaking()

    async def disconnect(self, close_code):
        """Maneja la desconexión de un jugador de Pong."""
        if not hasattr(self, 'user'):
            print(
                f"[DEBUG] Desconexión sin usuario asignado. Código: {close_code}")
            return

        print(
            f"[DEBUG] Desconexión de {self.user.internal_id}. Código: {close_code}")
        if self.user.internal_id in player_connections:
            del player_connections[self.user.internal_id]

        if self.user.internal_id in waiting_players:
            waiting_players.remove(self.user.internal_id)
            print(f"[DEBUG] {self.user.internal_id} eliminado de la cola")

        if self.room_id and self.room_id in active_games:
            if 'ball_task' in active_games[self.room_id]:
                active_games[self.room_id]['ball_task'].cancel()
            await self.channel_layer.group_discard(self.room_id, self.channel_name)
            await self.channel_layer.group_send(
                self.room_id,
                {
                    'type': 'player_disconnected',
                    'player_id': self.user.internal_id
                }
            )
            if self.room_id in active_games:
                del active_games[self.room_id]
                print(
                    f"[DEBUG] Juego {self.room_id} terminado por desconexión")

    async def receive(self, text_data):
        """Maneja mensajes recibidos del frontend para Pong."""
        data = json.loads(text_data)
        action = data.get('action')

        if action == 'move_paddle':
            if not self.room_id or self.room_id not in active_games:
                print(
                    f"[WARNING] Intento de mover paleta sin sala activa: {data}")
                return
            game_data = active_games[self.room_id]
            if data['player'] == 'player1' and self.user.internal_id == game_data['player1_id']:
                game_data['left_paddle'] = data['paddle_position']
            elif data['player'] == 'player2' and self.user.internal_id == game_data['player2_id']:
                game_data['right_paddle'] = data['paddle_position']
            await self.channel_layer.group_send(
                self.room_id,
                {
                    'type': 'update_paddle',
                    'player': data['player'],
                    'paddle_position': data['paddle_position']
                }
            )
        elif action == 'game_over':
            user_id = data.get('player_id')
            if user_id == self.user.internal_id:
                points_scored = data.get('points_scored', 0)
                has_won = data.get('has_won', False)
                await self.update_user_stats(self.user, points_scored, has_won)
                print(f"[DEBUG] Estadísticas actualizadas para {user_id}")

    async def check_matchmaking(self):
        """Empareja jugadores para una partida de Pong."""
        if len(waiting_players) < 2:
            return

        player1_id = waiting_players.pop(0)
        player2_id = None
        for i, pid in enumerate(waiting_players):
            if pid != player1_id:
                player2_id = waiting_players.pop(i)
                break

        if not player2_id:
            waiting_players.insert(0, player1_id)
            return

        try:
            game = await self.create_game(player1_id, player2_id)
            room_id = game.room_id
            player1_conn = player_connections.get(player1_id)
            player2_conn = player_connections.get(player2_id)

            if player1_conn and player2_conn:
                player1_conn.room_id = room_id
                player2_conn.room_id = room_id
                await player1_conn.channel_layer.group_add(room_id, player1_conn.channel_name)
                await player2_conn.channel_layer.group_add(room_id, player2_conn.channel_name)

                player1_info = await self.get_user_info(player1_id)
                player2_info = await self.get_user_info(player2_id)

                base_speed = 0.015
                active_games[room_id] = {
                    'ball_x': 0.5, 'ball_y': 0.5,
                    'ball_dx': base_speed * random.choice([-1, 1]),
                    'ball_dy': base_speed * 0.8 * random.choice([-1, 1]),
                    'player1_score': 0, 'player2_score': 0,
                    'left_paddle': 0.5, 'right_paddle': 0.5,
                    'player1_id': player1_id, 'player2_id': player2_id
                }
                active_games[room_id]['ball_task'] = asyncio.create_task(
                    self.move_ball(room_id))

                await self.channel_layer.group_send(
                    room_id,
                    {
                        'type': 'game_start',
                        'room_id': room_id,
                        'player1': player1_info,
                        'player2': player2_info
                    }
                )
                print(f"[DEBUG] Partida iniciada: {room_id}")
            else:
                waiting_players.extend([player1_id, player2_id])
                print(
                    f"[ERROR] Conexiones no encontradas: P1={player1_id}, P2={player2_id}")
        except Exception as e:
            waiting_players.extend([player1_id, player2_id])
            print(f"[ERROR] Error en matchmaking: {e}")

    async def move_ball(self, room_id):
        """Maneja el movimiento de la pelota en una partida de Pong."""
        try:
            game_data = active_games[room_id]
            paddle_height = 0.2
            base_speed = 0.015
            update_interval = 0.02

            while room_id in active_games:
                game_data['ball_x'] += game_data['ball_dx']
                game_data['ball_y'] += game_data['ball_dy']

                if game_data['ball_y'] <= 0 or game_data['ball_y'] >= 1:
                    game_data['ball_dy'] = -game_data['ball_dy'] * 1.02
                    game_data['ball_y'] = max(
                        0.01, min(0.99, game_data['ball_y']))

                if (game_data['ball_x'] <= 0.025 and game_data['ball_x'] >= -0.01 and
                    game_data['ball_y'] >= game_data['left_paddle'] - paddle_height/2 and
                        game_data['ball_y'] <= game_data['left_paddle'] + paddle_height/2):
                    game_data['ball_dx'] = -game_data['ball_dx'] * 1.1
                    game_data['ball_x'] = 0.025
                    relative_intersection = (
                        game_data['ball_y'] - game_data['left_paddle']) / (paddle_height/2)
                    game_data['ball_dy'] = base_speed * \
                        1.5 * relative_intersection

                if (game_data['ball_x'] >= 0.99 and game_data['ball_x'] <= 1.01 and
                    game_data['ball_y'] >= game_data['right_paddle'] - paddle_height/2 and
                        game_data['ball_y'] <= game_data['right_paddle'] + paddle_height/2):
                    game_data['ball_dx'] = -game_data['ball_dx'] * 1.1
                    game_data['ball_x'] = 0.99
                    relative_intersection = (
                        game_data['ball_y'] - game_data['right_paddle']) / (paddle_height/2)
                    game_data['ball_dy'] = base_speed * \
                        1.5 * relative_intersection

                if game_data['ball_x'] < 0:
                    game_data['player2_score'] += 1
                    await self.channel_layer.group_send(
                        room_id,
                        {'type': 'update_score',
                            'player1_score': game_data['player1_score'], 'player2_score': game_data['player2_score']}
                    )
                    self.reset_ball(game_data, base_speed)
                    await asyncio.sleep(1)

                if game_data['ball_x'] > 1:
                    game_data['player1_score'] += 1
                    await self.channel_layer.group_send(
                        room_id,
                        {'type': 'update_score',
                            'player1_score': game_data['player1_score'], 'player2_score': game_data['player2_score']}
                    )
                    self.reset_ball(game_data, base_speed)
                    await asyncio.sleep(1)

                if game_data['player1_score'] >= 3 or game_data['player2_score'] >= 3:
                    winner = 1 if game_data['player1_score'] >= 3 else 2
                    await self.channel_layer.group_send(
                        room_id,
                        {
                            'type': 'game_over',
                            'winner': winner,
                            'player1_id': game_data['player1_id'],
                            'player2_id': game_data['player2_id'],
                            'player1_score': game_data['player1_score'],
                            'player2_score': game_data['player2_score']
                        }
                    )
                    await self.save_game_results(room_id, game_data)
                    del active_games[room_id]
                    return

                await self.channel_layer.group_send(
                    room_id,
                    {'type': 'update_ball', 'ball_position_x':
                        game_data['ball_x'], 'ball_position_y': game_data['ball_y']}
                )
                await asyncio.sleep(update_interval)

        except asyncio.CancelledError:
            print(f"[DEBUG] Tarea de pelota cancelada para {room_id}")
        except Exception as e:
            print(f"[ERROR] Error en move_ball: {e}")
            if room_id in active_games:
                del active_games[room_id]

    def reset_ball(self, game_data, base_speed):
        """Reinicia la pelota al centro con una nueva dirección."""
        game_data['ball_x'] = 0.5
        game_data['ball_y'] = 0.5
        game_data['ball_dx'] = base_speed * random.choice([-1, 1])
        game_data['ball_dy'] = base_speed * 0.8 * random.choice([-1, 1])

    @database_sync_to_async
    def create_game(self, player1_id, player2_id):
        """Crea una partida en la base de datos."""
        player1 = User.objects.get(internal_id=player1_id)
        player2 = User.objects.get(internal_id=player2_id)
        game = Game(player1=player1, player2=player2)
        game.save()
        return game

    @database_sync_to_async
    def save_game_results(self, room_id, game_data):
        """Guarda los resultados de la partida."""
        game = Game.objects.filter(room_id=room_id).first()
        if game:
            game.player1_score = game_data['player1_score']
            game.player2_score = game_data['player2_score']
            game.is_active = False
            game.save()
            print(f"[DEBUG] Resultados guardados para {room_id}")

    @database_sync_to_async
    def get_user_info(self, user_id):
        """Obtiene información del usuario."""
        try:
            user = User.objects.get(internal_id=user_id)
            return {
                'id': user.internal_id,
                'intra_id': user.intra_id,
                'intra_login': user.internal_login or user.intra_login,
                'intra_picture': user.intra_picture
            }
        except User.DoesNotExist:
            return {'id': user_id, 'intra_login': f'Usuario {user_id}', 'intra_picture': '/static/default-avatar.png'}

    @database_sync_to_async
    def update_user_stats(self, user, points_scored, has_won):
        """Actualiza estadísticas del usuario."""
        user.games_played += 1
        user.total_points += points_scored
        if has_won:
            user.games_won += 1
        user.save()

    async def game_start(self, event):
        """Notifica el inicio de la partida."""
        await self.send(text_data=json.dumps({
            'type': 'game_start',
            'room_id': event['room_id'],
            'player1': event['player1'],
            'player2': event['player2'],
            'user_id': str(self.user.internal_id)
        }))

    async def update_paddle(self, event):
        """Actualiza la posición de la paleta."""
        await self.send(text_data=json.dumps(event))

    async def update_ball(self, event):
        """Actualiza la posición de la pelota."""
        await self.send(text_data=json.dumps(event))

    async def update_score(self, event):
        """Actualiza la puntuación."""
        await self.send(text_data=json.dumps(event))

    async def player_disconnected(self, event):
        """Notifica la desconexión de un jugador."""
        if self.room_id in active_games:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'El otro jugador se ha desconectado'
            }))

    async def game_over(self, event):
        """Notifica el fin de la partida."""
        winner = event.get('winner', 0)
        message = f'¡Jugador {winner} ha ganado!' if winner else 'Partida finalizada sin ganador'
        await self.send(text_data=json.dumps({
            'type': 'game_over',
            'winner': winner,
            'message': message,
            'player1_id': event.get('player1_id'),
            'player2_id': event.get('player2_id'),
            'player1_score': event.get('player1_score', 0),
            'player2_score': event.get('player2_score', 0)
        }))


class TournamentConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        session = self.scope.get('session', {})
        user_id = session.get('user_id')

        if not user_id:
            print(f"[DEBUG] No user_id en sesión: {session}")
            await self.close(code=4001)
            return

        try:
            self.user = await database_sync_to_async(User.objects.get)(internal_id=user_id)
            print(
                f"[DEBUG] Usuario autenticado en torneo - User ID: {self.user.internal_id}, Session: {session}")
        except User.DoesNotExist:
            print(f"[DEBUG] Usuario {user_id} no encontrado")
            await self.close(code=4002)
            return

        await self.accept()
        tournament_connections[self.user.internal_id] = self
        print(
            f"[DEBUG] Conexión registrada - Tournament Connections: {list(tournament_connections.keys())}")
        self.tournament_token = None

    async def start_tournament(self, event):
        # Ignorar el mensaje en el backend, ya que lo maneja el frontend
        print(
            f"[DEBUG] Mensaje start_tournament recibido en backend y ignorado: {event}")
        pass

    async def disconnect(self, close_code):
        if self.user.internal_id in tournament_connections:
            del tournament_connections[self.user.internal_id]
            print(
                f"[DEBUG] Conexión eliminada - User ID: {self.user.internal_id}, Remaining Connections: {list(tournament_connections.keys())}")

        if self.tournament_token and self.tournament_token in tournament_rooms:
            tournament_data = tournament_rooms[self.tournament_token]
            if self.user.internal_id in tournament_data['participants']:
                tournament_data['participants'].remove(self.user.internal_id)
                print(
                    f"[DEBUG] {self.user.internal_id} ha salido del torneo {self.tournament_token}, Participants: {tournament_data['participants']}")

                # Si es la final y el usuario es un finalista
                if tournament_data['status'] == 'final':
                    finalists = tournament_data['matches']['final']['players']
                    user_id_str = str(self.user.internal_id)
                    final_match_id = f"{self.tournament_token}-final"
                    if user_id_str in [str(p) for p in finalists]:
                        # Si el partido no ha comenzado o está en countdown
                        if (tournament_data['matches']['final']['winner'] is None and
                                (final_match_id not in match_states or not match_states[final_match_id]['running'])):
                            winner_id = next(
                                p for p in finalists if str(p) != user_id_str)
                            tournament_data['matches']['final']['winner'] = winner_id
                            tournament_data['matches']['final']['player1_score'] = 5 if str(
                                winner_id) == str(finalists[0]) else 0
                            tournament_data['matches']['final']['player2_score'] = 5 if str(
                                winner_id) == str(finalists[1]) else 0
                            tournament_data['status'] = 'finished'

                            # Limpiar estado si existe
                            if final_match_id in match_states:
                                if 'ball_task' in match_states[final_match_id]:
                                    match_states[final_match_id]['ball_task'].cancel(
                                    )
                                del match_states[final_match_id]

                            # Enviar resultados finales directamente
                            results = {
                                'participants': await self.get_participants_info(tournament_data['participants']),
                                'match1': {
                                    'players': await self.get_participants_info(tournament_data['matches']['match1']['players']),
                                    'winner': await self.get_participant_info(tournament_data['matches']['match1']['winner'])
                                },
                                'match2': {
                                    'players': await self.get_participants_info(tournament_data['matches']['match2']['players']),
                                    'winner': await self.get_participant_info(tournament_data['matches']['match2']['winner'])
                                },
                                'final': {
                                    'players': await self.get_participants_info(tournament_data['matches']['final']['players']),
                                    'winner': await self.get_participant_info(winner_id)
                                }
                            }
                            await self.channel_layer.group_send(
                                self.tournament_token,
                                {
                                    'type': 'tournament_results',
                                    'results': results
                                }
                            )
                            print(
                                f"[DEBUG] Finalista {user_id_str} desconectado antes/durante countdown. Resultados enviados. Ganador: {winner_id}")
                            # Enviar a blockchain en caso de desconexión en final
                            await save_tournament_to_blockchain(tournament_data)
                            await self.channel_layer.group_discard(self.tournament_token, self.channel_name)
                            return  # Salir para evitar más procesamiento

                # Resto del manejo existente
                if tournament_data['creator'] == self.user.internal_id and tournament_data['participants']:
                    tournament_data['creator'] = tournament_data['participants'][0]
                    print(
                        f"[DEBUG] Nuevo creador del torneo {self.tournament_token}: {tournament_data['creator']}")

                if tournament_data['status'] in ['in_progress', 'final', 'finished']:
                    await self.handle_tournament_disconnect(tournament_data)
                else:
                    await self.send_tournament_info()

                if not tournament_data['participants']:
                    del tournament_rooms[self.tournament_token]
                    print(
                        f"[DEBUG] Torneo {self.tournament_token} eliminado por falta de participantes")
            await self.channel_layer.group_discard(self.tournament_token, self.channel_name)

    async def handle_tournament_disconnect(self, tournament_data):
        """Maneja la desconexión de un jugador en un torneo en curso."""
        user_id_str = str(self.user.internal_id)
        match_found = False

        # Revisar todos los matches del torneo
        for match_key in ['match1', 'match2', 'final']:
            match_data = tournament_data['matches'][match_key]
            players = match_data['players']
            if user_id_str in [str(p) for p in players]:
                match_found = True
                match_id = f"{self.tournament_token}-{match_key}"
                # Grupo específico del match
                match_group_name = f"match_{match_id}"

                # Si el match ya tiene ganador, ignorar
                if match_data['winner']:
                    print(
                        f"[DEBUG] {match_id} ya tiene ganador: {match_data['winner']}, ignorando desconexión")
                    continue

                # Determinar oponente
                opponent_id = next(p for p in players if str(p) != user_id_str)

                # Si la partida está en curso (estado existe en match_states)
                if match_id in match_states:
                    state = match_states[match_id]
                    state['running'] = False
                    if 'ball_task' in state:
                        state['ball_task'].cancel()

                    # Asegurar que todos los IDs sean strings
                    winner_id = str(opponent_id)
                    state_player1_id = str(state['player1_id'])
                    state_player2_id = str(state['player2_id'])

                    # Asignar victoria al oponente con 5-0
                    state['player1_score'] = 5 if state_player1_id == winner_id else 0
                    state['player2_score'] = 5 if state_player2_id == winner_id else 0

                    winner = 1 if state_player1_id == winner_id else 2
                    print(
                        f"[DEBUG] Asignando ganador - Desconectado: {user_id_str}, Winner_id: {winner_id}, Player1_id: {state_player1_id}, Player2_id: {state_player2_id}, Winner: {winner}")

                    await self.channel_layer.group_send(
                        match_group_name,
                        {
                            'type': 'game_over',
                            'winner': winner,
                            'player1_id': state_player1_id,
                            'player2_id': state_player2_id,
                            'player1_score': state['player1_score'],
                            'player2_score': state['player2_score'],
                            'message': 'El oponente se ha desconectado. ¡Has ganado!'
                        }
                    )
                    await self.channel_layer.group_send(
                        self.tournament_token,
                        {
                            'type': 'match_result',
                            'match_id': match_id,
                            'winner_id': int(winner_id),
                            'player1_score': state['player1_score'],
                            'player2_score': state['player2_score']
                        }
                    )
                    # No eliminamos match_states[match_id] aquí; lo dejamos a TournamentMatchConsumer

                # Si la partida aún no ha comenzado
                else:
                    match_data['winner'] = opponent_id
                    match_data['player1_score'] = 5 if str(
                        opponent_id) == str(players[0]) else 0
                    match_data['player2_score'] = 5 if str(
                        opponent_id) == str(players[1]) else 0
                    print(
                        f"[DEBUG] {match_id} marcado como perdido por desconexión. Ganador: {opponent_id}")
                    await self.channel_layer.group_send(
                        self.tournament_token,
                        {
                            'type': 'match_result',
                            'match_id': match_id,
                            'winner_id': int(opponent_id),
                            'player1_score': match_data['player1_score'],
                            'player2_score': match_data['player2_score']
                        }
                    )
                    # Notificar al oponente si está conectado
                    if opponent_id in tournament_connections:
                        await tournament_connections[opponent_id].send(text_data=json.dumps({
                            'type': 'start_tournament',
                            'match_id': match_id,
                            'opponent_id': user_id_str,
                            'user_id': opponent_id
                        }))

        if not match_found:
            print(
                f"[DEBUG] No se encontró match activo para {user_id_str} en {self.tournament_token}")

    async def receive(self, text_data):
        data = json.loads(text_data)
        action = data.get('action')

        async def leave_existing_tournament():
            if self.tournament_token and self.tournament_token in tournament_rooms:
                old_tournament = tournament_rooms[self.tournament_token]
                if self.user.internal_id in old_tournament['participants']:
                    old_tournament['participants'].remove(
                        self.user.internal_id)
                    print(
                        f"[DEBUG] {self.user.internal_id} ha salido del torneo {self.tournament_token}")

                    if old_tournament['creator'] == self.user.internal_id and old_tournament['participants']:
                        old_tournament['creator'] = old_tournament['participants'][0]
                        print(
                            f"[DEBUG] Nuevo creador del torneo {self.tournament_token}: {old_tournament['creator']}")

                    await self.send_tournament_info()

                    if not old_tournament['participants']:
                        del tournament_rooms[self.tournament_token]
                        print(
                            f"[DEBUG] Torneo {self.tournament_token} eliminado por falta de participantes")
                self.tournament_token = None

        if action == 'create_tournament':
            await leave_existing_tournament()
            self.tournament_token = str(uuid.uuid4())[:8]
            tournament_rooms[self.tournament_token] = {
                'creator': self.user.internal_id,
                'participants': [self.user.internal_id],
                'max_players': 4,
                'status': 'waiting',
                'channel_group': self.tournament_token,
                'matches': {
                    'match1': {'players': [], 'winner': None, 'player1_score': 0, 'player2_score': 0},
                    'match2': {'players': [], 'winner': None, 'player1_score': 0, 'player2_score': 0},
                    'final': {'players': [], 'winner': None, 'player1_score': 0, 'player2_score': 0},
                }
            }
            print(
                f"[DEBUG] Torneo creado por {self.user.internal_id}: {self.tournament_token}")
            await self.channel_layer.group_add(self.tournament_token, self.channel_name)
            await self.send_tournament_info()

        elif action == 'join_tournament':
            tournament_token = data.get('token')
            if not tournament_token:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'Falta el token del torneo'
                }))
                return

            if tournament_token not in tournament_rooms:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'Token de torneo inválido'
                }))
                return

            tournament_data = tournament_rooms[tournament_token]
            print(
                f"[DEBUG] Intento de unión - User ID: {self.user.internal_id}, Tournament: {tournament_token}, Current Participants: {tournament_data['participants']}")

            if tournament_data['status'] != 'waiting':
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'El torneo ya ha comenzado o ha terminado'
                }))
                return

            if len(tournament_data['participants']) >= tournament_data['max_players']:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'El torneo está lleno'
                }))
                return

            if self.user.internal_id in tournament_data['participants']:
                print(
                    f"[DEBUG] Error: Usuario {self.user.internal_id} ya está en participants: {tournament_data['participants']}")
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'Ya estás en este torneo'
                }))
                return

            await leave_existing_tournament()

            tournament_data['participants'].append(self.user.internal_id)
            self.tournament_token = tournament_token
            await self.channel_layer.group_add(tournament_token, self.channel_name)
            print(
                f"[DEBUG] {self.user.internal_id} se unió al torneo {tournament_token}, New Participants: {tournament_data['participants']}")
            await self.send_tournament_info()

        elif action == 'start_tournament':
            tournament_token = data.get('token')
            if not tournament_token or tournament_token != self.tournament_token:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'Token de torneo inválido o no coincide'
                }))
                return

            if tournament_token not in tournament_rooms:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'El torneo no existe'
                }))
                return

            tournament_data = tournament_rooms[tournament_token]
            if self.user.internal_id != tournament_data['creator']:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'Solo el creador puede iniciar el torneo'
                }))
                return

            if len(tournament_data['participants']) != 4:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'Se necesitan exactamente 4 jugadores para iniciar el torneo'
                }))
                return

            print(
                f"[DEBUG] Iniciando torneo {tournament_token} por {self.user.internal_id}")
            tournament_data['status'] = 'in_progress'

            # Lista de IDs: [1, 2, 3, 4]
            participants = tournament_data['participants']
            match1_players = participants[:2]  # [1, 2]
            match2_players = participants[2:]  # [3, 4]

            tournament_data['matches']['match1']['players'] = match1_players
            tournament_data['matches']['match2']['players'] = match2_players

            match1_id = f"{tournament_token}-match1"
            match2_id = f"{tournament_token}-match2"

            # Enviar mensajes a los jugadores de match1
            for player_id in match1_players:
                opponent_id = match1_players[0] if player_id != match1_players[0] else match1_players[1]
                if player_id in tournament_connections:
                    await tournament_connections[player_id].send(text_data=json.dumps({
                        'type': 'start_tournament',
                        'match_id': match1_id,
                        'opponent_id': opponent_id,
                        'user_id': player_id
                    }))

            # Enviar mensajes a los jugadores de match2
            for player_id in match2_players:
                opponent_id = match2_players[0] if player_id != match2_players[0] else match2_players[1]
                if player_id in tournament_connections:
                    await tournament_connections[player_id].send(text_data=json.dumps({
                        'type': 'start_tournament',
                        'match_id': match2_id,
                        'opponent_id': opponent_id,
                        'user_id': player_id
                    }))

            print(
                f"[DEBUG] Matches iniciados: {match1_id} ({match1_players}), {match2_id} ({match2_players})")
            await self.send_tournament_info()

    async def send_tournament_info(self):
        if self.tournament_token and self.tournament_token in tournament_rooms:
            tournament_data = tournament_rooms[self.tournament_token]
            participants_info = await self.get_participants_info(tournament_data['participants'])
            print(
                f"[DEBUG] Enviando actualización al grupo - Token: {self.tournament_token}, Creator ID: {tournament_data['creator']}")
            await self.channel_layer.group_send(
                self.tournament_token,
                {
                    'type': 'tournament_info',
                    'token': self.tournament_token,
                    'participants': participants_info,
                    'max_players': tournament_data['max_players'],
                    'status': tournament_data['status'],
                    'creator': tournament_data['creator'],
                }
            )

    @database_sync_to_async
    def get_participants_info(self, participant_ids):
        participants = []
        for user_id in participant_ids:
            try:
                user = User.objects.get(internal_id=user_id)
                participants.append({
                    'id': user.internal_id,
                    'intra_login': user.internal_login or user.intra_login,
                    'intra_picture': user.intra_picture,
                    'games_won': user.games_won,
                    'total_points': user.total_points
                })
            except User.DoesNotExist:
                participants.append({
                    'id': user_id,
                    'intra_login': f'User {user_id}',
                    'intra_picture': None,
                    'games_won': 0,
                    'total_points': 0
                })
        return participants

    async def tournament_info(self, event):
        show_start_button = (self.user.internal_id == event['creator'])
        print(
            f"[DEBUG] Enviando a frontend - User ID: {self.user.internal_id}, Creator ID: {event['creator']}, Show Start Button: {show_start_button}")
        await self.send(text_data=json.dumps({
            'type': 'tournament_info',
            'token': event['token'],
            'participants': event['participants'],
            'max_players': event['max_players'],
            'status': event['status'],
            'creator': event['creator'],
            'show_start_button': show_start_button
        }))

    async def match_result(self, event):
        match_id = event['match_id']
        winner_id = event['winner_id']
        player1_score = event.get('player1_score', 0)
        player2_score = event.get('player2_score', 0)
        if self.tournament_token and self.tournament_token in tournament_rooms:
            tournament_data = tournament_rooms[self.tournament_token]
            match_key = match_id.split('-')[-1]
            if match_key in tournament_data['matches']:
                if tournament_data['matches'][match_key]['winner'] is None:
                    tournament_data['matches'][match_key]['winner'] = winner_id
                    tournament_data['matches'][match_key]['player1_score'] = player1_score
                    tournament_data['matches'][match_key]['player2_score'] = player2_score
                    print(
                        f"[DEBUG] Ganador de {match_id}: {winner_id}, Puntuación: {player1_score}-{player2_score}")

                if match_key == 'final' and tournament_data['status'] != 'finished':
                    tournament_data['status'] = 'finished'
                    tournament_data['matches']['final']['player1_score'] = player1_score
                    tournament_data['matches']['final']['player2_score'] = player2_score

                    results = {
                        'participants': await self.get_participants_info(tournament_data['participants']),
                        'match1': {
                            'players': await self.get_participants_info(tournament_data['matches']['match1']['players']),
                            'winner': await self.get_participant_info(tournament_data['matches']['match1']['winner'])
                        },
                        'match2': {
                            'players': await self.get_participants_info(tournament_data['matches']['match2']['players']),
                            'winner': await self.get_participant_info(tournament_data['matches']['match2']['winner'])
                        },
                        'final': {
                            'players': await self.get_participants_info(tournament_data['matches']['final']['players']),
                            'winner': await self.get_participant_info(winner_id)
                        }
                    }
                    await self.channel_layer.group_send(
                        self.tournament_token,
                        {
                            'type': 'tournament_results',
                            'results': results
                        }
                    )
                    print(
                        f"[DEBUG] Torneo {self.tournament_token} finalizado. Resultados enviados.")

                    # Enviar los resultados a la blockchain
                    await save_tournament_to_blockchain(tournament_data)

                elif (tournament_data['matches']['match1']['winner'] is not None and
                      tournament_data['matches']['match2']['winner'] is not None and
                      tournament_data['status'] == 'in_progress'):
                    await self.start_final(tournament_data)
            else:
                print(
                    f"[DEBUG] Match {match_id} no encontrado en torneo {self.tournament_token}")

    async def start_final(self, tournament_data):
        tournament_data['status'] = 'final'
        finalists = [
            tournament_data['matches']['match1']['winner'],
            tournament_data['matches']['match2']['winner']
        ]
        tournament_data['matches']['final']['players'] = finalists
        final_match_id = f"{self.tournament_token}-final"

        await asyncio.sleep(3)

        # Verificar conexiones antes del countdown
        missing_players = [
            p for p in finalists if p not in tournament_connections]
        if missing_players:
            print(
                f"[DEBUG] Jugadores desconectados antes del countdown: {missing_players}")
            if len(missing_players) == 1:
                winner_id = finalists[0] if missing_players[0] == finalists[1] else finalists[1]
                tournament_data['matches']['final']['winner'] = winner_id
                tournament_data['matches']['final']['player1_score'] = 5 if str(
                    winner_id) == str(finalists[0]) else 0
                tournament_data['matches']['final']['player2_score'] = 5 if str(
                    winner_id) == str(finalists[1]) else 0
                tournament_data['status'] = 'finished'
                # Enviar resultados directamente
                results = {
                    'participants': await self.get_participants_info(tournament_data['participants']),
                    'match1': {
                        'players': await self.get_participants_info(tournament_data['matches']['match1']['players']),
                        'winner': await self.get_participant_info(tournament_data['matches']['match1']['winner'])
                    },
                    'match2': {
                        'players': await self.get_participants_info(tournament_data['matches']['match2']['players']),
                        'winner': await self.get_participant_info(tournament_data['matches']['match2']['winner'])
                    },
                    'final': {
                        'players': await self.get_participants_info(tournament_data['matches']['final']['players']),
                        'winner': await self.get_participant_info(winner_id)
                    }
                }
                await self.channel_layer.group_send(
                    self.tournament_token,
                    {
                        'type': 'tournament_results',
                        'results': results
                    }
                )
                print(
                    f"[DEBUG] Torneo {self.tournament_token} finalizado por desconexión antes del countdown. Resultados enviados.")
                # Enviar a blockchain
                await save_tournament_to_blockchain(tournament_data)
                return
            elif len(missing_players) == 2:
                print(
                    f"[DEBUG] Ambos finalistas desconectados, torneo {self.tournament_token} cancelado")
                tournament_data['status'] = 'finished'
                return

        # Resto del código (countdown y start_tournament)
        tasks = []
        for player_id in finalists:
            tasks.append(
                tournament_connections[player_id].send(text_data=json.dumps({
                    'type': 'prepare_for_final',
                    'final_match_id': final_match_id
                }))
            )
        await asyncio.gather(*tasks)
        await asyncio.sleep(1)

        for i in range(5, 0, -1):
            tasks = []
            for player_id in finalists:
                if player_id in tournament_connections:
                    tasks.append(
                        tournament_connections[player_id].send(text_data=json.dumps({
                            'type': 'countdown_to_final',
                            'seconds': i,
                            'final_match_id': final_match_id
                        }))
                    )
            if len(tasks) < 2:
                missing_players = [
                    p for p in finalists if p not in tournament_connections]
                winner_id = finalists[0] if missing_players[0] == finalists[1] else finalists[1]
                tournament_data['matches']['final']['winner'] = winner_id
                tournament_data['matches']['final']['player1_score'] = 5 if str(
                    winner_id) == str(finalists[0]) else 0
                tournament_data['matches']['final']['player2_score'] = 5 if str(
                    winner_id) == str(finalists[1]) else 0
                tournament_data['status'] = 'finished'
                results = {
                    'participants': await self.get_participants_info(tournament_data['participants']),
                    'match1': {
                        'players': await self.get_participants_info(tournament_data['matches']['match1']['players']),
                        'winner': await self.get_participant_info(tournament_data['matches']['match1']['winner'])
                    },
                    'match2': {
                        'players': await self.get_participants_info(tournament_data['matches']['match2']['players']),
                        'winner': await self.get_participant_info(tournament_data['matches']['match2']['winner'])
                    },
                    'final': {
                        'players': await self.get_participants_info(tournament_data['matches']['final']['players']),
                        'winner': await self.get_participant_info(winner_id)
                    }
                }
                await self.channel_layer.group_send(
                    self.tournament_token,
                    {
                        'type': 'tournament_results',
                        'results': results
                    }
                )
                print(
                    f"[DEBUG] Torneo {self.tournament_token} finalizado por desconexión durante countdown. Resultados enviados.")
                # Enviar a blockchain
                await save_tournament_to_blockchain(tournament_data)
                return
            await asyncio.gather(*tasks)
            await asyncio.sleep(1)

        for player_id in finalists:
            if player_id in tournament_connections:
                await tournament_connections[player_id].send(text_data=json.dumps({
                    'type': 'start_tournament',
                    'match_id': final_match_id,
                    'opponent_id': finalists[0] if player_id == finalists[1] else finalists[1],
                    'user_id': player_id
                }))
                print(
                    f"[DEBUG] Enviado start_tournament a {player_id} para {final_match_id}")

        print(f"[DEBUG] Final iniciada: {final_match_id} ({finalists})")

    async def countdown_to_final(self, event):
        await self.send(text_data=json.dumps({
            'type': 'countdown_to_final',
            'seconds': event['seconds'],
            'final_match_id': event['final_match_id']
        }))

    async def tournament_results(self, event):
        await self.send(text_data=json.dumps({
            'type': 'tournament_results',
            'results': event['results']
        }))

    @database_sync_to_async
    def get_participant_info(self, user_id):
        try:
            user = User.objects.get(internal_id=user_id)
            return {
                'id': user.internal_id,
                'intra_login': user.internal_login or user.intra_login,
                'intra_picture': user.intra_picture,
                'games_won': user.games_won,
                'total_points': user.total_points
            }
        except User.DoesNotExist:
            return {
                'id': user_id,
                'intra_login': f'User {user_id}',
                'intra_picture': None,
                'games_won': 0,
                'total_points': 0
            }


class TournamentMatchConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.match_id = self.scope['url_route']['kwargs']['match_id']
        self.tournament_token = self.match_id.split('-')[0]
        self.room_group_name = f'match_{self.match_id}'

        session = self.scope.get('session', {})
        self.user_id = session.get('user_id')
        if not self.user_id:
            print(f"[DEBUG] No user_id en sesión para {self.match_id}")
            await self.close(code=4001)
            return

        # Verificar autorización
        tournament_data = tournament_rooms.get(self.tournament_token, {})
        match_key = self.match_id.split('-')[-1]
        expected_players = tournament_data.get(
            'matches', {}).get(match_key, {}).get('players', [])
        user_id_str = str(self.user_id)
        if user_id_str not in [str(p) for p in expected_players]:
            print(
                f"[DEBUG] {user_id_str} no autorizado para {self.match_id}. Expected: {expected_players}")
            await self.close(code=4003)
            return

        # Inicializar estado del juego si no existe
        if self.match_id not in match_states:
            player1_id = str(expected_players[0])
            player2_id = str(expected_players[1])
            match_states[self.match_id] = {
                'ball_x': 0.5, 'ball_y': 0.5,
                'ball_dx': 0.008 * random.choice([-1, 1]),
                'ball_dy': 0.008 * 0.8 * random.choice([-1, 1]),
                'player1_score': 0, 'player2_score': 0,
                'left_paddle': 0.5, 'right_paddle': 0.5,
                'player1_id': player1_id, 'player2_id': player2_id,
                'players': {},
                'ready': 0,
                'running': False,
            }

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        print(f"[DEBUG] Jugador {self.user_id} conectado a {self.match_id}")

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        if self.match_id in match_states:
            state = match_states[self.match_id]
            user_id_str = str(self.user_id)
            if user_id_str in state['players']:
                del state['players'][user_id_str]
                state['ready'] -= 1

                if state['running']:
                    # Partida en curso: dar victoria al oponente con 5-0
                    state['running'] = False
                    if 'ball_task' in state:
                        state['ball_task'].cancel()

                    winner_id = state['player1_id'] if user_id_str == state['player2_id'] else state['player2_id']
                    state['player1_score'] = 5 if state['player1_id'] == winner_id else 0
                    state['player2_score'] = 5 if state['player2_id'] == winner_id else 0

                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {
                            'type': 'game_over',
                            'winner': 1 if state['player1_id'] == winner_id else 2,
                            'player1_id': state['player1_id'],
                            'player2_id': state['player2_id'],
                            'player1_score': state['player1_score'],
                            'player2_score': state['player2_score'],
                            'message': 'El oponente se ha desconectado. ¡Has ganado!'
                        }
                    )
                    await self.channel_layer.group_send(
                        self.tournament_token,
                        {
                            'type': 'match_result',
                            'match_id': self.match_id,
                            'winner_id': int(winner_id),
                            'player1_score': state['player1_score'],
                            'player2_score': state['player2_score']
                        }
                    )
                    del match_states[self.match_id]
                    print(
                        f"[DEBUG] {self.match_id} terminado por desconexión. Ganador: {winner_id}")
                elif state['ready'] == 0:
                    del match_states[self.match_id]
                    print(
                        f"[DEBUG] Estado de {self.match_id} eliminado por desconexión total")

    async def receive(self, text_data):
        data = json.loads(text_data)
        action = data.get('action')
        state = match_states.get(self.match_id)
        if not state:
            print(f"[DEBUG] No hay estado para {self.match_id}")
            return

        user_id_str = str(self.user_id)

        if action == 'join':
            if user_id_str not in state['players']:
                player_number = 1 if user_id_str == state['player1_id'] else 2
                state['players'][user_id_str] = player_number
                state['ready'] += 1
                print(
                    f"[DEBUG] {self.user_id} se unió como player{player_number}, Ready: {state['ready']}")

                if state['ready'] == 2 and not state['running']:
                    state['running'] = True
                    player1_info = await self.get_user_info(state['player1_id'])
                    player2_info = await self.get_user_info(state['player2_id'])
                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {
                            'type': 'game_start',
                            'room_id': self.match_id,
                            'player1': player1_info,
                            'player2': player2_info
                        }
                    )
                    state['ball_task'] = asyncio.create_task(self.move_ball())
                    print(f"[DEBUG] Partida {self.match_id} iniciada")

        elif action == 'move':
            direction = data.get('direction')
            paddle_step = 0.025  # Misma velocidad que el frontend
            is_player1 = user_id_str == state['player1_id']
            paddle_key = 'left_paddle' if is_player1 else 'right_paddle'

            if direction == 'up':
                state[paddle_key] = max(0, state[paddle_key] - paddle_step)
            elif direction == 'down':
                state[paddle_key] = min(1, state[paddle_key] + paddle_step)

            print(
                f"[DEBUG] Moviendo {paddle_key} de {user_id_str} a {state[paddle_key]}")

            # Enviar actualización de ambas paletas a todos los clientes
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'update_paddle',
                    'left_paddle': state['left_paddle'],
                    'right_paddle': state['right_paddle']
                }
            )

        elif action == 'game_over':
            if user_id_str == data.get('player_id'):
                points_scored = data.get('points_scored', 0)
                has_won = data.get('has_won', False)
                await self.update_user_stats(await self.get_user(self.user_id), points_scored, has_won)
                print(f"[DEBUG] Estadísticas actualizadas para {self.user_id}")

    async def move_ball(self):
        try:
            state = match_states[self.match_id]
            paddle_height = 0.2
            base_speed = 0.008
            update_interval = 0.016  # Reducido de 0.02 a 0.016 para actualizaciones más frecuentes

            while state['running']:
                state['ball_x'] += state['ball_dx']
                state['ball_y'] += state['ball_dy']

                # Lógica de rebote en los bordes superior e inferior
                if state['ball_y'] <= 0 or state['ball_y'] >= 1:
                    state['ball_dy'] = -state['ball_dy'] * 1.02
                    state['ball_y'] = max(0.01, min(0.99, state['ball_y']))

                # Colisión con la paleta izquierda (player1)
                if (state['ball_x'] <= 0.03 and state['ball_x'] >= -0.01 and
                    state['ball_y'] >= state['left_paddle'] - paddle_height/2 and
                        state['ball_y'] <= state['left_paddle'] + paddle_height/2):
                    state['ball_dx'] = -state['ball_dx'] * 1.1
                    state['ball_x'] = 0.03
                    relative_intersection = (
                        state['ball_y'] - state['left_paddle']) / (paddle_height/2)
                    state['ball_dy'] = base_speed * 1.5 * relative_intersection

                # Colisión con la paleta derecha (player2)
                if (state['ball_x'] >= 0.97 and state['ball_x'] <= 1.01 and
                    state['ball_y'] >= state['right_paddle'] - paddle_height/2 and
                        state['ball_y'] <= state['right_paddle'] + paddle_height/2):
                    state['ball_dx'] = -state['ball_dx'] * 1.1
                    state['ball_x'] = 0.97
                    relative_intersection = (
                        state['ball_y'] - state['right_paddle']) / (paddle_height/2)
                    state['ball_dy'] = base_speed * 1.5 * relative_intersection

                # Punto para player2 si la bola pasa por la izquierda
                if state['ball_x'] < 0:
                    state['player2_score'] += 1
                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {'type': 'update_score',
                            'player1_score': state['player1_score'], 'player2_score': state['player2_score']}
                    )
                    self.reset_ball(state, base_speed)
                    await asyncio.sleep(1)

                # Punto para player1 si la bola pasa por la derecha
                if state['ball_x'] > 1:
                    state['player1_score'] += 1
                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {'type': 'update_score',
                            'player1_score': state['player1_score'], 'player2_score': state['player2_score']}
                    )
                    self.reset_ball(state, base_speed)
                    await asyncio.sleep(1)

                # Finalizar partida si alguien llega a 5 puntos
                if state['player1_score'] >= 5 or state['player2_score'] >= 5:
                    winner = 1 if state['player1_score'] >= 5 else 2
                    winner_id = state['player1_id'] if winner == 1 else state['player2_id']
                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {
                            'type': 'game_over',
                            'winner': winner,
                            'player1_id': state['player1_id'],
                            'player2_id': state['player2_id'],
                            'player1_score': state['player1_score'],
                            'player2_score': state['player2_score']
                        }
                    )
                    await self.channel_layer.group_send(
                        self.tournament_token,
                        {
                            'type': 'match_result',
                            'match_id': self.match_id,
                            'winner_id': int(winner_id),
                            'player1_score': state['player1_score'],
                            'player2_score': state['player2_score']
                        }
                    )
                    await self.save_game_results(self.match_id, state)
                    del match_states[self.match_id]
                    return

                # Enviar actualización de la bola a los clientes
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {'type': 'update_ball',
                        'ball_position_x': state['ball_x'], 'ball_position_y': state['ball_y']}
                )
                await asyncio.sleep(update_interval)

        except asyncio.CancelledError:
            print(f"[DEBUG] Tarea de pelota cancelada para {self.match_id}")
        except Exception as e:
            print(f"[ERROR] Error en move_ball: {e}")
            if self.match_id in match_states:
                del match_states[self.match_id]

    def reset_ball(self, state, base_speed):
        state['ball_x'] = 0.5
        state['ball_y'] = 0.5
        state['ball_dx'] = base_speed * random.choice([-1, 1])
        state['ball_dy'] = base_speed * 0.8 * random.choice([-1, 1])

    @database_sync_to_async
    def get_user(self, user_id):
        return User.objects.get(internal_id=user_id)

    @database_sync_to_async
    def save_game_results(self, match_id, state):
        game = Game.objects.filter(room_id=match_id).first()
        if not game:
            player1 = User.objects.get(internal_id=state['player1_id'])
            player2 = User.objects.get(internal_id=state['player2_id'])
            game = Game(player1=player1, player2=player2, room_id=match_id)
        game.player1_score = state['player1_score']
        game.player2_score = state['player2_score']
        game.is_active = False
        game.save()
        print(f"[DEBUG] Resultados guardados para {match_id}")

    @database_sync_to_async
    def get_user_info(self, user_id):
        try:
            user = User.objects.get(internal_id=user_id)
            return {
                'id': user.internal_id,
                'intra_id': user.intra_id,
                'intra_login': user.internal_login or user.intra_login,
                'intra_picture': user.intra_picture,
                'user_id': user.internal_id  # Asegúrate de incluir user_id
            }
        except User.DoesNotExist:
            return {'id': user_id, 'intra_login': f'Usuario {user_id}', 'intra_picture': None, 'user_id': user_id}

    @database_sync_to_async
    def update_user_stats(self, user, points_scored, has_won):
        user.games_played += 1
        user.total_points += points_scored
        if has_won:
            user.games_won += 1
        user.save()

    async def game_start(self, event):
        await self.send(text_data=json.dumps({
            'type': 'game_start',
            'room_id': event['room_id'],
            'player1': event['player1'],
            'player2': event['player2'],
            'user_id': str(self.user_id)
        }))

    async def update_paddle(self, event):
        await self.send(text_data=json.dumps({
            'type': 'update_paddle',
            'left_paddle': event['left_paddle'],
            'right_paddle': event['right_paddle']
        }))

    async def update_ball(self, event):
        await self.send(text_data=json.dumps(event))

    async def update_score(self, event):
        await self.send(text_data=json.dumps(event))

    async def player_disconnected(self, event):
        await self.send(text_data=json.dumps({
            'type': 'error',
            'message': 'El otro jugador se ha desconectado'
        }))

    async def game_over(self, event):
        winner = event.get('winner', 0)
        message = f'¡Jugador {winner} ha ganado!' if winner else 'Partida finalizada sin ganador'
        await self.send(text_data=json.dumps({
            'type': 'game_over',
            'winner': winner,
            'message': message,
            'player1_id': event.get('player1_id'),
            'player2_id': event.get('player2_id'),
            'player1_score': event.get('player1_score', 0),
            'player2_score': event.get('player2_score', 0)
        }))
