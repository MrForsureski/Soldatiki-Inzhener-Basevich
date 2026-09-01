FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY services/order-api/package.json services/order-api/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY services/order-api/tsconfig.json ./
COPY services/order-api/src ./src
RUN pnpm build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable
COPY services/order-api/package.json services/order-api/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts
COPY --from=build /app/dist ./dist
COPY services/order-api/migrations ./migrations
EXPOSE 8080
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
