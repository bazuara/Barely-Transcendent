from django.contrib import admin
from django.urls import path, include
from transcendence import views
from django.conf import settings
from django.conf.urls.static import static
from users.views import login, oauth_callback, logout, profile, update_profile, mock_login, anonimize, search_users

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', login, name='login'),
    path('oauth/callback', oauth_callback, name='oauth_callback'),
    path('home/', views.home, name='home'),
    path('search/', search_users, name='search_users'),  # New URL for search
    path('about/', views.about, name='about'),
    path('logout/', logout, name='logout'),
    path('profile/', profile, name='profile'),
    path('profile/update/', update_profile, name='update_profile'),
    path('pong/', views.pong, name='pong'),
    path('tournament/', views.tournament, name='tournament'),
    path('mock-login/<str:username>/', mock_login, name='mock_login'),
    path('history/', views.history, name='history'),
    path('tournament-history/', views.tournament_history, name='tournament_history'),
    path('profile/anonimize/', anonimize, name='anonimize'),
    path("prometheus/", include("django_prometheus.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)