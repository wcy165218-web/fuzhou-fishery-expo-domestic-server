#!/usr/bin/env bash

set -euo pipefail

PUBLIC_HOST="${1:-}"
EMAIL="${2:-}"
STATIC_ROOT="${3:-/var/www/expo-static}"
SERVER_PATH="${SERVER_PATH:-/opt/expo-server}"
ENV_FILE="${ENV_FILE:-${SERVER_PATH}/.env.production}"
APP_USER="${APP_USER:-admin}"
PM2_APP_NAME="${PM2_APP_NAME:-expo-server}"
NODE_UPSTREAM="${NODE_UPSTREAM:-127.0.0.1:3000}"
VPS_PUBLIC_IP="${VPS_PUBLIC_IP:-8.136.49.187}"
BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-${ENV_FILE}}"

if [[ -z "$PUBLIC_HOST" || -z "$EMAIL" ]]; then
  echo "usage: $0 expo.example.com admin@example.com [static-root]" >&2
  exit 1
fi

if [[ "$(id -u)" != "0" ]]; then
  echo "run as root, for example: sudo $0 ${PUBLIC_HOST} ${EMAIL}" >&2
  exit 1
fi

ALLOWED_ORIGINS_VALUE="https://${PUBLIC_HOST}"
CONFIRMATION_PUBLIC_ORIGIN_VALUE="https://${PUBLIC_HOST}/Exhibitors-confirmation"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

require_command nginx
require_command certbot
require_command dig
require_command runuser

assert_dns_points_to_vps() {
  local host=$1
  local addresses
  addresses="$(dig +short A "$host" | tr '\n' ' ')"
  if [[ " ${addresses} " != *" ${VPS_PUBLIC_IP} "* ]]; then
    echo "DNS for ${host} does not point to ${VPS_PUBLIC_IP}; got: ${addresses:-<none>}" >&2
    echo "Set SKIP_DNS_CHECK=1 only if you are using a non-public validation path." >&2
    exit 1
  fi
}

if [[ "${SKIP_DNS_CHECK:-0}" != "1" ]]; then
  assert_dns_points_to_vps "$PUBLIC_HOST"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing env file: ${ENV_FILE}" >&2
  exit 1
fi

if [[ "${RUN_BACKUP:-1}" == "1" ]]; then
  BACKUP_ENV_FILE="$BACKUP_ENV_FILE" bash "${SERVER_PATH}/scripts/backup-sqlite.sh"
fi

set_env_value() {
  local key=$1
  local value=$2
  local escaped
  escaped="$(printf '%s' "$value" | sed 's/[\/&]/\\&/g')"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s/^${key}=.*/${key}=${escaped}/" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

set_env_value "ALLOWED_ORIGINS" "$ALLOWED_ORIGINS_VALUE"
set_env_value "CONFIRMATION_PUBLIC_ORIGIN" "$CONFIRMATION_PUBLIC_ORIGIN_VALUE"

mkdir -p "$STATIC_ROOT" /etc/nginx/snippets /etc/nginx/sites-available /etc/nginx/sites-enabled

cat > /etc/nginx/snippets/expo-node-proxy.conf <<NGINX
proxy_pass http://expo_node_api;
proxy_http_version 1.1;
proxy_set_header Host \$host;
proxy_set_header X-Real-IP \$remote_addr;
proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto \$scheme;
proxy_set_header X-Forwarded-Host \$host;
proxy_set_header X-Forwarded-Port \$server_port;
proxy_set_header Upgrade \$http_upgrade;
proxy_set_header Connection "upgrade";
proxy_read_timeout 60s;
NGINX

cat > /etc/nginx/snippets/expo-static-security.conf <<'NGINX'
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
NGINX

cat > /etc/nginx/sites-available/expo-server <<NGINX
upstream expo_node_api {
    server ${NODE_UPSTREAM};
    keepalive 32;
}

server_tokens off;
limit_req_zone \$binary_remote_addr zone=expo_login_rate:10m rate=10r/m;
limit_req_zone \$binary_remote_addr zone=expo_public_rate:10m rate=30r/m;
limit_req_status 429;

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 444;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${PUBLIC_HOST};

    root ${STATIC_ROOT};
    index index.html;
    client_max_body_size 20m;
    include /etc/nginx/snippets/expo-static-security.conf;

    location = /api/login {
        limit_req zone=expo_login_rate burst=10 nodelay;
        include /etc/nginx/snippets/expo-node-proxy.conf;
    }

    location ^~ /api/public/exhibitor-confirmations/ {
        limit_req zone=expo_public_rate burst=20 nodelay;
        include /etc/nginx/snippets/expo-node-proxy.conf;
    }

    location ^~ /api/ {
        include /etc/nginx/snippets/expo-node-proxy.conf;
    }

    location = /exhibitor-confirm {
        try_files /exhibitor-confirm.html =404;
    }

    location = /exhibitor-confirm.html {
        try_files /exhibitor-confirm.html =404;
    }

    location ~ "^/[A-Za-z0-9_-]{43}$" {
        try_files /exhibitor-confirm.html =404;
    }

    location ^~ /Exhibitors-confirmation/ {
        try_files /exhibitor-confirm.html =404;
    }

    location ^~ /assets/ {
        try_files \$uri =404;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }

    location ^~ /js/ {
        try_files \$uri =404;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }

    location = /favicon.ico {
        return 204;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/expo-domains /etc/nginx/sites-enabled/expo-default
ln -sf /etc/nginx/sites-available/expo-server /etc/nginx/sites-enabled/expo-server

nginx -t
systemctl reload nginx

certbot --nginx --non-interactive --agree-tos --redirect -m "$EMAIL" \
  -d "$PUBLIC_HOST"

nginx -t
systemctl reload nginx

export ALLOWED_ORIGINS="$ALLOWED_ORIGINS_VALUE"
export CONFIRMATION_PUBLIC_ORIGIN="$CONFIRMATION_PUBLIC_ORIGIN_VALUE"
runuser -u "$APP_USER" -- env \
  ALLOWED_ORIGINS="$ALLOWED_ORIGINS_VALUE" \
  CONFIRMATION_PUBLIC_ORIGIN="$CONFIRMATION_PUBLIC_ORIGIN_VALUE" \
  PM2_APP_NAME="$PM2_APP_NAME" \
  bash -lc "cd '$SERVER_PATH' && pm2 restart '$PM2_APP_NAME' --update-env && pm2 status '$PM2_APP_NAME' --no-color"

echo "EXPO_VPS_DOMAINS_READY"
echo "https://${PUBLIC_HOST}"
echo "https://${PUBLIC_HOST}/Exhibitors-confirmation"
