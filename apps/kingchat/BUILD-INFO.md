# Guftin Android build

The Android QA APK is built by GitHub Actions using the Android SDK and Gradle (`assembleRelease`). Expo is used only to generate the native Android project and JavaScript bundle; the APK compilation and emulator smoke test run on GitHub-hosted runners.

Workflow: `.github/workflows/guftin-android-apk.yml`
