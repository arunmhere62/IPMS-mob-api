#!/bin/sh
set -e

DEV_CONF="/etc/nginx/conf.d/dev-api.conf"
DEV_CERT="/etc/letsencrypt/live/dev-api.indianpgmanagement.com/fullchain.pem"

if [ -f "$DEV_CERT" ]; then
    echo "Dev SSL certificate found — enabling dev-api virtual host."
else
    echo "Dev SSL certificate not found — disabling dev-api virtual host to protect Nginx startup."
    rm -f "$DEV_CONF"
fi

exec nginx -g 'daemon off;'
