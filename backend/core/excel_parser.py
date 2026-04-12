"""
Parse drawing index Excel files into structured document rows.

Reads the first sheet with recognizable Drawing/Document and Revision columns,
returns a list of {doc_no, desc, rev} dicts ready for the document index table.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional

import pandas as pd


def _normalize(value) -> str:
    """Strip and collapse whitespace."""
    if pd.isna(value):
        return ""
    return " ".join(str(value).strip().split())


def _find_column(columns: list, keywords: list[str]) -> Optional[str]:
    """Find the first column name containing any of the keywords (case-insensitive)."""
    for col in columns:
        col_lower = str(col).lower()
        for kw in keywords:
            if kw in col_lower:
                return col
    return None


def parse_drawing_index(xlsx_path: str) -> Dict:
    """
    Parse a drawing index Excel file.

    Returns:
        {
            "documents": [{doc_no, desc, rev}, ...],
            "sheet_name": str,
            "row_count": int,
            "warnings": [str, ...]
        }
    """
    xl = pd.ExcelFile(xlsx_path)
    warnings: List[str] = []

    for sheet in xl.sheet_names:
        df = xl.parse(sheet)
        if df.empty:
            continue

        cols = list(df.columns)

        # Find the document/drawing number column
        doc_col = _find_column(cols, ["drawing", "document", "doc no", "dwg"])

        # Find the description column
        desc_col = _find_column(cols, ["description", "title", "desc"])

        # Find the revision column
        rev_col = _find_column(cols, ["rev", "revision"])

        if not doc_col:
            # Try positional: first column is often the doc number
            if len(cols) >= 2:
                doc_col = cols[0]
                warnings.append(
                    f"No 'Drawing/Document' column header found in sheet '{sheet}'. "
                    f"Using first column '{doc_col}' as document number."
                )
            else:
                continue

        if not rev_col:
            warnings.append(f"No 'Revision' column found in sheet '{sheet}'. Revisions will be blank.")

        if not desc_col:
            # Try the column right after doc_col
            doc_idx = cols.index(doc_col) if doc_col in cols else -1
            if doc_idx >= 0 and doc_idx + 1 < len(cols) and cols[doc_idx + 1] != rev_col:
                desc_col = cols[doc_idx + 1]

        documents: List[Dict[str, str]] = []

        for _, row in df.iterrows():
            doc_val = _normalize(row.get(doc_col))
            if not doc_val:
                continue

            desc_val = _normalize(row.get(desc_col)) if desc_col else ""
            rev_val = _normalize(row.get(rev_col)) if rev_col else ""

            # Clean up revision values — sometimes they come as floats (0.0 → "0")
            if rev_val and re.match(r"^\d+\.0$", rev_val):
                rev_val = rev_val.split(".")[0]

            documents.append({
                "doc_no": doc_val,
                "desc": desc_val,
                "rev": rev_val,
            })

        if documents:
            return {
                "documents": documents,
                "sheet_name": sheet,
                "row_count": len(documents),
                "warnings": warnings,
            }

    raise ValueError(
        "Could not find usable drawing/document columns in any sheet. "
        "Expected column headers containing 'Drawing', 'Document', or 'Doc No'."
    )


def build_revision_map(xlsx_path: str) -> Dict[str, str]:
    """
    Build a normalized key → revision map from a drawing index Excel file.
    Keys are normalized to E{n}-{nnnn} format for matching against parsed filenames.
    """
    result = parse_drawing_index(xlsx_path)
    rev_map: Dict[str, str] = {}

    for doc in result["documents"]:
        doc_no = doc["doc_no"]
        rev = doc["rev"]
        if not rev:
            continue

        # Try to extract E-number pattern
        m = re.search(r"E\s*(\d+)\s*[-–—]?\s*(\d+)", doc_no, re.IGNORECASE)
        if m:
            key = f"E{int(m.group(1))}-{int(m.group(2)):04d}"
            rev_map[key] = rev

    return rev_map
