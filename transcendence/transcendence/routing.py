from django.urls import path
from .consumers import ChatConsumer

# Importa de manera perezosa para evitar problemas de importación circular
def get_pong_consumer():
    from pong.consumers import PongConsumer
    return PongConsumer

# Las rutas WebSocket
websocket_urlpatterns = [
    path('ws/chat/', ChatConsumer.as_asgi()),
    path('ws/pong/', get_pong_consumer().as_asgi()),
]