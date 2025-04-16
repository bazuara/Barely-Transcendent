#!/bin/sh
set -e

echo "⏳ Generando certificado autofirmado..."

# Extraer CAMPUS_HOST del .env y limpiar
HOST=$(grep CAMPUS_HOST /app/.env | cut -d '=' -f2 | tr -d '"' | sed 's|http[s]*://||' | sed 's|/||g')

echo "🌐 Host extraído: $HOST"

mkdir -p /etc/nginx/certs

openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout /etc/nginx/certs/selfsigned.key \
  -out /etc/nginx/certs/selfsigned.crt \
  -subj "/C=ES/ST=Madrid/L=Madrid/O=Dev/OU=Dev/CN=$HOST"

echo "✅ Certificado creado para CN=$HOST"

# Lanza NGINX
exec nginx -g "daemon off;"
