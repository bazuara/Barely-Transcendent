from users.models import User

def user_data(request):
    user = None
    if request.session.get('user_id'):
        try:
            user = User.objects.get(internal_id=request.session.get('user_id'))
        except User.DoesNotExist:
            pass
    return {'user': user}