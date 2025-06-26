# Multi-stage Dockerfile for KubeKavach
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@8.14.1
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm build

FROM node:20-alpine AS runner
RUN apk add --no-cache tini
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

COPY --from=builder --chown=nodejs:nodejs /app/packages/api/dist ./api/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/api/package.json ./api/
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

USER nodejs
EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "api/dist/server.js"]
