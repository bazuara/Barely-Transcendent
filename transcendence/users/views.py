import requests
from django.shortcuts import render, redirect, get_object_or_404
from django.conf import settings
from django.http import HttpResponse, HttpResponseServerError, JsonResponse
from .models import User
from django.utils import timezone
from django.contrib.auth import login as auth_login
import os
import time
from django.db.models import Q


def profile(request):
    user_id = request.session.get('user_id')
    if not user_id:
        return redirect('login')
    try:
        user = User.objects.get(internal_id=user_id)
    except User.DoesNotExist:
        return redirect('login')
    template = "partials/profile.html" if request.htmx else "profile.html"
    # Añadir timestamp para evitar caché
    context = {
        'user': user,
        'cache_bust': int(time.time())
    }
    return render(request, template, context)


def update_profile(request):
    user_id = request.session.get('user_id')
    if not user_id:
        return JsonResponse({'status': 'error', 'message': 'No estás autenticado'}, status=401)

    try:
        user = User.objects.get(internal_id=user_id)
    except User.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Usuario no encontrado'}, status=404)

    if request.method == 'POST':
        new_internal_login = request.POST.get('internal_login')
        new_internal_picture = request.FILES.get('internal_picture')

        if new_internal_login and (len(new_internal_login) < 3 or len(new_internal_login) > 12):
            return JsonResponse({'status': 'error', 'message': 'El nombre de usuario debe tener entre 3 y 12 caracteres'}, status=400)
        if new_internal_login and not all(c.isalnum() or c in ['-', '_'] for c in new_internal_login):
            return JsonResponse({'status': 'error', 'message': 'El nombre de usuario solo puede contener letras, números, guiones y guiones bajos'}, status=400)

        if new_internal_login and new_internal_login != user.internal_login:
            if User.objects.filter(internal_login=new_internal_login).exists() or \
               User.objects.exclude(internal_id=user.internal_id).filter(intra_login=new_internal_login).exists():
                return JsonResponse({'status': 'error', 'message': 'Este nombre ya está en uso (como nombre personalizado o de cuenta)'}, status=400)
            user.internal_login = new_internal_login
            request.session['intra_login'] = new_internal_login

        if new_internal_picture:
            if not new_internal_picture.name.lower().endswith('.png'):
                return JsonResponse({'status': 'error', 'message': 'La imagen debe ser un archivo PNG'}, status=400)
            if user.internal_picture:
                if os.path.isfile(user.internal_picture.path):
                    os.remove(user.internal_picture.path)
            user.internal_picture = new_internal_picture
        elif 'internal_picture' in request.POST and not new_internal_picture:
            if user.internal_picture:
                if os.path.isfile(user.internal_picture.path):
                    os.remove(user.internal_picture.path)
                user.internal_picture = None

        user.save()

        if request.htmx:
            # Añadir timestamp para evitar caché
            context = {
                'user': user,
                'success': True,
                'cache_bust': int(time.time())
            }
            return render(request, "partials/profile.html", context)
        return JsonResponse({'status': 'success', 'message': 'Perfil actualizado correctamente'})

    return redirect('profile')


def login(request):
    if request.session.get('user_id'):
        return redirect('home')

    template = "partials/login.html" if request.htmx else "login.html"
    oauth_url = (
        f"{settings.OAUTH_42_AUTHORIZATION_URL}"
        f"?client_id={settings.OAUTH_42_CLIENT_ID}"
        f"&redirect_uri={settings.OAUTH_42_REDIRECT_URI}"
        f"&response_type=code"
    )
    return render(request, template, {'oauth_url': oauth_url})


def oauth_callback(request):
    code = request.GET.get('code')
    if not code:
        return HttpResponseServerError("No se recibió un código de autorización")

    token_data = {
        'grant_type': 'authorization_code',
        'client_id': settings.OAUTH_42_CLIENT_ID,
        'client_secret': settings.OAUTH_42_CLIENT_SECRET,
        'code': code,
        'redirect_uri': settings.OAUTH_42_REDIRECT_URI
    }

    try:
        token_response = requests.post(settings.OAUTH_42_TOKEN_URL, data=token_data)
        if token_response.status_code != 200:
            return HttpResponseServerError(f"Error al obtener el token de acceso: {token_response.text}")

        token_info = token_response.json()
        access_token = token_info.get('access_token')
        headers = {'Authorization': f'Bearer {access_token}'}
        user_response = requests.get(settings.OAUTH_42_API_URL, headers=headers)

        if user_response.status_code != 200:
            return HttpResponseServerError(f"Error al obtener información del usuario: {user_response.text}")

        user_data = user_response.json()
        try:
            user = User.objects.get(intra_id=user_data['id'])
            user.intra_picture = user_data.get('image', {}).get('link', '')
            user.intra_name = user_data.get('first_name', '')
            user.intra_surname = user_data.get('last_name', '')
            user.last_online = timezone.now()
            user.save()
        except User.DoesNotExist:
            user = User(
                intra_id=user_data['id'],
                intra_login=user_data.get('login', ''),
                intra_picture=user_data.get('image', {}).get('link', ''),
                intra_name=user_data.get('first_name', ''),
                intra_surname=user_data.get('last_name', ''),
                internal_login=user_data.get('login', '')
            )
            user.save()

        request.session['user_id'] = user.internal_id
        request.session['intra_login'] = user.intra_login
        return redirect('home')

    except Exception as e:
        return HttpResponseServerError(f"Error durante el proceso de OAuth: {str(e)}")


def logout(request):
    request.session.flush()
    return redirect('login')


def mock_login(request, username):
    user = User.objects.filter(intra_login=username).first()
    if user:
        request.session['user_id'] = user.internal_id
        return JsonResponse({"status": "success", "message": f"Mock login successful for {username}"})
    return JsonResponse({"status": "error", "message": "User not found"}, status=400)


def anonimize(request):
    user_id = request.session.get('user_id')
    print(f"User {user_id} ready for anonimize")
    if not user_id:
        return redirect('login')

    try:
        user = User.objects.get(internal_id=user_id)
        user.anonimize()
    except User.DoesNotExist:
        pass

    request.session.flush()
    return redirect('login')

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
    elif user:  # Si no hay query y el usuario está autenticado, mostrar amigos
        try:
            users = user.friends.all().exclude(intra_login="ANONYMOUS")[:10]
        except Exception as e:
            print(f"Error al obtener amigos: {e}")
            return HttpResponse("Error al obtener amigos", status=500)
    
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
            if query:
                users = User.objects.filter(
                    Q(intra_login__icontains=query) | 
                    Q(internal_login__icontains=query) | 
                    Q(intra_name__icontains=query) | 
                    Q(intra_surname__icontains=query)
                ).exclude(intra_login="ANONYMOUS")
                if user:
                    users = users.exclude(internal_id=user.internal_id)[:10]
            else:
                users = user.friends.all().exclude(intra_login="ANONYMOUS")[:10]
            
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