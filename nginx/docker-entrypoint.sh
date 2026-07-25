#!/bin/sh
set -e

# Helper: keep only the first (HTTP) server block if the SSL cert is missing.
# This lets Certbot HTTP-01 validation work even before the certificate exists.
strip_https_block() {
    local conf="$1"
    awk '/^server \{/{n++} n<=1{print}' "$conf" > "$conf.tmp" && mv "$conf.tmp" "$conf"
}

DEV_CONF="/etc/nginx/conf.d/dev-api.conf"
DEV_CERT="/etc/letsencrypt/live/dev-api.indianpgmanagement.com/fullchain.pem"

if [ -f "$DEV_CERT" ]; then
    echo "Dev SSL certificate found — enabling dev-api virtual host."
else
    if [ -f "$DEV_CONF" ]; then
        echo "Dev SSL certificate not found — disabling HTTPS block, keeping HTTP for ACME."
        strip_https_block "$DEV_CONF"
    fi
fi

ADMIN_CONF="/etc/nginx/conf.d/admin-api.conf"
ADMIN_CERT="/etc/letsencrypt/live/admin-api.indianpgmanagement.com/fullchain.pem"

if [ -f "$ADMIN_CERT" ]; then
    echo "Admin SSL certificate found — enabling admin-api virtual host."
else
    if [ -f "$ADMIN_CONF" ]; then
        echo "Admin SSL certificate not found — disabling HTTPS block, keeping HTTP for ACME."
        strip_https_block "$ADMIN_CONF"
    fi
fi

exec nginx -g 'daemon off;'
