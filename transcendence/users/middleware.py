# En users/middleware.py
from django.shortcuts import redirect
from django.urls import reverse

class AuthRequiredMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Rutas que no requieren autenticación
        exempt_paths = [
            reverse('login'),
            reverse('oauth_callback'),
            '/admin/',
        ]
        
        # Comprobar si la ruta actual necesita autenticación
        exempt = False
        for path in exempt_paths:
            if request.path.startswith(path):
                exempt = True
                break
        
        if not exempt and not request.session.get('user_id'):
            return redirect('login')
        
        response = self.get_response(request)
        return response
    

class UserMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Si el usuario está autenticado, añadir el objeto usuario a la solicitud
        user_id = request.session.get('user_id')
        if user_id:
            try:
                request.user_obj = User.objects.get(internal_id=user_id)
            except User.DoesNotExist:
                # Si el usuario no existe en la base de datos, limpiar la sesión
                request.session.flush()
                
        response = self.get_response(request)
        return response

