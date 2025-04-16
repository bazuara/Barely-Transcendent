from django.contrib import admin
from .models import User
from pong.models import History

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('internal_id', 'intra_id', 'intra_login', 'internal_login', 'user_creation')
    search_fields = ('intra_login', 'internal_login', 'intra_name', 'intra_surname')

@admin.register(History)
class HistoryAdmin(admin.ModelAdmin):
    list_display = ('room_id', 'player1', 'player2', 'player1_score', 'player2_score', 'winner', 'timestamp')
    search_fields = ('room_id', 'player1__intra_login', 'player2__intra_login')
    list_filter = ('timestamp',)
    ordering = ('-timestamp',)