from django.urls import path
from .consumers import StatusConsumer  # Importar el consumidor de estado
from pong.consumers import PongConsumer, TournamentConsumer, TournamentMatchConsumer  # Importar el nuevo consumidor


websocket_urlpatterns = [
    path('ws/status/', StatusConsumer.as_asgi()),
    path('ws/pong/', PongConsumer.as_asgi()),
    path('ws/tournament/', TournamentConsumer.as_asgi()),  # Nueva ruta para torneos
    path('ws/tournament-match/<str:match_id>/', TournamentMatchConsumer.as_asgi()),  # Nueva ruta para partidas de torneos as_asgi
]