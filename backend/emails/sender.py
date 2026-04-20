"""
SYNCED FROM desktop-toolkit v2.0.0 — DO NOT EDIT HERE.
Source of truth: https://github.com/chamber-19/desktop-toolkit (python/chamber19_desktop_toolkit/sender.py)
Remove this file and update imports to `from chamber19_desktop_toolkit.sender import ...`
once the framework Python package module paths are verified at v2.0.0.

SMTP email sender for transmittal delivery.
Ported from Suite's backend/Transmittal-Builder/emails/sender.py.
"""

from __future__ import annotations

import os
import mimetypes
import smtplib
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Iterable, Optional, Tuple


def send_email(
    subject: str,
    plain_text: str,
    html: str,
    *,
    sender: Optional[str] = None,
    to: str,
    cc: Optional[str] = None,
    smtp_host: str = "smtp.gmail.com",
    smtp_ssl: bool = True,
    smtp_port_ssl: int = 465,
    smtp_port_tls: int = 587,
    username: Optional[str] = None,
    password: Optional[str] = None,
    attachments: Optional[Iterable[Tuple[str, bytes]]] = None,
) -> Tuple[bool, str]:
    """
    Send an email with optional attachments.

    Args:
        subject: Email subject line
        plain_text: Plain text body
        html: HTML body
        sender: From address
        to: Recipient address(es), comma-separated
        cc: CC address(es), comma-separated
        smtp_host: SMTP server hostname
        smtp_ssl: Use SSL (port 465) vs STARTTLS (port 587)
        username: SMTP login username (defaults to sender)
        password: SMTP login password / app password
        attachments: Iterable of (filename, content_bytes) tuples

    Returns:
        (success: bool, message: str)
    """
    username = username or sender
    if not sender or not username or not password:
        return False, "Missing SMTP credentials (sender/password not provided)."

    msg = MIMEMultipart("mixed")
    msg["From"] = sender
    msg["To"] = to
    if cc:
        msg["Cc"] = cc
    msg["Subject"] = subject

    # Body
    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(plain_text, "plain", "utf-8"))
    alt.attach(MIMEText(html, "html", "utf-8"))
    msg.attach(alt)

    # Attachments
    if attachments:
        for name, content in attachments:
            maintype, subtype = (
                mimetypes.guess_type(name)[0] or "application/octet-stream"
            ).split("/", 1)
            part = MIMEBase(maintype, subtype)
            part.set_payload(content)
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", "attachment", filename=name)
            msg.attach(part)

    try:
        if smtp_ssl:
            with smtplib.SMTP_SSL(smtp_host, smtp_port_ssl) as s:
                s.login(username, password)
                s.send_message(msg)
        else:
            with smtplib.SMTP(smtp_host, smtp_port_tls) as s:
                s.starttls()
                s.login(username, password)
                s.send_message(msg)
        return True, "sent"
    except Exception as e:
        return False, f"SMTP error: {e}"
