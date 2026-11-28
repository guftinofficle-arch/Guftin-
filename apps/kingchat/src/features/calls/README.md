# Calls feature module

This folder is the extraction target for call UI and call lifecycle code from the existing `App.tsx`.

Planned modules:
- `CallControls.tsx`: accessible microphone, speaker, camera-flip and hang-up controls.
- `callLifecycle.ts`: shared call end/cleanup state transitions.
- `callRecording.ts`: local recording-save flow and permission/error handling.
- `backgroundCalls.ts`: Android ongoing-call notification and background integration.

Compatibility rule: keep the current call implementation in `App.tsx` active until each extracted module is wired in and verified. Do not remove existing call behavior during extraction.
