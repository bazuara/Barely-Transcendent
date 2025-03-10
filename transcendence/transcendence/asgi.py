import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
import transcendence.routing  # Reemplaza "transcendence" por el nombre real de tu app

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "transcendence.settings")

application = ProtocolTypeRouter(
    {
        "http": get_asgi_application(),
        "websocket": AuthMiddlewareStack(
            URLRouter(transcendence.routing.websocket_urlpatterns)
        ),
    }
)
