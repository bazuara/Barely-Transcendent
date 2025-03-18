FROM python:3.13.2-slim
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		postgresql-client \
		iputils-ping \
		git \
		ssh \
		curl \
	&& rm -rf /var/lib/apt/lists/*

# Set environment variables 
# Prevents Python from writing pyc files to disk
ENV PYTHONDONTWRITEBYTECODE=1
#Prevents Python from buffering stdout and stderr
ENV PYTHONUNBUFFERED=1 
 
# Upgrade pip
RUN pip install --upgrade pip 
# Install dependencies
COPY image_requirements.txt .
RUN pip install -r image_requirements.txt

# Expose the application port
EXPOSE 8000 

# Create a non-root user
RUN adduser --disabled-password --gecos '' vscodeuser
# Switch to non root user
USER vscodeuser