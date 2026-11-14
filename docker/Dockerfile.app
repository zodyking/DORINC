# DORINC Suite — nuxt-app service
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
# --ignore-scripts: postinstall runs `nuxt prepare`, which needs source not yet copied
RUN npm ci --ignore-scripts
COPY . .
ARG NUXT_PUBLIC_BUILD_ID=
RUN if [ -z "$NUXT_PUBLIC_BUILD_ID" ]; then export NUXT_PUBLIC_BUILD_ID=$(date -u +%Y%m%d%H%M%S); fi \
  && echo "Building with NUXT_PUBLIC_BUILD_ID=$NUXT_PUBLIC_BUILD_ID" \
  && NUXT_PUBLIC_BUILD_ID="$NUXT_PUBLIC_BUILD_ID" npm run build

# Official Tailscale binaries (userspace-networking per printer, like PrintHarbor).
FROM docker.io/tailscale/tailscale:stable AS tailscale

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=38471
ENV NITRO_PORT=38471
ENV NITRO_HOST=0.0.0.0
# PrintHarbor needs a local CUPS daemon (lp, lpstat, lpadmin, IPP Everywhere).
# Do not overwrite PATH — Node, Tailscale, and the start script live in /usr/local/bin.
RUN apk add --no-cache cups cups-client cups-filters ca-certificates iptables ip6tables iproute2 tini \
  && mkdir -p /run/cups /var/run/cups /var/cache/cups /var/spool/cups /var/log/cups \
    /var/run/tailscale /var/lib/tailscale
COPY --from=tailscale /usr/local/bin/tailscale /usr/local/bin/tailscale
COPY --from=tailscale /usr/local/bin/tailscaled /usr/local/bin/tailscaled
COPY docker/cupsd.conf /usr/local/share/dorinc/cupsd.conf
COPY docker/start-app.sh /usr/local/bin/start-app.sh
RUN chmod +x /usr/local/bin/start-app.sh /usr/local/bin/tailscale /usr/local/bin/tailscaled
COPY --from=build /src/.output ./.output
# Setup wizard needs these on disk (not bundled into Nitro output).
COPY --from=build /src/server/db/migrations ./server/db/migrations
# Blade baseline for template editor + invoice preview (not in laravel-pdf image).
COPY --from=build /src/server/assets ./server/assets
EXPOSE 38471
# tini reaps tailscaled and CUPS children and forwards stop signals, as in PrintHarbor.
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/start-app.sh"]
