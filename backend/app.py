"""
Transmittal Builder — Backend API

Routes:
    GET  /api/health              Health check (unauthenticated)
    GET  /api/auth/me             Returns authenticated user info
    POST /api/parse-index         Parse an Excel drawing index → document rows
    POST /api/render              Render transmittal → ZIP package (docx + pdf + drawings)
    POST /api/email               Send transmittal via SMTP
    GET  /api/scan-projects       Scan a root directory for project folders
    POST /api/scan-folder         Deep-scan a specific project folder
    POST /api/render-to-folder    Render transmittal and write output directly to disk

Run:
    uvicorn app:app --reload --port 8000

Auth:
    All endpoints except /api/health require a Google ID token in the
    Authorization: Bearer <token> header.
    Set DISABLE_AUTH=1 to bypass for local dev.
"""

from __future__ import annotations

from dotenv import load_dotenv
load_dotenv()

import json
import os
import re
import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Form, Request, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from core.render import render_transmittal, _normalize_xmtl_num
from core.excel_parser import parse_drawing_index

from chamber19_desktop_toolkit.utils.pdf_merge import docx_to_pdf, merge_source_pdfs  # type: ignore
from auth import require_auth, log_access
import database


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
    return datetime.now().strftime("%Y%m%d")


def _build_combined_pdf_name(job_label: str, project_desc: str, checks: dict,
                              date_str: str) -> str:
    """
    Build the combined PDF filename:
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
    version=os.getenv("APP_VERSION", "dev"),
    description="Backend API for the Transmittal Builder web app",
)

_origins = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _access_log(request: Request, call_next):
    response = await call_next(request)
    user = getattr(request.state, "user", None)
    if user:
        ip = request.client.host if request.client else ""
        log_access(user["email"], request.method, str(request.url.path), response.status_code, ip)
    return response


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


# ─── User profiles ────────────────────────────────────────────

_PROFILE_PATH = os.getenv(
    "USER_PROFILE_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "user_profiles.json"),
)
_DEVELOPER_EMAIL = os.getenv("DEVELOPER_EMAIL", "")


def _read_profiles() -> dict:
    try:
        with open(_PROFILE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def _write_profiles(profiles: dict) -> None:
    os.makedirs(os.path.dirname(_PROFILE_PATH), exist_ok=True)
    with open(_PROFILE_PATH, "w", encoding="utf-8") as f:
        json.dump(profiles, f, indent=2, ensure_ascii=False)


class ProfileRequest(BaseModel):
    display_name: str


# ─── Health Check (unauthenticated) ───────────────────────────

@app.get("/api/health")
def health():
    return {"status": "healthy", "service": "transmittal-builder-backend", "version": os.getenv("APP_VERSION", "dev")}


# ─── Auth: current user ───────────────────────────────────────

@app.get("/api/auth/me")
def auth_me(user: dict = Depends(require_auth)):
    """Returns the authenticated user's Google profile info including display name."""
    profiles = _read_profiles()
    email = user.get("email", "")
    profile = profiles.get(email, {})
    return {
        **user,
        "display_name": profile.get("display_name") or None,
        "is_developer": email == _DEVELOPER_EMAIL,
    }


@app.post("/api/auth/profile")
def update_profile(req: ProfileRequest, user: dict = Depends(require_auth)):
    """Save or update the authenticated user's display name."""
    profiles = _read_profiles()
    email = user.get("email", "")
    profiles[email] = {
        **profiles.get(email, {}),
        "display_name": req.display_name.strip(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    _write_profiles(profiles)
    return {"success": True, "display_name": req.display_name.strip()}


# ─── GET /api/browse ─────────────────────────────────────────

@app.get("/api/browse")
def api_browse(path: str = "", user: dict = Depends(require_auth)):
    """
    Return the immediate child directories of *path*.
    If *path* is empty, return available drive letters on Windows (or / on Unix).
    """
    import string, sys

    if not path:
        if sys.platform == "win32":
            drives = [f"{d}:\\" for d in string.ascii_uppercase if os.path.exists(f"{d}:\\")]
            return {"path": "", "parent": None, "entries": [{"name": d, "path": d} for d in drives]}
        return {"path": "/", "parent": None, "entries": [{"name": "/", "path": "/"}]}

    path = os.path.normpath(path)
    if not os.path.isdir(path):
        raise HTTPException(404, f"Path not found: {path}")

    try:
        entries = sorted(
            ({"name": e.name, "path": e.path} for e in os.scandir(path) if e.is_dir()),
            key=lambda x: x["name"].lower(),
        )
    except PermissionError as exc:
        raise HTTPException(403, f"Access denied: {exc}") from exc

    parent_path = str(Path(path).parent)
    parent = None if os.path.normpath(parent_path) == os.path.normpath(path) else parent_path

    return {"path": path, "parent": parent, "entries": entries}


# ─── POST /api/zip-folder ─────────────────────────────────────

class ZipFolderRequest(BaseModel):
    folder_path: str


@app.post("/api/zip-folder")
def api_zip_folder(req: ZipFolderRequest, user: dict = Depends(require_auth)):
    """Zip the contents of an XMTL folder and return it for download."""
    import zipfile as _zipfile
    folder_path = os.path.normpath(req.folder_path)
    if not os.path.isdir(folder_path):
        raise HTTPException(400, f"Folder does not exist: {folder_path}")
    folder_name = os.path.basename(folder_path)
    work_dir = _make_work_dir()
    zip_path = os.path.join(work_dir, f"{folder_name}.zip")
    try:
        with _zipfile.ZipFile(zip_path, "w", _zipfile.ZIP_DEFLATED) as zf:
            for entry in sorted(os.scandir(folder_path), key=lambda e: e.name):
                if entry.is_file():
                    zf.write(entry.path, arcname=entry.name)
        return FileResponse(zip_path, media_type="application/zip", filename=f"{folder_name}.zip")
    except Exception as e:
        raise HTTPException(500, f"Failed to zip folder: {e}")


# ─── Project registry ─────────────────────────────────────────

_REGISTRY_PATH = os.getenv(
    "PROJECT_REGISTRY_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "project_registry.json"),
)


# ─── Database startup ─────────────────────────────────────────

@app.on_event("startup")
def _startup():
    database.init_db()
    database.migrate_from_registry(_REGISTRY_PATH)


class TouchProjectRequest(BaseModel):
    path: str
    job_num: str = ""
    client_site: str = ""
    next_xmtl_num: str = ""


class DeleteProjectRequest(BaseModel):
    path: str


@app.get("/api/projects/recent")
def api_projects_recent(user: dict = Depends(require_auth)):
    """Return up to 20 recently opened projects from the database."""
    rows = database.get_recent_projects(limit=20)
    # Normalise field names to match what the frontend already expects
    projects = [
        {
            "path":          r["path"],
            "job_num":       r.get("job_num") or "",
            "client_site":   r.get("client_site") or "",
            "next_xmtl_num": r.get("next_xmtl") or "",
            "opened_by":     r.get("opened_by") or "",
            "opened_at":     r.get("last_opened") or "",
        }
        for r in rows
    ]
    return {"projects": projects}


@app.post("/api/projects/touch")
def api_projects_touch(req: TouchProjectRequest, user: dict = Depends(require_auth)):
    """Record that a project was opened (upsert into DB)."""
    folder_name = os.path.basename(req.path)
    email = user.get("email", "")
    display_name = _read_profiles().get(email, {}).get("display_name") or email
    database.touch_project(
        path=req.path,
        job_num=req.job_num or _parse_project_name(folder_name)[0],
        client_site=req.client_site or _parse_project_name(folder_name)[1],
        opened_by=display_name,
        next_xmtl_num=req.next_xmtl_num,
    )
    return {"success": True}


@app.delete("/api/projects/recent")
def api_projects_recent_delete(req: DeleteProjectRequest, user: dict = Depends(require_auth)):
    """Remove a project from the DB. Developer only."""
    if user.get("email", "") != _DEVELOPER_EMAIL:
        raise HTTPException(403, "Developer access required")
    database.remove_project(req.path)
    return {"success": True}


# ─── Transmittal history ──────────────────────────────────────

class ProjectPathRequest(BaseModel):
    project_path: str


@app.post("/api/projects/transmittals")
def api_transmittal_history(req: ProjectPathRequest, user: dict = Depends(require_auth)):
    """Return logged transmittal history for a project path."""
    return {"transmittals": database.get_transmittal_history(req.project_path)}


class CheckDuplicatesRequest(BaseModel):
    project_path: str
    doc_nos: list[str]


@app.post("/api/drawings/check-duplicates")
def api_check_duplicates(req: CheckDuplicatesRequest, user: dict = Depends(require_auth)):
    """Check whether any of the supplied doc_nos were previously transmitted."""
    return {"duplicates": database.check_duplicate_drawings(req.project_path, req.doc_nos)}


# ─── Contact groups (address book) ───────────────────────────

@app.get("/api/contacts/groups")
def api_get_contact_groups(user: dict = Depends(require_auth)):
    return {"groups": database.get_contact_groups()}


class SaveGroupRequest(BaseModel):
    company_name: str
    contacts: list[dict]


@app.post("/api/contacts/groups")
def api_save_contact_group(req: SaveGroupRequest, user: dict = Depends(require_auth)):
    if not req.company_name.strip():
        raise HTTPException(400, "company_name is required")
    result = database.save_contact_group(req.company_name.strip(), req.contacts)
    return {"success": True, **result}


class DeleteGroupRequest(BaseModel):
    group_id: int


@app.delete("/api/contacts/groups")
def api_delete_contact_group(req: DeleteGroupRequest, user: dict = Depends(require_auth)):
    database.delete_contact_group(req.group_id)
    return {"success": True}


# ─── POST /api/parse-index ────────────────────────────────────

@app.post("/api/parse-index")
async def api_parse_index(
    file: UploadFile = File(...),
    user: dict = Depends(require_auth),
):
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

_JOB_NUM_RE = re.compile(r'^([A-Z][A-Z0-9]*-\d{3,})', re.IGNORECASE)
_JOB_NUM_RE2 = re.compile(r'^(\d+[A-Z]?-[A-Z]{2,})', re.IGNORECASE)
_JOB_NUM_NUMERIC_RE = re.compile(r'^(\d{4,})')
_EMBEDDED_TEMPLATE_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "templates", "transmittal_template.docx"
)
_TRANSMITTALS_NAME_RE = re.compile(r'transmittal', re.IGNORECASE)
_DEPT_FOLDER_RE = re.compile(r'^\d{2}-')


def _parse_project_name(folder_name: str) -> tuple[str, str]:
    """Split a project folder name into (job_num, client_site).

    Priority: pure-numeric prefix (25074-HEN → "25074"), then alphanumeric patterns.
    """
    # Pure-numeric project numbers: "25074-HEN - NANULAK 180 MW BESS E&I DESIGN"
    mn = _JOB_NUM_NUMERIC_RE.match(folder_name)
    if mn:
        job_num = mn.group(1)
        rest = folder_name[mn.end():]  # e.g. "-HEN - NANULAK 180 MW BESS E&I DESIGN"
        if " - " in rest:
            client_site = rest.split(" - ", 1)[1].strip()
        else:
            client_site = rest.lstrip("-").strip()
        return job_num, client_site
    m = _JOB_NUM_RE.match(folder_name)
    if m:
        job_num = m.group(1).upper()
        rest = folder_name[m.end():]
        if rest.startswith(" - "):
            client_site = rest[3:].strip()
        else:
            client_site = rest.lstrip("-").replace("-", " ").strip()
        return job_num, client_site
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
    try:
        for entry in os.scandir(folder_path):
            if entry.is_dir() and _is_transmittals_folder(entry.name, entry.path):
                return entry.path
    except OSError:
        pass
    return None


def _collect_pdf_sources(parent_path: str, exclude_path: Optional[str] = None, max_depth: int = 4) -> list[dict]:
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
    contacts_path = os.path.join(folder_path, "contacts.json")
    if os.path.isfile(contacts_path):
        try:
            with open(contacts_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            pass
    return []


def _get_next_xmtl_num(folder_path: str) -> str:
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
    if not query.strip():
        return True
    target = folder_name.lower()
    return all(token in target for token in query.lower().split())


def _build_project_meta(folder_path: str, folder_name: str) -> dict:
    job_num, client_site = _parse_project_name(folder_name)

    has_drawings = False
    has_index = False
    has_template = False
    has_contacts = False
    existing_xmtl: list[str] = []
    xmtl_scan_dir = folder_path

    try:
        for entry in os.scandir(folder_path):
            n = entry.name.lower()
            if entry.is_dir():
                if re.match(r'^xmtl-\d+$', n):
                    existing_xmtl.append(entry.name)
                elif n == "drawings":
                    has_drawings = True
                elif _is_transmittals_folder(entry.name, entry.path):
                    xmtl_scan_dir = entry.path
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
def api_scan_projects(
    root: str,
    query: str = "",
    user: dict = Depends(require_auth),
):
    """
    Scan immediate subdirectories of *root* and return project metadata.
    Optional *query* performs fuzzy text filtering.
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
        if _DEPT_FOLDER_RE.match(entry.name):
            continue
        if _is_transmittals_folder(entry.name, entry.path):
            continue
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
def api_scan_folder(
    req: ScanFolderRequest,
    user: dict = Depends(require_auth),
):
    """
    Deep-scan a specific project folder.
    Handles transmittals folders, dept subfolders, project roots, and flat structures.
    """
    folder_path = os.path.normpath(req.folder_path)
    if not os.path.isdir(folder_path):
        raise HTTPException(400, f"Folder does not exist: {folder_path}")

    folder_name = os.path.basename(folder_path)

    is_xmtl_folder = _is_transmittals_folder(folder_name, folder_path)
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
    pdf_sources: list[dict] = []

    if is_xmtl_folder:
        transmittals_folder = folder_path
        parent = os.path.dirname(folder_path)
        parent_name = os.path.basename(parent)
        if _DEPT_FOLDER_RE.match(parent_name):
            candidate = os.path.dirname(parent)
        else:
            candidate = parent
        project_root = candidate if os.path.isdir(candidate) else parent
        job_num, client_site = _parse_project_name(os.path.basename(project_root))
        output_dir = transmittals_folder

    elif is_dept_folder:
        project_root = os.path.dirname(folder_path)
        job_num, client_site = _parse_project_name(os.path.basename(project_root))
        transmittals_folder = _find_transmittals_subfolder(project_root)
        output_dir = transmittals_folder or project_root

    elif has_dept_subfolders:
        project_root = folder_path
        job_num, client_site = _parse_project_name(folder_name)
        transmittals_folder = _find_transmittals_subfolder(folder_path)
        output_dir = transmittals_folder or folder_path

    else:
        project_root = folder_path
        transmittals_folder = None
        job_num, client_site = _parse_project_name(folder_name)
        output_dir = folder_path

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

    if not contacts and project_root and project_root != scan_dir:
        contacts = _load_contacts_from(project_root)

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
    template: Optional[UploadFile] = File(default=None, description="Transmittal .docx template (uses embedded template if omitted)"),
    fields: str = Form(..., description="JSON: project/sender fields"),
    checks: str = Form(..., description="JSON: checkbox states"),
    contacts: str = Form(..., description="JSON: [{name, company, email, phone}]"),
    documents: str = Form(..., description="JSON: [{doc_no, desc, rev}]"),
    output_dir: str = Form(..., description="Absolute path to the transmittals / project folder"),
    pdfs: List[UploadFile] = File(default=[], description="Source PDF documents"),
    local_pdf_paths: str = Form(default="[]", description="JSON: list of absolute paths to local PDFs on disk"),
    user: dict = Depends(require_auth),
):
    """
    Render a transmittal package and write output directly to disk.
    Creates XMTL-NNN/ inside output_dir.
    """
    work_dir = _make_work_dir()

    try:
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

        if template and template.filename:
            template_path = _save_upload(template, work_dir, "template.docx")
        elif os.path.isfile(_EMBEDDED_TEMPLATE_PATH):
            template_path = _EMBEDDED_TEMPLATE_PATH
        else:
            raise HTTPException(500, "No transmittal template available — embedded template not found.")

        pdf_dir = os.path.join(work_dir, "pdfs")
        os.makedirs(pdf_dir, exist_ok=True)
        saved_pdfs: list[str] = []
        seen_names: set[str] = set()
        for pdf in pdfs:
            if pdf.filename and pdf.filename.lower().endswith(".pdf"):
                saved_pdfs.append(_save_upload(pdf, pdf_dir))
                seen_names.add(pdf.filename.lower())

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

        job_num = fields_dict.get("job_num", "").strip() or "UNKNOWN"
        raw_xmtl = fields_dict.get("transmittal_num", "").strip()
        xmtl_num = _normalize_xmtl_num(raw_xmtl) or _get_next_xmtl_num(output_dir)
        project_desc = fields_dict.get("project_desc", "").strip()
        date_str = fields_dict.get("date", "")
        xmtl_num_padded = xmtl_num.zfill(3) if xmtl_num.isdigit() else xmtl_num
        job_label = job_num if job_num.upper().startswith("R3P-") else f"R3P-{job_num}"
        base_name = f"{job_label}-XMTL-{xmtl_num_padded} - DOCUMENT INDEX"

        xmtl_folder_name = f"XMTL-{xmtl_num_padded}"
        xmtl_folder = os.path.join(output_dir, xmtl_folder_name)

        # Render everything into the temp work_dir first.
        # The XMTL folder on disk is only created once all files are ready —
        # a crash or restart during rendering leaves nothing behind.
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

        transmittal_pdf_tmp, error = docx_to_pdf(docx_tmp, work_dir)
        if not transmittal_pdf_tmp:
            raise HTTPException(500, f"Transmittal PDF generation failed: {error}")

        # All rendering succeeded — now create the folder and copy files out.
        os.makedirs(xmtl_folder, exist_ok=True)
        files_written: list[str] = []

        def _copy_to_xmtl(src: str, dest_name: str) -> str:
            dest = os.path.join(xmtl_folder, dest_name)
            shutil.copy2(src, dest)
            files_written.append(dest)
            return dest

        _copy_to_xmtl(docx_tmp, f"{base_name}.docx")
        _copy_to_xmtl(transmittal_pdf_tmp, f"{base_name}.pdf")

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
            contacts_path = os.path.join(target_dir, "contacts.json")
            existing: list[dict] = []
            if os.path.isfile(contacts_path):
                try:
                    with open(contacts_path, "r", encoding="utf-8") as f:
                        existing = json.load(f)
                except (OSError, json.JSONDecodeError):
                    existing = []
            merged = {c.get("email", "").lower(): c for c in existing if c.get("email")}
            for c in clean_contacts:
                if c.get("email"):
                    merged[c["email"].lower()] = {**c, "email": c["email"].lower()}
            merged_list = sorted(merged.values(), key=lambda c: c.get("email", ""))
            with open(contacts_path, "w", encoding="utf-8") as f:
                json.dump(merged_list, f, indent=2, ensure_ascii=False)

        _write_merged_contacts(output_dir)

        output_dir_name = os.path.basename(output_dir)
        if _is_transmittals_folder(output_dir_name, output_dir):
            parent = os.path.dirname(output_dir)
            parent_name = os.path.basename(parent)
            candidate_root = os.path.dirname(parent) if _DEPT_FOLDER_RE.match(parent_name) else parent
            if (os.path.isdir(candidate_root)
                    and os.path.normpath(candidate_root) != os.path.normpath(output_dir)):
                _write_merged_contacts(candidate_root)

        # Log the completed transmittal to the database for history + duplicate detection
        try:
            database.log_transmittal(
                project_path=output_dir,
                xmtl_num=xmtl_num_padded,
                folder_name=xmtl_folder_name,
                folder_path=xmtl_folder,
                date=date_str,
                sender_name=fields_dict.get("from_name", ""),
                documents=documents_list,
            )
        except Exception:
            pass  # log failure must never block a successful render

        next_num = _get_next_xmtl_num(output_dir)
        return JSONResponse({
            "success": True,
            "xmtl_folder": xmtl_folder,
            "xmtl_folder_name": xmtl_folder_name,
            "next_xmtl_num": next_num,
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
    user: dict = Depends(require_auth),
):
    """Render a transmittal package and return a ZIP download."""
    work_dir = _make_work_dir()

    try:
        try:
            fields_dict = json.loads(fields)
            checks_dict = json.loads(checks)
            contacts_list = json.loads(contacts)
            documents_list = json.loads(documents)
        except json.JSONDecodeError as e:
            raise HTTPException(400, f"Invalid JSON in form data: {e}")

        template_path = _save_upload(template, work_dir, "template.docx")

        pdf_dir = os.path.join(work_dir, "pdfs")
        os.makedirs(pdf_dir, exist_ok=True)
        saved_pdfs: list[str] = []
        for pdf in pdfs:
            if pdf.filename and pdf.filename.lower().endswith(".pdf"):
                saved_pdfs.append(_save_upload(pdf, pdf_dir))

        job_num = fields_dict.get("job_num", "").strip() or "UNKNOWN"
        raw_xmtl = fields_dict.get("transmittal_num", "").strip()
        xmtl_num = _normalize_xmtl_num(raw_xmtl) or "001"
        project_desc = fields_dict.get("project_desc", "").strip()
        date_str = fields_dict.get("date", "")
        xmtl_num_padded = xmtl_num.zfill(3) if xmtl_num.isdigit() else xmtl_num
        job_label = job_num if job_num.upper().startswith("R3P-") else f"R3P-{job_num}"
        base_name = f"{job_label}-XMTL-{xmtl_num_padded} - DOCUMENT INDEX"

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

        transmittal_pdf_path, error = docx_to_pdf(docx_out, work_dir)
        if not transmittal_pdf_path:
            raise HTTPException(500, f"Transmittal PDF generation failed: {error}")

        import zipfile
        zip_name = f"{job_label}-XMTL-{xmtl_num_padded}-Package.zip"
        zip_path = os.path.join(work_dir, zip_name)

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(docx_out, arcname=f"{base_name}.docx")
            zf.write(transmittal_pdf_path, arcname=f"{base_name}.pdf")
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
async def api_email(
    req: EmailRequest,
    user: dict = Depends(require_auth),
):
    """Send a transmittal email via SMTP."""
    from chamber19_desktop_toolkit.utils.email_sender import send_email  # type: ignore

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

if __name__ == "__main__":
    import socket
    import uvicorn

    port_env = os.environ.get("TRANSMITTAL_BACKEND_PORT", "0")
    try:
        port = int(port_env)
    except ValueError:
        port = 0

    if port == 0:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as _s:
            _s.bind(("127.0.0.1", 0))
            port = _s.getsockname()[1]

    print(port, flush=True)

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
    )
