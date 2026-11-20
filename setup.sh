#!/bin/sh
# One-command install on a server that already has Docker.
#   sh setup.sh                 -> runs on http://<server-ip>:3000
#   sh setup.sh example.com     -> runs on https://example.com (DNS A record must point to this server)
set -e
DOMAIN_ARG="$1"
rnd() { head -c 48 /dev/urandom | base64 | tr -d '/+=\n' | cut -c1-"$1"; }

if [ -f .env ]; then
  echo ".env already exists — keeping it."
else
  cp .env.example .env
  AUTH=$(rnd 48); CRON=$(rnd 32); DBPW=$(rnd 24); ADMINPW=$(rnd 14); DEMOPW=$(rnd 14)
  if [ -n "$DOMAIN_ARG" ]; then APPURL="https://$DOMAIN_ARG"; else APPURL="http://$(curl -s https://api.ipify.org || echo localhost):3000"; fi
  sed -i "s|^APP_URL=.*|APP_URL=\"$APPURL\"|; s|^AUTH_SECRET=.*|AUTH_SECRET=\"$AUTH\"|; s|^CRON_SECRET=.*|CRON_SECRET=\"$CRON\"|; s|^SEED_ADMIN_PASSWORD=.*|SEED_ADMIN_PASSWORD=\"$ADMINPW\"|; s|^SEED_DEMO_PASSWORD=.*|SEED_DEMO_PASSWORD=\"$DEMOPW\"|" .env
  { echo "DB_PASSWORD=\"$DBPW\""; echo "SEED_DEMO=\"true\""; [ -n "$DOMAIN_ARG" ] && echo "DOMAIN=\"$DOMAIN_ARG\""; } >> .env
  echo "Created .env with fresh secrets."
fi

if [ -n "$DOMAIN_ARG" ]; then docker compose --profile https up -d --build; else docker compose up -d --build; fi
echo
echo "Started. First start takes 2–5 minutes (building). Watch progress:  docker compose logs -f app"
echo "Admin login:  admin@lumera.test   password: $(grep '^SEED_ADMIN_PASSWORD=' .env | cut -d'"' -f2)"
echo "Demo password for client1@/olena-koval@/owner1@lumera.test: $(grep '^SEED_DEMO_PASSWORD=' .env | cut -d'"' -f2)"
