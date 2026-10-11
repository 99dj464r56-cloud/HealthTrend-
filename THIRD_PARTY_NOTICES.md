# Third-party notices

The production bundle includes open-source OCR and PDF processing assets:

- PDF.js (`pdfjs-dist`), Tesseract.js, and Tesseract.js Core: Apache License 2.0.
- English and Simplified Chinese Tesseract language data packages: MIT License.

Their source packages and license texts are available in the npm registry and in the corresponding package directories. These components are copied into the generated site bundle at build time; they are not committed as binary files in this repository. The dependency lockfile pins the package versions used for a build.
