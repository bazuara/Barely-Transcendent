from django.contrib import admin
from .models import User

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('internal_id', 'intra_id', 'intra_login', 'internal_login', 'user_creation')
    search_fields = ('intra_login', 'internal_login', 'intra_name', 'intra_surname')