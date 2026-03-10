# todo-server: Node API (auth, tasks, etc.)
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

# Run node directly so it is PID 1 and receives SIGTERM for graceful shutdown
CMD ["node", "--no-deprecation", "server.js"]
