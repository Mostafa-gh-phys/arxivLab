#!/usr/bin/env bash
set -euo pipefail

# Build Linux AppImage and Windows .exe (via Electron + electron-builder)
echo "[1/3] Installing desktop packager dependencies (electron & electron-builder) if needed..."
if ! npx --no-install electron-builder --version >/dev/null 2>&1; then
  npm install --no-save electron electron-builder
fi

echo "[2/3] Building Vite frontend and standalone Node server bundle..."
npm run build
npm run build:server

TARGET="${1:-all}"
case "$TARGET" in
  linux)
    echo "[3/3] Packaging Linux .AppImage..."
    npx electron-builder --linux AppImage --publish never
    ;;
  win)
    echo "[3/3] Packaging Windows .exe (NSIS + Portable)..."
    npx electron-builder --win nsis portable --publish never
    ;;
  mac)
    echo "[3/3] Packaging macOS .dmg and .zip (Apple Silicon + Intel)..."
    CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg zip --publish never
    ;;
  all)
    echo "[3/3] Packaging Linux .AppImage and Windows .exe..."
    npx electron-builder --linux AppImage --win nsis portable --publish never
    if [ "$(uname -s)" = "Darwin" ]; then
      echo "[3b/3] Detected macOS host, packaging .dmg and .zip..."
      CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg zip --publish never
    fi
    ;;
  *)
    echo "Usage: $0 [linux|win|mac|all]"
    exit 1
    ;;
esac

echo "Done! Output packages are in ./release/"
ls -lh release/
