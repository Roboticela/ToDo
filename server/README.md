# ToDo API Server

Express backend with PostgreSQL (Prisma), JWT auth, Google OAuth, Paddle subscriptions, Nodemailer (SMTP) for email, and Cloudflare R2 for avatar storage.

## Setup

1. **Install dependencies**
   ```bash
   cd server && npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your:
   - `DATABASE_URL` – PostgreSQL connection string
   - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` – min 32 chars
   - `FRONTEND_URL` – e.g. `https://todo.roboticela.com` or `http://localhost:5173`
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` – from Google Cloud Console  
     Add redirect URI: `https://your-api-domain/api/auth/google/callback`
   - SMTP settings for Nodemailer (forgot password, welcome email)
   - Paddle API key, webhook secret, and price IDs (Basic/Pro)
   - **R2** (optional): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` – for storing avatars in Cloudflare R2 instead of using Google’s image URL directly. If unset, Google avatars are not stored and profile uploads are not persisted to R2.

3. **Database**
   ```bash
   npx prisma generate
   npx prisma db push
   # or: npx prisma migrate dev
   ```

4. **Run**
   ```bash
   npm run dev
   ```
   Server listens on `PORT` (default 3000).

## API overview

- `POST /api/auth/register` – Register (email/password)
- `POST /api/auth/login` – Login
- `POST /api/auth/refresh` – Refresh tokens
- `POST /api/auth/logout` – Logout (Bearer)
- `POST /api/auth/forgot-password` – Send reset email
- `POST /api/auth/reset-password` – Reset with token
- `GET /api/auth/google?client=web|desktop` – Start Google OAuth
- `GET /api/auth/google/callback` – OAuth callback (redirects to frontend)
- `GET /api/users/me`, `PATCH /api/users/:id`, `DELETE /api/users/:id` – User (Bearer)
- `GET/POST/PATCH/DELETE /api/tasks/*` – Tasks and completions (Bearer)
- `POST /api/tasks/sync` – Bulk sync tasks/completions (Bearer)
- `POST /api/paddle/create-checkout` – Create Paddle checkout (Bearer)
- `POST /api/paddle/webhook` – Paddle webhook (signature verified)

## Frontend

Set `VITE_API_URL` to this server’s origin (e.g. `http://localhost:3000`) so the app uses the real API.
