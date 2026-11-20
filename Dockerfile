# Builds the site and, on start, prepares the database by itself (see docker-entrypoint.sh).
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npx prisma generate && npx next build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
ENV NODE_ENV=production PORT=3000
COPY --from=build /app ./
RUN chmod +x docker-entrypoint.sh && mkdir -p uploads
EXPOSE 3000
CMD ["sh", "./docker-entrypoint.sh"]
