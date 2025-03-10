from django.shortcuts import render, redirect
from users.models import User
from django.utils import timezone

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

    template = "partials/home.html" if request.htmx else "home.html"

    return render(request, template)

def about(request):
    template = "partials/about.html" if request.htmx else "about.html"
    return render(request, template)