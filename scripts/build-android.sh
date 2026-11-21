#!/usr/bin/env bash
set -euo pipefail

export CI=true
export CAPACITOR_TELEMETRY=false
export GRADLE_OPTS="${GRADLE_OPTS:--Dorg.gradle.jvmargs=-Xmx3072m -XX:+HeapDumpOnOutOfMemoryError}"

echo "[1/5] Preparing Capacitor Android packages..."
if [ ! -d "node_modules/@capacitor/android" ] || [ ! -d "node_modules/@capacitor/cli" ]; then
  npm install --no-save @capacitor/cli @capacitor/android
fi

echo "[2/5] Building Vite web bundle..."
npm run build

echo "[3/5] Initializing Capacitor Android project..."
npx cap telemetry off >/dev/null 2>&1 || true
if [ ! -d "android" ]; then
  npx cap add android
fi

echo "[4/5] Applying modern minimal arXivLab launcher icons & versioning..."
RES_DIR="android/app/src/main/res"
mkdir -p "${RES_DIR}/values"

cat > "${RES_DIR}/values/ic_launcher_background.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#090E18</color>
</resources>
XML

resize_png() {
  local src="$1"
  local px="$2"
  local dest="$3"
  mkdir -p "$(dirname "$dest")"
  if command -v convert >/dev/null 2>&1; then
    convert "$src" -resize "${px}x${px}" "$dest"
  elif command -v magick >/dev/null 2>&1; then
    magick "$src" -resize "${px}x${px}" "$dest"
  elif command -v python3 >/dev/null 2>&1 && python3 -c "import PIL" >/dev/null 2>&1; then
    python3 -c "from PIL import Image; Image.open('$src').resize(($px, $px), Image.LANCZOS).save('$dest')"
  else
    cp -f "$src" "$dest"
  fi
}

declare -A ICON_SIZES=( [mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192 )
declare -A FG_SIZES=( [mdpi]=108 [hdpi]=162 [xhdpi]=216 [xxhdpi]=324 [xxxhdpi]=432 )

for density in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  size="${ICON_SIZES[$density]}"
  fg="${FG_SIZES[$density]}"
  resize_png "public/pwa-512x512.png" "$size" "${RES_DIR}/mipmap-${density}/ic_launcher.png"
  resize_png "public/pwa-512x512.png" "$size" "${RES_DIR}/mipmap-${density}/ic_launcher_round.png"
  resize_png "public/pwa-maskable-512x512.png" "$fg" "${RES_DIR}/mipmap-${density}/ic_launcher_foreground.png"
done

PKG_VERSION="$(node -p "require('./package.json').version")"
VERSION_CODE="${ANDROID_VERSION_CODE:-$((20000 + ${GITHUB_RUN_NUMBER:-0}))}"
if [ -f "android/app/build.gradle" ]; then
  sed -i -E "s/versionCode [0-9]+/versionCode ${VERSION_CODE}/" android/app/build.gradle
  sed -i -E "s/versionName \"[^\"]+\"/versionName \"${PKG_VERSION}\"/" android/app/build.gradle
fi

npx cap sync android

echo "[5/5] Building installable Android .apk..."
mkdir -p release

OUTPUT_APK="release/arXivLab-${PKG_VERSION}-android.apk"

(
  cd android
  chmod +x gradlew
  if [ -n "${ANDROID_KEYSTORE_PATH:-}" ] && [ -f "${ANDROID_KEYSTORE_PATH}" ]; then
    echo "Signing release .apk with provided keystore..."
    ./gradlew --no-daemon assembleRelease \
      "-Pandroid.injected.signing.store.file=${ANDROID_KEYSTORE_PATH}" \
      "-Pandroid.injected.signing.store.password=${ANDROID_KEYSTORE_PASSWORD}" \
      "-Pandroid.injected.signing.key.alias=${ANDROID_KEY_ALIAS}" \
      "-Pandroid.injected.signing.key.password=${ANDROID_KEY_PASSWORD}"
  else
    echo "Building directly installable signed debug .apk..."
    ./gradlew --no-daemon assembleDebug
  fi
)

if [ -f "android/app/build/outputs/apk/release/app-release.apk" ]; then
  cp "android/app/build/outputs/apk/release/app-release.apk" "$OUTPUT_APK"
elif [ -f "android/app/build/outputs/apk/debug/app-debug.apk" ]; then
  cp "android/app/build/outputs/apk/debug/app-debug.apk" "$OUTPUT_APK"
else
  echo "ERROR: Expected APK file was not generated."
  exit 1
fi

if [ "${BUILD_AAB:-false}" = "true" ]; then
  (
    cd android
    if [ -n "${ANDROID_KEYSTORE_PATH:-}" ] && [ -f "${ANDROID_KEYSTORE_PATH}" ]; then
      ./gradlew --no-daemon bundleRelease \
        "-Pandroid.injected.signing.store.file=${ANDROID_KEYSTORE_PATH}" \
        "-Pandroid.injected.signing.store.password=${ANDROID_KEYSTORE_PASSWORD}" \
        "-Pandroid.injected.signing.key.alias=${ANDROID_KEY_ALIAS}" \
        "-Pandroid.injected.signing.key.password=${ANDROID_KEY_PASSWORD}"
    else
      ./gradlew --no-daemon bundleRelease
    fi
  )
  if [ -f "android/app/build/outputs/bundle/release/app-release.aab" ]; then
    cp "android/app/build/outputs/bundle/release/app-release.aab" "release/arXivLab-${PKG_VERSION}-playstore.aab"
  fi
fi

echo "Done! Android APK ready in ./release/:"
ls -lh release/
