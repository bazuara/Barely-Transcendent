import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from users.models import User
import redis
from transcendence.settings import REDIS_HOST, REDIS_PORT, REDIS_PASSWORD

# Conexión a Redis forzando la contraseña para probar
redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    db=0,
    decode_responses=True,
    password="super_secure_password"  # Usa la contraseña directamente para probar
)

class StatusConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Obtener el user_id desde la sesión
        session = self.scope.get("session", {})
        user_id = session.get("user_id")

        # Verificar si hay un user_id en la sesión
        if not user_id:
            print(f"[DEBUG] No se encontró user_id en la sesión: {session}")
            await self.close(code=4001)
            return

        # Obtener el usuario desde tu modelo personalizado usando el user_id
        try:
            self.user = await database_sync_to_async(User.objects.get)(internal_id=user_id)
            self.user_id = self.user.internal_id
            print(f"[DEBUG] Usuario autenticado: {self.user_id}")
        except User.DoesNotExist:
            print(f"[DEBUG] Usuario con ID {user_id} no existe")
            await self.close(code=4002)
            return

        # Añadir al usuario al grupo global para notificaciones
        self.group_name = "user_status"
        await self.channel_layer.group_add(self.group_name, self.channel_name)

        # Aceptar la conexión WebSocket
        await self.accept()

        # Incrementar el contador de conexiones y marcar como online
        await self.increment_user_connections(self.user_id)

        # Notificar a todos los clientes del grupo sobre el cambio (solo si pasa de offline a online)
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "user_status_update",
                "user_id": self.user_id,
                "status": "online"
            }
        )

    async def disconnect(self, close_code):
        # Solo proceder si el usuario está definido
        if hasattr(self, "user_id"):
            print(f"[DEBUG] Desconexión de {self.user_id}. Código: {close_code}")
            # Decrementar el contador de conexiones y verificar si se debe marcar como offline
            should_notify_offline = await self.decrement_user_connections(self.user_id)

            if should_notify_offline:
                # Notificar a todos los clientes del grupo sobre el cambio
                await self.channel_layer.group_send(
                    self.group_name,
                    {
                        "type": "user_status_update",
                        "user_id": self.user_id,
                        "status": "offline"
                    }
                )

            # Eliminar del grupo
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        message_type = data.get("type")

        if message_type == "request_all_users_status":
            # Obtener todos los usuarios online desde Redis
            online_users = await self.get_all_online_users()
            await self.send_all_users_status(online_users)
        elif message_type == "request_user_status":
            # Obtener el estado de un usuario específico
            user_id = data.get("user_id")
            if user_id:
                status = await self.get_user_status(user_id)
                await self.send_user_status(user_id, status)

    # Método para manejar actualizaciones de estado enviadas al grupo
    async def user_status_update(self, event):
        user_id = event["user_id"]
        status = event["status"]
        await self.send_user_status(user_id, status)

    # Métodos para manejar el estado y conexiones con Redis
    @database_sync_to_async
    def increment_user_connections(self, user_id):
        # Incrementar el contador de conexiones
        key = f"user_connections:{user_id}"
        redis_client.incr(key)
        # Establecer un TTL para la clave (por ejemplo, 1 hora)
        redis_client.expire(key, 3600)
        # Marcar como online en Redis
        redis_client.setex(f"user_status:{user_id}", 60, "online")
        redis_client.sadd("online_users", user_id)

    @database_sync_to_async
    def decrement_user_connections(self, user_id):
        # Decrementar el contador de conexiones
        key = f"user_connections:{user_id}"
        count = redis_client.decr(key)
        if count <= 0:
            # Si no hay más conexiones, marcar como offline
            redis_client.delete(f"user_status:{user_id}")
            redis_client.srem("online_users", user_id)
            redis_client.delete(key)  # Limpiar la clave de conexiones
            return True
        return False

    @database_sync_to_async
    def get_user_status(self, user_id):
        # Obtener el estado desde Redis
        status = redis_client.get(f"user_status:{user_id}")
        return "online" if status == "online" else "offline"

    @database_sync_to_async
    def get_all_online_users(self):
        # Obtener todos los usuarios online desde Redis
        online_users = redis_client.smembers("online_users")
        return [int(user_id) for user_id in online_users]

    # Método para enviar el estado de un usuario al cliente
    async def send_user_status(self, user_id, status):
        await self.send(text_data=json.dumps({
            "type": "user_status",
            "user_id": user_id,
            "status": status
        }))

    # Método para enviar el estado de todos los usuarios al cliente
    async def send_all_users_status(self, users_status):
        await self.send(text_data=json.dumps({
            "type": "all_users_status",
            "users_status": users_status  # Lista de IDs de usuarios online
        }))