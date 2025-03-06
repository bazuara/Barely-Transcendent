import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from users.models import User
from pong.models import Game

# Cola de espera para emparejar jugadores
waiting_players = []

class PongConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        """
        Maneja la conexión de un jugador.
        """
        print("[DEBUG] Nueva conexión WebSocket.")
        self.user = self.scope['user']  # Usuario autenticado
        self.room_id = None

        # Añadir el jugador a la cola de espera
        waiting_players.append(self.user.internal_id)
        print(f"[DEBUG] Jugador {self.user.internal_id} añadido a la cola. Jugadores en espera: {waiting_players}")

        # Si hay al menos dos jugadores en la cola, emparejarlos
        if len(waiting_players) >= 2:
            player1_id = waiting_players.pop(0)
            player2_id = waiting_players.pop(0)
            print(f"[DEBUG] Emparejando jugadores: {player1_id} vs {player2_id}")

            # Crear una nueva partida
            game = await self.create_game(player1_id, player2_id)
            self.room_id = game.room_id
            print(f"[DEBUG] Partida creada con room_id: {self.room_id}")

            # Notificar a ambos jugadores que la partida ha comenzado
            await self.channel_layer.group_add(
                self.room_id,
                self.channel_name
            )
            await self.accept()

            await self.channel_layer.group_send(
                self.room_id,
                {
                    'type': 'game_start',
                    'room_id': self.room_id,
                    'player1': player1_id,
                    'player2': player2_id
                }
            )
            print(f"[DEBUG] Notificando a los jugadores que la partida ha comenzado.")
        else:
            # Aceptar la conexión pero mantener al jugador en espera
            await self.accept()
            await self.send(text_data=json.dumps({
                'type': 'waiting',
                'message': 'Esperando a otro jugador...'
            }))
            print(f"[DEBUG] Jugador {self.user.internal_id} en espera.")

    async def disconnect(self, close_code):
        """
        Maneja la desconexión de un jugador.
        """
        print(f"[DEBUG] Desconexión de jugador {self.user.internal_id}. Código: {close_code}")
        if self.room_id:
            # Salir del grupo (sala) de la partida
            await self.channel_layer.group_discard(
                self.room_id,
                self.channel_name
            )

    async def receive(self, text_data):
        """
        Maneja los mensajes recibidos desde el frontend.
        """
        print(f"[DEBUG] Mensaje recibido: {text_data}")
        data = json.loads(text_data)
        action = data.get('action')

        if action == 'move_paddle':
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

            user = await database_sync_to_async(User.objects.get)(internal_id=player_id)
            await database_sync_to_async(self.update_user_stats)(user, points_scored, has_won)

    async def game_start(self, event):
        """
        Notifica a los jugadores que la partida ha comenzado.
        """
        print(f"[DEBUG] Enviando mensaje 'game_start' a los jugadores.")
        await self.send(text_data=json.dumps({
            'type': 'game_start',
            'room_id': self.room_id,  # Enviar el room_id al frontend
            'player1': event['player1'],
            'player2': event['player2']
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
