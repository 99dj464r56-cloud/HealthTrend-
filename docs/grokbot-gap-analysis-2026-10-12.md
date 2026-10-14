> Historical record (2026-10-12). Current acceptance status and fixes: [release verification](healthtrend-release-verification-2026-10-13.md). Earlier completion labels do not establish device acceptance.

# Gap analysis + domain model sketch + phased plan

**Date:** 2026-10-12 (Asia/Taipei)  
**Branch:** `feature/health-trend-pdf` @ `396051a`  
**Worktree:** `<worktree>`  
**Scope:** Phase 1 only (instructions §5 item 1). No large implementation in this session.  
**Sources:** `docs/grokbot-complete-health-trend-pdf-instructions.md` §§2–7, design spec, implementation plan, current `src/**`, `README.md`, `PRIVACY.md`.

---

## 1. Current architecture summary

The app is a Vite + TypeScript static SPA. Confirmed records live in IndexedDB (`health-trend-pdf` / store `records` / key `current`). PDF text extraction uses PDF.js; image/scanned pages use bundled Tesseract.js (`chi_sim+eng`). Charts are SVG; PDF export is browser print-to-PDF via an A4 landscape print view.

### Schema (`src/domain/types.ts`, `schemaVersion: 1`)

| Entity | Role today |
| --- | --- |
| `HealthRecord` | Root: `medications`, `indicators`, `observations`, `sources` |
| `Indicator` | Bilingual name/purpose, category, **unit**, **`lowerLimit` / `upperLimit`**, `priority` |
| `Observation` | `indicatorId`, `date` (YYYY-MM-DD), **`value: number`**, `unit`, optional `sourceId` / `pageNumber`, `confirmed: true` |
| `Medication` | Bilingual names, `strength`, `instructions`, optional `startDate`/`endDate`, `linkedIndicatorIds` |
| `Source` | `fileName`, type `image`\|`pdf`\|`manual`, `importedAt`, `pageCount` |

Validation (`src/domain/validation.ts`) enforces unique IDs, ISO dates, finite numeric observation values, unit match between observation and indicator, and rejects unconfirmed observations. There is **no migration path** beyond `schemaVersion === 1` hard-reject.

### Charts + PDF

- `buildSeries` (`src/charts/series.ts`) groups by indicator + unit; attaches **one** `referenceRange` from the indicator; classifies every point with that single range.
- `renderIndicatorChart` (`src/charts/chartSvg.ts`) draws **index-equidistant** X positions (`mappedX(index, length)`), a single pair of dashed reference lines across the plot, connected polyline, latest-three labels (currently `YYYY-MM` via `monthLabel`), red abnormal styling.
- `buildReportModel` / `printView` put priority series in a dedicated section **and** again inside category sections (intentional duplication already present). Medication list + linked dose text appear under charts; no chart-level dose band graphics yet.

### Import

- Manual forms (`src/ui/manualForms.ts`, `src/import/manual.ts`).
- PDF text (`src/import/pdfText.ts`) + OCR (`src/import/imageOcr.ts`) → draft candidates (`parseCandidates`) → human review (`reviewTable` / `importPanel`) before save.
- Candidate ranges are strings on the draft; on confirm, ranges are written onto the **Indicator**, not the Observation (`src/ui/app.ts`).
- Backup: JSON export/import (`src/import/backup.ts`) with size cap; no preview/conflict UI, no encryption, version must be exactly 1.

### Storage / privacy baseline

- IndexedDB only; no account/sync. PRIVACY.md: uploaded docs/OCR stay in memory; only confirmed transcription is saved. First OCR loads ~36 MiB same-origin worker/WASM/lang assets. README documents no upload/API and local IndexedDB.

---

## 2. Gap vs requirements (instructions §§2–4)

Legend: **Done** / **Partial** / **Missing**. Map to current files.

### §2 Product decisions already confirmed

| # | Requirement | Status | Current files / notes |
| --- | --- | --- | --- |
| 1 | Per-observation report reference range + comparator | **Missing** | Ranges on `Indicator` (`types.ts`); confirm path overwrites indicator limits (`app.ts`); no comparator field |
| 2 | Priority markers repeated in priority + category sections | **Done** | `reportModel.ts` filters `priority` into `priorityIndicators` and still lists them under `categories` |
| 3 | Latest report prose (findings/conclusion/advice) in same PDF after user confirm | **Missing** | No text-block entity; print view is meds + charts only (`printView.ts`) |
| 4 | Bilingual labels, per-category charts, year-aware dates, trend line, latest-three, ref marks, red abnormal, A4 landscape | **Partial** | Mostly present; dates on labels/ticks use `YYYY-MM` not full date; X-axis not true time scale; ref lines are series-global not per-point |
| 5 | Keep approved report style; implement Astra fixes without removing style | **Constraint** | Do not remove priority duplication or A4 landscape conventions while closing gaps |

### §3 P0 — correctness, provenance, identity

| ID | Requirement | Status | Map to files |
| --- | --- | --- | --- |
| **3.1** | Each observation keeps own value, unit, low/high, comparator, date, lab, method, specimen, source/page; missing range stays blank; migration marks unverified ranges; versioned migrate + rollback | **Missing** | `types.ts` Observation lacks range/comparator/lab/method; `validation.ts` requires finite `number`; `indexedDb.ts` no migrate; `backup.ts` rejects non-v1 |
| **3.2** | Trend = measured values only; classify per point’s own range; no fake unified band across labs; per-date range marks; optional compare-ref is user-opt-in; units separate; no silent `<0.01`→`0.01` | **Missing / Partial** | Unit split exists (`series.ts`); classification + dashed lines use indicator range (`series.ts`, `chartSvg.ts`); value always exact number; no comparator, no per-point range UI, no compare-ref mode |
| **3.3** | Real time-scale X-axis; latest three full dates; same-day multiples; dense labels; no dropping history for label clarity | **Missing / Partial** | Equidistant index X (`chartSvg.ts` `mappedX`); latest-three kept (good); labels `YYYY-MM`; uncommitted dirty change adds label collision lanes (preserve) but does not fix time scale |
| **3.4** | Local profile identity; import confirm; PDF shows subject; OCR name = hint only | **Missing** | No profile on `HealthRecord`; report title is generic (`reportModel.ts`); import does not ask subject |

### §3 P1 — meds + report import

| ID | Requirement | Status | Map to files |
| --- | --- | --- | --- |
| **3.5** | Medication regimen stages (dose/freq/form, start/end); keep history; chart time bands; unknown dates explicit; reject inverted ranges; package OCR ≠ dose | **Partial** | Single `Medication` with one start/end (`types.ts`); text period under chart (`printView.ts`); no stage history, no SVG bands; strength/instructions free text; parseCandidates skips bare mg strengths (partial) |
| **3.6** | Richer lab parsing (CBC units, inequalities, qualitative, layouts, aliases); report-level date/lab; batch review; dup/conflict; coverage stats; page preview; OCR ephemeral | **Partial** | Draft-only candidates + review UI exist; OCR not persisted as source blob (good); parsing is simple line regex (`parseCandidates.ts`); no alias dictionary, no inequality/qualitative, no dup/conflict/coverage stats, no batch confirm |
| **3.7** | Confirmed report text sections in PDF with provenance; no AI rewrite; length → appendix with notice | **Missing** | No `ReportTextBlock` / UI / print section |

### §3 P2 — traceability, backup, scale

| ID | Requirement | Status | Map to files |
| --- | --- | --- | --- |
| **3.8** | PDF appendix: source file/page, confirm status, revision notes, template version | **Missing** | Points carry `sourceId`/`pageNumber` in series but print view does not render provenance appendix |
| **3.9** | Backup version compat, import preview, conflict strategy, recoverable failure; optional encryption; offline claim must be tested | **Partial / Missing** | Round-trip JSON + validate only (`backup.ts`); README/PRIVACY describe local IndexedDB + first-load OCR assets — **offline claim needs later network-offline e2e** (see § privacy notes) |
| **3.10** | Synthetic scale tests (23 CBC, 67 indicators, long meds, dense dates, different ranges); per-page PDF visual check | **Partial** | Unit/e2e tests + synthetic fixture exist; no large CBC/67 fixture or page-render visual checklist automation yet |

### §4 Apple Health / Fitness manual import

| Area | Status | Notes |
| --- | --- | --- |
| Manual XML/ZIP import UI + category/date filter + preview + confirm | **Missing** | No `appleHealth*` modules; sources type has no `apple-health` |
| Record / Workout / ActivitySummary mapping, original type/unit/time/source | **Missing** | Activity data would need separate category/series semantics (not lab Indicator) |
| Safe XML (no DTD/XXE), ZIP bomb limits, memory-only raw file | **Missing** | Only general import size/page limits (`limits.ts`) |
| Idempotent fingerprint, conflict UI, cancel = no write | **Missing** | — |
| No HealthKit / OAuth / cloud / GPS routes | **Out of scope** (correctly absent) | — |

---

## 3. Domain model change sketch

Target: bump **`schemaVersion` → 2** with explicit migrate `1 → 2`, migrate tests, and rollback-safe load (keep pre-migrate snapshot until validate succeeds).

### 3.1 Observation / Result (P0 core)

Keep `Indicator` as the catalog (names, purpose, category, default unit, priority). **Move clinical interpretation inputs onto each observation:**

```ts
// sketch — not implemented this session
type Comparator = 'eq' | 'lt' | 'gt' | 'lte' | 'gte' | null;
type RangeProvenance = 'report' | 'user-entered' | 'migrated-unverified' | 'absent';

interface ObservationV2 {
  id: string;
  indicatorId: string;
  date: string;                 // YYYY-MM-DD local calendar date
  // raw reporting semantics
  rawValueText: string;         // e.g. "<0.01", "阳性", "88.4"
  numericValue: number | null;  // null when qualitative / non-numeric
  comparator: Comparator;       // null for exact or qualitative
  unit: string;
  lowerLimit: number | null;
  upperLimit: number | null;
  rangeProvenance: RangeProvenance;
  // optional context
  laboratory: string | null;
  method: string | null;
  specimen: string | null;
  sourceId: string | null;
  pageNumber: number | null;
  confirmed: true;
}
```

**Rules:**

- Classify using **this observation’s** limits + comparator; never rewrite historical limits when a later report updates the indicator catalog.
- Indicator-level `lowerLimit`/`upperLimit` become optional **defaults for new manual rows only**, or are removed from authoritative classification after migrate (prefer: keep as UI defaults, never as chart truth).
- Migration from v1: copy indicator limits onto each matching-unit observation with `rangeProvenance: 'migrated-unverified'`; do not claim they are original report ranges.
- Comparators: never coerce `<0.01` to exact `0.01` for plotting as a precise point without marking inequality (plot as open marker / label with symbol; exclude from “exact” stats).

### 3.2 Migration versioning / rollback

- `validateHealthRecord` accepts `1 | 2`; `migrateHealthRecord(record): HealthRecordV2`.
- `loadHealthRecord`: read raw → if v1, deep-clone → migrate → validate v2 → **only then** rewrite IndexedDB (or write-on-next-save with in-memory v2); on migrate/validate failure, leave v1 bytes untouched and surface recoverable error.
- Backup import: preview schema version; offer migrate-with-unverified-range notice; refuse unknown future versions.
- Tests: synthetic v1 fixture round-trip; failure injection does not clear store.

### 3.3 Profile identity

```ts
interface Profile {
  displayName: string;          // user-chosen local label
  notes?: string;
  createdAt: string;
  // no government ID / medical record number required
}
// HealthRecordV2.profile: Profile
```

- PDF header shows `profile.displayName`.
- Import review: show profile; if OCR text suggests a different person name, **prompt** — never auto-file.
- Tests use synthetic names only (`Alex Demo`, `Parent A`), never real family data.

### 3.4 Medication regimen stages

```ts
interface MedicationRegimenStage {
  id: string;
  medicationId: string;         // stable drug identity
  doseAmount: string | null;    // e.g. "1"
  doseUnit: string | null;      // e.g. "tablet" — distinct from package count
  strengthLabel: string;        // e.g. "5 mg"
  frequency: string;
  form: string | null;
  startDate: string | null;     // null = unknown (must display as unknown)
  endDate: string | null;
}
```

- Editing “current” creates/closes stages; historical stages retained.
- Reject `startDate > endDate` when both known.
- Chart: neutral time bands / markers from stages linked via `linkedIndicatorIds`; no causal copy.

### 3.5 Report text blocks

```ts
interface ReportTextBlock {
  id: string;
  sourceId: string;
  reportName: string;
  reportDate: string | null;
  laboratory: string | null;
  pageNumber: number | null;
  sectionTitle: string;         // 检查所见 / 结论 / 建议 …
  body: string;                 // user-confirmed verbatim
  kind: 'verbatim' | 'user-note';
  confirmed: true;
}
```

- PDF section “报告文字结论与建议”; long content paginates / appendix with truncation notice if needed.
- Unconfirmed OCR never enters `body`.

### 3.6 Apple Health records (separate from lab observations)

```ts
type AppleRecordKind = 'sample' | 'workout' | 'activitySummary';

interface AppleHealthRecord {
  id: string;
  kind: AppleRecordKind;
  typeIdentifier: string;       // HK quantity/workout type string
  value: number | null;
  unit: string | null;
  startAt: string;              // ISO with original offset preserved as text + parsed instant
  endAt: string | null;
  sourceName: string | null;
  sourceBundleOrDevice: string | null;
  importFingerprint: string;    // stable idempotency key
  sourceFileId: string;
  importedAt: string;
}
```

- Own categories in report (activity / fitness); **never** merge incompatible units into lab series.
- Aggregation only when user opts in; UI shows algorithm, period, count.

### 3.7 Chart series impact (downstream of model)

- `ChartPoint` gains per-point `lower`/`upper`/`comparator`/`rangeProvenance`/`laboratory`/`method`.
- Default visualization: measured trend + **per-date range ticks/brackets** labeled “该次报告参考范围”; connect range band **only** when consecutive points share lab+method; break on change.
- X mapping: `(dateMs - minMs) / (maxMs - minMs)` with same-day jitter/stack; latest-three labels use **full YYYY-MM-DD**.

---

## 4. Files / schema migrations / privacy docs to touch

### Schema + persistence

- `src/domain/types.ts` — v2 types (Observation, Profile, stages, text blocks, Apple records)
- `src/domain/validation.ts` + `validation.test.ts`
- **New** `src/domain/migrate.ts` + `migrate.test.ts` (v1→v2, unverified ranges, rollback)
- `src/storage/indexedDb.ts` + tests — load/migrate path; consider `DATABASE_VERSION` bump only if store shape changes (record blob can stay one key)
- `src/import/backup.ts` + tests — version preview / migrate notice
- `tests/fixtures/synthetic-record.json` (+ new v1 legacy fixture, Apple synthetic XML/ZIP)

### Charts / report

- `src/charts/series.ts`, `series.test.ts`
- `src/charts/chartSvg.ts`, `chartSvg.test.ts` (**preserve** uncommitted label-lane work)
- `src/report/reportModel.ts`, `printView.ts`, `print.css`, related tests
- `tests/report.spec.ts` — page render checks later

### Import / UI

- `src/import/manual.ts`, `parseCandidates.ts`, `pdfText.ts`, `pdfTextLayout.ts` (untracked — preserve)
- `src/ui/app.ts`, `manualForms.ts`, `reviewTable.ts`, `importPanel.ts`
- **New (later phases):** `src/import/appleHealth/*.ts`, secure ZIP/XML helpers, profile confirm UI, text-block review UI, regimen stage forms

### Privacy / user docs (when behavior lands)

- `PRIVACY.md` — Apple Health XML/ZIP in-memory only; no GPS/route parsing; backup sensitivity; optional original-file retention default off
- `README.md` — supported Apple types list; offline testing results; release notes distinguishing done / partial / deferred
- `SECURITY.md` if XXE/ZIP limits need documenting
- Instruction docs already present (untracked): keep as reference, do not treat as code

### Explicit non-touch this phase

- Do not reset/discard dirty files listed in §6.
- Do not create a parallel project.
- Do not commit unless asked.

---

## 5. Phased plan (matches instructions §5) + acceptance (§6)

| Phase | Work | Primary acceptance checks (§6) |
| --- | --- | --- |
| **1 — this session** | Gap analysis + model sketch + plan (this doc) | Deliverable written; dirty tree inventoried |
| **2** | Observation range/comparator schema, profile identity, v1→v2 migrate + rollback tests | Two synthetic reports different unit/range/lab → history not rewritten; missing range stays unknown; migrate/backup failure leaves original intact |
| **3** | Real date X-axis; per-result range visualization; inequality markers; unit separation regressions | 2024–2026 irregular spacing; latest three full dates; same-day distinguishable; no unified false band; `<`/`>`/`≤`/`≥` keep semantics |
| **4** | Report text blocks + medication regimen stages + chart time bands | Text confirm/cancel/revise + provenance; unverified OCR absent from PDF; priority still duplicated in both sections |
| **5** | Apple Health XML/ZIP local import (filter, preview, confirm, fingerprints, safe parse) | Preview shows type/unit/offset/source; cancel writes nothing; idempotent re-import; malicious XML/ZIP rejected |
| **6** | Batch recognition/coverage stats, provenance appendix, backup preview/conflicts, user docs, offline test | CBC 23 + 67-indicator synthetic coverage; Playwright proves no health upload; full PDF page visual pass; README honesty on OCR/HealthKit |
| **7** | Stop for user decision if scope creeps | Out-of-scope list (§7) unchanged unless user asks |

**Smallest first P0 implementation slice (recommended next):** Phase 2 only — Observation-owned limits + comparator + `migrated-unverified` + profile stub + migrate tests. Defer chart time-axis to Phase 3 so schema truth is fixed before visualization.

---

## 6. Inventory of existing uncommitted changes (preserve)

**Do not reset, discard, or mix unrelated commits.** Snapshot at analysis time:

### Modified (unstaged)

| File | Diff summary (what it appears to do) |
| --- | --- |
| `src/charts/chartSvg.ts` | Collision-aware vertical lanes for latest-three point labels when a long stable series crowds labels |
| `src/charts/chartSvg.test.ts` | Test for three distinct label `y` positions on a 20-point series |
| `src/import/pdfText.ts` | Uses `formatPdfTextItems` so PDF.js `hasEOL` line breaks are preserved instead of joining all tokens with spaces |
| `src/import/manual.ts` | Optional `pageNumber` on manual observation fields; preserves provenance when editing |
| `src/import/ingestion.test.ts` | Tests for PDF row boundaries, empty EOL fragments, and provenance retention on manual edit |
| `src/ui/app.ts` | On candidate confirm, updates existing indicator metadata/limits (not only insert); passes `pageNumber`/`sourceId` through when editing observations |

### Untracked

| Path | Appears to be |
| --- | --- |
| `src/import/pdfTextLayout.ts` | Helper reconstructing PDF text with EOL → newlines (supports the pdfText change) |
| `docs/grokbot-complete-health-trend-pdf-instructions.md` | Full execution brief (this work’s source of truth) |
| `docs/grokbot-apple-health-import-instructions.md` | Apple Health–specific import brief |
| `docs/grokbot-gap-analysis-2026-10-12.md` | **This file** (created by Phase 1) |

These code changes are coherent WIP toward better PDF line splitting and chart label readability; Phase 2+ should build on them, not revert them.

---

## 7. Explicit out-of-scope (instructions §7)

Do **not** implement in this program of work unless the user explicitly expands scope:

- Cloud AI / remote model inference on health data
- Accounts, remote sharing, cross-device sync
- Drug interaction or dose-adjustment advice
- Diagnosis / treatment recommendations
- Auto-applying network reference ranges
- Uploading health data anywhere
- HealthKit native realtime connection
- FHIR / IPS compliance export (LOINC/FHIR may be reviewed later only after core model is stable; no compliance claims without validation)

Also out of scope for Apple import (§4): OAuth, API keys, background services, native iOS app, parsing/storing workout GPS routes or ECG attachments.

---

## Privacy / offline claims to re-test later

From `PRIVACY.md` + `README.md`:

1. **Claim:** Confirmed records stay in browser IndexedDB; report bytes/OCR text are not uploaded or saved — only confirmed fields.  
   **Later test:** Playwright request interception on import + OCR + save paths; assert no health payload egress.
2. **Claim:** First OCR loads ~36 MiB same-origin assets; afterward only same-origin static requests; no analytics/API.  
   **Nuance:** This is **not** the same as “fully offline on first visit.” After assets are cached, reopen under offline should still load app shell + IndexedDB data — **must be proven** with a dedicated offline e2e (instructions §3.9 / §6). Design acceptance also says “offline-capable build.”
3. **Claim:** JSON backups contain health information and need careful handling.  
   **Later:** Backup preview + version migrate notices before overwrite.
4. **Upcoming Apple Health:** Document memory-only XML/ZIP, no route/ECG storage, category allow-list default — update PRIVACY/README when Phase 5 lands.

---

## Phase 1 outcome

- Gap analysis written to this path.
- Top implementation risk: **indicator-scoped ranges + exact numeric-only observations** invalidate historical abnormality and block inequality semantics.
- Next slice: **schema v2 Observation ranges/comparators + migrate/profile** before chart rework or Apple Health.
