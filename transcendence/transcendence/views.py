from django.shortcuts import render, redirect
from users.models import User
from pong.models import History
from django.utils import timezone
import time
from django.core.paginator import Paginator

def home(request):
    user_id = request.session.get('user_id')
    if not user_id:
        return redirect('login')
    try:
        user = User.objects.get(internal_id=user_id)
        user.last_online = timezone.now()
        user.save()
    except User.DoesNotExist:
        request.session.flush()
        return redirect('login')
    top_players = User.objects.order_by('-games_won')[:10]
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
    user_id = request.session.get('user_id')
    if not user_id:
        return redirect('login')
    template = "partials/pong.html" if request.htmx else "pong.html"
    return render(request, template)


def tournament(request):
    user_id = request.session.get('user_id')
    if not user_id:
        return redirect('login')
    template = "partials/tournament.html" if request.htmx else "tournament.html"
    return render(request, template)


def history(request):
    user_id = request.session.get('user_id')
    if not user_id:
        return redirect('login')
    try:
        user = User.objects.get(internal_id=user_id)
    except User.DoesNotExist:
        request.session.flush()
        return redirect('login')

    history_entries = History.objects.select_related('player1', 'player2', 'winner').all().order_by('-timestamp')
    paginator = Paginator(history_entries, 10)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)

    context = {
        'user': user,
        'history_entries': page_obj,
        'cache_bust': int(time.time())
    }
    template = "partials/history.html" if request.htmx else "history.html"
    return render(request, template, context)