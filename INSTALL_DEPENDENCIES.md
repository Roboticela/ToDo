# Build Dependencies Installation Guide

Complete list of packages needed to build Roboticela ToDo for all platforms and architectures.

> 📚 **After installing dependencies, see [README.md - Building for Production](README.md#-building-for-production) for build instructions and commands.**

---

## 🐧 Linux (Ubuntu/Debian)

### Base Build Tools
```bash
sudo apt update
sudo apt install -y \
  curl \
  wget \
  file \
  build-essential \
  libssl-dev \
  pkg-config \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev
```

### Cross-Compilation Tools

#### Windows Cross-Compilation (MinGW)
```bash
sudo apt install -y \
  mingw-w64 \
  gcc-mingw-w64 \
  g++-mingw-w64 \
  clang-17
```

#### ARM64/aarch64 Cross-Compilation
```bash
sudo apt install -y \
  gcc-aarch64-linux-gnu \
  g++-aarch64-linux-gnu \
  crossbuild-essential-arm64 \
  libc6-dev-arm64-cross \
  libssl-dev:arm64 \
  libgtk-3-dev:arm64 \
  libwebkit2gtk-4.1-dev:arm64
```

#### ARMv7 Cross-Compilation
```bash
sudo apt install -y \
  gcc-arm-linux-gnueabihf \
  g++-arm-linux-gnueabihf \
  crossbuild-essential-armhf \
  libc6-dev-armhf-cross \
  libssl-dev:armhf \
  libgtk-3-dev:armhf \
  libwebkit2gtk-4.1-dev:armhf
```

### Node.js & npm
```bash
# Install Node.js (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# npm comes with Node.js
```

### Rust & Cargo
```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add Rust targets
rustup target add \
  x86_64-unknown-linux-gnu \
  aarch64-unknown-linux-gnu \
  armv7-unknown-linux-gnueabihf \
  x86_64-pc-windows-gnu \
  x86_64-pc-windows-msvc \
  aarch64-pc-windows-msvc \
  i686-pc-windows-msvc \
  x86_64-apple-darwin \
  aarch64-apple-darwin
```

## 🪟 Windows

### Using Windows Package Managers

#### Chocolatey (Recommended)
```powershell
# Install Chocolatey first (as Administrator)
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install build tools
choco install -y nodejs visualstudio2022buildtools visualstudio2022-workload-vctools rust-ms
choco install -y webview2-runtime

# npm comes with Node.js
```

#### WinGet
```powershell
# Install Node.js
winget install OpenJS.NodeJS.LTS

# Install Rust
winget install Rustlang.Rustup

# Install Visual Studio Build Tools
winget install Microsoft.VisualStudio.2022.BuildTools

# Install WebView2
winget install Microsoft.EdgeWebView2Runtime

# npm comes with Node.js
```

### Manual Installation
1. **Visual Studio 2022** (Community/Build Tools): https://visualstudio.microsoft.com/downloads/
   - Select "Desktop development with C++" workload
   
2. **Rust**: https://rustup.rs/
   
3. **Node.js**: https://nodejs.org/
   
4. **WebView2**: https://developer.microsoft.com/microsoft-edge/webview2/

### Rust Targets (Windows)
```powershell
rustup target add x86_64-pc-windows-msvc
rustup target add aarch64-pc-windows-msvc
rustup target add i686-pc-windows-msvc
```

## 🍎 macOS

### Xcode & Command Line Tools
```bash
# Install Xcode from App Store
# Then install Command Line Tools
xcode-select --install

# Accept license
sudo xcodebuild -license accept
```

### Homebrew & Dependencies
```bash
# Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install dependencies
brew install node
```

### Rust & Targets
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add targets
rustup target add x86_64-apple-darwin
rustup target add aarch64-apple-darwin
```

## 📦 All-in-One Installation Scripts

### Linux (Ubuntu/Debian) - Complete Setup
```bash
#!/bin/bash

echo "🚀 Installing all build dependencies for Roboticela ToDo..."

# Base system tools
sudo apt update
sudo apt install -y curl wget file build-essential libssl-dev pkg-config

# Tauri dependencies
sudo apt install -y \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev

# Cross-compilation tools (optional)
echo "📦 Installing cross-compilation tools..."
sudo apt install -y \
  mingw-w64 \
  gcc-mingw-w64 \
  g++-mingw-w64 \
  gcc-aarch64-linux-gnu \
  g++-aarch64-linux-gnu \
  gcc-arm-linux-gnueabihf \
  g++-arm-linux-gnueabihf \
  crossbuild-essential-arm64 \
  crossbuild-essential-armhf

# Node.js & npm
echo "📦 Installing Node.js and npm..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
# npm comes with Node.js

# Rust
echo "🦀 Installing Rust..."
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

# Rust targets
echo "🎯 Adding Rust compilation targets..."
rustup target add \
  x86_64-unknown-linux-gnu \
  aarch64-unknown-linux-gnu \
  armv7-unknown-linux-gnueabihf \
  x86_64-pc-windows-gnu \
  aarch64-linux-android \
  armv7-linux-androideabi \
  i686-linux-android \
  x86_64-linux-android

echo ""
echo "✅ Base dependencies installed!"
echo "🎉 Ready to build! Run: npm run tauri build"
```

Save this as `install-deps.sh`, make it executable, and run:
```bash
chmod +x install-deps.sh
./install-deps.sh
```

### macOS - Complete Setup
```bash
#!/bin/bash

echo "🚀 Installing all build dependencies for Roboticela ToDo..."

# Install Xcode Command Line Tools
xcode-select --install

# Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js (npm comes with Node.js)
brew install node

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

# Add Rust targets
rustup target add x86_64-apple-darwin
rustup target add aarch64-apple-darwin

echo "✅ All dependencies installed!"
echo "🎉 Ready to build! Run: npm run tauri build"
```

## 🔍 Verification Commands

After installation, verify everything is set up:

```bash
# Check versions
node --version
npm --version
rustc --version
cargo --version

# Check installed Rust targets
rustup target list --installed

# Check cross-compilers (Linux)
x86_64-w64-mingw32-gcc --version
aarch64-linux-gnu-gcc --version
arm-linux-gnueabihf-gcc --version
```

## 📊 Platform Requirements Summary

| Platform | Required Tools | Optional |
|----------|---------------|----------|
| **Linux x86_64** | ✅ Rust, Node.js, GTK3, WebKit2GTK | - |
| **Linux ARM64** | ✅ + ARM64 cross-compiler | - |
| **Linux ARMv7** | ✅ + ARMv7 cross-compiler | - |
| **Windows** | ✅ MinGW (Linux) OR Windows + MSVC | - |
| **macOS** | ❌ Requires macOS + Xcode | - |

## 🚀 Quick Start After Installation

```bash
# Clone and setup
cd ToDo
npm install

# Build for current platform
npm run tauri build

# Generate checksums (if script exists)
npm run checksums
```

## 💡 Tips

1. **Docker Alternative**: Consider using Docker for consistent cross-platform builds
2. **CI/CD**: Use GitHub Actions with multiple runners for true multi-platform builds
3. **Space Requirements**: Ensure ~10GB free space for dependencies and builds
4. **Memory**: 8GB+ RAM recommended for builds

## 🔗 Official Documentation

- Tauri Prerequisites: https://tauri.app/v1/guides/getting-started/prerequisites
- Rust Installation: https://rustup.rs/
- Node.js Installation: https://nodejs.org/

---

**Last Updated**: January 25, 2026  
**Tauri Version**: 2.x  
**Tested On**: Ubuntu 22.04, Windows 11, macOS 14
