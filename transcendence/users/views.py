import requests
from django.shortcuts import render, redirect
from django.conf import settings
from django.http import HttpResponse, HttpResponseServerError
from .models import User
from django.utils import timezone

#oauth_url = (
#    "https://api.intra.42.fr/oauth/authorize"
#    "?client_id=u-s4t2ud-254f5f29fbea7b7489f9a2b1a17fb2b605f2c7999426345b76aa3b17c9427855"
#    "&redirect_uri=http%3A%2F%2F127.0.0.1%3A8000%2Foauth%2Fcallback"
#    "&response_type=code"
#)

def profile(request):
    # Verificar si el usuario está autenticado
    user_id = request.session.get('user_id')
    if not user_id:
        return redirect('login')
    
    # Obtener el usuario
    try:
        user = User.objects.get(internal_id=user_id)
    except User.DoesNotExist:
        return redirect('login')
    
    # Renderizar la plantilla adecuada según si es una solicitud HTMX o no
    template = "partials/profile.html" if request.htmx else "profile.html"
    return render(request, template, {'user': user})


def update_profile(request):
    # Verificar si el usuario está autenticado
    user_id = request.session.get('user_id')
    if not user_id:
        return JsonResponse({'status': 'error', 'message': 'No estás autenticado'}, status=401)
    
    # Obtener el usuario
    try:
        user = User.objects.get(internal_id=user_id)
    except User.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Usuario no encontrado'}, status=404)
    
    # Actualizar datos si es una solicitud POST
    if request.method == 'POST':
        new_internal_login = request.POST.get('internal_login')
        
        # Validar que el nuevo login no esté ya usado por otro usuario
        if new_internal_login and new_internal_login != user.internal_login:
            if User.objects.filter(internal_login=new_internal_login).exists():
                return JsonResponse({'status': 'error', 'message': 'Este nombre de usuario ya está en uso'}, status=400)
            user.internal_login = new_internal_login
            request.session['intra_login'] = new_internal_login  # Actualizar sesión

        # Manejar la carga de una nueva imagen (implementar después si se necesita)
        # if 'internal_picture' in request.FILES:
        #     # Lógica para manejar la imagen
            
        user.save()
        
        if request.htmx:
            return render(request, "partials/profile.html", {'user': user, 'success': True})
        return JsonResponse({'status': 'success', 'message': 'Perfil actualizado correctamente'})
    
    # Si no es POST, redirigir a la página de perfil
    return redirect('profile')


def login(request):
    # Solo redirigir si hay un usuario autenticado
    if request.session.get('user_id'):
        return redirect('home')
    
    template = "partials/login.html" if request.htmx else "login.html"
    
    # Construir la URL de autorización OAuth
    oauth_url = (
        f"{settings.OAUTH_42_AUTHORIZATION_URL}"
        f"?client_id={settings.OAUTH_42_CLIENT_ID}"
        f"&redirect_uri={settings.OAUTH_42_REDIRECT_URI}"
        f"&response_type=code"
    )
    
    context = {
        'oauth_url': oauth_url
    }
    
    return render(request, template, context)

def oauth_callback(request):
    code = request.GET.get('code')
    
    if not code:
        return HttpResponseServerError("No se recibió un código de autorización")
    
    # Intercambiar el código por un token de acceso
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
        
        # Obtener información del usuario desde la API de 42
        headers = {'Authorization': f'Bearer {access_token}'}
        user_response = requests.get(settings.OAUTH_42_API_URL, headers=headers)
        
        if user_response.status_code != 200:
            return HttpResponseServerError(f"Error al obtener información del usuario: {user_response.text}")
        
        user_data = user_response.json()
        
        # Buscar o crear el usuario en nuestra base de datos
        try:
            user = User.objects.get(intra_id=user_data['id'])
            # Actualizar datos del usuario existente
            user.intra_picture = user_data.get('image', {}).get('link', '')
            user.intra_name = user_data.get('first_name', '')
            user.intra_surname = user_data.get('last_name', '')
            user.last_online = timezone.now()
            user.save()
        except User.DoesNotExist:
            # Crear nuevo usuario
            user = User(
                intra_id=user_data['id'],
                intra_login=user_data.get('login', ''),
                intra_picture=user_data.get('image', {}).get('link', ''),
                intra_name=user_data.get('first_name', ''),
                intra_surname=user_data.get('last_name', ''),
                internal_login=user_data.get('login', '')  # Por defecto, usar el mismo login
            )
            user.save()
        
        # Guardar información de usuario en la sesión
        request.session['user_id'] = user.internal_id
        request.session['intra_login'] = user.intra_login
        
        # Redirigir a la página de inicio
        return redirect('home')
    
    except Exception as e:
        return HttpResponseServerError(f"Error durante el proceso de OAuth: {str(e)}")
    
# En users/views.py
def logout(request):
    request.session.flush()
    return redirect('login')