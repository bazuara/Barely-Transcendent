FROM python:3.13.2-slim
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		postgresql-client \
	&& rm -rf /var/lib/apt/lists/*

# Set environment variables 
# Prevents Python from writing pyc files to disk
ENV PYTHONDONTWRITEBYTECODE=1
#Prevents Python from buffering stdout and stderr
ENV PYTHONUNBUFFERED=1 

# copy all external files to the container
COPY . /app
WORKDIR /app
 
# Upgrade pip
RUN pip install --upgrade pip 
# Install dependencies
RUN pip install -r image_requirements.txt

# Expose the application port
EXPOSE 8000 


RUN pip install -r requirements.txt
# RUN python transcendence/manage.py migrate
# RUN python transcendence/manage.py collectstatic --noinput

# Set the working directory
WORKDIR /app
# run server with python -m daphne -b 0.0.0.0 -p 8000 transcendence.asgi:application
CMD ["sh", "-c", "python transcendence/manage.py migrate && python transcendence/manage.py collectstatic --noinput && cd transcendence && python -m daphne -b 0.0.0.0 -p 8000 transcendence.asgi:application"]