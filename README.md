# R3P Transmittal Builder v3.0

Standalone web application for generating engineering transmittal packages.
Drop your files, generate a combined PDF, and send it.

## Architecture

```
backend/
├── app.py                 FastAPI application (all routes)
├── core/
│   ├── render.py          .docx template rendering
│   ├── excel_parser.py    Drawing index Excel parsing
│   └── pdf_merge.py       Combined PDF generation (cover + source PDFs)
├── emails/
│   └── sender.py          SMTP email delivery
└── requirements.txt
```

## API Endpoints

| Method | Path               | Description                                    |
|--------|--------------------|------------------------------------------------|
| GET    | /api/health        | Health check                                   |
| POST   | /api/parse-index   | Upload Excel → parsed document rows            |
| POST   | /api/render        | Render transmittal → DOCX / combined PDF / ZIP |
| POST   | /api/email         | Send transmittal via SMTP                      |

## Quick Start

```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

API docs at http://localhost:8000/docs

## Render Flow

1. Frontend sends template (.docx), fields, checks, contacts, documents, and source PDFs
2. Backend fills the template using python-docx (placeholder replacement, checkboxes, tables)
3. Converts the filled .docx → PDF via LibreOffice
4. Merges cover PDF + all source PDFs into one combined package via pypdf
5. Returns the combined PDF (or .docx, or both as ZIP)

## PDF Conversion

Combined PDF output requires converting the transmittal .docx cover sheet to PDF.
The PDF merging itself (combining cover + source PDFs) uses pypdf — no external tool needed.

**Windows (recommended):** `pip install docx2pdf` — uses your installed Microsoft Word
via COM automation. Since you're on a Windows engineering workstation with Word,
this just works.

**Linux/Mac fallback:** `apt install libreoffice-writer` or `brew install --cask libreoffice`

The backend tries Word first on Windows, LibreOffice first elsewhere, and falls
through to the other if the primary fails.

Without either converter, `/api/render` still works for `output_format=docx`.

## Environment Variables (optional)

| Variable       | Description                    |
|----------------|--------------------------------|
| SMTP_SENDER    | Default email sender address   |
| SMTP_PASSWORD  | Default SMTP password/app key  |

ROOT3POWER ENGINEERING
