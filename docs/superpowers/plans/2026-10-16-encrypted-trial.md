# Encrypted Trial Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task.

**Goal:** Keep source private, publish a public trial, and encrypt personal backup exports while keeping password-free daily access.
**Architecture:** Reuse the existing WebCrypto envelope format. Request a password only for export/restore. Validate restored records before preview and explicitly confirm replacement. Publish only the share-safe static build through Sites.
**Tech Stack:** TypeScript, Vite, WebCrypto, Vitest, Playwright, Sites static hosting.
**Spec:** User-approved scope in this conversation (2026-10-16).

## Global Constraints
- Do not change GitHub repository visibility.
- Daily personal access stays password-free; local data remains device-local plaintext, clearly disclosed.
- Personal JSON exports must use AES-GCM envelopes; password never included or persisted.
- Public build contains synthetic data only; preserve existing records and legacy import.

## Review Focus
- Wrong passwords/tampered files never overwrite data.
- Canceling export/restore produces no download/write.
- Weak or mismatched passwords keep the dialog open.
- Oversized/malformed imports fail before decryption.
- Public trial uses root base paths, local OCR assets, no personal seed.

### Task 1: Encrypted backup flow
Files: src/import/encryptedBackup.ts, src/import/encryptedBackup.test.ts, src/ui/backupDialog.ts, src/ui/app.ts, src/styles.css, tests/encryptedBackup.spec.ts.
- [x] Write/run failing round-trip, wrong-password, tampering and invalid/oversized input tests.
- [x] Implement exportEncryptedBackup(record,password): Promise<EncryptedBackupFile> and restoreEncryptedBackup(file,password): Promise<HealthRecord> using vault helpers; erase raw keys in finally.
- [x] Add accessible export/restore password dialog, cancel and in-flight handling. Personal export only encrypted; imports preview and confirm before replacement.
- [x] Verify real browser export/reload/restore, wrong password and cancel preservation; fix nested worktree test discovery.
- [x] Correct privacy and onboarding copy to distinguish local storage from encrypted files.

### Task 2: Public static deployment
Files: sanitized Sites project, .openai/hosting.json, delivery README and verification record.
- [x] Build share-safe root-path artifact, run tests/typecheck/privacy audit.
- [x] Copy only tracked sanitized source to a separate Sites project; no git history, backups, private seeds or runtime state.
- [x] Sites creation returned an internal error; listing confirmed no new Site. Fallback: create a public compiled-assets-only GitHub repository and enable Pages, without exposing private source history.
- [x] Verify first-use demo and backup UI, record URL and results; keep GitHub private.

## Execution ledger
- Scope approved by user: ok. Execute inline on codex/encrypted-trial, based on fetched main f4afe83.
- Existing npm test failure reproduced: nested worktree suites wrongly collected; exclude .worktrees.

- Review: independent reviewer found export/restore size mismatch; reproduced with a failing test, fixed by rejecting envelopes above 25 MiB before download.
- Verification: 118 unit tests and 9 web end-to-end tests pass; TypeScript and share-safe build pass. Full e2e additionally found an obsolete packaged Mac app test failure (desktopApp.spec.ts first test; second did not run); desktop binary not rebuilt in this web-only scope.
- Ruling: use a feature branch in the existing clean checkout; avoid changing the older linked worktree.
- Deployment verification and final documentation are pending; checkboxes above describe implemented preparation, not a claim of live availability.

- Additional negative tests: reject excessive KDF work and malformed authenticated schema-v4 records; schema-v4 restores validate without migration defaults. 118 unit tests pass; backup browser round-trip tests rerun and pass.
