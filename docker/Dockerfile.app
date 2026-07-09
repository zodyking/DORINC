# DORINC Suite — nuxt-app service
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
# --ignore-scripts: postinstall runs `nuxt prepare`, which needs source not yet copied
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=38471
ENV NITRO_PORT=38471
ENV NITRO_HOST=0.0.0.0
COPY --from=build /src/.output ./.output
EXPOSE 38471
CMD ["node", ".output/server/index.mjs"]
