# HealthTrend release verification — 2026-10-13

Scope: recovery integrity, honest backup status, Pages publication gates and chart provenance. Base: `dcee54d3f1c6a44c063c23f5c94317aa7d83c33c`; branch: `codex/fix-recovery-release-gates`. This record supersedes broad completion statements in the October 12 handoff.

| Area | Implemented | Verification | Remaining acceptance |
| --- | --- | --- | --- |
| Pending restore | Every schema collection and profile prevent empty-vault replacement. Identity/count confirmation, encrypted read-back, atomic ciphertext comparison for writes and rollback. Source files retained; DELETE returns 405. | Unit cases for each collection, cancellation, write/read failures; real encrypted conditional-write tests including a concurrent write during encryption; browser cancellation and restore/re-unlock. | Real personal recovery and device workflows |
| Backup status | File generation/sharing stays unconfirmed; explicit save acknowledgement uses captured revision. Later edits remain outstanding. Automatic writes say local write and cloud sync unverified; writes serialized. OCR confirmations use the same change/backup path. | Unit emission and revision tests; browser download/confirmation; encrypted local-write and new-profile password restore. | Actual iPhone Files/iCloud save, synchronization and restore |
| Public build | Recursive artifact allowlist, symlink rejection, exact comparison with committed synthetic demo, SHA-256 file inventory. Typecheck always; Chromium E2E required in CI before existing workflow upload. | 16 output files audited; injected `dist/seeds/accidental-record.json` caused audit exit 1, removed probe and re-audit passed. `CI=true npm run build:pages` passed locally. | GitHub-hosted Linux execution after main update; permitted source content still requires review, allowlisting cannot prove absence of all possible PHI |
| Chart meanings | Full-width latest-report comparison lines carry date; visible caveat and per-point own range/lab/method/provenance tooltip. Migrated ranges labelled unverified. | Chart assertions and synthetic report export E2E. | Complete printed layout and clinician interpretation; no medical validation claim |
| Native helper | Package compiles Swift source instead of copying a tracked binary; requires target architecture equal to host. Documentation accurately describes Electron Touch ID gating without biometric Keychain ACL. | `swiftc -typecheck electron/native/keychain-touchid.swift` passed. | Full Mac package, actual Touch ID and Keychain device behavior; universal/cross-architecture packaging unsupported in this build path |

## Results

- `npm test`: **30 files, 130 tests passed**.
- `npx tsc --noEmit`: passed.
- `npm run build:pages` and `npm run audit:pages`: passed.
- `npm run test:e2e`: **12 passed, 2 skipped**. Both skips require a packaged native Mac app; they are not successful native acceptance.
- `CI=true npm run build:pages`: CI code path completed locally, including browser installation and the same 12 browser passes / 2 native skips. This does not establish a GitHub Linux runner result.
- Independent code review identified the concurrent-restore and OCR-backup holes; both were corrected and a bounded recheck found no remaining actionable issue in those fixes.
- Vite retains a bundle-size warning (main JS approximately 583 kB uncompressed). No claim of performance optimization, cold offline availability or full historical Git privacy audit.

No real health records were used in regressions. This change is submitted on an independent branch for review; it does not itself merge or deploy the public site.
