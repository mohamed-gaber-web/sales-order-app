---
description: Build a debug Android APK for testing. Runs npm build → cap sync → gradlew assembleDebug and reports the APK path.
---

Build a debug Android APK by running these steps **in order**. Report progress after each step and stop immediately if any step fails.

## Steps

### 1 — Build the web app
```
npm run build
```
Working directory: project root (`D:\Grow Path\Dynamic with app\grow-path`).  
Wait for completion. If it fails, show the error and stop.

### 2 — Sync web assets to Android
```
npx cap sync android
```
Same working directory. This copies the built `www/` into the Android project and updates plugins.  
Wait for completion. If it fails, show the error and stop.

### 3 — Assemble the debug APK
```
.\gradlew.bat assembleDebug
```
Working directory: `android\` subfolder (`D:\Grow Path\Dynamic with app\grow-path\android`).  
This is the Gradle wrapper for Windows. Wait for completion — it can take 1–3 minutes on a cold build.  
If it fails, show the full Gradle error output.

### 4 — Locate and report the APK
After a successful build, the debug APK is at:
```
android\app\build\outputs\apk\debug\app-debug.apk
```
Confirm the file exists and report:
- Full absolute path to the APK
- File size
- A reminder that this is a **debug build** — install via `adb install` or share directly to a test device.

## Notes
- If `gradlew.bat` is not found, check that the `android/` directory exists and run `npx cap add android` first.
- If the build fails with a Java or SDK error, check that `ANDROID_HOME` / `JAVA_HOME` environment variables are set correctly.
- The APK is signed with the debug keystore — suitable for internal testing only, not for Play Store submission.
