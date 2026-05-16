"""
Transmittal Builder — SQLite persistence layer.

Replaces the flat JSON project_registry.json with a proper database so the
app can track transmittal history per-project, power duplicate-drawing
detection, and store the address-book contact groups.

DB file: backend/data/transmittal_builder.db
"""

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from typing import Optional

_DB_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "data", "transmittal_builder.db"
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    path        TEXT UNIQUE NOT NULL,
    job_num     TEXT        DEFAULT '',
    client_site TEXT        DEFAULT '',
    next_xmtl   TEXT        DEFAULT '',
    last_opened TEXT        DEFAULT '',
    opened_by   TEXT        DEFAULT '',
    created_at  TEXT        DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transmittals (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id     INTEGER NOT NULL,
    xmtl_num       TEXT NOT NULL,
    folder_name    TEXT DEFAULT '',
    folder_path    TEXT DEFAULT '',
    date           TEXT DEFAULT '',
    sender_name    TEXT DEFAULT '',
    drawing_count  INTEGER DEFAULT 0,
    created_at     TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS transmittal_docs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    transmittal_id INTEGER NOT NULL,
    doc_no         TEXT DEFAULT '',
    description    TEXT DEFAULT '',
    rev            TEXT DEFAULT '',
    FOREIGN KEY (transmittal_id) REFERENCES transmittals(id)
);

CREATE TABLE IF NOT EXISTS contact_groups (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT UNIQUE NOT NULL,
    updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id   INTEGER,
    name       TEXT DEFAULT '',
    company    TEXT DEFAULT '',
    email      TEXT DEFAULT '',
    phone      TEXT DEFAULT '',
    FOREIGN KEY (group_id) REFERENCES contact_groups(id)
);
"""


@contextmanager
def _conn():
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ─── Initialisation ───────────────────────────────────────────

def init_db() -> None:
    with _conn() as conn:
        conn.executescript(_SCHEMA)


def migrate_from_registry(registry_path: str) -> int:
    """
    One-time import of project_registry.json into the projects table.
    Safe to call repeatedly — uses INSERT OR IGNORE so existing rows
    are not overwritten.
    Returns the number of rows inserted.
    """
    if not os.path.isfile(registry_path):
        return 0
    try:
        with open(registry_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        projects = data.get("projects", [])
    except (OSError, json.JSONDecodeError):
        return 0

    count = 0
    with _conn() as conn:
        for p in projects:
            path = p.get("path", "").strip()
            if not path:
                continue
            conn.execute(
                """
                INSERT OR IGNORE INTO projects
                    (path, job_num, client_site, next_xmtl, last_opened, opened_by)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    path,
                    p.get("job_num", ""),
                    p.get("client_site", ""),
                    p.get("next_xmtl_num", ""),
                    p.get("opened_at", ""),
                    p.get("opened_by", ""),
                ),
            )
            count += 1
    return count


# ─── Projects ─────────────────────────────────────────────────

def get_recent_projects(limit: int = 20) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT path, job_num, client_site, next_xmtl, last_opened, opened_by
            FROM   projects
            ORDER  BY last_opened DESC
            LIMIT  ?
            """,
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def touch_project(
    path: str,
    job_num: str,
    client_site: str,
    opened_by: str,
    next_xmtl_num: str = "",
) -> None:
    now = datetime.utcnow().isoformat()
    with _conn() as conn:
        conn.execute(
            """
            INSERT INTO projects
                (path, job_num, client_site, next_xmtl, last_opened, opened_by)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                job_num     = excluded.job_num,
                client_site = excluded.client_site,
                next_xmtl   = excluded.next_xmtl,
                last_opened = excluded.last_opened,
                opened_by   = excluded.opened_by
            """,
            (path, job_num, client_site, next_xmtl_num, now, opened_by),
        )


def remove_project(path: str) -> None:
    with _conn() as conn:
        conn.execute("DELETE FROM projects WHERE path = ?", (path,))


def get_project_id(path: str, conn=None) -> Optional[int]:
    def _query(c):
        row = c.execute(
            "SELECT id FROM projects WHERE path = ?", (path,)
        ).fetchone()
        return row["id"] if row else None

    if conn is not None:
        return _query(conn)
    with _conn() as c:
        return _query(c)


# ─── Transmittal log ──────────────────────────────────────────

def log_transmittal(
    project_path: str,
    xmtl_num: str,
    folder_name: str,
    folder_path: str,
    date: str,
    sender_name: str,
    documents: list[dict],
) -> int:
    """
    Record a completed transmittal and its drawing list.
    If the project isn't in the DB yet (edge case: render called before
    touch), a stub project row is created so the FK constraint holds.
    Returns the new transmittal id.
    """
    with _conn() as conn:
        # Ensure project exists
        project_id = get_project_id(project_path, conn)
        if project_id is None:
            conn.execute(
                "INSERT OR IGNORE INTO projects (path) VALUES (?)", (project_path,)
            )
            project_id = get_project_id(project_path, conn)

        cur = conn.execute(
            """
            INSERT INTO transmittals
                (project_id, xmtl_num, folder_name, folder_path, date,
                 sender_name, drawing_count)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project_id,
                xmtl_num,
                folder_name,
                folder_path,
                date,
                sender_name,
                len(documents),
            ),
        )
        transmittal_id = cur.lastrowid

        for doc in documents:
            conn.execute(
                """
                INSERT INTO transmittal_docs
                    (transmittal_id, doc_no, description, rev)
                VALUES (?, ?, ?, ?)
                """,
                (
                    transmittal_id,
                    doc.get("doc_no", ""),
                    doc.get("desc", ""),
                    doc.get("rev", ""),
                ),
            )

    return transmittal_id


def get_transmittal_history(project_path: str) -> list[dict]:
    """All transmittals for a project, newest first."""
    project_id = get_project_id(project_path)
    if project_id is None:
        return []
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT id, xmtl_num, folder_name, date, sender_name, drawing_count, created_at
            FROM   transmittals
            WHERE  project_id = ?
            ORDER  BY xmtl_num DESC
            """,
            (project_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def check_duplicate_drawings(project_path: str, doc_nos: list[str]) -> list[dict]:
    """
    For each doc_no in the list, return the most-recent transmittal it
    appeared in for this project (if any).

    Returns a list of dicts:
        { doc_no, prev_rev, xmtl_num, xmtl_date }

    Only doc_nos that were previously transmitted are included — clean
    doc_nos produce no entry.
    """
    if not doc_nos:
        return []
    project_id = get_project_id(project_path)
    if project_id is None:
        return []

    results: list[dict] = []
    with _conn() as conn:
        for doc_no in doc_nos:
            if not doc_no or not doc_no.strip():
                continue
            row = conn.execute(
                """
                SELECT td.doc_no, td.rev AS prev_rev,
                       t.xmtl_num, t.date AS xmtl_date
                FROM   transmittal_docs td
                JOIN   transmittals t ON td.transmittal_id = t.id
                WHERE  t.project_id = ?
                AND    LOWER(REPLACE(td.doc_no,' ','')) =
                       LOWER(REPLACE(?, ' ', ''))
                ORDER  BY t.xmtl_num DESC
                LIMIT  1
                """,
                (project_id, doc_no),
            ).fetchone()
            if row:
                results.append(dict(row))

    return results


# ─── Address-book contact groups ──────────────────────────────

def get_contact_groups() -> list[dict]:
    """All groups with their contacts, sorted by company name."""
    with _conn() as conn:
        groups = conn.execute(
            "SELECT id, company_name, updated_at FROM contact_groups ORDER BY company_name"
        ).fetchall()

        result = []
        for g in groups:
            contacts = conn.execute(
                """
                SELECT id, name, company, email, phone
                FROM   contacts
                WHERE  group_id = ?
                ORDER  BY name
                """,
                (g["id"],),
            ).fetchall()
            result.append(
                {
                    "id": g["id"],
                    "company_name": g["company_name"],
                    "updated_at": g["updated_at"],
                    "contacts": [dict(c) for c in contacts],
                }
            )
    return result


def save_contact_group(company_name: str, contacts: list[dict]) -> dict:
    """
    Upsert a contact group by company name.
    Replaces all existing contacts for that group.
    """
    now = datetime.utcnow().isoformat()
    with _conn() as conn:
        conn.execute(
            """
            INSERT INTO contact_groups (company_name, updated_at) VALUES (?, ?)
            ON CONFLICT(company_name) DO UPDATE SET updated_at = excluded.updated_at
            """,
            (company_name, now),
        )
        row = conn.execute(
            "SELECT id FROM contact_groups WHERE company_name = ?", (company_name,)
        ).fetchone()
        group_id = row["id"]

        conn.execute("DELETE FROM contacts WHERE group_id = ?", (group_id,))

        for c in contacts:
            if c.get("name") or c.get("email"):
                conn.execute(
                    """
                    INSERT INTO contacts (group_id, name, company, email, phone)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        group_id,
                        c.get("name", ""),
                        c.get("company", company_name),
                        c.get("email", ""),
                        c.get("phone", ""),
                    ),
                )

    return {"id": group_id, "company_name": company_name}


def delete_contact_group(group_id: int) -> None:
    with _conn() as conn:
        conn.execute("DELETE FROM contacts WHERE group_id = ?", (group_id,))
        conn.execute("DELETE FROM contact_groups WHERE id = ?", (group_id,))
