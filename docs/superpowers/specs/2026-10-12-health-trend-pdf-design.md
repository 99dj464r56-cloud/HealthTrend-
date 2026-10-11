# Health Trend PDF - Product Design

## Intent

Build a public, static web app that lets an individual or caregiver organize medication instructions and longitudinal medical test results, then create a clean, printable PDF in a consistent format. The original use case is to make scattered medicine labels and checkup reports easier to compare over time without placing health data in a hosted service.

## Goals

- Accept manual entry, photo capture/upload, and PDF report upload on desktop and mobile.
- Extract text in the browser, propose structured medication and lab rows, and require human review before saving or charting anything extracted.
- Record bilingual test labels, purpose, category, collection date, value, unit, and report-provided reference limits; retain source filename/page as provenance when available.
- Record medicines with bilingual names, strength, actual schedule/dose, and effective dates; allow a user to link medicines to relevant indicators and show dosage periods on the related chart without implying causation.
- Generate a PDF that follows the approved visual conventions: A4 landscape, clear Chinese/English typography, medication summary, indicator categories, two-column chart cards, a separate chart for each indicator, year-aware dates, a connected trend line, point labels for the latest three readings with their dates, visibly labeled upper/lower reference lines, clear bilingual names and purpose, red emphasis for priority markers and out-of-range latest values, and simple up/down abnormal arrows. Print layout must prevent clipping and overlap; long chart sets may span pages.
- Support importing/exporting a portable JSON backup and clearing local data.
- Deploy as a static GitHub Pages site; the same built app must also run locally without an application server.

## Non-goals

- No diagnosis, treatment recommendations, drug interaction checker, or inference that a medication caused a lab change.
- No account, synchronization, cloud database, analytics, telemetry, or server-side OCR/AI.
- No automatic acceptance of extracted values, reference ranges, dates, medication instructions, or inferred units.
- No promise that OCR recognizes every laboratory layout; users can always enter or correct data manually.

## Privacy and safety constraints

- Health documents and entered values remain in browser storage on the user's device. No data upload, remote API, or tracking request is permitted.
- Use packaged, version-pinned open-source dependencies; do not load scripts, OCR models, fonts, or worker code from a third-party CDN at runtime.
- Clearly warn users that browser-local data is tied to that browser/device and should be backed up before clearing site data or changing devices.
- Treat OCR output as untrusted input. Escape rendered user strings; never execute content from reports.
- Do not ship real user records, filenames, screenshots, names, medication details, or report dates in source, tests, screenshots, demo data, or GitHub history. Demo data must be fictional.
- Document that report reference intervals are lab- and context-specific, and that the tool is for record organization, not medical advice.

## Competitor review and product implications

Reviewed public repositories on 2026-10-12:

- [GPinPocket](https://github.com/alipkagit/GPinPocket): local-first health dashboard, records/timeline, charts, and tests. Useful ideas: fictional demo data and an explicit testing setup. It is a broad dashboard and requires a local app/database workflow rather than a lightweight print-oriented static tool.
- [HealthTrack](https://github.com/EzekielTheMad/healthtrack): self-hosted medication/lab tracking and PDF import with an approval step. Useful idea: review extracted records before import. It is a full multi-user server app, and optional cloud AI integrations are outside this app's privacy model.
- [Soma](https://github.com/mdportnov/soma): medication dose periods overlaid on biomarker trends, multilingual report import, reference ranges, and local-first positioning. Useful idea: date-bounded dose overlays linked to relevant charts. Preserve this as a neutral timeline annotation, never as evidence of drug efficacy or causation.
- [Dracula](https://github.com/skorokithakis/dracula): OCR-assisted lab tracking, longitudinal charts, and highlighting abnormal biomarkers. Useful ideas: abnormal prioritization and static viewing. Its OCR/assessment workflow uses a Claude API key and therefore is not suitable for our no-upload default.
- [Health Dashboard](https://github.com/rorydavidson/myhealth): browser-side PDF extraction, editable detected dates, local data, and export. Useful ideas: on-device PDF parsing, editable extraction, portability. It is a much broader health dashboard.

The distinct focus here is a phone-friendly, bilingual, human-confirmed import flow that produces a stable print/PDF deliverable: medication list plus individually legible, category-separated charts with the exact supplied reference limits and latest-three labels. This is a focused subset rather than a replacement for the broader self-hosted health record platforms reviewed above.

## Main user flow

1. Open the public static site on a phone or computer; see a plain-language local privacy notice.
2. Start an empty record, import a local JSON backup, or add medicines/results manually.
3. Capture/upload medication labels or a report photo/PDF. OCR runs locally; extracted text and proposed fields appear in an editable review table with source reference and confidence/uncertainty cues.
4. Confirm or correct names, dose, date, unit, category, reference interval, and priority status. Ambiguous or absent values remain blank; nothing is silently guessed.
5. Review the medication list and grouped trend charts in a print preview.
6. Export a PDF and optionally save a JSON backup. User can delete all local data.

## Report conventions

- A4 landscape, readable margins, high-contrast dark text, white cards, restrained blue trend line, red priority/out-of-range emphasis.
- The medicine section contains bilingual medication names and user-confirmed instructions, plus related indicators when linked.
- Each laboratory indicator gets its own chart; categories (for example priority, lipids, kidney, blood count, thyroid) are separated rather than mixing unrelated tests in one chart.
- Reference limits are per indicator, with independent numeric labels at the actual corresponding dashed lines. One-sided limits show only the known bound; missing limits are explicitly shown as not provided and are not fabricated.
- Plot contains dates including years and latest three values visibly labeled near their corresponding trend points. Latest abnormal value uses red text and a direction arrow.
- Chart headings show bilingual name and purpose. If OCR/provided values lack enough history, show the available point(s); a single measurement is not represented as a multi-point trend.
- Numeric unit conversion is not automatic in the first version. Different units are kept distinct unless the user explicitly normalizes them; values with incompatible units must not share one series.

## Technical direction (builder's call)

- Static TypeScript web app built with a small Vite bundle and browser-native form/camera controls.
- Store records locally in IndexedDB (browser persistence); offer JSON import/export.
- Use local PDF text extraction for text-based PDFs and bundled on-device OCR for images/scanned pages. All OCR model assets are shipped with the app, not fetched from a CDN at runtime.
- Use SVG charts generated from structured data and print CSS with explicit A4 landscape pagination. Generate PDF via the browser's print-to-PDF flow, so the exported document and print preview share the same layout.
- Prefer a small number of dependencies. Exact package versions and browser support must be checked at implementation time and pinned in the lockfile.
- Default interface language is Chinese with English clinical labels alongside; data can be edited in either language.

## Open decisions left to the builder

- Choose an actively maintained browser OCR package/model bundle that supports Chinese and English while keeping runtime network requests at zero; quantify initial app/model size and explain it in the UI.
- Choose a compact data schema that preserves original OCR text separately from reviewed values and tracks user edits/source provenance.
- Define an explicit storage version and migration/backup compatibility contract.
- Use neutral, synthetic data only for screenshots and end-to-end fixtures.

## Acceptance criteria

- An offline-capable build generates a PDF from manually entered, synthetic medication and multi-date lab data.
- OCR and PDF parsing execute without transmitting document bytes, OCR text, or health fields to any server; tests or browser network inspection demonstrate zero runtime requests beyond loading the static app itself.
- OCR results cannot enter a report until individually reviewed/confirmed; missing/ambiguous fields stay blank.
- Tests cover range positioning, one-sided/missing ranges, abnormal thresholds, latest-three labels, category separation, date ordering/year display, incompatible units, and user text escaping.
- Print preview at A4 landscape shows connected trend lines, correctly placed and labeled limits, medication summaries, and clean pagination with no clipping or overlap in reviewed rendered output.
- Public repository audit finds no personal health data or private source material.
