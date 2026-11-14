#!/bin/sh
set -eu
DATA="${DATA_DIR:-/data}"
export DATA_DIR="$DATA"
mkdir -p "$DATA/files" "$DATA/tmp" "$DATA/tailscale" /run/cups /etc/cups /var/spool/cups/tmp
printf '%s\n' letter > /etc/papersize
chmod 700 "$DATA/files" "$DATA/tmp"
if [ ! -s /etc/cups/cupsd.conf ] && [ -f /usr/share/printharbor/cups-seed/cupsd.conf ]; then
  cp -a /usr/share/printharbor/cups-seed/. /etc/cups/
fi

# Secrets live on the data volume, so a deploy needs no extra environment.
# DORINC reads the same api-token file from the shared volume.
keep() {
  file="$DATA/$1"
  if [ ! -s "$file" ]; then
    (umask 077 && python3 -c 'import secrets; print(secrets.token_urlsafe(48))' > "$file")
  fi
  cat "$file"
}
if [ -z "${SESSION_SECRET:-}" ]; then SESSION_SECRET="$(keep session-secret)"; fi
if [ -z "${ADMIN_PASSWORD:-}" ]; then ADMIN_PASSWORD="$(keep admin-password)"; fi
export SESSION_SECRET ADMIN_PASSWORD
if [ -z "${PRINTHARBOR_API_TOKEN:-}" ]; then keep api-token >/dev/null; fi

PIDS=""
shutdown() {
  for pid in $PIDS; do
    kill "$pid" 2>/dev/null || true
  done
}
trap shutdown EXIT INT TERM
# CUPS accepts local requests only. Its port is not published by Docker.
cupsd -f &
PIDS="$!"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if lpstat -r >/dev/null 2>&1; then break; fi
  sleep 1
done
exec uvicorn app.api:app --host 0.0.0.0 --port "${PRINTHARBOR_PORT:-47831}" --no-proxy-headers
