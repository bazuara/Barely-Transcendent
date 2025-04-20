from django.shortcuts import render, redirect
from users.models import User
from pong.models import History
from django.utils import timezone
import time
from django.core.paginator import Paginator
from web3 import Web3
import json
from django.http import HttpResponse
from django.db.models import Q

# Configuración de la blockchain
ganache_url = "http://ganache:8545"
web3 = Web3(Web3.HTTPProvider(ganache_url)) # Conexión a Ganache

# Verificar conexión al iniciar
if web3.is_connected():
    print("[INFO] Conectado a la blockchain")
else:
    print("[ERROR] No se pudo conectar a la blockchain")

# Cargar ABI y dirección del contrato
with open('/app/build/contracts/Tournament.json') as f:
    contract_json = json.load(f)
    contract_abi = contract_json['abi']

with open('/app/build/contract_address.txt', 'r') as file:
    contract_address = file.read().strip()
contract = web3.eth.contract(address=contract_address, abi=contract_abi)

def get_all_tournaments():
    if not web3.is_connected():
        print("[ERROR] No se pudo conectar a la blockchain")
        return []
    try:
        # Obtener todos los torneos desde la blockchain
        matches = contract.functions.getMatches().call()
        tournaments = []
        for match in matches:
            # Verificar si los player_id son numéricos
            try:
                player_ids = [match[0], match[1], match[2], match[3]]
                # Intentar convertir cada ID a entero para validar
                for pid in player_ids:
                    int(pid)  # Lanza ValueError si no es numérico
            except (ValueError, TypeError):
                print(f"[INFO] Saltando torneo con IDs no numéricos: {player_ids}")
                continue  # Saltar este torneo

            tournament = {
                "player_id_1": match[0],
                "player_id_2": match[1],
                "player_id_3": match[2],
                "player_id_4": match[3],
                "score_match_1_2": match[4],
                "score_match_3_4": match[5],
                "score_match_final": match[6]
            }
            # Mapear IDs a nombres de usuario
            try:
                tournament['player_1_name'] = User.objects.get(internal_id=match[0]).intra_login
            except (User.DoesNotExist, ValueError):
                tournament['player_1_name'] = match[0]
            try:
                tournament['player_2_name'] = User.objects.get(internal_id=match[1]).intra_login
            except (User.DoesNotExist, ValueError):
                tournament['player_2_name'] = match[1]
            try:
                tournament['player_3_name'] = User.objects.get(internal_id=match[2]).intra_login
            except (User.DoesNotExist, ValueError):
                tournament['player_3_name'] = match[2]
            try:
                tournament['player_4_name'] = User.objects.get(internal_id=match[3]).intra_login
            except (User.DoesNotExist, ValueError):
                tournament['player_4_name'] = match[3]
            tournaments.append(tournament)
        return tournaments
    except Exception as e:
        print(f"[ERROR] Error al obtener torneos de la blockchain: {e}")
        return []

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

def tournament_history(request):
    user_id = request.session.get('user_id')
    if not user_id:
        return redirect('login')
    try:
        user = User.objects.get(internal_id=user_id)
    except User.DoesNotExist:
        request.session.flush()
        return redirect('login')

    # Obtener torneos desde la blockchain
    tournament_entries = get_all_tournaments()
    
    paginator = Paginator(tournament_entries, 10)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)

    context = {
        'user': user,
        'tournament_entries': page_obj,
        'cache_bust': int(time.time())
    }
    template = "partials/tournament_history.html" if request.htmx else "tournament_history.html"
    return render(request, template, context)

from django.shortcuts import render, redirect
from django.http import HttpResponse
from django.db.models import Q
from users.models import User
import time

def search_users(request):
    # Validar usuario mediante sesión
    user_id = request.session.get('user_id')
    user = None
    if user_id:
        try:
            user = User.objects.get(internal_id=user_id)
            user.last_online = timezone.now()
            user.save()
        except User.DoesNotExist:
            request.session.flush()
            return redirect('login')
    
    # Procesar búsqueda
    query = request.GET.get('q', '')
    users = []
    if query:
        try:
            users = User.objects.filter(
                Q(intra_login__icontains=query) | 
                Q(internal_login__icontains=query) | 
                Q(intra_name__icontains=query) | 
                Q(intra_surname__icontains=query)
            ).exclude(intra_login="ANONYMOUS")
            if user:
                users = users.exclude(internal_id=user.internal_id)[:10]
            else:
                users = users[:10]
        except Exception as e:
            print(f"Error en la búsqueda: {e}")
            return HttpResponse("Error en la búsqueda", status=500)
    
    # Procesar solicitud de añadir o eliminar amigo (HTMX)
    if request.htmx and request.POST:
        if not user:
            return HttpResponse('<div class="alert alert-danger">Debes iniciar sesión para gestionar amigos</div>')
        friend_id = request.POST.get('friend_id')
        query = request.POST.get('q', '')  # Mantener el query para la búsqueda
        try:
            friend = User.objects.get(internal_id=friend_id)
            if 'add_friend' in request.POST:
                user.friends.add(friend)
                message = '<div class="alert alert-success">Amigo añadido correctamente</div>'
            elif 'remove_friend' in request.POST:
                user.friends.remove(friend)
                message = '<div class="alert alert-success">Amigo eliminado correctamente</div>'
            else:
                return HttpResponse('<div class="alert alert-danger">Acción no válida</div>')
            
            # Re-renderizar los resultados después de añadir/eliminar amigo
            users = User.objects.filter(
                Q(intra_login__icontains=query) | 
                Q(intra_login__icontains=query) | 
                Q(intra_name__icontains=query) | 
                Q(intra_surname__icontains=query)
            ).exclude(intra_login="ANONYMOUS")
            if user:
                users = users.exclude(internal_id=user.internal_id)[:10]
            context = {
                'user': user,
                'users': users,
                'query': query,
                'cache_bust': int(time.time())
            }
            response = render(request, 'partials/search_results.html', context)
            # Añadir el mensaje de éxito al final del contenido
            response.content = response.content + message.encode()
            return response
        except User.DoesNotExist:
            return HttpResponse('<div class="alert alert-danger">Usuario no encontrado</div>')
    
    # Seleccionar plantilla según HTMX
    if request.htmx:
        template = 'partials/search_results.html'
    else:
        template = "search.html"
    
    # Preparar contexto
    context = {
        'user': user,
        'users': users,
        'query': query,
        'cache_bust': int(time.time())
    }
    
    return render(request, template, context)