# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
COPY prisma ./prisma/
COPY tsconfig*.json ./

# Install ALL dependencies (including devDependencies needed for build)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source and build
COPY src ./src
RUN npm run build

# Compile the init script separately (it's not a NestJS module)
RUN node_modules/.bin/tsc src/scripts/init-db.ts \
    --module commonjs \
    --moduleResolution node \
    --target ES2020 \
    --esModuleInterop true \
    --skipLibCheck true \
    --outDir dist/scripts

# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Copy dependency manifests and prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies only
RUN npm ci --omit=dev

# Generate Prisma client in production layer
RUN npx prisma generate

# Copy built output from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 4000

# Start: run init (create DB + migrate + seed) then launch app
CMD ["sh", "-c", "node dist/scripts/init-db.js && node dist/main"]
