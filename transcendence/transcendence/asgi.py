import os
import django

# Configurar Django antes de cualquier importación que use modelos
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "transcendence.settings")
django.setup()  # Esta línea es crucial - inicializa la aplicación Django

# Ahora importamos el resto de las dependencias
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from transcendence.routing import websocket_urlpatterns  # Importamos solo la variable
#from pong.consumers import tournament_rooms, tournament_connections

#tournament_rooms.clear()
#tournament_connections.clear()
#print("[DEBUG] Estado inicial limpiado")

application = ProtocolTypeRouter(
    {
        "http": get_asgi_application(),
        "websocket": AuthMiddlewareStack(
            URLRouter(websocket_urlpatterns)
        ),
    }
)