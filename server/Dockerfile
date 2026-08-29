# PhysEZ API — production image.
# Build context is this directory (server/), so the frontends are never part
# of the image.

# --- dependencies ------------------------------------------------------------
# Separate stage so the npm cache and any build noise stay out of the runtime
# image; only the resolved node_modules is copied forward.
FROM node:24-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
# node-pg-migrate is a runtime dependency, not a dev one: migrations run
# inside this image at container start.
RUN npm ci --omit=dev

# --- runtime -----------------------------------------------------------------
FROM node:24-alpine

# Secure cookies and production error handling depend on this (DESIGN.md §7).
ENV NODE_ENV=production
ENV PORT=3000
ENV UPLOAD_DIR=/app/uploads

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY src ./src
COPY migrations ./migrations
COPY docker-entrypoint.sh ./

# Uploads are written at runtime and must survive as a mounted volume; the
# directory is inside the image only so the path exists and is owned correctly.
RUN chmod +x docker-entrypoint.sh \
  && mkdir -p "$UPLOAD_DIR" \
  && chown -R node:node "$UPLOAD_DIR"

# The API never needs root.
USER node

EXPOSE 3000

# The entrypoint runs migrations (unless RUN_MIGRATIONS=false) and then execs
# the command below, so node receives signals directly.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "src/index.js"]
