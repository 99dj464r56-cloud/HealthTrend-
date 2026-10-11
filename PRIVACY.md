# Privacy

Health Trend PDF is a static browser application. Confirmed records are stored in the current browser's IndexedDB. Uploaded reports and photos are read in memory by PDF.js and Tesseract.js; source documents and raw OCR text are not uploaded or saved by the application. Only a user-confirmed transcription is added to the local record.

The first OCR use loads the worker, WebAssembly runtime, and Chinese/English language models from the same static site host. The OCR code and models are third-party open-source assets included in the site build. The browser may make normal requests for those static assets, but report contents are not sent with those requests. No analytics, advertising, or application API is configured.

Records stay in that browser profile and do not automatically sync across devices. Exported JSON backups contain health information and should be stored and shared carefully. Clearing the browser's site data may remove the local record. Use the app's backup feature before changing devices or browsers.

This project is not a medical device, electronic medical record service, or substitute for professional care. Do not use it for diagnosis, treatment decisions, or urgent situations. Check every transcription against the original report and consult a qualified clinician.
