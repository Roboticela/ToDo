<div align="center">

![App Logo](public/Favicon.svg)

# Roboticela ToDo

[![AGPL License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue.svg)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-Latest-orange.svg)](https://www.rust-lang.org/)

**Roboticela ToDo — your tasks, organized.**

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage-guide) • [Server](#-server) • [Contributing](#-contributing) • [Support](#-support)

---

</div>

## 📖 Table of Contents

- [About](#-about)
- [Features](#-features)
- [Technology Stack](#-technology-stack)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Running the Application](#-running-the-application)
- [Server](#-server)
- [Building for Production](#-building-for-production)
- [Usage Guide](#-usage-guide)
- [Project Structure](#-project-structure)
- [Configuration](#-configuration)
- [Contributing](#-contributing)
- [Code of Conduct](#-code-of-conduct)
- [Support](#-support)
- [Roadmap](#-roadmap)
- [License](#-license)
- [Acknowledgments](#-acknowledgments)
- [About Roboticela](#-about-roboticela)

---

## 🌟 About

**Roboticela ToDo** is a modern, cross-platform task manager. Built with Tauri, React, and TypeScript, with an optional Node.js backend for sync, auth, and subscriptions.

### Why This Project?

- ✅ **Free and Open Source** - Licensed under AGPL-3.0
- ✅ **Cross-Platform** - Works on Linux, Windows, macOS, and runs in the browser
- ✅ **Fast & Lightweight** - Built with Tauri and Rust for desktop; Vite for web
- ✅ **Tasks & Calendar** - Time-based, daily, and duration tasks with calendar and analytics
- ✅ **Sync & Auth** - Optional backend for sign-up, Google OAuth, and cloud sync
- ✅ **Subscriptions** - Optional Paddle billing (Basic, Pro, Lifetime)
- ✅ **Theme Support** - Multiple themes including light, dark, navy, ocean, and more
- ✅ **Actively Maintained** - Regular updates and community support

---

## ✨ Features

### 📋 Tasks
- **Task Types** - Time-based, daily, and duration tasks with priorities (low, medium, high)
- **Categories** - Organize as “do” or “don’t” with repeat options and end dates
- **Today & Calendar** - Today view and calendar for planning
- **Analytics** - Insights and completion stats
- **Sync** - Optional cloud sync when using the backend (desktop and web)

### 🔐 Auth & Account
- **Email/Password** - Register, login, email verification, password reset
- **Google OAuth** - Sign in with Google (web and desktop with deep link callback)
- **Profile** - Avatar (optional R2 storage), email preferences, subscription reminders

### 💳 Subscriptions (optional backend)
- **Plans** - Free, Basic, Pro, and Lifetime via Paddle
- **Webhooks** - Paddle webhook handling for subscription lifecycle
- **Reminder emails** - Optional subscription reminder emails (configurable interval)

### 🎨 General
- **Responsive Design** - Works on different screen sizes
- **Smooth Animations** - Powered by Framer Motion
- **Desktop or Web** - Run as Tauri desktop app or in the browser
- **Offline-capable** - Local storage / IndexedDB when not using the server

---

## 🛠️ Technology Stack

### Frontend
- **[React 19](https://reactjs.org/)** - UI library
- **[TypeScript 5.9](https://www.typescriptlang.org/)** - Type-safe JavaScript
- **[TailwindCSS 4](https://tailwindcss.com/)** - Utility-first CSS
- **[Framer Motion 12](https://www.framer.com/motion/)** - Animations
- **[React Router 7](https://reactrouter.com/)** - Client-side routing
- **[Lucide React](https://lucide.dev/)** - Icons
- **[Vite 7](https://vitejs.dev/)** - Build tool
- **IndexedDB (idb)** - Local task storage when offline or without server

### Desktop
- **[Tauri 2](https://tauri.app/)** - Desktop application framework
- **[Rust](https://www.rust-lang.org/)** - Systems programming language

### Server (optional backend)
- **Node.js** - Runtime
- **[Express 5](https://expressjs.com/)** - API server
- **[Prisma](https://www.prisma.io/)** - ORM with PostgreSQL
- **JWT** - Access & refresh tokens; cookie-based refresh
- **Google OAuth** - Sign-in with Google
- **Nodemailer** - Email (verification, password reset, subscription reminders)
- **Paddle** - Subscriptions (Basic, Pro, Lifetime)
- **AWS SDK (S3-compatible)** - Cloudflare R2 for avatar storage

### Development Tools
- **npm** - Package manager
- **ESLint** - Linting
- **TypeScript ESLint** - TypeScript linting

---

## 📋 Prerequisites

Before installing, ensure you have the following:

> 💡 **For detailed installation instructions and complete dependency lists, see [INSTALL_DEPENDENCIES.md](INSTALL_DEPENDENCIES.md)**

### Required Software

1. **Node.js** (v20 or higher) - [Download](https://nodejs.org/)
2. **Rust** (latest stable) - [Install](https://www.rust-lang.org/tools/install)
3. **npm** - Node package manager

### System Dependencies

#### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

#### Linux (Fedora)
```bash
sudo dnf check-update
sudo dnf install webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel
```

#### Linux (Arch)
```bash
sudo pacman -Syu
sudo pacman -S webkit2gtk \
  base-devel \
  curl \
  wget \
  file \
  openssl \
  appmenu-gtk-module \
  gtk3 \
  libappindicator-gtk3 \
  librsvg
```

#### macOS
```bash
xcode-select --install
```

#### Windows
- Install [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- Install [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually pre-installed on Windows 10/11)

---

## 📥 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Roboticela/ToDo.git
cd ToDo
```

### 2. Install Dependencies

Using npm:
```bash
npm install
```

### 3. Build Rust Dependencies (for desktop)

```bash
cd src-tauri
cargo build
cd ..
```

---

## 🚀 Running the Application

### Development Mode (Desktop)

Run the Tauri app with hot-reload:

```bash
npm run tauri dev
```

This will start the Vite dev server and run the desktop application.

### Web Only (Browser)

To run the frontend in the browser without Tauri:

```bash
npm run dev
```

Then open http://localhost:5173 in your browser.

---

## 🖥️ Server

The app can run without the server (local/offline mode). For sign-up, sync, Google OAuth, and subscriptions, run the optional Node.js backend.

### Server Prerequisites

- **Node.js** (v20 or higher)
- **PostgreSQL** - Database for users, tasks, and subscriptions
- **npm** - Package manager

### Server Installation

```bash
cd server
npm install
cp .env.example .env
# Edit .env with your database URL, JWT secrets, and optional services
```

### Database Setup

```bash
cd server
npm run db:generate   # Generate Prisma client
npm run db:push      # Push schema to database (dev)
# or
npm run db:migrate   # Run migrations (dev)
```

### Server Environment Variables

Copy `server/.env.example` to `server/.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Yes | Min 32 characters |
| `JWT_REFRESH_SECRET` | Yes | Min 32 characters |
| `FRONTEND_URL` | No | Frontend origin (e.g. http://localhost:5173) |
| `BACKEND_URL` | No | Backend origin (e.g. http://localhost:3000) |
| `APP_DEEP_LINK_SCHEME` | No | Desktop OAuth callback scheme (e.g. roboticela-todo) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | No | Google OAuth (for Sign in with Google) |
| `SMTP_*` | No | Nodemailer SMTP (verification, password reset, reminders) |
| `PADDLE_*` | No | Paddle API key, webhook secret, price IDs |
| `R2_*` | No | Cloudflare R2 for avatar storage |
| `PORT` | No | Server port (default 3000) |

See `server/.env.example` for the full list and comments.

### Running the Server

**Development (with watch):**
```bash
cd server
npm run dev
```

**Production:**
```bash
cd server
npm run start
```

The API runs at `http://localhost:3000` by default. Set the frontend’s API base URL to this (e.g. via env or config) when using the backend.

### Server API Overview

| Prefix | Purpose |
|--------|---------|
| `/api/auth` | Login, register, refresh, Google OAuth, logout |
| `/api/users` | Profile, avatar, email preferences |
| `/api/tasks` | CRUD and sync for tasks and completions |
| `/api/paddle` | Checkout, portal, webhook |
| `/api/email` | Verification, password reset, unsubscribe |
| `/health` | Health check (no auth) |

### Server Project Structure

```
server/
├── prisma/
│   ├── schema.prisma    # User, Task, Session, Subscription, etc.
│   └── migrations/
├── routes/
│   ├── auth.js          # Auth and Google OAuth
│   ├── users.js         # User profile and avatar
│   ├── tasks.js         # Tasks and completions
│   ├── paddle.js        # Paddle checkout and webhooks
│   └── email.js         # Email verification, reset, unsubscribe
├── services/
│   ├── jwtService.js
│   ├── emailService.js
│   ├── r2Service.js     # Avatar uploads (R2)
│   └── unsubscribeToken.js
├── middleware/
│   └── auth.js          # JWT auth middleware
├── jobs/
│   └── subscriptionReminderJob.js
├── EmailStructures/     # Email templates
├── config.js            # Config from env
├── server.js            # Express app entry
├── .env.example
└── package.json
```

---

## 📦 Building for Production

### Prerequisites

Before building for production, ensure you have:

1. **All dependencies installed** - See [INSTALL_DEPENDENCIES.md](INSTALL_DEPENDENCIES.md) for detailed platform-specific setup
2. **Node.js 20+** and **npm** installed
3. **Rust** and **Cargo** installed
4. **Platform-specific build tools** (WebKit2GTK for Linux, MSVC for Windows, Xcode for macOS)

To verify your setup:
```bash
node --version
npm --version
rustc --version
cargo --version
```

### Quick Build (Current Platform)

Build for your current platform:

```bash
npm run build
npm run tauri build
```

Or use the combined script:

```bash
npm run build:desktop
```

This will build the frontend, compile the Rust backend, bundle with Tauri, and generate platform-specific installers.

### Build Output Locations

**Desktop builds:**
```
src-tauri/target/release/          # Executables
src-tauri/target/release/bundle/   # Installers
```

### Advanced Build Options

#### Debug Build (Faster, Larger, with Debug Symbols)
```bash
npm run tauri build -- --debug
```

#### Release Build with Optimizations (Default)
```bash
npm run tauri build
```

### 🔐 Code Signing and Checksums

Builds can generate SHA256 checksums for integrity verification:

```bash
npm run build:desktop   # Build and generate checksums
npm run checksums      # Generate checksums only
npm run verify        # Verify checksums
```

For detailed code signing and notarization, see [SIGNING.md](SIGNING.md).

### Build Troubleshooting

**Frontend build fails:**
```bash
rm -rf node_modules dist
npm install
npm run build
```

**Rust compilation errors:**
```bash
rustup update
cd src-tauri && cargo clean && cd ..
```

**Missing dependencies:** See [INSTALL_DEPENDENCIES.md](INSTALL_DEPENDENCIES.md).

### Production Build Checklist

Before releasing:

- [ ] Update version in `package.json` and `src-tauri/tauri.conf.json`
- [ ] Test in development mode
- [ ] Run `npm run tauri build` for target platforms
- [ ] Verify checksums if applicable
- [ ] Test installers on target platforms
- [ ] Run `npm audit` and `cargo audit`

---

## 📚 Usage Guide

### Getting Started

1. **Launch the App** - Run `npm run tauri dev` or `npm run dev` and open the app.
2. **Sign in (optional)** - Use the server for account and sync: register or sign in with Google.
3. **Today** - View and complete today’s tasks; add time-based, daily, or duration tasks.
4. **Calendar** - Plan tasks by date and see repeats.
5. **Analytics** - View completion stats and insights.
6. **Settings** - Theme, profile, email preferences, subscription (if using backend).

### Tasks

- **Task types** - Time-based (specific time), daily (repeat days), or duration (start–end).
- **Categories** - Mark as “do” or “don’t”; set priority (low, medium, high).
- **Repeating** - Choose repeat days and optional end date.
- **Status** - Pending, completed, missed, or skipped.

### Routes

- **/** - Today (default)
- **/calendar** - Calendar view
- **/analytics** - Analytics
- **/settings** - Settings, profile, subscription
- **/auth/login**, **/auth/register** - Login and register
- **/auth/forgot-password**, **/auth/reset-password** - Password reset
- **/auth/callback** - OAuth callback (web)
- **/auth/desktop-success** - Desktop OAuth success

---

## 📁 Project Structure

```
ToDo/
│
├── src/                          # React frontend source
│   ├── components/               # React components
│   │   ├── todo/                 # ToDo UI
│   │   │   ├── AppLayout.tsx     # Main layout (nav + content)
│   │   │   ├── TodoHeader.tsx
│   │   │   ├── TaskForm.tsx
│   │   │   ├── TaskCard.tsx
│   │   │   ├── SideNav.tsx, BottomNav.tsx
│   │   │   ├── SyncIndicator.tsx
│   │   │   └── ...
│   │   ├── ui/                   # UI primitives (button, dropdown)
│   │   ├── ThemeScript.tsx
│   │   ├── AboutModal.tsx, LicenseModal.tsx, StoryModal.tsx
│   │   ├── DeepLinkAuthSetup.tsx
│   │   └── VerificationBanner.tsx
│   │
│   ├── contexts/
│   │   ├── AuthContext.tsx
│   │   ├── ThemeContext.tsx
│   │   ├── TaskContext.tsx
│   │   ├── SyncContext.tsx
│   │   └── HeaderVisibilityContext.tsx
│   │
│   ├── pages/
│   │   ├── auth/                 # Login, register, reset password, callback, etc.
│   │   └── todo/                 # TodayPage, CalendarPage, AnalyticsPage, SettingsPage, SubscriptionPage
│   │
│   ├── lib/                      # Utilities and services
│   │   ├── authService.ts        # Auth API and tokens
│   │   ├── tauri.ts              # Tauri helpers
│   │   └── utils.ts
│   │
│   ├── App.css
│   └── main.tsx                  # Entry point + router
│
├── server/                       # Optional Node.js backend (see Server section)
│   ├── prisma/
│   ├── routes/, services/, middleware/, jobs/
│   ├── config.js, server.js
│   └── .env.example
│
├── src-tauri/                    # Tauri desktop
│   ├── src/
│   ├── icons/, capabilities/
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── public/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── LICENSE
├── INSTALL_DEPENDENCIES.md
├── SIGNING.md
└── README.md
```

---

## ⚙️ Configuration

### Tauri Configuration

The `src-tauri/tauri.conf.json` file contains Tauri settings: app identifier, version, window size and title, capabilities, and bundle options. Modify it to change desktop app behavior.

### Frontend Environment

The frontend may use an environment variable (e.g. `VITE_API_URL` or similar) to point to the backend URL when using the server. Check the project’s env handling for the exact name.

### Server Environment

Server configuration is via environment variables. Copy `server/.env.example` to `server/.env` and set values as described in the [Server](#-server) section.

---

## 🤝 Contributing

We welcome contributions! Whether it's bug fixes, features, docs, or feedback, every bit helps.

### Ways to Contribute

1. **Report Bugs** - Open an issue with steps to reproduce and environment details.
2. **Suggest Features** - Share ideas for new features or improvements.
3. **Write Code** - Submit pull requests for bugs or features.
4. **Improve Documentation** - Help keep the README and docs clear and up to date.
5. **Share the Project** - Star the repo and tell others.

### Getting Started with Development

1. **Fork the Repository**
   ```bash
   git clone https://github.com/Roboticela/ToDo.git
   cd ToDo
   ```

2. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature
   # or
   git checkout -b fix/bug-description
   ```

3. **Make Changes** - Follow existing style, add tests where relevant, and test locally.

4. **Commit**
   ```bash
   git add .
   git commit -m "Add: brief description"
   ```
   Prefixes: `Add:` `Fix:` `Update:` `Docs:` `Style:` `Refactor:` `Test:` `Chore:`

5. **Push and Open a PR**
   ```bash
   git push origin feature/your-feature
   ```
   Then open a Pull Request on GitHub with a clear description and any related issues.

### Code Style

- **Frontend** - Functional components, TypeScript, TailwindCSS, React best practices.
- **Rust** - `cargo fmt`, `cargo clippy`, clear error handling, doc comments for public APIs.

---

## 📜 Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

**Positive behavior:** Respectful and inclusive communication, patience with newcomers, accepting constructive criticism, focusing on the community’s best interest, empathy.

**Unacceptable behavior:** Harassment, trolling, derogatory comments, personal or political attacks, publishing others’ private information, or any conduct inappropriate in a professional setting.

### Enforcement

Reports of unacceptable behavior will be reviewed and addressed by the maintainers. Maintainers may remove, edit, or reject comments, commits, code, and other contributions that violate this Code of Conduct.

---

## 💬 Support

### GitHub Issues

For bugs, feature requests, or technical questions:

🐛 **[Open an Issue](https://github.com/Roboticela/ToDo/issues)**

When reporting a bug, please include:
- OS and version
- App version (or commit)
- Steps to reproduce
- Expected vs actual behavior
- Screenshots or error messages if helpful

### Community

- 🐙 **GitHub**: [Roboticela/ToDo](https://github.com/Roboticela/ToDo)
- ⭐ **Star the repo** to show your support.

### FAQ

**Q: Is this free to use?**  
A: Yes. It’s open-source under the AGPL-3.0 license.

**Q: Can I use it commercially?**  
A: Yes, subject to AGPL-3.0. If you distribute or run a modified version over a network, you must make the source available under AGPL-3.0.

**Q: Web only or desktop too?**  
A: Both. Use `npm run dev` for web or `npm run tauri dev` / built installer for desktop.

**Q: Do I need the server to use the app?**  
A: No. You can use the app locally (desktop or web) without the server. The server is for accounts, sync, Google sign-in, and subscriptions.

**Q: How do I report a security issue?**  
A: Open a GitHub issue or contact the maintainers directly.

---

## 🗺️ Roadmap

### Possible Future Improvements

- [ ] **Export / Backup** - Export tasks or backup/restore
- [ ] **Reminders** - Notifications for upcoming tasks
- [ ] **i18n** - Multiple languages for the UI
- [ ] **Accessibility** - Enhanced keyboard and screen reader support
- [ ] **Mobile** - Tauri mobile or PWA improvements

### Version History

**v0.1.0** (Current)
- Tasks: time-based, daily, duration; today, calendar, analytics
- Auth: email/password, Google OAuth, verification, password reset
- Optional server: Prisma/PostgreSQL, JWT, Paddle, R2 avatars, subscription reminders
- Multiple themes, Tauri desktop, React Router

See [Releases](https://github.com/Roboticela/ToDo/releases) for the full changelog.

---

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

### What This Means

✅ **You CAN:**
- Use the software for any purpose
- Study, modify, and distribute it
- Use it commercially (under the license terms)

⚠️ **You MUST:**
- Disclose source when distributing
- Include the license and copyright notice
- State changes made
- License modifications under AGPL-3.0
- If you run a modified version over a network, provide source access to users

❌ **You CANNOT:**
- Hold the authors liable for damages
- Use the authors’ names for endorsement without permission

**Full License Text:** See the [LICENSE](LICENSE) file.

---

## 🙏 Acknowledgments

Thanks to the open-source projects and communities that make this possible:

### Core Technologies
- **[Tauri](https://tauri.app/)** - Desktop framework
- **[React](https://reactjs.org/)** - UI library
- **[Rust](https://www.rust-lang.org/)** - Performance and safety
- **[Vite](https://vitejs.dev/)** - Build tooling

### Libraries & Tools
- **[TailwindCSS](https://tailwindcss.com/)** - Styling
- **[Framer Motion](https://www.framer.com/motion/)** - Animations
- **[React Router](https://reactrouter.com/)** - Routing
- **[Lucide React](https://lucide.dev/)** - Icons
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety

---

## 🏢 About Roboticela

<div align="center">

<img src="src/assets/CompanyLogo.png" alt="Roboticela Logo" width="200" style="padding:30px;" />

**[Roboticela](https://github.com/Roboticela)** builds high-quality, open-source software for developers and learners.

</div>

### Our Mission

To create accessible, privacy-conscious software that supports learning and open collaboration.

### This Project

**Roboticela ToDo** is developed and maintained by Roboticela. We focus on:

- 🔓 **Open Source** - Transparent, community-friendly development
- 🔒 **Privacy** - No tracking of users beyond optional analytics you can control
- 🚀 **Modern Stack** - Tauri, React, TypeScript, optional Node/Prisma backend
- 📋 **Tasks** - Simple, powerful task management with optional cloud sync and subscriptions

### Get in Touch

- 🐙 **GitHub**: [github.com/Roboticela](https://github.com/Roboticela)
- 📧 **Email**: contact@roboticela.com
- 🔗 **Repository**: [github.com/Roboticela/ToDo](https://github.com/Roboticela/ToDo)

### Support Roboticela

- ⭐ Star our repositories
- 🐛 Report bugs and suggest features
- 🤝 Contribute code or documentation
- 📣 Share the project with others

---

<div align="center">

## 💖 Thank You!

Thanks for using **Roboticela ToDo**.

**Built with ❤️ by [Roboticela](https://github.com/Roboticela)**

© 2025 Roboticela. Licensed under AGPL-3.0.

---

⭐ **If you find this project useful, please consider giving it a star on GitHub!** ⭐

[⬆ Back to Top](#-roboticela-todo)

</div>
