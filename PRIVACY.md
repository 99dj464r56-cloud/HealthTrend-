# Privacy

HealthTrend keeps health data on the device you use. There is no HealthTrend account, hosted database, analytics, or advertising SDK.

## What stays local

- Confirmed records live in IndexedDB (`health-trend-guest` / `health-trend-pdf` / `health-trend-demo`).
- Photos and PDFs are read in memory for OCR (PDF.js + Tesseract.js). Source files and raw OCR text are not uploaded; only user-confirmed rows are saved.
- Optional Apple Health XML/ZIP import is parsed in the browser. Raw exports are not retained. Workout GPS routes are not imported.

## Personal vault

- Personal mode encrypts the record at rest (PBKDF2-SHA256 → KEK wraps DEK → AES-GCM).
- Unlock with a recovery password; optional Touch ID (WebAuthn PRF in Chromium `localhost`, or Electron Keychain helper on Mac). The native Keychain item is device-bound but has no biometric ACL; Electron performs the Touch ID gate.
- Encrypted backup file: `health-trend-personal.enc.json`. Desktop can write it into a chosen/iCloud folder; on iPhone/iPad Safari the **「生成加密备份」** banner initiates sharing or downloading. Only explicit user confirmation records a manual save; neither download nor local write proves iCloud sync or successful restore. Ciphertext only — the password is never stored in the backup file.
- Public / GitHub Pages / share builds (`VITE_SHARE_BUILD=1`) never ship a personal seed. Personal mode starts empty.

## What you must still protect

- Exported plaintext JSON backups (guest/demo export) contain health information — store carefully.
- Clearing site data removes the local vault; keep a recent encrypted backup before changing browsers or devices.
- Do not commit `public/seeds/personal-backup.json`, `待导入_*`, or recoverable personal ciphertext to git.

## Medical disclaimer

This project is not a medical device or EMR. It does not diagnose or recommend treatment. Verify every transcription against the original report and consult a clinician for care decisions.

## Local recovery source

The optional localhost backup middleware can read a plaintext `_pending-restore.json` from the configured backup directory. Only a completely empty personal vault is eligible, and import requires identity/count confirmation plus exact encrypted read-back verification. Existing records use the manual import preview. Source recovery files are retained; remove them manually after verifying recovery. Never put these files into the public build directory.
