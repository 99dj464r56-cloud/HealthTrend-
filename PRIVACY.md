# Privacy

HealthTrend keeps health data on the device you use. There is no HealthTrend account, hosted database, analytics, or advertising SDK.

## What stays local

- Confirmed records live in IndexedDB (`health-trend-guest` / `health-trend-pdf` / `health-trend-demo`).
- Photos and PDFs are read in memory for OCR (PDF.js + Tesseract.js). Source files and raw OCR text are not uploaded; only user-confirmed rows are saved.
- Optional Apple Health XML/ZIP import is parsed in the browser. Raw exports are not retained. Workout GPS routes are not imported.

## Personal records and encrypted backups

- Daily personal access requires no HealthTrend account or app password. Current records are stored **unencrypted in this browser's IndexedDB**; device/browser security protects local access. This does not provide application-level encryption at rest.
- Personal backup export requests a separate backup password (minimum 8 characters), confirmed twice. PBKDF2-SHA256 (310,000 iterations, random salt) wraps a random data key; AES-GCM encrypts the record. The password is never saved in the file or browser settings.
- Downloaded file: `health-trend-personal.enc.json`. Save it to Files / iCloud Drive yourself; initiating a download does not confirm cloud backup completion.
- Restore requires the file and its backup password. Wrong passwords or damaged files do not modify local data; a preview and replacement confirmation precede any write. Legacy plaintext JSON imports remain supported.
- Legacy password-protected local vaults retain their existing one-time migration flow. This release does not restore an application login or idle lock.
- Public/share builds never include a personal seed. Personal mode starts empty; demo data is synthetic.

## What you must still protect

- Guest/demo JSON exports and printed/PDF reports are plaintext and can contain health information — store carefully. Personal backup exports are encrypted.
- Clearing site data removes the local vault; keep a recent encrypted backup before changing browsers or devices.
- Do not commit `public/seeds/personal-backup.json`, `待导入_*`, or recoverable personal ciphertext to git.

## Medical disclaimer

This project is not a medical device or EMR. It does not diagnose or recommend treatment. Verify every transcription against the original report and consult a clinician for care decisions.
