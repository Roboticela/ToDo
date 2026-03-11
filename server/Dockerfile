# todo-server: Node API (auth, tasks, etc.)
# All config via env vars. Pass at runtime (e.g. docker run --env-file .env or compose environment).
FROM node:22-alpine

WORKDIR /app

# Copy package files and install production deps only (use --omit=dev, not --production)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Generate Prisma client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy application
COPY . .

EXPOSE 3000

# Env vars the app reads (set at runtime; empty here so they must be provided)
ENV DATABASE_URL=""
ENV JWT_ACCESS_SECRET=""
ENV JWT_REFRESH_SECRET=""
ENV JWT_ACCESS_EXPIRY=""
ENV JWT_REFRESH_EXPIRY=""
ENV FRONTEND_URL=""
ENV BACKEND_URL=""
ENV APP_DEEP_LINK_SCHEME=""
ENV GOOGLE_CLIENT_ID=""
ENV GOOGLE_CLIENT_SECRET=""
ENV SMTP_HOST=""
ENV SMTP_PORT=""
ENV SMTP_SECURE=""
ENV SMTP_USER=""
ENV SMTP_PASS=""
ENV SMTP_FROM=""
ENV SUBSCRIPTION_REMINDER_INTERVAL_DAYS=""
ENV EMAIL_UNSUBSCRIBE_SECRET=""
ENV PADDLE_API_KEY=""
ENV PADDLE_WEBHOOK_SECRET=""
ENV PADDLE_PRICE_ID_BASIC_MONTHLY=""
ENV PADDLE_PRICE_ID_BASIC_YEARLY=""
ENV PADDLE_PRICE_ID_PRO_MONTHLY=""
ENV PADDLE_PRICE_ID_PRO_YEARLY=""
ENV PADDLE_PRICE_ID_LIFETIME=""
ENV R2_ACCOUNT_ID=""
ENV R2_ACCESS_KEY_ID=""
ENV R2_SECRET_ACCESS_KEY=""
ENV R2_BUCKET=""
ENV R2_PUBLIC_URL=""
ENV PORT=""
ENV NODE_ENV=""

# Run node directly so it is PID 1 and receives SIGTERM for graceful shutdown
CMD ["node", "--no-deprecation", "server.js"]
