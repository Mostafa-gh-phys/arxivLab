# Building & Installing arXivLab on Android

arXivLab includes:
1. **Phone-optimized Android PWA** (`vite-plugin-pwa`): Android Chrome/Edge users can tap **Install App** inside Settings/Menu (or browser menu -> *Install app*) immediately with zero store wait.
2. **Native Android APK** via Capacitor (`org.arxivlab.workstation`) with on-device direct arXiv, INSPIRE-HEP, PDF download/highlighting, and Google Drive/WebDAV sync (`CapacitorHttp` bypasses WebView CORS natively).

## Option A: Build & Download Android `.apk` via GitHub Actions (Recommended)
No Google Play account or keystore secrets are required to build and install the `.apk`:

1. Open **Actions -> Build Android APK** (`.github/workflows/build-android.yml`) -> **Run workflow**.
2. Toggle `commit_apk_to_repo: true` if you also want `apk/arXivLab-android.apk` committed directly into the repository, or keep `publish_github_release: true` to attach the `.apk` to a GitHub Release (`v2.0-android`).
3. Download `arXivLab-2.0.0-android.apk` from the Workflow Artifact (`arxivlab-android-apk`) or GitHub Release and install it on your Android phone.

---

## Option B: Build Locally with Android SDK
```bash
npm run dist:android
```
Outputs `release/arXivLab-2.0.0-android.apk` with the modern minimal `χ` launcher icon.

---

## Option C: Optional Signed Release APK or Play Store `.aab`
If you later decide to distribute on Google Play:
1. Generate an upload keystore:
   ```bash
   keytool -genkey -v -keystore arxivlab-upload.jks \
     -keyalg RSA -keysize 2048 -validity 10000 -alias arxivlab
   base64 -w0 arxivlab-upload.jks > keystore.b64.txt
   ```
2. Add GitHub Actions secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) or run locally with `BUILD_AAB=true npm run dist:android`.

