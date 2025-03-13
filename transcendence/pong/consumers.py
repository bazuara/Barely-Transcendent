import json
import asyncio
import random
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from users.models import User
from pong.models import Game

# Estas estructuras globales mantienen las conexiones de los jugadores
player_connections = {}  # Mapea IDs de usuario a sus conexiones (consumer)
waiting_players = []     # Lista de IDs de usuario en espera
active_games = {}        # Mapea room_ids a datos del juego

class PongConsumer(AsyncWebsocketConsumer):
    
    async def connect(self):
        """
        Maneja la conexión de un jugador.
        """
        print("[DEBUG] Nueva conexión WebSocket.")
        print(f"[DEBUG] Scope: {self.scope}")
        
        try:
            # Obtener el ID de usuario de la sesión directamente
            session = self.scope.get('session', {})
            user_id = session.get('user_id')
            
            if not user_id:
                print(f"[DEBUG] No se encontró user_id en la sesión. Datos de sesión: {session}")
                await self.close(code=4001)
                return
                
            # Obtener el usuario desde la base de datos
            try:
                self.user = await database_sync_to_async(User.objects.get)(internal_id=user_id)
                print(f"[DEBUG] Usuario autenticado correctamente: {self.user.internal_id}")
            except User.DoesNotExist:
                print(f"[DEBUG] Usuario con ID {user_id} no existe en la base de datos")
                await self.close(code=4002)
                return
            
            # Aceptar la conexión inmediatamente
            await self.accept()
            
            self.room_id = None
            self.session_id = f"session_{id(self)}"  # Identificador único para esta sesión/conexión
            
            # Registrar esta conexión para el usuario
            player_connections[self.user.internal_id] = self
            print(f"[DEBUG] Registrando conexión para el usuario {self.user.internal_id}")
            
            # Si el usuario ya está en la cola, no agregarlo de nuevo
            if self.user.internal_id in waiting_players:
                print(f"[DEBUG] El usuario {self.user.internal_id} ya está en la cola, no se añade de nuevo")
                await self.send(text_data=json.dumps({
                    'type': 'waiting',
                    'message': 'Ya estás en cola, esperando a otro jugador...'
                }))
                return
            
            # Añadir a la cola de espera
            waiting_players.append(self.user.internal_id)
            print(f"[DEBUG] Jugador {self.user.internal_id} añadido a la cola. Jugadores en espera: {waiting_players}")
            
            # Enviar mensaje de espera
            await self.send(text_data=json.dumps({
                'type': 'waiting',
                'message': 'Esperando a otro jugador...'
            }))
            print(f"[DEBUG] Jugador {self.user.internal_id} en espera.")
            
            # Verificar si podemos hacer emparejamiento
            await self.check_matchmaking()
            
        except Exception as e:
            print(f"[ERROR] Error general en la conexión WebSocket: {e}")
            await self.close(code=4000)
    
    async def check_matchmaking(self):
        """
        Verifica si hay suficientes jugadores para emparejar.
        """
        if len(waiting_players) >= 2:
            # Tomar los dos primeros jugadores diferentes
            player1_id = waiting_players[0]
            player2_id = None
            
            # Buscar un segundo jugador diferente
            for player_id in waiting_players[1:]:
                if player_id != player1_id:
                    player2_id = player_id
                    break
            
            # Si no encontramos un segundo jugador diferente, salir
            if player2_id is None:
                print(f"[DEBUG] No hay oponentes diferentes para {player1_id}")
                return
            
            # Remover ambos jugadores de la cola
            waiting_players.remove(player1_id)
            waiting_players.remove(player2_id)
            
            print(f"[DEBUG] Emparejando jugadores: {player1_id} vs {player2_id}")
            
            try:
                # Crear la partida
                game = await self.create_game(player1_id, player2_id)
                room_id = game.room_id
                print(f"[DEBUG] Partida creada con room_id: {room_id}")
                
                # Obtener las conexiones de ambos jugadores
                player1_conn = player_connections.get(player1_id)
                player2_conn = player_connections.get(player2_id)
                
                if player1_conn and player2_conn:
                    # Establecer el room_id para ambos jugadores
                    player1_conn.room_id = room_id
                    player2_conn.room_id = room_id
                    
                    # Añadir ambos jugadores al grupo
                    await player1_conn.channel_layer.group_add(room_id, player1_conn.channel_name)
                    await player2_conn.channel_layer.group_add(room_id, player2_conn.channel_name)
                    
                    print(f"[DEBUG] Ambos jugadores añadidos al grupo {room_id}")
                    
                    # Obtener la información de usuario para ambos jugadores
                    player1_info = await self.get_user_info(player1_id)
                    player2_info = await self.get_user_info(player2_id)
                    
                    # Configurar el estado del juego con velocidades más altas
                    base_speed = 0.015  # Velocidad base aumentada a 0.035
                    active_games[room_id] = {
                        'ball_x': 0.5,
                        'ball_y': 0.5,
                        'ball_dx': base_speed * random.choice([-1, 1]),
                        'ball_dy': base_speed * 0.8 * random.choice([-1, 1]),
                        'player1_score': 0,
                        'player2_score': 0,
                        'left_paddle': 0.5,
                        'right_paddle': 0.5,
                        'player1_id': player1_id,  # Guardar los IDs de los jugadores en el estado
                        'player2_id': player2_id
                    }
                    
                    # Iniciar el movimiento de la pelota
                    ball_task = asyncio.create_task(self.move_ball(room_id))
                    active_games[room_id]['ball_task'] = ball_task
                    
                    # Enviar mensaje de inicio de juego al grupo
                    await self.channel_layer.group_send(
                        room_id,
                        {
                            'type': 'game_start',
                            'room_id': room_id,
                            'player1': player1_info,
                            'player2': player2_info
                        }
                    )
                    print(f"[DEBUG] Notificando a los jugadores que la partida ha comenzado. Room ID: {room_id}")
                else:
                    print(f"[ERROR] No se encontraron las conexiones de los jugadores. P1: {player1_id in player_connections}, P2: {player2_id in player_connections}")
                    # Devolver los jugadores a la cola
                    waiting_players.extend([player1_id, player2_id])
            except Exception as e:
                print(f"[ERROR] Error al crear la partida: {e}")
                # Devolver los jugadores a la cola
                waiting_players.extend([player1_id, player2_id])
    
    @database_sync_to_async
    def get_user_info(self, user_id):
        """
        Obtiene información básica del usuario para enviar al cliente.
        """
        try:
            user = User.objects.get(internal_id=user_id)
            return {
                'id': user.internal_id,
                'intra_id': user.intra_id,
                'intra_login': user.internal_login or user.intra_login,  # Usar internal_login si está disponible
                'intra_picture': user.intra_picture
            }
        except User.DoesNotExist:
            return {
                'id': user_id,
                'intra_login': f'Usuario {user_id}',
                'intra_picture': None
            }
    
    async def move_ball(self, room_id):
        """
        Maneja el movimiento de la pelota.
        """
        try:
            game_data = active_games[room_id]
            paddle_height = 0.2  # Altura de la paleta en unidades normalizadas
            base_speed = 0.015   # Velocidad base para cálculos
            update_interval = 0.02  # 20ms = 50 FPS

            while room_id in active_games:
                # Actualizar posición de la pelota
                game_data['ball_x'] += game_data['ball_dx']
                game_data['ball_y'] += game_data['ball_dy']
                
                # Rebote en paredes superior e inferior
                if game_data['ball_y'] <= 0 or game_data['ball_y'] >= 1:
                    game_data['ball_dy'] = -game_data['ball_dy'] * 1.02
                    game_data['ball_y'] = max(0.01, min(0.99, game_data['ball_y']))
                
                # Colisión con paleta izquierda
                if (game_data['ball_x'] <= 0.02 and
                    game_data['ball_x'] >= -0.01 and
                    game_data['ball_y'] >= game_data['left_paddle'] - paddle_height/2 and 
                    game_data['ball_y'] <= game_data['left_paddle'] + paddle_height/2):
                    
                    game_data['ball_dx'] = -game_data['ball_dx'] * 1.1
                    game_data['ball_x'] = 0.02
                    relative_intersection = (game_data['ball_y'] - game_data['left_paddle']) / (paddle_height/2)
                    game_data['ball_dy'] = base_speed * 1.5 * relative_intersection
                
                # Colisión con paleta derecha
                if (game_data['ball_x'] >= 0.99 and
                    game_data['ball_x'] <= 1.01 and
                    game_data['ball_y'] >= game_data['right_paddle'] - paddle_height/2 and 
                    game_data['ball_y'] <= game_data['right_paddle'] + paddle_height/2):
                    
                    game_data['ball_dx'] = -game_data['ball_dx'] * 1.1
                    game_data['ball_x'] = 0.99
                    relative_intersection = (game_data['ball_y'] - game_data['right_paddle']) / (paddle_height/2)
                    game_data['ball_dy'] = base_speed * 1.5 * relative_intersection
                
                # Punto para jugador 2 (pelota sale por la izquierda)
                if game_data['ball_x'] < 0:
                    game_data['player2_score'] += 1
                    await self.channel_layer.group_send(
                        room_id,
                        {
                            'type': 'update_score',
                            'player1_score': game_data['player1_score'],
                            'player2_score': game_data['player2_score']
                        }
                    )
                    game_data['ball_x'] = 0.5
                    game_data['ball_y'] = 0.5
                    game_data['ball_dx'] = base_speed * random.choice([-1, 1])
                    game_data['ball_dy'] = base_speed * 0.8 * random.choice([-1, 1])
                    await asyncio.sleep(1)
                
                # Punto para jugador 1 (pelota sale por la derecha)
                if game_data['ball_x'] > 1:
                    game_data['player1_score'] += 1
                    await self.channel_layer.group_send(
                        room_id,
                        {
                            'type': 'update_score',
                            'player1_score': game_data['player1_score'],
                            'player2_score': game_data['player2_score']
                        }
                    )
                    game_data['ball_x'] = 0.5
                    game_data['ball_y'] = 0.5
                    game_data['ball_dx'] = base_speed * random.choice([-1, 1])
                    game_data['ball_dy'] = base_speed * 0.8 * random.choice([-1, 1])
                    await asyncio.sleep(1)
                
                # Verificar si algún jugador ha ganado
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
                    # Eliminar el juego de active_games solo al finalizar oficialmente
                    if room_id in active_games:
                        del active_games[room_id]
                    return
                
                # Enviar actualización de posición de la pelota
                await self.channel_layer.group_send(
                    room_id,
                    {
                        'type': 'update_ball',
                        'ball_position_x': game_data['ball_x'],
                        'ball_position_y': game_data['ball_y']
                    }
                )
                
                await asyncio.sleep(update_interval)
                    
        except asyncio.CancelledError:
            # No eliminamos active_games aquí, lo dejamos para player_disconnected
            print(f"[DEBUG] Tarea de movimiento de pelota cancelada para {room_id}")
        except Exception as e:
            print(f"[ERROR] Error en move_ball: {e}")
            if room_id in active_games:
                del active_games[room_id]

    @database_sync_to_async
    def save_game_results(self, room_id, game_data):
        """
        Guarda los resultados de la partida en la base de datos.
        """
        try:
            # Actualizar el objeto Game en la base de datos si es posible
            game = Game.objects.filter(room_id=room_id).first()
            if game:
                game.player1_score = game_data['player1_score']
                game.player2_score = game_data['player2_score']
                game.is_active = False
                game.save()
                
                # No necesitamos actualizar las estadísticas de usuario aquí
                # porque el cliente lo hará mediante el mensaje 'game_over'
                print(f"[DEBUG] Guardados resultados de partida {room_id} en la base de datos")
        except Exception as e:
            print(f"[ERROR] Error al guardar resultados de la partida: {e}")
    
    async def disconnect(self, close_code):
        """
        Maneja la desconexión de un jugador.
        """
        # Verificar si el usuario fue establecido antes de intentar acceder a él
        if hasattr(self, 'user') and self.user:
            print(f"[DEBUG] Desconexión de jugador {self.user.internal_id}. Código: {close_code}")
            
            # Eliminar esta conexión del registro
            if self.user.internal_id in player_connections:
                del player_connections[self.user.internal_id]
            
            # Si el jugador está en la cola de espera, quitarlo
            if self.user.internal_id in waiting_players:
                waiting_players.remove(self.user.internal_id)
                print(f"[DEBUG] Jugador {self.user.internal_id} eliminado de la cola de espera")
            
            # Si está en una sala, salir de ella
            if hasattr(self, 'room_id') and self.room_id:
                # Si el juego está activo, cancelar la tarea de movimiento de la pelota
                if self.room_id in active_games and 'ball_task' in active_games[self.room_id]:
                    active_games[self.room_id]['ball_task'].cancel()
                    print(f"[DEBUG] Cancelada tarea de movimiento de pelota para sala {self.room_id}")
                
                await self.channel_layer.group_discard(
                    self.room_id,
                    self.channel_name
                )
                print(f"[DEBUG] Jugador {self.user.internal_id} ha salido de la sala {self.room_id}")
                
                # Notificar a los demás jugadores que este jugador se ha desconectado
                await self.channel_layer.group_send(
                    self.room_id,
                    {
                        'type': 'player_disconnected',
                        'player_id': self.user.internal_id
                    }
                )
        else:
            print(f"[DEBUG] Desconexión de un usuario no autenticado. Código: {close_code}")

    async def receive(self, text_data):
        """
        Maneja los mensajes recibidos desde el frontend.
        """
        print(f"[DEBUG] Mensaje recibido: {text_data}")
        data = json.loads(text_data)
        action = data.get('action')
        message_type = data.get('type')

        if action == 'move_paddle':
            # Verificar que tenemos una sala asignada antes de enviar el mensaje
            if not hasattr(self, 'room_id') or not self.room_id:
                print(f"[WARNING] Intento de mover paleta sin sala asignada: {data}")
                return
            
            # Actualizar la posición de la paleta en el estado del juego
            if self.room_id in active_games:
                if data['player'] == 'player1':
                    active_games[self.room_id]['left_paddle'] = data['paddle_position']
                elif data['player'] == 'player2':
                    active_games[self.room_id]['right_paddle'] = data['paddle_position']
            
            # Enviar el movimiento de la paleta al otro jugador
            await self.channel_layer.group_send(
                self.room_id,
                {
                    'type': 'update_paddle',
                    'player': data['player'],
                    'paddle_position': data['paddle_position']
                }
            )
        elif action == 'game_over':
            # Actualizar estadísticas de los jugadores
            player_id = data['player_id']
            points_scored = data['points_scored']
            has_won = data['has_won']

            try:
                user = await database_sync_to_async(User.objects.get)(internal_id=player_id)
                await database_sync_to_async(self.update_user_stats)(user, points_scored, has_won)
                print(f"[DEBUG] Estadísticas actualizadas para usuario {player_id}: puntos={points_scored}, victoria={has_won}")
            except User.DoesNotExist:
                print(f"[ERROR] Usuario con ID {player_id} no encontrado para actualizar estadísticas.")
                
        elif message_type == 'join_queue':
            # Este mensaje ya se procesa en connect(), podemos ignorarlo aquí
            # Pero podemos verificar que el ID del usuario sea correcto
            user_id = data.get('user_id')
            if user_id and user_id != self.user.internal_id:
                print(f"[WARNING] ID de usuario en mensaje join_queue ({user_id}) no coincide con ID de sesión ({self.user.internal_id})")
            pass
        else:
            # Ignorar otros tipos de mensajes por ahora
            print(f"[DEBUG] Acción/tipo no reconocido: {action or message_type}")

    async def game_start(self, event):
        """
        Notifica a los jugadores que la partida ha comenzado.
        """
        print(f"[DEBUG] Consumer {self.session_id} enviando mensaje 'game_start' para usuario {self.user.internal_id}")
        await self.send(text_data=json.dumps({
            'type': 'game_start',
            'room_id': event['room_id'],  # Usar el room_id del evento
            'player1': event['player1'],
            'player2': event['player2'],
            'session_id': self.session_id  # Incluir ID de sesión para identificación del cliente
        }))

    async def update_paddle(self, event):
        """
        Envía la actualización de la posición de la paleta al frontend.
        """
        print(f"[DEBUG] Enviando actualización de paleta: {event}")
        await self.send(text_data=json.dumps({
            'type': 'update_paddle',
            'player': event['player'],
            'paddle_position': event['paddle_position']
        }))
    
    async def update_ball(self, event):
        """
        Envía la actualización de la posición de la pelota al frontend.
        """
        await self.send(text_data=json.dumps({
            'type': 'update_ball',
            'ball_position_x': event['ball_position_x'],
            'ball_position_y': event['ball_position_y']
        }))
    
    async def update_score(self, event):
        """
        Envía la actualización de puntuación al frontend.
        """
        await self.send(text_data=json.dumps({
            'type': 'update_score',
            'player1_score': event['player1_score'],
            'player2_score': event['player2_score']
        }))
        
    async def player_disconnected(self, event):
        """
        Notifica a los demás jugadores que un jugador se ha desconectado, solo si el juego está activo.
        """
        print(f"[DEBUG] Notificando desconexión del jugador {event['player_id']}")
        
        # Verificar si hay una sala asignada
        if hasattr(self, 'room_id') and self.room_id:
            # Si el juego está en active_games, significa que está activo
            if self.room_id in active_games:
                print(f"[DEBUG] El juego en {self.room_id} está activo, notificando desconexión")
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'El otro jugador se ha desconectado'
                }))
                
                # Cancelar la tarea de la pelota y limpiar el juego
                if 'ball_task' in active_games[self.room_id]:
                    active_games[self.room_id]['ball_task'].cancel()
                    print(f"[DEBUG] Tarea de movimiento de pelota cancelada para {self.room_id}")
                if self.room_id in active_games:
                    del active_games[self.room_id]
                    print(f"[DEBUG] Juego {self.room_id} eliminado de active_games debido a desconexión")
            else:
                print(f"[DEBUG] No se envía error: la partida en {self.room_id} ya terminó")
        else:
            print(f"[DEBUG] No se envía error: no hay room_id asignado")
    
    async def game_over(self, event):
        """
        Notifica el fin del juego al frontend.
        """
        winner = event.get('winner', 0)
        message = event.get('message', '')
        
        if not message:
            if winner == 0:
                message = 'Partida finalizada sin ganador'
            else:
                message = f'¡Jugador {winner} ha ganado!'
        
        await self.send(text_data=json.dumps({
            'type': 'game_over',
            'winner': winner,
            'message': message,
            'player1_id': event.get('player1_id'),
            'player2_id': event.get('player2_id'),
            'player1_score': event.get('player1_score', 0),
            'player2_score': event.get('player2_score', 0)
        }))

    @database_sync_to_async
    def create_game(self, player1_id, player2_id):
        """
        Crea una nueva partida en la base de datos.
        """
        print(f"[DEBUG] Creando partida entre {player1_id} y {player2_id}.")
        player1 = User.objects.get(internal_id=player1_id)
        player2 = User.objects.get(internal_id=player2_id)
        game = Game(player1=player1, player2=player2)
        game.save()
        return game

    def update_user_stats(self, user, points_scored, has_won):
        """
        Actualiza las estadísticas del usuario después de una partida.
        """
        print(f"[DEBUG] Actualizando estadísticas de {user.internal_id}.")
        user.games_played += 1
        user.total_points += points_scored
        if has_won:
            user.games_won += 1
        user.save()
        