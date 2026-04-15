"""
R3P Transmittal Builder — Backend API

Routes:
    POST /api/parse-index     Parse an Excel drawing index → document rows
    POST /api/render          Render transmittal → ZIP package (docx + pdf + drawings)
    POST /api/email           Send transmittal via SMTP

Run:
    uvicorn app:app --reload --port 8000
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from core.render import render_transmittal
from core.excel_parser import parse_drawing_index
from core.pdf_merge import docx_to_pdf, merge_source_pdfs


# ─── App Setup ────────────────────────────────────────────────

app = FastAPI(
    title="R3P Transmittal Builder",
    version="3.0.0",
    description="Backend API for the ROOT3POWER Transmittal Builder",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Lock this down in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# Track temp dirs for cleanup
_temp_dirs: list[str] = []


def _make_work_dir() -> str:
    d = tempfile.mkdtemp(prefix="xmtl_")
    _temp_dirs.append(d)
    return d


def _save_upload(upload: UploadFile, dest_dir: str, filename: str = None) -> str:
    """Save an uploaded file to disk and return the path."""
    name = filename or upload.filename
    path = os.path.join(dest_dir, name)
    with open(path, "wb") as f:
        f.write(upload.file.read())
    return path


# ─── Health Check ─────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "3.0.0"}


# ─── POST /api/parse-index ────────────────────────────────────

@app.post("/api/parse-index")
async def api_parse_index(file: UploadFile = File(...)):
    """
    Upload an Excel drawing index file.
    Returns parsed document rows: [{doc_no, desc, rev}, ...]
    """
    if not file.filename:
        raise HTTPException(400, "No file provided.")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ("xlsx", "xls"):
        raise HTTPException(400, f"Expected .xlsx or .xls, got .{ext}")

    work_dir = _make_work_dir()
    try:
        xlsx_path = _save_upload(file, work_dir, "index.xlsx")
        result = parse_drawing_index(xlsx_path)
        return JSONResponse({
            "success": True,
            "documents": result["documents"],
            "sheet_name": result["sheet_name"],
            "row_count": result["row_count"],
            "warnings": result["warnings"],
        })
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(500, f"Failed to parse index: {e}")
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


# ─── POST /api/render ─────────────────────────────────────────

@app.post("/api/render")
async def api_render(
    template: UploadFile = File(..., description="Transmittal .docx template"),
    fields: str = Form(..., description="JSON: project/sender fields"),
    checks: str = Form(..., description="JSON: checkbox states"),
    contacts: str = Form(..., description="JSON: [{name, company, email, phone}]"),
    documents: str = Form(..., description="JSON: [{doc_no, desc, rev}]"),
    pdfs: List[UploadFile] = File(default=[], description="Source PDF documents"),
):
    """
    Render a transmittal package.

    Always returns a ZIP containing:
        - the rendered transmittal .docx
        - the rendered transmittal .pdf
        - a merged PDF of the submitted drawing PDFs only
    """
    work_dir = _make_work_dir()

    try:
        # Parse JSON form fields
        try:
            fields_dict = json.loads(fields)
            checks_dict = json.loads(checks)
            contacts_list = json.loads(contacts)
            documents_list = json.loads(documents)
        except json.JSONDecodeError as e:
            raise HTTPException(400, f"Invalid JSON in form data: {e}")

        # Save template
        template_path = _save_upload(template, work_dir, "template.docx")

        # Save source PDFs
        pdf_dir = os.path.join(work_dir, "pdfs")
        os.makedirs(pdf_dir, exist_ok=True)
        saved_pdfs: list[str] = []
        for pdf in pdfs:
            if pdf.filename and pdf.filename.lower().endswith(".pdf"):
                saved_pdfs.append(_save_upload(pdf, pdf_dir))

        # Build output filename
        job_num = fields_dict.get("job_num", "").strip() or "UNKNOWN"
        xmtl_num = fields_dict.get("transmittal_num", "").strip() or "001"
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_name = f"R3P-{job_num}_XMTL-{xmtl_num}_{timestamp}"

        # Render the .docx
        docx_out = os.path.join(work_dir, f"{base_name}.docx")
        render_transmittal(
            template_path=template_path,
            fields=fields_dict,
            checks=checks_dict,
            contacts=contacts_list,
            documents=documents_list,
            out_path=docx_out,
        )

        if not saved_pdfs:
            raise HTTPException(400, "At least one source PDF is required to build the drawing package.")

        # Create transmittal PDF
        transmittal_pdf_path, error = docx_to_pdf(docx_out, work_dir)
        if not transmittal_pdf_path:
            raise HTTPException(500, f"Transmittal PDF generation failed: {error}")

        # Create merged drawings-only PDF
        drawings_combined_name = f"{base_name}_Drawings_Combined.pdf"
        drawings_combined_path = os.path.join(work_dir, drawings_combined_name)
        try:
            merge_source_pdfs(saved_pdfs, drawings_combined_path)
        except Exception as e:
            raise HTTPException(500, f"Drawing PDF merge failed: {e}")

        # Return package ZIP
        import zipfile
        zip_name = f"{base_name}_Package.zip"
        zip_path = os.path.join(work_dir, zip_name)

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(docx_out, arcname=f"{base_name}.docx")
            zf.write(transmittal_pdf_path, arcname=f"{base_name}.pdf")
            zf.write(drawings_combined_path, arcname=drawings_combined_name)

        return FileResponse(
            zip_path,
            media_type="application/zip",
            filename=zip_name,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Render failed: {e}")


# ─── POST /api/email ──────────────────────────────────────────

class EmailRequest(BaseModel):
    to: str
    cc: Optional[str] = None
    subject: str
    body_text: str
    body_html: str
    smtp_host: str = "smtp.gmail.com"
    smtp_ssl: bool = True
    sender: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None


@app.post("/api/email")
async def api_email(req: EmailRequest):
    """
    Send a transmittal email.
    Note: SMTP credentials must be provided per-request or via env vars.
    """
    from emails.sender import send_email

    sender = req.sender or os.environ.get("SMTP_SENDER", "")
    password = req.password or os.environ.get("SMTP_PASSWORD", "")

    if not sender or not password:
        raise HTTPException(400, "SMTP sender and password are required.")

    success, message = send_email(
        subject=req.subject,
        plain_text=req.body_text,
        html=req.body_html,
        sender=sender,
        to=req.to,
        cc=req.cc,
        smtp_host=req.smtp_host,
        smtp_ssl=req.smtp_ssl,
        username=req.username,
        password=password,
    )

    if not success:
        raise HTTPException(500, message)

    return {"success": True, "message": message}


# ─── Cleanup ──────────────────────────────────────────────────

@app.on_event("shutdown")
def cleanup_temp_dirs():
    for d in _temp_dirs:
        shutil.rmtree(d, ignore_errors=True)
