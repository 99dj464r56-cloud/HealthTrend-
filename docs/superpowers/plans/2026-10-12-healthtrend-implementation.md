# HealthTrend — Implementation Plan (毕业作业 2 cut)

## Implemented scope (device acceptance remains separate)

1. Domain model + migrate/validate for medications, regimen stages, indicators, observations, report texts.
2. IndexedDB workspaces: guest / personal (`health-trend-pdf`) / demo — names frozen.
3. Personal vault: `src/security/vault.ts`, `personalLock.ts`, Touch ID (WebAuthn PRF + Electron Keychain).
4. Encrypted backup client: server middleware, FSA, Electron native; mobile share/download banner.
5. Import: JSON backup, Apple Health XML (subset), packaging OCR drafts, medication packaging helpers.
6. Charts + print PDF (A4 landscape, provenance, observation-owned ranges).
7. Mac packaging: `scripts/build-mac-app.ts` → `/Applications/HealthTrend.app`.
8. Share packaging: `VITE_SHARE_BUILD=1`, privacy scan, zip without personal seed.
9. PWA: `public/manifest.webmanifest`, icons 180/192/512, apple-mobile meta, Chinese A2HS tip.
10. Pages: `npm run build:pages` + `.github/workflows/pages.yml` (base `/HealthTrend-/`).

## Verify before push

```bash
npm test
npx tsc --noEmit
npm run build:pages
npm run audit:pages
# optional: npm run test:e2e
```

Privacy: scan working tree + `git log -p` / `git grep` for personal markers (names, DOB, real meds, `personal-backup.json`, `待导入`, recoverable enc PHI). Keep `.gitignore` exclusions; do not delete user's iCloud `待导入_*` files.

## Deploy

- Remote: `git@github.com:99dj464r56-cloud/HealthTrend-.git`
- Branch: merge feature → `main`, push (no force).
- Pages: Actions workflow deploys `dist`; or Settings → Pages → GitHub Actions.
- Expected URL: `https://99dj464r56-cloud.github.io/HealthTrend-/`

## Acceptance status

See [current verification](../../healthtrend-release-verification-2026-10-13.md). Passing automated browser tests does not confirm native Touch ID, iPhone/iCloud restore, complete printed layout, or cold offline launch.
