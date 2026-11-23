#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$GITHUB_WORKSPACE/apps/kingchat"
APK="${APK_PATH:-$PROJECT_ROOT/android/app/build/outputs/apk/release/app-release.apk}"
LOG="$PROJECT_ROOT/startup-smoke-logcat.txt"

capture_logs() {
  adb logcat -d -v threadtime > "$LOG" 2>/dev/null || true
}
trap capture_logs EXIT

if [[ ! -s "$APK" ]]; then
  echo "::error::Release APK not found or empty: $APK"
  exit 1
fi
ls -lh "$APK"

adb wait-for-device
timeout 180s adb install -r "$APK"
adb logcat -c
timeout 30s adb shell monkey -p com.guftin.app -c android.intent.category.LAUNCHER 1

# Give React Native, native modules, and the first screen time to initialize.
sleep 60
capture_logs

PID="$(adb shell pidof -s com.guftin.app | tr -d '\r' || true)"
if [[ -z "$PID" ]]; then
  echo "::error::Guftin process exited after launch. Inspect the attached startup-smoke-logcat.txt for the fatal exception."
  grep -E -i 'FATAL EXCEPTION|Fatal signal|UnsatisfiedLinkError|AndroidRuntime|ReactNativeJS|SoLoader|LiveKit' "$LOG" | tail -n 160 || true
  exit 1
fi

if grep -E -q 'FATAL EXCEPTION|Fatal signal [0-9]+|TurboModuleInteropUtils|Exception in HostObject|Unable to load script|Make sure you.re running Metro|ReactNativeJS.*(Error|error|Invariant Violation)' "$LOG"; then
  echo "::error::Android reported a fatal exception, missing JavaScript bundle, or React Native startup error. Inspect startup-smoke-logcat.txt."
  grep -E -i 'FATAL EXCEPTION|Fatal signal|TurboModuleInteropUtils|Exception in HostObject|UnsatisfiedLinkError|AndroidRuntime|ReactNativeJS|SoLoader|LiveKit' "$LOG" | tail -n 160 || true
  exit 1
fi

RESUMED_ACTIVITY="$(adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' | grep -F 'com.guftin.app' || true)"
if [[ -z "$RESUMED_ACTIVITY" ]]; then
  echo "::error::Guftin process is alive but its launcher activity is not resumed."
  exit 1
fi

echo "Guftin remained alive for 60 seconds and its launcher activity stayed resumed (PID $PID)."
echo "$RESUMED_ACTIVITY"

# Verify a true cold launch while the emulator has no network connection.
adb shell svc wifi disable || true
adb shell svc data disable || true
sleep 3
adb shell am force-stop com.guftin.app
adb logcat -c
timeout 30s adb shell monkey -p com.guftin.app -c android.intent.category.LAUNCHER 1
sleep 20
capture_logs
OFFLINE_PID="$(adb shell pidof -s com.guftin.app | tr -d '\r' || true)"
OFFLINE_ACTIVITY="$(adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' | grep -F 'com.guftin.app' || true)"
if [[ -z "$OFFLINE_PID" || -z "$OFFLINE_ACTIVITY" ]]; then
  echo "::error::Guftin did not remain open after a cold launch with Wi-Fi and mobile data disabled."
  grep -E -i 'FATAL EXCEPTION|Fatal signal|AndroidRuntime|ReactNativeJS|Unable to load script' "$LOG" | tail -n 160 || true
  exit 1
fi
if grep -E -q 'FATAL EXCEPTION|Fatal signal [0-9]+|Unable to load script|ReactNativeJS.*(Error|error|Invariant Violation)' "$LOG"; then
  echo "::error::Guftin reported a fatal React Native error during offline cold launch."
  grep -E -i 'FATAL EXCEPTION|Fatal signal|AndroidRuntime|ReactNativeJS|Unable to load script' "$LOG" | tail -n 160 || true
  exit 1
fi
echo "Guftin cold-launched offline and stayed in the foreground (PID $OFFLINE_PID)."
echo "$OFFLINE_ACTIVITY"
