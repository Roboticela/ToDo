# Build stage: frontend only
FROM node:22-alpine AS builder

# Use a placeholder so the built bundle contains a known string we can replace at runtime.
# This allows changing VITE_API_URL via a runtime env var without rebuilding the image.
ARG VITE_API_URL=__VITE_API_URL_PLACEHOLDER__
ENV VITE_API_URL=${VITE_API_URL}

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy source and build (skip prebuild - it needs src-tauri for Tauri/desktop)
COPY . .
RUN npx tsc -b && npx vite build

# Production stage: serve static files with nginx
FROM nginx:alpine

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy built frontend from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA fallback + health endpoint served from a file written at container startup
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
    location /health {\n\
        access_log off;\n\
        default_type application/json;\n\
        alias /usr/share/nginx/html/health.json;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

# Entrypoint: validate env vars, replace placeholder in built assets, write health.json, start nginx
RUN printf '#!/bin/sh\n\
set -e\n\
\n\
# Fail fast if required env var is missing\n\
if [ -z "$VITE_API_URL" ]; then\n\
  echo "[startup] FATAL: VITE_API_URL env var is required but not set"\n\
  exit 1\n\
fi\n\
\n\
echo "[startup] Environment check:"\n\
echo "  VITE_API_URL: SET -> $VITE_API_URL"\n\
\n\
echo "[startup] Injecting VITE_API_URL into static assets..."\n\
find /usr/share/nginx/html -type f \\( -name "*.js" -o -name "*.html" \\) \\\n\
  -exec sed -i "s|__VITE_API_URL_PLACEHOLDER__|${VITE_API_URL}|g" {} +\n\
echo "[startup] Done."\n\
\n\
# Write health.json so the /health endpoint shows live config (no secrets exposed)\n\
printf '"'"'{"ok":true,"apiUrl":"%s"}'"'"' "$VITE_API_URL" \\\n\
  > /usr/share/nginx/html/health.json\n\
\n\
exec nginx -g "daemon off;"\n' > /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

EXPOSE 80

CMD ["/docker-entrypoint.sh"]
