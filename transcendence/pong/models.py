from django.db import models
from users.models import User  # Importa tu modelo personalizado de usuario

class Game(models.Model):
    # Identificador único de la partida (se genera automáticamente)
    room_id = models.CharField(max_length=100, unique=True)

    # Jugadores
    player1 = models.ForeignKey(User, on_delete=models.CASCADE, related_name='games_as_player1')
    player2 = models.ForeignKey(User, on_delete=models.CASCADE, related_name='games_as_player2')

    # Estado del juego
    player1_score = models.IntegerField(default=0)
    player2_score = models.IntegerField(default=0)
    ball_position_x = models.FloatField(default=0.5)  # Posición X de la pelota (normalizada)
    ball_position_y = models.FloatField(default=0.5)  # Posición Y de la pelota (normalizada)
    paddle1_position = models.FloatField(default=0.5)  # Posición de la paleta del jugador 1 (normalizada)
    paddle2_position = models.FloatField(default=0.5)  # Posición de la paleta del jugador 2 (normalizada)

    # Fecha de creación de la partida
    created_at = models.DateTimeField(auto_now_add=True)

    # Estado de la partida (activa/finalizada)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"Partida {self.room_id} ({self.player1.intra_login} vs {self.player2.intra_login})"

    def save(self, *args, **kwargs):
        """
        Genera un room_id único antes de guardar la partida.
        """
        if not self.room_id:
            self.room_id = self.generate_room_id()
        super().save(*args, **kwargs)

    @staticmethod
    def generate_room_id():
        """
        Genera un identificador único para la partida.
        """
        import uuid
        return str(uuid.uuid4())
