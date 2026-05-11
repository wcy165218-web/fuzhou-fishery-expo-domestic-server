#!/usr/bin/env bash

set -euo pipefail

echo "WARNING: configure-bwh-domains.sh is the legacy Worker-proxy domain script." >&2
echo "For the Node + SQLite VPS cutover, use scripts/configure-vps-domains.sh instead." >&2
exit 1

DOMAIN="${1:-}"
EMAIL="${2:-}"
UPSTREAM_HOST="${3:-fuzhou-fishery-expo.wcy165218.workers.dev}"
STATIC_ROOT="${4:-/var/www/expo-static}"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "usage: $0 example.com admin@example.com [worker-host] [static-root]" >&2
  exit 1
fi

ERP_HOST="erp.${DOMAIN}"
CONFIRMATION_HOST="confirmation.${DOMAIN}"

mkdir -p "$STATIC_ROOT"

cat > /etc/nginx/snippets/expo-worker-proxy.conf <<NGINX
resolver 1.1.1.1 8.8.8.8 ipv6=off valid=300s;
set \$expo_worker_upstream ${UPSTREAM_HOST};

proxy_pass https://\$expo_worker_upstream;
proxy_http_version 1.1;
proxy_ssl_server_name on;
proxy_ssl_name \$expo_worker_upstream;
proxy_set_header Host \$expo_worker_upstream;
proxy_set_header X-Real-IP \$remote_addr;
proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto \$scheme;
proxy_set_header X-Forwarded-Host \$host;
proxy_set_header X-Forwarded-Port \$server_port;
proxy_set_header Accept-Encoding "";
sub_filter_once off;
sub_filter_types text/plain application/json application/javascript text/javascript;
sub_filter "https://${UPSTREAM_HOST}" "\$scheme://\$host";
sub_filter "http://${UPSTREAM_HOST}" "\$scheme://\$host";
proxy_set_header Upgrade \$http_upgrade;
proxy_set_header Connection \$connection_upgrade;
proxy_redirect https://${UPSTREAM_HOST}/ \$scheme://\$host/;
NGINX

cat > /etc/nginx/snippets/expo-static-security.conf <<'NGINX'
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
NGINX

cat > /etc/nginx/sites-available/expo-domains <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    root ${STATIC_ROOT};
    index index.html;
    client_max_body_size 20m;
    include /etc/nginx/snippets/expo-static-security.conf;

    location ^~ /api/ {
        include /etc/nginx/snippets/expo-worker-proxy.conf;
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

server {
    listen 80;
    listen [::]:80;
    server_name ${ERP_HOST} ${CONFIRMATION_HOST};

    root ${STATIC_ROOT};
    index index.html;
    client_max_body_size 20m;
    include /etc/nginx/snippets/expo-static-security.conf;

    location ^~ /api/ {
        include /etc/nginx/snippets/expo-worker-proxy.conf;
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
        if (\$host = ${CONFIRMATION_HOST}) {
            rewrite ^ /exhibitor-confirm.html break;
        }
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

cat > /etc/nginx/sites-available/expo-default <<NGINX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root ${STATIC_ROOT};
    index index.html;
    client_max_body_size 20m;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

    location ^~ /api/ {
        include /etc/nginx/snippets/expo-worker-proxy.conf;
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

rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/expo-worker-proxy
ln -sf /etc/nginx/sites-available/expo-domains /etc/nginx/sites-enabled/expo-domains
ln -sf /etc/nginx/sites-available/expo-default /etc/nginx/sites-enabled/expo-default
nginx -t
systemctl reload nginx

certbot --nginx --non-interactive --agree-tos --redirect -m "$EMAIL" \
  -d "$DOMAIN" -d "$ERP_HOST" -d "$CONFIRMATION_HOST"

cat > /etc/nginx/sites-available/expo-domains <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    root ${STATIC_ROOT};
    index index.html;
    client_max_body_size 20m;
    include /etc/nginx/snippets/expo-static-security.conf;

    location ^~ /api/ {
        include /etc/nginx/snippets/expo-worker-proxy.conf;
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

server {
    listen 80;
    listen [::]:80;
    server_name ${ERP_HOST} ${CONFIRMATION_HOST};

    root ${STATIC_ROOT};
    index index.html;
    client_max_body_size 20m;
    include /etc/nginx/snippets/expo-static-security.conf;

    location ^~ /api/ {
        include /etc/nginx/snippets/expo-worker-proxy.conf;
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
        if (\$host = ${CONFIRMATION_HOST}) {
            rewrite ^ /exhibitor-confirm.html break;
        }
        try_files \$uri \$uri/ /index.html;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${DOMAIN};

    root ${STATIC_ROOT};
    index index.html;
    client_max_body_size 20m;

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    include /etc/nginx/snippets/expo-static-security.conf;

    location ^~ /api/ {
        include /etc/nginx/snippets/expo-worker-proxy.conf;
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

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${ERP_HOST};

    root ${STATIC_ROOT};
    index index.html;
    client_max_body_size 20m;

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    include /etc/nginx/snippets/expo-static-security.conf;

    location ^~ /api/ {
        include /etc/nginx/snippets/expo-worker-proxy.conf;
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

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${CONFIRMATION_HOST};

    root ${STATIC_ROOT};
    index exhibitor-confirm.html;
    client_max_body_size 20m;

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    include /etc/nginx/snippets/expo-static-security.conf;

    location ^~ /api/ {
        include /etc/nginx/snippets/expo-worker-proxy.conf;
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
        try_files /exhibitor-confirm.html =404;
    }
}
NGINX

nginx -t
systemctl reload nginx
certbot renew --dry-run

echo "EXPO_DOMAINS_READY"
echo "https://${ERP_HOST}"
echo "https://${CONFIRMATION_HOST}"
