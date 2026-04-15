"""
R3P Transmittal Builder — Backend API

Routes:
    POST /api/parse-index       Parse an Excel drawing index → document rows
    POST /api/render            Render transmittal → ZIP package (docx + pdf + drawings)
    POST /api/email             Send transmittal via SMTP
    GET  /api/scan-projects     Scan a root directory for project folders
    POST /api/scan-folder       Deep-scan a specific project folder
    POST /api/render-to-folder  Render transmittal and write output directly to disk

Run:
    uvicorn app:app --reload --port 8000
"""

from __future__ import annotations

import json
import os
import re
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
    return {"status": "healthy", "service": "transmittal-builder-backend", "version": "3.0.0"}


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


# ─── Filesystem helpers ───────────────────────────────────────

# Pattern matching typical job numbers like "R3P-2401" or "ABC-1234"
_JOB_NUM_RE = re.compile(r'^([A-Z][A-Z0-9]*-\d{3,})', re.IGNORECASE)


def _parse_project_name(folder_name: str) -> tuple[str, str]:
    """
    Split a project folder name into (job_num, client_site).

    Example: "R3P-2401-Brazos-Substation" → ("R3P-2401", "Brazos Substation")
    """
    m = _JOB_NUM_RE.match(folder_name)
    if m:
        job_num = m.group(1).upper()
        rest = folder_name[m.end():].lstrip("-")
        client_site = rest.replace("-", " ").strip()
        return job_num, client_site
    return folder_name, ""


def _get_next_xmtl_num(folder_path: str) -> str:
    """
    Scan for existing XMTL-NNN sub-folders and return the next available
    three-digit number as a zero-padded string (e.g. "003").
    """
    max_num = 0
    try:
        for entry in os.scandir(folder_path):
            if entry.is_dir():
                m = re.match(r'^XMTL-(\d+)$', entry.name, re.IGNORECASE)
                if m:
                    max_num = max(max_num, int(m.group(1)))
    except OSError:
        pass
    return str(max_num + 1).zfill(3)


def _fuzzy_match(query: str, folder_name: str) -> bool:
    """
    Return True when every whitespace-separated token in *query* appears as a
    case-insensitive substring anywhere in *folder_name*.
    """
    if not query.strip():
        return True
    target = folder_name.lower()
    return all(token in target for token in query.lower().split())


def _build_project_meta(folder_path: str, folder_name: str) -> dict:
    """Return lightweight metadata for a project folder (no deep scan)."""
    job_num, client_site = _parse_project_name(folder_name)

    # Detect presence of key file types without reading them
    has_drawings = False
    has_index = False
    has_template = False
    has_contacts = False
    existing_xmtl: list[str] = []

    try:
        for entry in os.scandir(folder_path):
            n = entry.name.lower()
            if entry.is_dir():
                if re.match(r'^xmtl-\d+$', n):
                    existing_xmtl.append(entry.name)
                elif n == "drawings":
                    has_drawings = True
            elif entry.is_file():
                if n.endswith(".pdf"):
                    has_drawings = True
                elif n.endswith((".xlsx", ".xls")):
                    has_index = True
                elif n.endswith(".docx"):
                    has_template = True
                elif n == "contacts.json":
                    has_contacts = True
    except OSError:
        pass

    existing_xmtl.sort()
    next_num = _get_next_xmtl_num(folder_path)

    return {
        "path": folder_path,
        "job_num": job_num,
        "client_site": client_site,
        "has_drawings": has_drawings,
        "has_index": has_index,
        "has_template": has_template,
        "has_contacts": has_contacts,
        "existing_xmtl": existing_xmtl,
        "next_xmtl_num": next_num,
    }


# ─── GET /api/scan-projects ───────────────────────────────────

@app.get("/api/scan-projects")
def api_scan_projects(root: str, query: str = ""):
    """
    Scan immediate subdirectories of *root* and return project metadata.

    Optional *query* performs fuzzy text filtering (all words in query must
    appear in the folder name, case-insensitive).
    """
    root = os.path.normpath(root)
    if not os.path.isdir(root):
        raise HTTPException(400, f"Root directory does not exist: {root}")

    projects: list[dict] = []
    try:
        entries = sorted(
            (e for e in os.scandir(root) if e.is_dir()),
            key=lambda e: e.name.lower(),
        )
    except PermissionError as exc:
        raise HTTPException(403, f"Cannot read directory: {exc}") from exc

    for entry in entries:
        if _fuzzy_match(query, entry.name):
            projects.append(_build_project_meta(entry.path, entry.name))

    return JSONResponse({"projects": projects})


# ─── POST /api/scan-folder ────────────────────────────────────

class ScanFolderRequest(BaseModel):
    folder_path: str


@app.post("/api/scan-folder")
def api_scan_folder(req: ScanFolderRequest):
    """
    Deep-scan a specific project folder.

    Returns discovered PDFs, index files, templates, contacts, existing XMTL
    folders, and the next available XMTL number.
    """
    folder_path = os.path.normpath(req.folder_path)
    if not os.path.isdir(folder_path):
        raise HTTPException(400, f"Folder does not exist: {folder_path}")

    folder_name = os.path.basename(folder_path)
    job_num, client_site = _parse_project_name(folder_name)

    pdfs: list[str] = []
    index_files: list[str] = []
    template_files: list[str] = []
    contacts: list[dict] = []
    existing_xmtl: list[str] = []

    def _rel(path: str) -> str:
        return os.path.relpath(path, folder_path).replace("\\", "/")

    try:
        for entry in os.scandir(folder_path):
            n = entry.name.lower()
            if entry.is_dir():
                if re.match(r'^xmtl-\d+$', n):
                    existing_xmtl.append(entry.name)
                elif n == "drawings":
                    # Scan drawings subfolder for PDFs
                    for sub in os.scandir(entry.path):
                        if sub.is_file() and sub.name.lower().endswith(".pdf"):
                            pdfs.append(_rel(sub.path))
            elif entry.is_file():
                if n.endswith(".pdf"):
                    pdfs.append(_rel(entry.path))
                elif n.endswith((".xlsx", ".xls")):
                    index_files.append(_rel(entry.path))
                elif n.endswith(".docx"):
                    template_files.append(_rel(entry.path))
                elif n == "contacts.json":
                    try:
                        with open(entry.path, "r", encoding="utf-8") as f:
                            contacts = json.load(f)
                    except (OSError, json.JSONDecodeError):
                        contacts = []
    except OSError as exc:
        raise HTTPException(500, f"Error scanning folder: {exc}") from exc

    existing_xmtl.sort()
    pdfs.sort()
    index_files.sort()
    template_files.sort()

    return JSONResponse({
        "job_num": job_num,
        "client_site": client_site,
        "pdfs": pdfs,
        "index_files": index_files,
        "template_files": template_files,
        "contacts": contacts,
        "existing_xmtl": existing_xmtl,
        "next_xmtl_num": _get_next_xmtl_num(folder_path),
    })


# ─── POST /api/render-to-folder ───────────────────────────────

@app.post("/api/render-to-folder")
async def api_render_to_folder(
    template: UploadFile = File(..., description="Transmittal .docx template"),
    fields: str = Form(..., description="JSON: project/sender fields"),
    checks: str = Form(..., description="JSON: checkbox states"),
    contacts: str = Form(..., description="JSON: [{name, company, email, phone}]"),
    documents: str = Form(..., description="JSON: [{doc_no, desc, rev}]"),
    output_dir: str = Form(..., description="Absolute path to the project folder"),
    pdfs: List[UploadFile] = File(default=[], description="Source PDF documents"),
):
    """
    Render a transmittal package and write the output files directly to disk.

    Creates an ``XMTL-NNN/`` sub-folder inside *output_dir*, writes the
    rendered ``.docx``, ``.pdf``, and combined drawings PDF into it, and
    saves a ``contacts.json`` file in both the XMTL folder and the project
    root for easy reuse.

    Returns JSON with the path to the created folder and the list of files
    written.
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

        output_dir = os.path.normpath(output_dir)
        if not os.path.isdir(output_dir):
            raise HTTPException(400, f"Output directory does not exist: {output_dir}")

        # Save template to temp dir
        template_path = _save_upload(template, work_dir, "template.docx")

        # Save source PDFs to temp dir
        pdf_dir = os.path.join(work_dir, "pdfs")
        os.makedirs(pdf_dir, exist_ok=True)
        saved_pdfs: list[str] = []
        for pdf in pdfs:
            if pdf.filename and pdf.filename.lower().endswith(".pdf"):
                saved_pdfs.append(_save_upload(pdf, pdf_dir))

        if not saved_pdfs:
            raise HTTPException(400, "At least one source PDF is required.")

        # Determine output filenames
        job_num = fields_dict.get("job_num", "").strip() or "UNKNOWN"
        xmtl_num = fields_dict.get("transmittal_num", "").strip() or _get_next_xmtl_num(output_dir)
        # Pad to 3 digits if purely numeric
        xmtl_num_padded = xmtl_num.zfill(3) if xmtl_num.isdigit() else xmtl_num
        base_name = f"R3P-{job_num}_XMTL-{xmtl_num_padded}"

        # Create the XMTL output sub-folder
        xmtl_folder_name = f"XMTL-{xmtl_num_padded}"
        xmtl_folder = os.path.join(output_dir, xmtl_folder_name)
        os.makedirs(xmtl_folder, exist_ok=True)

        # Render the .docx into a temp file first
        docx_tmp = os.path.join(work_dir, f"{base_name}.docx")
        render_transmittal(
            template_path=template_path,
            fields=fields_dict,
            checks=checks_dict,
            contacts=contacts_list,
            documents=documents_list,
            out_path=docx_tmp,
        )

        # Create transmittal PDF
        transmittal_pdf_tmp, error = docx_to_pdf(docx_tmp, work_dir)
        if not transmittal_pdf_tmp:
            raise HTTPException(500, f"Transmittal PDF generation failed: {error}")

        # Create merged drawings PDF
        drawings_combined_name = f"{base_name}_Drawings_Combined.pdf"
        drawings_combined_tmp = os.path.join(work_dir, drawings_combined_name)
        try:
            merge_source_pdfs(saved_pdfs, drawings_combined_tmp)
        except Exception as e:
            raise HTTPException(500, f"Drawing PDF merge failed: {e}")

        # Copy final files into the XMTL output folder
        files_written: list[str] = []

        def _copy_to_xmtl(src: str, dest_name: str) -> str:
            dest = os.path.join(xmtl_folder, dest_name)
            shutil.copy2(src, dest)
            files_written.append(dest)
            return dest

        _copy_to_xmtl(docx_tmp, f"{base_name}.docx")
        _copy_to_xmtl(transmittal_pdf_tmp, f"{base_name}.pdf")
        _copy_to_xmtl(drawings_combined_tmp, drawings_combined_name)

        # Save contacts.json in the XMTL folder
        clean_contacts = [
            {k: c.get(k, "") for k in ("name", "company", "email", "phone")}
            for c in contacts_list
            if c.get("name") or c.get("email")
        ]
        contacts_xmtl = os.path.join(xmtl_folder, "contacts.json")
        with open(contacts_xmtl, "w", encoding="utf-8") as f:
            json.dump(clean_contacts, f, indent=2, ensure_ascii=False)
        files_written.append(contacts_xmtl)

        # Also update/create contacts.json at the project root level
        contacts_root = os.path.join(output_dir, "contacts.json")
        with open(contacts_root, "w", encoding="utf-8") as f:
            json.dump(clean_contacts, f, indent=2, ensure_ascii=False)

        return JSONResponse({
            "success": True,
            "xmtl_folder": xmtl_folder,
            "xmtl_folder_name": xmtl_folder_name,
            "files_written": files_written,
        })

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Render-to-folder failed: {e}")
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
