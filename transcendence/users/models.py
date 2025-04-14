from django.db import models
from django.utils import timezone
import os


def user_profile_picture_path(instance, filename):
    # Guardar la imagen como <intra_id>.png
    ext = 'png'  # Forzamos la extensión a PNG
    return os.path.join('profile_pictures', f'{instance.intra_id}.{ext}')


class User(models.Model):
    internal_id = models.AutoField(primary_key=True)
    intra_id = models.IntegerField()
    intra_picture = models.URLField(max_length=255, blank=True, null=True)
    intra_login = models.CharField(max_length=100)
    intra_name = models.CharField(max_length=100)
    intra_surname = models.CharField(max_length=100)
    internal_login = models.CharField(
        max_length=100, unique=True, blank=True, null=True)
    internal_picture = models.ImageField(
        upload_to=user_profile_picture_path, blank=True, null=True)
    user_creation = models.DateTimeField(auto_now_add=True)
    last_online = models.DateTimeField(default=timezone.now)

    # Campos para estadísticas del juego
    games_played = models.IntegerField(default=0)
    games_won = models.IntegerField(default=0)
    total_points = models.IntegerField(default=0)

    def __str__(self):
        return str(self.intra_id)

    def anonimize(self):
        # Eliminar la imagen física si existe
        if self.internal_picture:
            if os.path.isfile(self.internal_picture.path):
                os.remove(self.internal_picture.path)
            self.internal_picture = None

        self.intra_id = 0
        self.intra_picture = "/static/default-avatar.png"
        self.intra_login = "ANONYMOUS"
        self.intra_name = "ANONYMOUS"
        self.intra_surname = "ANONYMOUS"
        self.internal_login = "ANONYMOUS_" + str(timezone.now())
        self.user_creation = timezone.now()
        self.last_online = timezone.now()
        print(f"User {self.internal_id} is now anonimized")
        self.save()