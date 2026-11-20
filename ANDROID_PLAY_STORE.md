# Publishing arXivLab Android to Google Play Store

arXivLab includes:
1. **Phone-optimized Android PWA** (`vite-plugin-pwa`): Android Chrome/Edge users can tap **Install App** inside Settings/Menu (or browser menu -> *Install app*) immediately with zero store wait.
2. **Native Android APK & Google Play App Bundle (`.aab`)** via Capacitor (`org.arxivlab.workstation`) with on-device direct arXiv, INSPIRE-HEP, PDF download, and Google Drive/WebDAV sync (`CapacitorHttp` bypasses WebView CORS natively).

## Why Google Play Cannot Be Auto-Published Without Your Account
Publishing directly to Google Play requires your own **Google Play Console** developer account, identity verification, app signing keystore, Data Safety declaration, and store graphics. Once you configure the secrets below, `.github/workflows/build-android.yml` builds and can automatically upload `.aab` builds to your **Internal Testing** track.

---

## Step 1: Create an Upload Keystore (One-Time)
```bash
keytool -genkey -v -keystore arxivlab-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias arxivlab
base64 -w0 arxivlab-upload.jks > keystore.b64.txt
```

## Step 2: Add GitHub Repository Secrets (Recommended for Play Console)
In **GitHub -> Settings -> Secrets and variables -> Actions**, add:
- `ANDROID_KEYSTORE_BASE64`: contents of `keystore.b64.txt`
- `ANDROID_KEYSTORE_PASSWORD`: your keystore password
- `ANDROID_KEY_ALIAS`: `arxivlab`
- `ANDROID_KEY_PASSWORD`: your key password
- *(Optional auto-upload)* `PLAY_STORE_SERVICE_ACCOUNT_JSON`: Google Cloud service account JSON granted **Release manager** permissions in Google Play Console.

## Step 3: Build `.apk` and `.aab`
- **GitHub Actions**: Run **Actions -> Build Android App (APK & Google Play AAB)** -> **Run workflow** (check `upload_to_play_internal` once secrets are added).
- **Local Linux/macOS/Windows with Android SDK**:
  ```bash
  npm run dist:android
  ```
  Outputs `release/arXivLab-2.0.0-android.apk` (or debug `.apk` if unsigned) and `release/arXivLab-2.0.0-playstore.aab`.

## Step 4: Submit on Google Play Console
1. Create an app in **Google Play Console** (`org.arxivlab.workstation`).
2. Enroll in **Play App Signing** and upload `arXivLab-2.0.0-playstore.aab` under **Testing -> Internal testing** (or **Production**).
3. Complete Store Listing (screenshots, icon `public/pwa-512x512.png`, Privacy Policy URL, Data Safety).
4. Submit for Google Play review.
