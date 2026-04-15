"""
Combined PDF generation.

Merges the rendered transmittal cover sheet (converted from .docx to PDF)
with all source PDF documents into a single combined package.

Conversion priority:
    1. Microsoft Word via docx2pdf (Windows — uses COM automation)
    2. LibreOffice headless (Linux/Mac fallback)
"""

from __future__ import annotations

import os
import platform
import subprocess
import shutil
from typing import List, Optional, Tuple

from pypdf import PdfWriter, PdfReader


def _convert_via_word(docx_path: str, output_dir: str) -> Tuple[Optional[str], Optional[str]]:
    """Convert .docx → PDF using Microsoft Word (Windows only, via docx2pdf)."""
    try:
        from docx2pdf import convert
    except ImportError:
        return None, "docx2pdf not installed. Run: pip install docx2pdf"

    base = os.path.splitext(os.path.basename(docx_path))[0]
    pdf_path = os.path.join(output_dir, f"{base}.pdf")

    try:
        convert(docx_path, pdf_path)
        if os.path.isfile(pdf_path):
            return pdf_path, None
        return None, "Word conversion produced no output."
    except Exception as e:
        return None, f"Word conversion failed: {e}"


def _convert_via_libreoffice(docx_path: str, output_dir: str) -> Tuple[Optional[str], Optional[str]]:
    """Convert .docx → PDF using LibreOffice headless."""
    libreoffice = shutil.which("libreoffice") or shutil.which("soffice")
    if not libreoffice:
        return None, "LibreOffice not found."

    try:
        result = subprocess.run(
            [libreoffice, "--headless", "--convert-to", "pdf", "--outdir", output_dir, docx_path],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            return None, f"LibreOffice failed: {result.stderr.strip()}"

        base = os.path.splitext(os.path.basename(docx_path))[0]
        pdf_path = os.path.join(output_dir, f"{base}.pdf")
        if os.path.isfile(pdf_path):
            return pdf_path, None
        return None, "LibreOffice produced no output."
    except subprocess.TimeoutExpired:
        return None, "LibreOffice timed out (60s)."
    except Exception as e:
        return None, f"LibreOffice error: {e}"


def docx_to_pdf(docx_path: str, output_dir: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Convert a .docx file to PDF.

    On Windows: uses Microsoft Word via docx2pdf (COM automation).
    On Linux/Mac: uses LibreOffice headless.
    Falls through to the other method if the primary one fails.

    Returns:
        (pdf_path, error_message) — one will be None.
    """
    if not os.path.isfile(docx_path):
        return None, f"DOCX file not found: {docx_path}"

    os.makedirs(output_dir, exist_ok=True)
    errors = []

    # Primary: Word on Windows, LibreOffice elsewhere
    if platform.system() == "Windows":
        pdf_path, err = _convert_via_word(docx_path, output_dir)
        if pdf_path:
            return pdf_path, None
        errors.append(f"Word: {err}")

        # Fallback to LibreOffice
        pdf_path, err = _convert_via_libreoffice(docx_path, output_dir)
        if pdf_path:
            return pdf_path, None
        errors.append(f"LibreOffice: {err}")
    else:
        pdf_path, err = _convert_via_libreoffice(docx_path, output_dir)
        if pdf_path:
            return pdf_path, None
        errors.append(f"LibreOffice: {err}")

        # Fallback to Word (in case docx2pdf is installed on Mac/Linux)
        pdf_path, err = _convert_via_word(docx_path, output_dir)
        if pdf_path:
            return pdf_path, None
        errors.append(f"Word: {err}")

    return None, (
        "No PDF converter available. "
        "On Windows: pip install docx2pdf (requires Microsoft Word). "
        "On Linux: apt install libreoffice-writer. "
        f"Details: {'; '.join(errors)}"
    )


def merge_pdfs(
    cover_pdf: str,
    source_pdfs: List[str],
    output_path: str,
) -> str:
    """
    Merge the transmittal cover sheet PDF with all source document PDFs
    into a single combined PDF.

    Args:
        cover_pdf: Path to the transmittal cover sheet PDF
        source_pdfs: List of paths to source document PDFs (in order)
        output_path: Where to save the combined PDF

    Returns:
        The output path.
    """
    writer = PdfWriter()

    # Add cover sheet first
    if os.path.isfile(cover_pdf):
        reader = PdfReader(cover_pdf)
        for page in reader.pages:
            writer.add_page(page)

    # Add each source PDF
    for pdf_path in source_pdfs:
        if not os.path.isfile(pdf_path):
            continue
        try:
            reader = PdfReader(pdf_path)
            for page in reader.pages:
                writer.add_page(page)
        except Exception:
            # Skip unreadable PDFs rather than failing the whole merge
            continue

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "wb") as f:
        writer.write(f)

    return output_path


def merge_source_pdfs(
    source_pdfs: List[str],
    output_path: str,
) -> str:
    """
    Merge only the source drawing PDFs into a single combined PDF.

    Args:
        source_pdfs: List of source document PDF paths
        output_path: Where to save the merged PDF

    Returns:
        The output path.

    Raises:
        ValueError: If no readable PDFs were merged.
    """
    writer = PdfWriter()
    merged_count = 0

    for pdf_path in source_pdfs:
        if not os.path.isfile(pdf_path):
            continue
        try:
            reader = PdfReader(pdf_path)
            for page in reader.pages:
                writer.add_page(page)
            merged_count += 1
        except Exception:
            continue

    if merged_count == 0:
        raise ValueError("No readable drawing PDFs were available to merge.")

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "wb") as f:
        writer.write(f)

    return output_path


def build_combined_pdf(
    docx_path: str,
    source_pdfs: List[str],
    work_dir: str,
    output_name: str,
) -> Tuple[Optional[str], Optional[str]]:
    """
    Full pipeline: convert transmittal .docx → PDF, then merge with source PDFs.

    Args:
        docx_path: Path to the rendered transmittal .docx
        source_pdfs: List of source document PDF paths
        work_dir: Temporary working directory
        output_name: Filename for the combined PDF (e.g. "R3P-1234_XMTL-001_Combined.pdf")

    Returns:
        (combined_pdf_path, error_message) — one will be None.
    """
    # Step 1: Convert cover sheet to PDF
    cover_pdf, error = docx_to_pdf(docx_path, work_dir)
    if not cover_pdf:
        return None, error

    # Step 2: Merge cover + source PDFs
    output_path = os.path.join(work_dir, output_name)
    try:
        merge_pdfs(cover_pdf, source_pdfs, output_path)
        return output_path, None
    except Exception as e:
        return None, f"PDF merge failed: {e}"
