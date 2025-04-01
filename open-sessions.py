import subprocess
import time

# URLs a visitar
urls = [
    "http://127.0.0.1:8000/mock-login/Test",
    "http://127.0.0.1:8000/mock-login/Test2",
    "http://127.0.0.1:8000/mock-login/Test3",
]

# Comandos para abrir navegadores en ventanas separadas
subprocess.Popen(["google-chrome", "--incognito", urls[0]])
subprocess.Popen(["firefox", urls[1]])
subprocess.Popen(["firefox", "--private-window", urls[2]])

# Esperamos unos segundos para que se carguen las páginas
time.sleep(3)

# Redirigir cada ventana a /profile
subprocess.Popen(["xdotool", "search", "--onlyvisible", "--class", "google-chrome", "windowactivate", "--sync", "key", "ctrl+l", "type", "http://127.0.0.1:8000/profile", "key", "Return"])
subprocess.Popen(["xdotool", "search", "--onlyvisible", "--class", "firefox", "windowactivate", "--sync", "key", "ctrl+l", "type", "http://127.0.0.1:8000/profile", "key", "Return"])

