# DORINC Suite — nuxt-app service
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /src/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
