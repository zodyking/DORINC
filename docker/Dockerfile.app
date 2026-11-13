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

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=38471
ENV NITRO_PORT=38471
ENV NITRO_HOST=0.0.0.0
# PrintHarbor needs a local CUPS daemon (lp, lpstat, lpadmin, IPP Everywhere).
# Do not overwrite PATH — the Node image entrypoint and node live in /usr/local/bin.
RUN apk add --no-cache cups cups-client cups-filters \
  && mkdir -p /run/cups /var/run/cups /var/cache/cups /var/spool/cups /var/log/cups
COPY docker/cupsd.conf /usr/local/share/dorinc/cupsd.conf
COPY docker/start-app.sh /usr/local/bin/start-app.sh
RUN chmod +x /usr/local/bin/start-app.sh
COPY --from=build /src/.output ./.output
# Setup wizard needs these on disk (not bundled into Nitro output).
COPY --from=build /src/server/db/migrations ./server/db/migrations
# Blade baseline for template editor + invoice preview (not in laravel-pdf image).
COPY --from=build /src/server/assets ./server/assets
EXPOSE 38471
ENTRYPOINT ["/usr/local/bin/start-app.sh"]
