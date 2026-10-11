# Health Trend PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a privacy-first static web app for reviewing medication/report input and generating a readable bilingual health-trend PDF.

**Architecture:** A TypeScript + Vite single-page app stores reviewed records in versioned IndexedDB, imports images and PDFs through local browser workers, and renders data-driven SVG cards into a dedicated print view. GitHub Actions builds and deploys the static bundle to Pages; no health data is sent to application servers.

**Tech Stack:** TypeScript, Vite, Vitest, Playwright, IndexedDB, PDF.js, Tesseract.js (with worker/core and chi_sim+eng language assets self-hosted from the built app), SVG, CSS print layout, GitHub Pages Actions.

**Spec:** `docs/superpowers/specs/2026-10-12-health-trend-pdf-design.md`

## Global Constraints

- No real personal health records, medicine names/doses, filenames, dates, screenshots, or private data in the public repository or Git history.
- No external runtime service, analytics, telemetry, CDN code/model/font, or health-data upload; only the GitHub Pages host serves static application and OCR assets.
- OCR is a proposal only; every extracted field must be reviewed before use.
- Reference intervals are per-indicator and must be user/report-provided; never invent a missing bound.
- PDF layout is A4 landscape with bilingual content, two chart cards per row, individual charts, explicit reference labels, visible latest three point/date labels, and red abnormal/priority treatment.
- No diagnosis, treatment advice, or causal assertion about medication and lab changes.
- Manual entry remains available when OCR fails; units are not silently converted or mixed.

## Review Focus

- OCR worker/model may silently fetch from a third-party default CDN; test a production-build scan and block network access except same-origin app assets.
- Long, dense reports may exceed browser memory; test bounded page processing and present a clear skip/error path instead of freezing the UI.
- Sparse or one-sided ranges may produce misleading/overlapping chart labels; test missing, lower-only, upper-only, and single-point cases.
- Multiple units or same-name tests from different labs may be plotted as one series; test unit segregation and preserve source/range provenance.
- GitHub Pages project subpaths may break worker, OCR model, PDF worker, or route asset URLs; test the built app at a non-root base path.

---

### Task 1: App shell, data contract, and privacy baseline

**Files:**
- Create: `package.json`, `package-lock.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `src/main.ts`, `src/styles.css`
- Create: `src/domain/types.ts`, `src/domain/validation.ts`, `src/domain/validation.test.ts`
- Create: `src/storage/indexedDb.ts`, `src/storage/indexedDb.test.ts`
- Create: `src/ui/privacyNotice.ts`, `.gitignore`

**Interfaces:**
- `validateHealthRecord(record: unknown): HealthRecord` validates schema version, required dates/units, finite numeric values, unique IDs, and confirmed-vs-draft state; throws a user-safe validation error.
- `saveHealthRecord(record: HealthRecord): Promise<void>`, `loadHealthRecord(): Promise<HealthRecord | null>`, and `clearHealthRecord(): Promise<void>` use IndexedDB database `health-trend-pdf`, object store `records`, schema version `1`.
- `HealthRecord` contains `schemaVersion`, `medications`, `indicators`, `observations`, and `sources`; raw OCR candidates remain separate from reviewed canonical values.

- [ ] **Step 1: Add only package/test-runner configuration and empty module entry points, then write failing behavioral tests** covering invalid date/value, unconfirmed OCR excluded from canonical observations, valid fixture round-trip, and clear.
- [ ] **Step 2: Run `npm test -- src/domain/validation.test.ts src/storage/indexedDb.test.ts`; confirm assertions fail because validation/persistence behavior is absent (not because imports or test setup fail).**
- [ ] **Step 3: Implement the types, validation, and IndexedDB methods with no remote dependencies.**
- [ ] **Step 4: Run the focused tests, then `npm test`; all tests pass.**
- [ ] **Step 5: Render the privacy notice in the shell and verify first-run empty state in Playwright.**

### Task 2: Manual entry, review table, backup, and local sources

**Files:**
- Create: `src/import/backup.ts`, `src/import/backup.test.ts`
- Create: `src/ui/app.ts`, `src/ui/reviewTable.ts`, `src/ui/manualForms.ts`
- Create: `tests/app.spec.ts`

**Interfaces:**
- `exportBackup(record: HealthRecord): Blob` emits JSON with schema version and no binary attachments by default.
- `parseBackup(file: File): Promise<HealthRecord>` validates schema and refuses malformed or unsupported versions.
- User can add/edit/delete medications, indicators, observations, categories, purposes, ranges, priority flag, unit, and medicine-indicator links.

- [ ] **Step 1: Add empty modules only, then write failing tests** for valid export/import round-trip, malformed backup rejection, manual observation creation, required range blank remains blank, and confirm/discard OCR candidates.
- [ ] **Step 2: Run the focused tests and verify behavioral assertions fail while the test setup itself remains valid.**
- [ ] **Step 3: Implement editable medication and observation forms, source registry, and backup import/export.**
- [ ] **Step 4: Run `npm test`; all unit tests pass.**
- [ ] **Step 5: Run Playwright on add/edit/delete, backup download/upload, and clear-data confirmation.**

### Task 3: Local PDF text and image OCR ingestion

**Files:**
- Create: `src/import/pdfText.ts`, `src/import/imageOcr.ts`, `src/import/parseCandidates.ts`
- Create: `src/import/ingestion.test.ts`, `tests/import.spec.ts`
- Modify: `vite.config.ts`, `package.json`, `package-lock.json`

**Interfaces:**
- `extractPdfText(file: File, onProgress: (progress: number) => void): Promise<SourcePage[]>` extracts text per page locally via PDF.js.
- `recognizeImage(file: File, onProgress: (progress: number) => void): Promise<OcrPage>` uses Tesseract.js `chi_sim+eng`, bundled worker/core/lang assets hosted same-origin; no CDN fallback.
- `parseCandidates(source: SourcePage | OcrPage): ImportCandidate[]` returns untrusted draft candidates and confidence/source spans; no output is considered confirmed.
- Import review displays original text, page number, confidence, and editable candidate fields before adding any canonical medication/observation.

- [ ] **Step 1: Add empty import modules only, then write tests** proving candidate parse outputs draft-only records, handles missing/ambiguous reference bounds as blank, and rejects unsupported files / oversize page count with clear errors.
- [ ] **Step 2: Run focused tests to confirm behavioral assertions fail before implementation.**
- [ ] **Step 3: Implement local PDF text extraction and image OCR with cancellable bounded page processing and visible progress.**
- [ ] **Step 4: Run unit tests and browser integration tests on synthetic fixtures.**
- [ ] **Step 5: Run a production build, serve it under a non-root base path, and use Playwright request interception to assert all OCR/PDF worker/model requests are same-origin and no document content is sent in network requests.**

### Task 4: Trend chart model and PDF print view

**Files:**
- Create: `src/charts/series.ts`, `src/charts/series.test.ts`
- Create: `src/charts/chartSvg.ts`, `src/charts/chartSvg.test.ts`
- Create: `src/report/reportModel.ts`, `src/report/reportModel.test.ts`
- Create: `src/report/printView.ts`, `src/report/print.css`
- Create: `tests/report.spec.ts`, `tests/fixtures/synthetic-record.json`

**Interfaces:**
- `buildSeries(indicator, observations): ChartSeries[]` groups only by indicator ID and unit; sorts dates ascending; returns actual numeric points and supplied reference bounds.
- `classifyObservation(value, range): "low" | "in-range" | "high" | "unknown"` supports one-sided and absent limits.
- `renderIndicatorChart(series): SVGElement` draws reference dashed lines with the matching bound labels at their correct Y positions, date/year-aware x-axis, connected trend line, and latest-three numeric/date labels.
- `buildReportModel(record): ReportModel` returns medication summary, linked dose periods, priority group, and separate categorized indicator series without medical interpretation.

- [ ] **Step 1: Add empty chart/report modules only, then write failing tests** for exact range coordinate mapping, lower-/upper-only and absent bounds, abnormal arrows/colors, single point, latest-three ordering/labels, year display, unit separation, HTML text escaping, medication period labels, and category separation.
- [ ] **Step 2: Run focused tests and verify behavioral assertions fail before implementation.**
- [ ] **Step 3: Implement chart primitives and report model; mark medicine dose periods as neutral annotations and avoid axis-scale distortion.**
- [ ] **Step 4: Implement print view with A4 landscape, readable two-column cards, page breaks between category groups as needed, and legible high-contrast labels.**
- [ ] **Step 5: Run `npm test` and Playwright synthetic end-to-end report generation; export browser print-to-PDF fixture.**
- [ ] **Step 6: Render every PDF page to PNG; inspect all pages, verify connected lines, label placement, no clipping/overlap, correct grouping, and page numbering.**

### Task 5: GitHub Pages deployment and public repository audit

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`, `LICENSE`, `SECURITY.md`, `PRIVACY.md`
- Modify: `vite.config.ts`, `package.json`

**Interfaces:**
- `npm test`, `npm run build`, and `npm run preview` are documented and deterministic from the lockfile.
- Workflow deploys `dist/` on pushes to `main` using the official GitHub Pages Actions deployment flow.
- README explains static hosting, local-only data behavior, first-use OCR/model download size, manual fallback, backup/restore, PDF export, and medical disclaimer.

- [ ] **Step 1: Write/check tests** for clean build output, expected app shell at configured Pages base, dependency/license inventory, and absence of personal identifiers or source report files.
- [ ] **Step 2: Run complete `npm test` and `npm run build`; verify passing output before publishing.**
- [ ] **Step 3: Add locked-down Pages workflow permissions, accessibility/reduced-motion basics, and usage/privacy/security docs.**
- [ ] **Step 4: Audit `git status`, tracked files, built assets, strings, and image fixtures to ensure only synthetic/public assets exist.**
- [ ] **Step 5: Create public repository `health-trend-pdf`, push the verified main branch, enable Pages via Actions, and verify the deployed URL and production OCR/PDF flow.**
- [ ] **Step 6: If GitHub authentication is unavailable, leave the local Git repository cleanly prepared with a remote-ready README and report the exact one-time authentication step needed; do not claim a publication.**
