from django.shortcuts import render


def home(request):
    template = "partials/home.html" if request.htmx else "home.html"
    return render(request, template)


def about(request):
    template = "partials/about.html" if request.htmx else "about.html"
    return render(request, template)
