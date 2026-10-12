# HealthTrend — Product Design

## Intent

HealthTrend is a **local-only** personal health organizer. A person or caregiver can collect medication regimens and longitudinal lab observations, review OCR drafts from photos/PDFs, chart trends with **report-owned** reference ranges, print a clean landscape PDF, and keep an **encrypted** copy on iCloud / Files. Nothing is uploaded to a HealthTrend server — there is no account and no cloud database.

## Modes

| Mode | Storage | Seed | Typical use |
|------|---------|------|-------------|
| Guest | `health-trend-guest` IndexedDB | empty | try the UI, disposable |
| Demo | `health-trend-demo` | committed synthetic `demo-record.json` | demos / screenshots / homework |
| Personal | `health-trend-pdf` | optional local restore only | real record; password + optional Touch ID vault |

Public / GitHub Pages / share builds set `VITE_SHARE_BUILD=1` so personal mode starts empty (set-password flow) and **never** ships `personal-backup.json`.

## Privacy model

- At rest (personal): envelope encryption — PBKDF2-SHA256 (≥310k) derives a KEK that wraps a random DEK; AES-GCM protects the record (`current-enc` + vault meta).
- Unlock: recovery password always; Touch ID via WebAuthn PRF in Chromium `localhost`, or Electron `promptTouchID` + native Keychain helper on Mac.
- Backup file: `health-trend-personal.enc.json` (`health-trend-personal-enc` v2). Ciphertext only; password never stored in the file.
- Desktop auto-backup: Vite loopback middleware `/__backup/*` when `HEALTH_BACKUP_DIR` points at an iCloud folder, or File System Access API, or Electron native write.
- Mobile Safari / PWA: persistent banner **「备份到 iCloud」** → Web Share / download of the `.enc.json` into 文件 App → iCloud; stale reminder if >2 days or ≥5 changes since last success.
- No PHI in git, demos, screenshots, or share zips (privacy markers + `audit:public`).

## Surfaces

1. **Browser SPA** (Vite + TypeScript) — guest / demo / personal.
2. **PWA** — manifest, icons, viewport-fit, Add to Home Screen notes in Chinese.
3. **Mac app** (`HealthTrend.app`) — Electron `app://healthtrend/`, Touch ID, print, native backup.
4. **GitHub Pages** — base `/HealthTrend-/`, share-safe build, no personal seed.

## OCR & data ownership

- Photos / PDFs → in-browser OCR → **draft rows only**; human review required before save.
- Reference ranges come from the lab report the user attaches (or manual entry) — HealthTrend does not invent clinical “normal” ranges.
- Medication stages support open-ended「仍使用」when `endDate` is empty.

## Non-goals

- No diagnosis, treatment advice, interaction checker, or causal claims between meds and labs.
- No hosted sync, analytics, or CDN-loaded OCR/models at runtime.
- No automatic acceptance of OCR values.

## Roadmap note (not in this homework cut)

Family multi-profile (separate vaults per person under one device) is intentionally deferred; storage keys and mode switcher are shaped so a later profile picker can land without a schema rename.
