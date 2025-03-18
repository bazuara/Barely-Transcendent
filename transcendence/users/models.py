from django.db import models
from django.utils import timezone

class User(models.Model):
    internal_id = models.AutoField(primary_key=True)
    intra_id = models.IntegerField()
    intra_picture = models.URLField(max_length=255, blank=True, null=True)
    intra_login = models.CharField(max_length=100)
    intra_name = models.CharField(max_length=100)
    intra_surname = models.CharField(max_length=100)
    internal_login = models.CharField(
    max_length=100, unique=True, blank=True, null=True)
    internal_picture = models.URLField(max_length=255, blank=True, null=True)
    user_creation = models.DateTimeField(auto_now_add=True)
    last_online = models.DateTimeField(default=timezone.now)

    # Campos para estadísticas del juego
    games_played = models.IntegerField(default=0)
    games_won = models.IntegerField(default=0)
    total_points = models.IntegerField(default=0)

    def __str__(self):
        return str(self.intra_id)

   # anonimize user
    def anonimize(self):
        self.intra_id = 0
        self.intra_picture = "ANOYMOUS"
        self.intra_login = "ANOYMOUS"
        self.intra_name = "ANONYMOUS"
        self.intra_surname = "ANONYMOUS"
        # set internal login to ANONYMOUS + timestamp
        self.internal_login = "ANONYMOUS_" + str(timezone.now())
        self.internal_picture = "ANONYMOUS"
        self.user_creation = timezone.now()
        self.last_online = timezone.now()
        # log to console user is anonimized
        print(f"User {self.internal_id} is now anonimized")
        self.save()
