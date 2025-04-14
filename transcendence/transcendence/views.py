from django.shortcuts import render, redirect
from users.models import User
from django.utils import timezone
import time


def home(request):
    # Obtener el ID del usuario de la sesión
    user_id = request.session.get('user_id')

    if not user_id:
        return redirect('login')

    # Obtener el usuario de la base de datos
    try:
        user = User.objects.get(internal_id=user_id)
        # Actualizar última conexión
        user.last_online = timezone.now()
        user.save()
    except User.DoesNotExist:
        # Si el usuario no existe, redirigir a login
        request.session.flush()
        return redirect('login')

    # Obtener el Top 10 de jugadores por games_won
    top_players = User.objects.order_by('-games_won')[:10]

    # Preparar el contexto con el usuario, el ranking y un timestamp para evitar caché
    context = {
        'user': user,
        'top_players': top_players,
        'cache_bust': int(time.time())
    }

    template = "partials/home.html" if request.htmx else "home.html"

    return render(request, template, context)


def about(request):
    template = "partials/about.html" if request.htmx else "about.html"
    return render(request, template)


def pong(request):
    # Verificar si el usuario está autenticado
    user_id = request.session.get('user_id')
    if not user_id:
        return redirect('login')
    
    template = "partials/pong.html" if request.htmx else "pong.html"
    return render(request, template)


def tournament(request):
    # Verificar si el usuario está autenticado
    user_id = request.session.get('user_id')
    if not user_id:
        return redirect('login')
    
    template = "partials/tournament.html" if request.htmx else "tournament.html"
    return render(request, template)