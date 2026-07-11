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
COPY --from=build /src/.output ./.output
# Setup wizard needs these on disk (not bundled into Nitro output).
COPY --from=build /src/server/db/migrations ./server/db/migrations
EXPOSE 38471
CMD ["node", ".output/server/index.mjs"]
