#!/usr/bin/env bash
set -euo pipefail

# Build Android .apk (sideload) and .aab (Google Play App Bundle) via Capacitor
echo "[1/4] Checking Capacitor Android dependencies..."
if ! npx --no-install cap --version >/dev/null 2>&1; then
  npm install --no-save @capacitor/cli @capacitor/android @capacitor/assets
fi

echo "[2/4] Building Vite web bundle..."
npm run build

echo "[3/4] Preparing Capacitor Android project & launcher icons..."
if [ ! -d "android" ]; then
  npx cap add android
fi

# Generate Android mipmap launcher icons & splash if assets folder exists
mkdir -p assets
cp -f public/pwa-512x512.png assets/icon-only.png
cp -f public/pwa-maskable-512x512.png assets/icon-foreground.png
cp -f public/pwa-maskable-512x512.png assets/splash.png
npx --yes @capacitor/assets generate --android || true

# Ensure versionName and versionCode match package.json cleanly
PKG_VERSION="$(node -p "require('./package.json').version")"
VERSION_CODE="${ANDROID_VERSION_CODE:-$((20000 + ${GITHUB_RUN_NUMBER:-0}))}"
if [ -f "android/app/build.gradle" ]; then
  sed -i -E "s/versionCode [0-9]+/versionCode ${VERSION_CODE}/" android/app/build.gradle
  sed -i -E "s/versionName \"[^\"]+\"/versionName \"${PKG_VERSION}\"/" android/app/build.gradle
fi

npx cap sync android

echo "[4/4] Building Android .apk and Google Play .aab..."
mkdir -p release

SIGNING_ARGS=()
if [ -n "${ANDROID_KEYSTORE_PATH:-}" ] && [ -f "${ANDROID_KEYSTORE_PATH}" ]; then
  echo "Using provided release keystore for signing..."
  SIGNING_ARGS=(
    "-Pandroid.injected.signing.store.file=${ANDROID_KEYSTORE_PATH}"
    "-Pandroid.injected.signing.store.password=${ANDROID_KEYSTORE_PASSWORD}"
    "-Pandroid.injected.signing.key.alias=${ANDROID_KEY_ALIAS}"
    "-Pandroid.injected.signing.key.password=${ANDROID_KEY_PASSWORD}"
  )
fi

(
  cd android
  chmod +x gradlew
  if [ ${#SIGNING_ARGS[@]} -gt 0 ]; then
    ./gradlew assembleRelease bundleRelease "${SIGNING_ARGS[@]}"
  else
    ./gradlew assembleDebug bundleRelease
  fi
)

if [ -f "android/app/build/outputs/apk/release/app-release.apk" ]; then
  cp "android/app/build/outputs/apk/release/app-release.apk" "release/arXivLab-${PKG_VERSION}-android.apk"
elif [ -f "android/app/build/outputs/apk/debug/app-debug.apk" ]; then
  cp "android/app/build/outputs/apk/debug/app-debug.apk" "release/arXivLab-${PKG_VERSION}-android-debug.apk"
fi

if [ -f "android/app/build/outputs/bundle/release/app-release.aab" ]; then
  cp "android/app/build/outputs/bundle/release/app-release.aab" "release/arXivLab-${PKG_VERSION}-playstore.aab"
fi

echo "Done! Android artifacts in ./release/:"
ls -lh release/
