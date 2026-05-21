"""SMTP email service.

Uses Python's built-in smtplib + email.message for portability. Each company
has its own SMTP config in `company_settings.smtp`. Secrets are decrypted only
at send time via settings_service.get_company_section().
"""
import asyncio
import smtplib
import ssl
import socket
from email.message import EmailMessage
from email.utils import formataddr


class EmailError(Exception):
    pass


def _build_message(cfg: dict, to: str, subject: str, body_html: str,
                   body_text: str | None = None,
                   attachments: list[tuple[str, bytes, str]] | None = None) -> EmailMessage:
    msg = EmailMessage()
    from_name = cfg.get("from_name") or "SuriRent"
    from_email = cfg.get("from_email") or cfg.get("username") or "no-reply@example.com"
    msg["From"] = formataddr((from_name, from_email))
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body_text or "Bekijk deze e-mail in een HTML-compatibele e-mailclient.")
    msg.add_alternative(body_html, subtype="html")
    for filename, content, content_type in attachments or []:
        maintype, _, subtype = content_type.partition("/")
        msg.add_attachment(content, maintype=maintype or "application", subtype=subtype or "octet-stream", filename=filename)
    return msg


def _send_sync(cfg: dict, msg: EmailMessage) -> None:
    """Synchronous SMTP send. Raises EmailError on failure."""
    host = (cfg.get("host") or "").strip()
    port = int(cfg.get("port") or 587)
    username = cfg.get("username") or ""
    password = cfg.get("password") or ""
    use_tls = bool(cfg.get("use_tls"))
    if not host:
        raise EmailError("SMTP host is niet geconfigureerd")
    try:
        if port == 465 or not use_tls:
            # Implicit SSL (port 465) or plain (rare).
            if port == 465:
                ctx = ssl.create_default_context()
                with smtplib.SMTP_SSL(host, port, timeout=15, context=ctx) as s:
                    if username:
                        s.login(username, password)
                    s.send_message(msg)
            else:
                with smtplib.SMTP(host, port, timeout=15) as s:
                    if username:
                        s.login(username, password)
                    s.send_message(msg)
        else:
            # STARTTLS path (port 587).
            with smtplib.SMTP(host, port, timeout=15) as s:
                s.ehlo()
                s.starttls(context=ssl.create_default_context())
                s.ehlo()
                if username:
                    s.login(username, password)
                s.send_message(msg)
    except (smtplib.SMTPException, socket.gaierror, socket.timeout, ConnectionError, OSError) as e:
        raise EmailError(f"SMTP fout: {e}") from e


async def send_email(cfg: dict, to: str, subject: str, body_html: str,
                     body_text: str | None = None,
                     attachments: list[tuple[str, bytes, str]] | None = None) -> None:
    """Non-blocking wrapper around smtplib (runs in threadpool)."""
    if not cfg.get("enabled"):
        raise EmailError("SMTP is niet ingeschakeld voor dit bedrijf")
    msg = _build_message(cfg, to, subject, body_html, body_text, attachments)
    await asyncio.to_thread(_send_sync, cfg, msg)


def get_platform_smtp_config() -> dict | None:
    """Read SuriRent's platform-wide SMTP from env vars (for transactional
    mails like the post-signup welcome email). Returns None when not configured."""
    import os
    host = (os.environ.get("PLATFORM_SMTP_HOST") or "").strip()
    if not host:
        return None
    return {
        "enabled": True,
        "host": host,
        "port": int(os.environ.get("PLATFORM_SMTP_PORT") or 587),
        "username": os.environ.get("PLATFORM_SMTP_USERNAME") or "",
        "password": os.environ.get("PLATFORM_SMTP_PASSWORD") or "",
        "use_tls": (os.environ.get("PLATFORM_SMTP_TLS") or "true").lower() != "false",
        "from_name": os.environ.get("PLATFORM_FROM_NAME") or "SuriRent",
        "from_email": os.environ.get("PLATFORM_FROM_EMAIL") or "no-reply@surirent.sr",
    }


async def send_platform_email(to: str, subject: str, body_html: str,
                              body_text: str | None = None) -> None:
    """Send a transactional email using SuriRent's platform SMTP.

    Silently no-ops when not configured (so registration still succeeds
    even if the operator hasn't filled in PLATFORM_SMTP_HOST yet).
    """
    cfg = get_platform_smtp_config()
    if not cfg:
        return
    msg = _build_message(cfg, to, subject, body_html, body_text)
    try:
        await asyncio.to_thread(_send_sync, cfg, msg)
    except EmailError:
        # Welcome email is best-effort: registration must not fail.
        return


# ============== Branded HTML helpers ==============
def wrap_template(content_html: str, footer: str = "") -> str:
    """Wrap a snippet in a SuriRent-styled HTML email shell."""
    return f"""<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8" />
<title>SuriRent</title>
<style>
  body {{ margin: 0; padding: 0; background: #FFF7F0; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #0f172a; }}
  .container {{ max-width: 560px; margin: 0 auto; padding: 24px 16px; }}
  .card {{ background: #fff; border: 1px solid #FFD7B8; border-radius: 18px; padding: 28px; }}
  .brand {{ background: linear-gradient(135deg, #FF8A3D, #C74600); color: #fff; border-radius: 14px; padding: 14px 18px; font-weight: 800; letter-spacing: 0.5px; display: inline-block; }}
  h1 {{ font-size: 22px; margin: 18px 0 4px; }}
  p {{ line-height: 1.55; font-size: 14px; color: #334155; }}
  .footer {{ text-align: center; color: #94a3b8; font-size: 11px; margin-top: 18px; line-height: 1.5; }}
  table.kv {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
  table.kv td {{ padding: 6px 0; border-bottom: 1px dashed #e2e8f0; font-size: 13px; }}
  table.kv td:first-child {{ color: #64748b; }}
  table.kv td:last-child {{ font-weight: 700; text-align: right; }}
</style></head>
<body><div class="container">
  <div class="card">
    <div class="brand">SuriRent</div>
    {content_html}
  </div>
  <div class="footer">{footer or "Deze e-mail is automatisch verzonden door SuriRent Vastgoed."}</div>
</div></body></html>"""
