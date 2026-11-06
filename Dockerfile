# Сборка образа сайта. Один и тот же образ запускается у любого провайдера —
# так при сбое одного облака сайт можно поднять у другого за часы.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
# curl нужен хостингу для проверки состояния сайта (/api/health).
RUN apk add --no-cache curl
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
# Модули для миграций целиком (сборщик Next берёт из них только то, что нужно сайту).
COPY --from=build /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1
# При старте применяем миграции базы, затем запускаем сайт.
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
