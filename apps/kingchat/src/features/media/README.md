# Media feature module

Extraction target for media auto-download and gallery consent.

Planned modules:
- `autoDownload.ts`: one shared preference and download policy for received media.
- `galleryConsent.ts`: separate, explicit user permission before saving media to the device gallery.

Compatibility rule: preserve current media display, transfer and retry behavior while introducing the shared setting. Do not silently enable gallery saving.
