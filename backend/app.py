"""
Transmittal Builder — Backend API

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

from core.render import render_transmittal, _normalize_xmtl_num
from core.excel_parser import parse_drawing_index
from core.pdf_merge import docx_to_pdf, merge_source_pdfs


# ─── Copy-intent checkbox key → abbreviation mapping ─────────

_COPY_INTENT_ABBREV: dict[str, str] = {
    "ci_info": "IFI",
    "ci_approval": "IFA",
    "ci_bid": "IFB",
    "ci_preliminary": "IFP",
    "ci_const": "IFC",
    "ci_asbuilt": "IFAB",
    "ci_fab": "IFF",
    "ci_record": "IFR",
    "ci_ref": "IFRF",
}


def _get_copy_intent_abbrev(checks: dict) -> str | None:
    """Return the abbreviation for the single selected copy-intent, or None."""
    for key, abbrev in _COPY_INTENT_ABBREV.items():
        if checks.get(key):
            return abbrev
    return None


def _parse_date_to_yyyymmdd(date_str: str) -> str:
    """Best-effort parse a date string to YYYYMMDD format."""
    if not date_str or not isinstance(date_str, str):
        return datetime.now().strftime("%Y%m%d")
    date_str = date_str.strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m-%d-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y%m%d")
        except ValueError:
            continue
    # Fallback: today's date
    return datetime.now().strftime("%Y%m%d")


def _build_combined_pdf_name(job_label: str, project_desc: str, checks: dict,
                              date_str: str) -> str:
    """
    Build the combined PDF filename in the format:
    JOB-25074 - NANULAK 180MW BESS SUBSTATION - IFP_20251017.pdf
    """
    intent = _get_copy_intent_abbrev(checks)
    date_part = _parse_date_to_yyyymmdd(date_str)
    parts = [job_label]
    if project_desc.strip():
        parts.append(project_desc.strip().upper())
    if intent:
        parts.append(f"{intent}_{date_part}")
    else:
        parts.append(date_part)
    return " - ".join(parts) + ".pdf"


# ─── App Setup ────────────────────────────────────────────────

app = FastAPI(
    title="Transmittal Builder",
    version="4.0.0",
    description="Backend API for the Transmittal Builder desktop app",
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
    return {"status": "healthy", "service": "transmittal-builder-backend", "version": "4.0.0"}


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

# Pattern matching typical job numbers like "R3P-2401", "ABC-1234", etc.
_JOB_NUM_RE = re.compile(r'^([A-Z][A-Z0-9]*-\d{3,})', re.IGNORECASE)
# Pattern matching numeric-prefixed job numbers like "25074-HEN"
_JOB_NUM_RE2 = re.compile(r'^(\d+[A-Z]?-[A-Z]{2,})', re.IGNORECASE)
# Transmittals folder name detector
_TRANSMITTALS_NAME_RE = re.compile(r'transmittal', re.IGNORECASE)
# Numbered department folder pattern like "01-ENGINEERING"
_DEPT_FOLDER_RE = re.compile(r'^\d{2}-')


def _parse_project_name(folder_name: str) -> tuple[str, str]:
    """
    Split a project folder name into (job_num, client_site).

    Handles two naming conventions:
      "ABC-2401-Project-Name"                   → ("ABC-2401", "Project Name")
      "25074-HEN - NANULAK 180 MW BESS DESIGN"  → ("25074-HEN", "NANULAK 180 MW BESS DESIGN")
    """
    # Try primary pattern first (letter-led: e.g. ABC-2401)
    m = _JOB_NUM_RE.match(folder_name)
    if m:
        job_num = m.group(1).upper()
        rest = folder_name[m.end():]
        if rest.startswith(" - "):
            client_site = rest[3:].strip()
        else:
            client_site = rest.lstrip("-").replace("-", " ").strip()
        return job_num, client_site
    # Try secondary pattern (digit-led: 25074-HEN)
    m2 = _JOB_NUM_RE2.match(folder_name)
    if m2:
        job_num = m2.group(1).upper()
        rest = folder_name[m2.end():]
        if rest.startswith(" - "):
            client_site = rest[3:].strip()
        else:
            client_site = rest.lstrip("-").replace("-", " ").strip()
        return job_num, client_site
    return folder_name, ""


def _is_transmittals_folder(folder_name: str, folder_path: str) -> bool:
    """
    Return True if the folder appears to be a transmittals folder.
    Checks both the folder name (contains 'transmittal') and its contents
    (has at least one XMTL-* subfolder).
    """
    if _TRANSMITTALS_NAME_RE.search(folder_name):
        return True
    try:
        for entry in os.scandir(folder_path):
            if entry.is_dir() and re.match(r'^xmtl-\d+$', entry.name, re.IGNORECASE):
                return True
    except OSError:
        pass
    return False


def _find_transmittals_subfolder(folder_path: str) -> Optional[str]:
    """Return the path of the first transmittals subfolder found, or None."""
    try:
        for entry in os.scandir(folder_path):
            if entry.is_dir() and _is_transmittals_folder(entry.name, entry.path):
                return entry.path
    except OSError:
        pass
    return None


def _collect_pdf_sources(parent_path: str, exclude_path: Optional[str] = None, max_depth: int = 4) -> list[dict]:
    """
    Build a list of PDF source descriptors by recursively scanning subfolders of
    *parent_path* up to *max_depth* levels deep, skipping *exclude_path*.

    Each descriptor: {path, label, pdf_count, pdf_files}  where pdf_files is a
    sorted list of *absolute* paths to the discovered PDFs and label is the
    relative folder path using " / " as separator (e.g. "01-ENGINEERING / DRAWINGS / ISSUED").
    """
    sources: list[dict] = []
    exclude_norm = os.path.normpath(exclude_path) if exclude_path else None

    def _scan(dir_path: str, label: str, depth: int) -> None:
        if depth > max_depth:
            return
        pdfs: list[str] = []
        subdirs: list[tuple[str, str]] = []
        try:
            for e in sorted(os.scandir(dir_path), key=lambda x: x.name.lower()):
                if e.is_file() and e.name.lower().endswith(".pdf"):
                    pdfs.append(e.path)
                elif e.is_dir():
                    norm = os.path.normpath(e.path)
                    if not (exclude_norm and norm == exclude_norm):
                        subdirs.append((e.path, e.name))
        except OSError:
            return
        if pdfs:
            sources.append({
                "path": dir_path,
                "label": label,
                "pdf_count": len(pdfs),
                "pdf_files": sorted(pdfs),
            })
        for sub_path, sub_name in subdirs:
            _scan(sub_path, f"{label} / {sub_name}", depth + 1)

    try:
        for entry in sorted(os.scandir(parent_path), key=lambda e: e.name.lower()):
            if not entry.is_dir():
                continue
            norm = os.path.normpath(entry.path)
            if exclude_norm and norm == exclude_norm:
                continue
            _scan(entry.path, entry.name, 1)
    except OSError:
        pass

    return sources


def _load_contacts_from(folder_path: str) -> list[dict]:
    """Try to load and return contacts from contacts.json in folder_path."""
    contacts_path = os.path.join(folder_path, "contacts.json")
    if os.path.isfile(contacts_path):
        try:
            with open(contacts_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            pass
    return []


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
    xmtl_scan_dir = folder_path  # where to look for XMTL-* folders

    try:
        for entry in os.scandir(folder_path):
            n = entry.name.lower()
            if entry.is_dir():
                if re.match(r'^xmtl-\d+$', n):
                    existing_xmtl.append(entry.name)
                elif n == "drawings":
                    has_drawings = True
                elif _is_transmittals_folder(entry.name, entry.path):
                    # Project root has a transmittals subfolder — use it for XMTL scanning
                    xmtl_scan_dir = entry.path
                    has_drawings = True  # assume drawings exist somewhere
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

    # If a transmittals subfolder was found, enumerate XMTL-* from there
    if xmtl_scan_dir != folder_path:
        try:
            for entry in os.scandir(xmtl_scan_dir):
                if entry.is_dir() and re.match(r'^xmtl-\d+$', entry.name, re.IGNORECASE):
                    existing_xmtl.append(entry.name)
        except OSError:
            pass

    existing_xmtl = sorted(set(existing_xmtl))
    next_num = _get_next_xmtl_num(xmtl_scan_dir)

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

    seen_paths: set[str] = set()
    for entry in entries:
        # Skip numbered department folders ("01-ENGINEERING") and any
        # transmittals subfolder — these are *inside* a project, not
        # projects themselves. Without this filter, scanning a project
        # root makes folders like "06-TRANSMITTALS" appear in the project
        # picker (and clicking twice was registering as two adds).
        if _DEPT_FOLDER_RE.match(entry.name):
            continue
        if _is_transmittals_folder(entry.name, entry.path):
            continue
        # Defensive dedupe by normalized path
        norm = os.path.normpath(entry.path).lower()
        if norm in seen_paths:
            continue
        seen_paths.add(norm)
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

    Supports multi-level folder structures:

    **Transmittals folder** (contains XMTL-* subfolders or name contains "transmittal"):
      - Walks up to infer the project root (skipping numbered dept folders)
      - Scans sibling folders for PDF sources, index/template files
      - Returns output_dir = the transmittals folder itself

    **Department subfolder** (name starts with two digits + dash, e.g. "01-ENGINEERING"):
      - Walks up to the project root
      - Finds the transmittals sibling folder for XMTL numbering
      - Collects PDF sources from ALL sibling dept folders
      - Returns output_dir = transmittals sibling (or project root if none)

    **Project root** (contains numbered department subfolders like "01-*"):
      - Locates the transmittals subfolder within it
      - Scans department subfolders for PDF sources
      - Returns output_dir = transmittals subfolder (or the root if none found)

    **Flat structure** (original behavior fallback):
      - Scans for PDFs, index, template, XMTL folders at the top level
      - Returns output_dir = the selected folder
    """
    folder_path = os.path.normpath(req.folder_path)
    if not os.path.isdir(folder_path):
        raise HTTPException(400, f"Folder does not exist: {folder_path}")

    folder_name = os.path.basename(folder_path)

    # ── Classify the selected folder ──────────────────────────
    is_xmtl_folder = _is_transmittals_folder(folder_name, folder_path)
    # A numbered dept subfolder (e.g. "01-ENGINEERING") that is NOT itself a transmittals folder
    is_dept_folder = bool(_DEPT_FOLDER_RE.match(folder_name)) and not is_xmtl_folder

    has_dept_subfolders = False
    if not is_xmtl_folder and not is_dept_folder:
        try:
            for e in os.scandir(folder_path):
                if e.is_dir() and _DEPT_FOLDER_RE.match(e.name):
                    has_dept_subfolders = True
                    break
        except OSError:
            pass

    transmittals_folder: Optional[str] = None
    project_root: Optional[str] = None
    # NOTE: pdf_sources is intentionally always [] now — the frontend's
    # "PDF Sources Found" panel was removed in v5.0 in favor of the
    # drag-and-drop dropzone, and computing the recursive walk on every
    # project load was both expensive and unused. The field is kept in the
    # response for backward compatibility with older clients.
    pdf_sources: list[dict] = []

    if is_xmtl_folder:
        # ── Case A: selected folder IS the transmittals folder ──
        transmittals_folder = folder_path
        parent = os.path.dirname(folder_path)
        parent_name = os.path.basename(parent)
        # If the parent is a numbered dept folder, skip up one more level
        if _DEPT_FOLDER_RE.match(parent_name):
            candidate = os.path.dirname(parent)
        else:
            candidate = parent
        # Validate the candidate exists; fall back to parent if not
        project_root = candidate if os.path.isdir(candidate) else parent
        job_num, client_site = _parse_project_name(os.path.basename(project_root))
        output_dir = transmittals_folder

    elif is_dept_folder:
        # ── Case D: selected folder is a numbered dept subfolder ──
        # (e.g. user selected "01-ENGINEERING" from the dropdown)
        # Walk up to the project root and anchor the scan there.
        project_root = os.path.dirname(folder_path)
        job_num, client_site = _parse_project_name(os.path.basename(project_root))
        transmittals_folder = _find_transmittals_subfolder(project_root)
        output_dir = transmittals_folder or project_root

    elif has_dept_subfolders:
        # ── Case B: selected folder is a project root ────────
        project_root = folder_path
        job_num, client_site = _parse_project_name(folder_name)
        transmittals_folder = _find_transmittals_subfolder(folder_path)
        output_dir = transmittals_folder or folder_path

    else:
        # ── Case C: flat / legacy structure ──────────────────
        project_root = folder_path
        transmittals_folder = None
        job_num, client_site = _parse_project_name(folder_name)
        output_dir = folder_path

    # ── Determine the directory to scan for XMTL-* folders ──
    scan_dir = transmittals_folder or output_dir

    existing_xmtl: list[str] = []
    contacts: list[dict] = []
    index_files: list[str] = []
    template_files: list[str] = []
    flat_pdfs: list[str] = []

    def _rel(path: str) -> str:
        try:
            return os.path.relpath(path, project_root).replace("\\", "/")
        except ValueError:
            return path

    # ── Scan transmittals/output dir for XMTL folders + contacts ──
    try:
        for entry in os.scandir(scan_dir):
            n = entry.name.lower()
            if entry.is_dir():
                if re.match(r'^xmtl-\d+$', n):
                    existing_xmtl.append(entry.name)
            elif entry.is_file() and n == "contacts.json":
                try:
                    with open(entry.path, "r", encoding="utf-8") as f:
                        contacts = json.load(f)
                except (OSError, json.JSONDecodeError):
                    pass
    except OSError:
        pass

    # Fall back to project root contacts if not found in transmittals folder
    if not contacts and project_root and project_root != scan_dir:
        contacts = _load_contacts_from(project_root)

    # ── Scan project root + dept subfolders for index/template files ──
    if project_root:
        try:
            for entry in os.scandir(project_root):
                n = entry.name.lower()
                if entry.is_file():
                    if n.endswith((".xlsx", ".xls")):
                        index_files.append(_rel(entry.path))
                    elif n.endswith(".docx"):
                        template_files.append(_rel(entry.path))
                    elif n.endswith(".pdf"):
                        flat_pdfs.append(_rel(entry.path))
                elif entry.is_dir() and not _is_transmittals_folder(entry.name, entry.path):
                    # Shallow scan of dept subfolders for index/template files
                    try:
                        for sub in os.scandir(entry.path):
                            sn = sub.name.lower()
                            if sub.is_file():
                                if sn.endswith((".xlsx", ".xls")):
                                    index_files.append(_rel(sub.path))
                                elif sn.endswith(".docx"):
                                    template_files.append(_rel(sub.path))
                    except OSError:
                        pass
        except OSError:
            pass

    # ── Flat-only extras: scan "drawings" subfolder ───────────
    if not is_xmtl_folder and not has_dept_subfolders:
        try:
            for entry in os.scandir(folder_path):
                n = entry.name.lower()
                if entry.is_dir() and n == "drawings":
                    try:
                        for sub in os.scandir(entry.path):
                            if sub.is_file() and sub.name.lower().endswith(".pdf"):
                                flat_pdfs.append(_rel(sub.path))
                    except OSError:
                        pass
                elif entry.is_file() and n.endswith(".pdf"):
                    flat_pdfs.append(_rel(entry.path))
        except OSError:
            pass

    existing_xmtl.sort()
    flat_pdfs.sort()
    index_files.sort()
    template_files.sort()

    return JSONResponse({
        "job_num": job_num,
        "client_site": client_site,
        "project_root": project_root,
        "transmittals_folder": transmittals_folder,
        "output_dir": output_dir,
        "pdfs": flat_pdfs,
        "pdf_sources": pdf_sources,
        "index_files": index_files,
        "template_files": template_files,
        "contacts": contacts,
        "existing_xmtl": existing_xmtl,
        "next_xmtl_num": _get_next_xmtl_num(scan_dir),
    })


# ─── POST /api/render-to-folder ───────────────────────────────

@app.post("/api/render-to-folder")
async def api_render_to_folder(
    template: UploadFile = File(..., description="Transmittal .docx template"),
    fields: str = Form(..., description="JSON: project/sender fields"),
    checks: str = Form(..., description="JSON: checkbox states"),
    contacts: str = Form(..., description="JSON: [{name, company, email, phone}]"),
    documents: str = Form(..., description="JSON: [{doc_no, desc, rev}]"),
    output_dir: str = Form(..., description="Absolute path to the transmittals / project folder"),
    pdfs: List[UploadFile] = File(default=[], description="Source PDF documents"),
    local_pdf_paths: str = Form(default="[]", description="JSON: list of absolute paths to local PDFs on disk"),
):
    """
    Render a transmittal package and write the output files directly to disk.

    Creates an ``XMTL-NNN/`` sub-folder inside *output_dir*, writes the
    rendered ``.docx``, ``.pdf``, and combined drawings PDF into it, and
    saves a ``contacts.json`` file in both the XMTL folder and the project
    root for easy reuse.

    Source PDFs can be provided either as uploaded files (*pdfs*) or as a
    JSON list of absolute local paths (*local_pdf_paths*).  Both may be used
    together; duplicates (by basename) are silently dropped.

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
            local_paths: list[str] = json.loads(local_pdf_paths)
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
        seen_names: set[str] = set()
        for pdf in pdfs:
            if pdf.filename and pdf.filename.lower().endswith(".pdf"):
                saved_pdfs.append(_save_upload(pdf, pdf_dir))
                seen_names.add(pdf.filename.lower())

        # Copy local PDFs directly from disk (avoid duplicate basenames)
        for lp in local_paths:
            lp = os.path.normpath(lp)
            bname = os.path.basename(lp).lower()
            if bname in seen_names:
                continue
            if os.path.isfile(lp) and bname.endswith(".pdf"):
                dest = os.path.join(pdf_dir, os.path.basename(lp))
                shutil.copy2(lp, dest)
                saved_pdfs.append(dest)
                seen_names.add(bname)

        # Determine output filenames. Strip any leading "XMTL-" the user may
        # have typed so the filename never contains "XMTL-XMTL-001".
        job_num = fields_dict.get("job_num", "").strip() or "UNKNOWN"
        raw_xmtl = fields_dict.get("transmittal_num", "").strip()
        xmtl_num = _normalize_xmtl_num(raw_xmtl) or _get_next_xmtl_num(output_dir)
        project_desc = fields_dict.get("project_desc", "").strip()
        date_str = fields_dict.get("date", "")
        # Pad to 3 digits if purely numeric; non-numeric values (e.g. "ABC") are
        # passed through unchanged — this is intentional for non-standard numbering.
        xmtl_num_padded = xmtl_num.zfill(3) if xmtl_num.isdigit() else xmtl_num
        # Preserve the job_num as-is if it already has a prefix; otherwise prepend "R3P-"
        job_label = job_num if job_num.upper().startswith("R3P-") else f"R3P-{job_num}"
        # Transmittal letter filename: e.g. R3P-JobNumber-XMTL-016 - DOCUMENT INDEX
        base_name = f"{job_label}-XMTL-{xmtl_num_padded} - DOCUMENT INDEX"

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
            has_attached_drawings=bool(saved_pdfs),
        )

        # Create transmittal PDF
        transmittal_pdf_tmp, error = docx_to_pdf(docx_tmp, work_dir)
        if not transmittal_pdf_tmp:
            raise HTTPException(500, f"Transmittal PDF generation failed: {error}")

        # Copy final files into the XMTL output folder
        files_written: list[str] = []

        def _copy_to_xmtl(src: str, dest_name: str) -> str:
            dest = os.path.join(xmtl_folder, dest_name)
            shutil.copy2(src, dest)
            files_written.append(dest)
            return dest

        _copy_to_xmtl(docx_tmp, f"{base_name}.docx")
        _copy_to_xmtl(transmittal_pdf_tmp, f"{base_name}.pdf")

        # Create and copy merged drawings PDF only when source PDFs were provided
        if saved_pdfs:
            drawings_combined_name = _build_combined_pdf_name(
                job_label, project_desc, checks_dict, date_str,
            )
            drawings_combined_tmp = os.path.join(work_dir, drawings_combined_name)
            try:
                merge_source_pdfs(saved_pdfs, drawings_combined_tmp)
            except Exception as e:
                raise HTTPException(500, f"Drawing PDF merge failed: {e}")
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

        def _write_merged_contacts(target_dir: str) -> None:
            """Merge clean_contacts into an existing contacts.json in target_dir."""
            contacts_path = os.path.join(target_dir, "contacts.json")
            existing: list[dict] = []
            if os.path.isfile(contacts_path):
                try:
                    with open(contacts_path, "r", encoding="utf-8") as f:
                        existing = json.load(f)
                except (OSError, json.JSONDecodeError):
                    existing = []
            # Deduplicate by email (new contacts take precedence over existing ones)
            merged = {c.get("email", "").lower(): c for c in existing if c.get("email")}
            for c in clean_contacts:
                if c.get("email"):
                    merged[c["email"].lower()] = {**c, "email": c["email"].lower()}
            merged_list = sorted(merged.values(), key=lambda c: c.get("email", ""))
            with open(contacts_path, "w", encoding="utf-8") as f:
                json.dump(merged_list, f, indent=2, ensure_ascii=False)

        # Write/merge contacts.json at output_dir level (transmittals folder)
        _write_merged_contacts(output_dir)

        # Also write/merge at the project root if output_dir is a transmittals folder
        output_dir_name = os.path.basename(output_dir)
        if _is_transmittals_folder(output_dir_name, output_dir):
            parent = os.path.dirname(output_dir)
            parent_name = os.path.basename(parent)
            candidate_root = os.path.dirname(parent) if _DEPT_FOLDER_RE.match(parent_name) else parent
            # Only write to the project root if it exists and differs from output_dir
            if (os.path.isdir(candidate_root)
                    and os.path.normpath(candidate_root) != os.path.normpath(output_dir)):
                _write_merged_contacts(candidate_root)

        return JSONResponse({
            "success": True,
            "xmtl_folder": xmtl_folder,
            "xmtl_folder_name": xmtl_folder_name,
            "next_xmtl_num": _get_next_xmtl_num(output_dir),
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

        # Build output filename. Strip any leading "XMTL-" the user may have
        # typed so the filename never contains "XMTL-XMTL-001".
        job_num = fields_dict.get("job_num", "").strip() or "UNKNOWN"
        raw_xmtl = fields_dict.get("transmittal_num", "").strip()
        xmtl_num = _normalize_xmtl_num(raw_xmtl) or "001"
        project_desc = fields_dict.get("project_desc", "").strip()
        date_str = fields_dict.get("date", "")
        xmtl_num_padded = xmtl_num.zfill(3) if xmtl_num.isdigit() else xmtl_num
        # Preserve the job_num as-is if it already has a prefix; otherwise prepend "R3P-"
        job_label = job_num if job_num.upper().startswith("R3P-") else f"R3P-{job_num}"
        # Transmittal letter filename: e.g. R3P-JobNumber-XMTL-016 - DOCUMENT INDEX
        base_name = f"{job_label}-XMTL-{xmtl_num_padded} - DOCUMENT INDEX"

        # Render the .docx
        docx_out = os.path.join(work_dir, f"{base_name}.docx")
        render_transmittal(
            template_path=template_path,
            fields=fields_dict,
            checks=checks_dict,
            contacts=contacts_list,
            documents=documents_list,
            out_path=docx_out,
            has_attached_drawings=bool(saved_pdfs),
        )

        # Create transmittal PDF
        transmittal_pdf_path, error = docx_to_pdf(docx_out, work_dir)
        if not transmittal_pdf_path:
            raise HTTPException(500, f"Transmittal PDF generation failed: {error}")

        # Return package ZIP
        import zipfile
        zip_name = f"{job_label}-XMTL-{xmtl_num_padded}-Package.zip"
        zip_path = os.path.join(work_dir, zip_name)

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(docx_out, arcname=f"{base_name}.docx")
            zf.write(transmittal_pdf_path, arcname=f"{base_name}.pdf")
            # Include merged drawings PDF only when source PDFs were provided
            if saved_pdfs:
                drawings_combined_name = _build_combined_pdf_name(
                    job_label, project_desc, checks_dict, date_str,
                )
                drawings_combined_path = os.path.join(work_dir, drawings_combined_name)
                try:
                    merge_source_pdfs(saved_pdfs, drawings_combined_path)
                except Exception as e:
                    raise HTTPException(500, f"Drawing PDF merge failed: {e}")
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


# ─── PyInstaller / sidecar entry point ───────────────────────
# When the backend is bundled as a standalone executable by PyInstaller
# and launched by the Tauri Rust shell, this block runs:
#   1. Reads TRANSMITTAL_BACKEND_PORT env var (set by Rust) or picks a
#      free OS port.
#   2. Prints the actual port on stdout so Rust can capture it.
#   3. Starts uvicorn on that port.
# In normal development (`uvicorn app:app --port 8000`) this block is
# never reached.

if __name__ == "__main__":
    import socket
    import uvicorn

    port_env = os.environ.get("TRANSMITTAL_BACKEND_PORT", "0")
    try:
        port = int(port_env)
    except ValueError:
        port = 0

    if port == 0:
        # Ask the OS for a free port.
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as _s:
            _s.bind(("127.0.0.1", 0))
            port = _s.getsockname()[1]

    # ── First line of stdout must be the port number ───────────────
    # The Tauri Rust launcher reads this before the server is ready.
    print(port, flush=True)

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
    )
