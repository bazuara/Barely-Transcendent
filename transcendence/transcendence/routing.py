from django.urls import path
from .consumers import ChatConsumer
from pong.consumers import PongConsumer, TournamentConsumer, TournamentMatchConsumer  # Importar el nuevo consumidor

def get_pong_consumer():
    from pong.consumers import PongConsumer
    return PongConsumer

websocket_urlpatterns = [
    path('ws/chat/', ChatConsumer.as_asgi()),
    path('ws/pong/', get_pong_consumer().as_asgi()),
    path('ws/tournament/', TournamentConsumer.as_asgi()),  # Nueva ruta para torneos
    path('ws/tournament-match/<str:match_id>/', TournamentMatchConsumer.as_asgi()),  # Nueva ruta para partidas de torneos as_asgi
]