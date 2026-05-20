"""PDF security: AES-256 encryption + QR verification stamp.

- encrypt_pdf(pdf_bytes, password) -> bytes with AES-256 encrypted PDF
- add_verify_qr(pdf_bytes, verify_url) -> bytes with QR stamp on first page
- verify_token(token) / make_token(payload) -> signed hash for QR URL
"""
import io
import os
import hmac
import json
import time
import base64
import hashlib
import qrcode
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader

PDF_PASSWORD = os.environ.get("PDF_AES_PASSWORD", "vastgoed-kiosk-secret-pdf-aes-2026")
JWT_SECRET = os.environ.get("JWT_SECRET", "fallback")


def make_verify_token(payload: dict) -> str:
    """Create signed token: base64(payload_json).hex(hmac_sha256)"""
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(JWT_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()[:16]
    return f"{body}.{sig}"


def verify_token(token: str) -> dict | None:
    try:
        body, sig = token.rsplit(".", 1)
        expected = hmac.new(JWT_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()[:16]
        if not hmac.compare_digest(sig, expected):
            return None
        pad = "=" * (-len(body) % 4)
        return json.loads(base64.urlsafe_b64decode(body + pad))
    except Exception:
        return None


def _qr_image(text: str, size: int = 200) -> bytes:
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=2)
    qr.add_data(text)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    img = img.resize((size, size))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def add_verify_qr(pdf_bytes: bytes, verify_url: str, label: str = "Verifieer kwitantie") -> bytes:
    """Overlay a QR code in the bottom-right of every page."""
    src = PdfReader(io.BytesIO(pdf_bytes))
    writer = PdfWriter()

    # Build overlay page once
    overlay_buf = io.BytesIO()
    c = canvas.Canvas(overlay_buf, pagesize=A4)
    width, height = A4
    qr_size = 80
    margin = 25
    x = width - qr_size - margin
    y = margin
    qr_png = _qr_image(verify_url, size=qr_size * 3)
    c.drawImage(ImageReader(io.BytesIO(qr_png)), x, y, qr_size, qr_size, mask=None)
    c.setFont("Helvetica", 6)
    c.setFillGray(0.3)
    c.drawRightString(width - margin, y + qr_size + 4, label)
    c.drawRightString(width - margin, y - 6, "Scan voor verificatie")
    c.save()
    overlay_buf.seek(0)
    overlay = PdfReader(overlay_buf).pages[0]

    for page in src.pages:
        page.merge_page(overlay)
        writer.add_page(page)

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def encrypt_pdf(pdf_bytes: bytes, password: str = None) -> bytes:
    """Encrypt PDF with AES-256. user_password = owner_password = given password."""
    pw = password or PDF_PASSWORD
    reader = PdfReader(io.BytesIO(pdf_bytes))
    writer = PdfWriter(clone_from=reader)
    writer.encrypt(user_password=pw, owner_password=pw, algorithm="AES-256")
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def secure_pdf(pdf_bytes: bytes, verify_url: str, encrypted: bool = False, password: str = None) -> bytes:
    """Combine: add QR overlay, optionally encrypt with AES-256."""
    stamped = add_verify_qr(pdf_bytes, verify_url)
    if encrypted:
        return encrypt_pdf(stamped, password)
    return stamped
