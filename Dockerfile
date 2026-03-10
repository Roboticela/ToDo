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

# SPA fallback: serve index.html for client-side routing
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location /health { \
        access_log off; \
        return 200 "OK"; \
        add_header Content-Type text/plain; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Entrypoint: replace the placeholder with the real VITE_API_URL env var at startup
RUN printf '#!/bin/sh\n\
set -e\n\
: "${VITE_API_URL:?VITE_API_URL env var is required}"\n\
find /usr/share/nginx/html -type f \\( -name "*.js" -o -name "*.html" \\) \\\n\
  -exec sed -i "s|__VITE_API_URL_PLACEHOLDER__|${VITE_API_URL}|g" {} +\n\
exec nginx -g "daemon off;"\n' > /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

EXPOSE 80

CMD ["/docker-entrypoint.sh"]
