#!/bin/sh
set -eu

DATA="${DORINC_DATA_DIR:-/app/.data}/cups"
mkdir -p "$DATA/ppd" "$DATA/spool" /run/cups /var/run/cups /var/cache/cups /var/spool/cups /var/log/cups /etc/cups/ppd

if [ -f /usr/local/share/dorinc/cupsd.conf ]; then
  cp /usr/local/share/dorinc/cupsd.conf /etc/cups/cupsd.conf
fi

# Keep queues across container rebuilds (compose mounts /app/.data).
if [ -f "$DATA/printers.conf" ]; then
  cp "$DATA/printers.conf" /etc/cups/printers.conf
fi
if [ -d "$DATA/ppd" ]; then
  cp -a "$DATA/ppd/." /etc/cups/ppd/ 2>/dev/null || true
fi

if [ -f /etc/cups/cups-files.conf ]; then
  if grep -q '^SystemGroup' /etc/cups/cups-files.conf; then
    sed -i 's/^SystemGroup.*/SystemGroup root/' /etc/cups/cups-files.conf
  else
    printf '\nSystemGroup root\n' >> /etc/cups/cups-files.conf
  fi
  if ! grep -q '^FileDevice' /etc/cups/cups-files.conf; then
    printf '\nFileDevice Yes\n' >> /etc/cups/cups-files.conf
  fi
fi

persist_cups() {
  [ -f /etc/cups/printers.conf ] && cp /etc/cups/printers.conf "$DATA/printers.conf" || true
  if [ -d /etc/cups/ppd ]; then
    mkdir -p "$DATA/ppd"
    cp -a /etc/cups/ppd/. "$DATA/ppd/" 2>/dev/null || true
  fi
}

cupsd
i=0
while [ "$i" -lt 25 ]; do
  if lpstat -r >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 0.2
done

( while true; do
    sleep 30
    persist_cups
  done ) &

exec /usr/local/bin/node .output/server/index.mjs
