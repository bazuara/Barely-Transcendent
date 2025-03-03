from django.db import models
from django.utils import timezone


class User(models.Model):
    internal_id = models.AutoField(primary_key=True)
    intra_id = models.IntegerField(unique=True)
    intra_picture = models.URLField(max_length=255, blank=True, null=True)
    intra_login = models.CharField(max_length=100, unique=True)
    intra_name = models.CharField(max_length=100)
    intra_surname = models.CharField(max_length=100)
    internal_login = models.CharField(max_length=100, unique=True, blank=True, null=True)
    internal_picture = models.URLField(max_length=255, blank=True, null=True)
    user_creation = models.DateTimeField(auto_now_add=True)
    last_online = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return str(self.intra_id)
    