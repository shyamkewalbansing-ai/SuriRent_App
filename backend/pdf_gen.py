"""PDF generation helpers using ReportLab.

Brand-styled met grijze pagina-achtergrond, prominente titel, twee-koloms
detail-blokken, groot bedrag-blok en geverifieerde footer met SHA-256 hash —
gebaseerd op de SuriRent voorbeeld-kwitantie (KW2026-00019). Alle PDFs
(kwitantie, factuur, contract, borg-restitutie, loonstrook) gebruiken
dezelfde visuele taal.
"""
import io
import hashlib
import base64
from datetime import datetime
from reportlab.lib.pagesizes import A4, A6
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image,
)

# Palet — bewust beperkt: zwarte tekst + lichte grijze achtergrond.
ORANGE = colors.HexColor("#FF5C00")           # Behouden voor accenten/sticky knoppen
DARK = colors.HexColor("#1a1a1a")
MUTED = colors.HexColor("#6b7280")
LIGHT = colors.HexColor("#f5f5f5")
PAGE_BG = colors.HexColor("#F8F8F8")           # Lichte grijze pagina-achtergrond
HAIRLINE = colors.HexColor("#E5E5E5")
SUCCESS = colors.HexColor("#16a34a")           # "VOLDAAN" status groen

MONTHS_NL = ["januari", "februari", "maart", "april", "mei", "juni",
             "juli", "augustus", "september", "oktober", "november", "december"]


def _styles():
    base = getSampleStyleSheet()
    base.add(ParagraphStyle(
        name="BrandName", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=10, textColor=DARK,
        leading=12, spaceAfter=2,
    ))
    base.add(ParagraphStyle(
        name="BrandContact", parent=base["Normal"],
        fontName="Helvetica", fontSize=7.5, textColor=MUTED,
        leading=9, spaceAfter=1,
    ))
    base.add(ParagraphStyle(
        name="DocTitle", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=26, textColor=DARK,
        leading=30, alignment=1, spaceBefore=4, spaceAfter=2,
    ))
    base.add(ParagraphStyle(
        name="DocNumber", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=10, textColor=MUTED,
        leading=12, alignment=1, spaceAfter=18,
    ))
    base.add(ParagraphStyle(
        name="SectionHead", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=9, textColor=DARK,
        leading=12, spaceAfter=4,
    ))
    base.add(ParagraphStyle(
        name="KVLabel", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=9, textColor=DARK,
        leading=12, spaceAfter=0,
    ))
    base.add(ParagraphStyle(
        name="KVValue", parent=base["Normal"],
        fontName="Helvetica", fontSize=9, textColor=DARK,
        leading=12, spaceAfter=0,
    ))
    base.add(ParagraphStyle(
        name="AmountLabel", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=10, textColor=DARK,
    ))
    base.add(ParagraphStyle(
        name="AmountValue", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=18, textColor=DARK,
        alignment=2,  # right
    ))
    base.add(ParagraphStyle(
        name="StatusValue", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=12, textColor=SUCCESS,
        alignment=2,
    ))
    base.add(ParagraphStyle(
        name="StatusOpen", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=12, textColor=ORANGE,
        alignment=2,
    ))
    base.add(ParagraphStyle(
        name="ApprovalLabel", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=8.5, textColor=MUTED,
        leading=11, spaceAfter=2,
    ))
    base.add(ParagraphStyle(
        name="ApprovalValue", parent=base["Normal"],
        fontName="Helvetica", fontSize=10, textColor=DARK,
        leading=13, spaceAfter=0,
    ))
    base.add(ParagraphStyle(
        name="Footer", parent=base["Normal"],
        fontName="Helvetica", fontSize=7, textColor=MUTED,
        leading=9, alignment=1,
    ))
    base.add(ParagraphStyle(
        name="FooterVerify", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=7.5, textColor=SUCCESS,
        leading=10, alignment=1,
    ))
    base.add(ParagraphStyle(
        name="FooterHash", parent=base["Normal"],
        fontName="Helvetica", fontSize=6.5, textColor=MUTED,
        leading=8, alignment=1,
    ))
    base.add(ParagraphStyle(
        name="Body", parent=base["Normal"], fontSize=10, leading=14,
    ))
    base.add(ParagraphStyle(
        name="Small", parent=base["Normal"], fontSize=8, textColor=MUTED,
    ))
    base.add(ParagraphStyle(
        name="Sub", parent=base["Normal"],
        fontSize=9, textColor=MUTED, spaceAfter=12,
    ))
    base.add(ParagraphStyle(
        name="H1Orange", parent=base["Heading1"],
        fontSize=22, textColor=DARK, spaceAfter=4, leading=26,
    ))
    return base


def _doc_hash(doc_number: str, *parts) -> str:
    """SHA-256 over receipt/factuur/contract nummer + extra payload — getoond
    in de footer als bewijs van authenticiteit. Niet kritisch beveiligd
    (printbare PDF is geen tamper-proof) maar wel een sterke visuele indicator."""
    raw = " | ".join([str(doc_number or "")] + [str(p or "") for p in parts])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest().upper()


def _fmt_money(amount: float, currency: str = "SRD") -> str:
    """Format `3000.0` → `SRD 3,000.00` (Engelse notatie zoals in voorbeeld)."""
    try:
        return f"{currency} {float(amount):,.2f}"
    except Exception:
        return f"{currency} {amount}"


def _fmt_date_nl(iso_str: str) -> str:
    """`2026-05-13T...` → `13 mei 2026`."""
    if not iso_str:
        return ""
    try:
        dt = datetime.fromisoformat(str(iso_str).replace("Z", "+00:00"))
        return f"{dt.day} {MONTHS_NL[dt.month - 1]} {dt.year}"
    except Exception:
        return str(iso_str)[:10]


def _bg_canvas(canvas, doc):
    """Tekent de lichte grijze pagina-achtergrond — wordt aangeroepen door
    SimpleDocTemplate voor elke pagina via onFirstPage/onLaterPages."""
    canvas.saveState()
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, doc.pagesize[0], doc.pagesize[1], fill=1, stroke=0)
    canvas.restoreState()


def _brand_header(el, payment_or_doc: dict):
    """Linksboven: bedrijfsnaam (bold) + adres + contact (tel/wa/email).
    Optioneel: bedrijfslogo links naast de naam.

    `payment_or_doc` mag een enriched dict zijn met company_name /
    company_address / company_phone / company_email / company_logo_bytes velden.
    """
    s = _styles()
    name = payment_or_doc.get("company_name") or "SuriRent N.V."
    address = payment_or_doc.get("company_address") or ""
    phone = payment_or_doc.get("company_phone") or ""
    email = payment_or_doc.get("company_email") or ""
    parts = []
    if phone:
        parts.append(f"Tel: {phone}")
        parts.append(f"WhatsApp: {phone}")
    if email:
        parts.append(email)
    contact = " | ".join(parts) if parts else ""

    # Tekstblok
    text_parts = [Paragraph(name.upper(), s["BrandName"])]
    if address:
        text_parts.append(Paragraph(address, s["BrandContact"]))
    if contact:
        text_parts.append(Paragraph(contact, s["BrandContact"]))

    # Logo links indien beschikbaar (gerenderd op max 22mm × 22mm)
    logo_bytes = payment_or_doc.get("company_logo_bytes")
    if logo_bytes:
        try:
            from reportlab.lib.utils import ImageReader
            reader = ImageReader(io.BytesIO(logo_bytes))
            iw, ih = reader.getSize()
            max_h = 22 * mm
            max_w = 28 * mm
            # Schaal om binnen max_w x max_h te passen.
            scale = min(max_w / iw, max_h / ih)
            w = iw * scale
            h = ih * scale
            logo = Image(io.BytesIO(logo_bytes), width=w, height=h)
            t = Table([[logo, text_parts]], colWidths=[max_w + 4 * mm, 170 * mm - max_w - 4 * mm])
            t.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]))
            el.append(t)
            el.append(Spacer(1, 14))
            return
        except Exception:
            pass  # fallback naar text-only header

    for p in text_parts:
        el.append(p)
    el.append(Spacer(1, 14))


def _brand_title(el, title: str, doc_number: str = ""):
    """Grote gecentreerde titel + kleinere documentnummer eronder."""
    s = _styles()
    el.append(Paragraph(title.upper(), s["DocTitle"]))
    if doc_number:
        el.append(Paragraph(doc_number, s["DocNumber"]))
    else:
        el.append(Spacer(1, 14))


def _two_col_block(el, rows: list, label_col_mm: float = 50, gap_after: int = 14):
    """Twee-koloms blok: label links (bold), value rechts.
    `rows` is een lijst van `(label, value)` tuples. Lege values worden geskipped."""
    s = _styles()
    data = []
    for k, v in rows:
        if v in (None, "", "—"):
            continue
        data.append([
            Paragraph(str(k).upper(), s["KVLabel"]),
            Paragraph(str(v), s["KVValue"]),
        ])
    if not data:
        return
    total_w = 170 * mm
    t = Table(data, colWidths=[label_col_mm * mm, total_w - label_col_mm * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, HAIRLINE),
    ]))
    el.append(t)
    el.append(Spacer(1, gap_after))


def _amount_block(el, label: str, amount: float, currency: str = "SRD"):
    """Groot bedrag-blok: label links, bedrag groot rechts."""
    s = _styles()
    data = [[
        Paragraph(label.upper(), s["AmountLabel"]),
        Paragraph(_fmt_money(amount, currency), s["AmountValue"]),
    ]]
    t = Table(data, colWidths=[100 * mm, 70 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.5, HAIRLINE),
    ]))
    el.append(t)
    el.append(Spacer(1, 10))


def _status_row(el, label: str, value: str, is_paid: bool = False):
    """Status-rij: label links, status rechts (groen=VOLDAAN, oranje=OPEN)."""
    s = _styles()
    data = [[
        Paragraph(label.upper(), s["KVLabel"]),
        Paragraph(value.upper(), s["StatusValue"] if is_paid else s["StatusOpen"]),
    ]]
    t = Table(data, colWidths=[100 * mm, 70 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, HAIRLINE),
    ]))
    el.append(t)


def _signature_block(el, received_by: str = "", approved_by: str = "",
                     company_name: str = "", signature_data: str = ""):
    """Twee-koloms signature blok onderaan vóór de footer.

    Links: 'ONTVANGEN DOOR' + naam (+ rol indien aanwezig)
    Rechts: 'GOEDGEKEURD DOOR {bedrijf}' + (optioneel) ingesloten signature image
    """
    s = _styles()
    el.append(Spacer(1, 18))
    left_parts = []
    left_parts.append(Paragraph("ONTVANGEN DOOR", s["ApprovalLabel"]))
    left_parts.append(Paragraph(received_by or "—", s["ApprovalValue"]))
    # Signature placeholder (links): handtekeningvak
    left_parts.append(Spacer(1, 14))
    left_parts.append(Paragraph("_" * 28, s["ApprovalValue"]))
    left_parts.append(Paragraph("Handtekening huurder", s["Small"]))

    right_parts = []
    label = f"GOEDGEKEURD DOOR {company_name.upper()}" if company_name else "GOEDGEKEURD DOOR"
    right_parts.append(Paragraph(label, s["ApprovalLabel"]))
    if approved_by:
        right_parts.append(Paragraph(approved_by, s["ApprovalValue"]))
    # Probeer een ingesloten signature image te renderen (base64 data URL).
    sig_img = None
    if signature_data and isinstance(signature_data, str):
        try:
            raw = signature_data.split(",", 1)[1] if "," in signature_data else signature_data
            img_bytes = base64.b64decode(raw)
            sig_img = Image(io.BytesIO(img_bytes), width=60 * mm, height=20 * mm)
        except Exception:
            sig_img = None
    if sig_img:
        right_parts.append(Spacer(1, 4))
        right_parts.append(sig_img)
    else:
        right_parts.append(Spacer(1, 14))
        right_parts.append(Paragraph("_" * 28, s["ApprovalValue"]))
    right_parts.append(Paragraph("Handtekening / Stempel", s["Small"]))

    data = [[left_parts, right_parts]]
    t = Table(data, colWidths=[85 * mm, 85 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    el.append(t)


def _verification_footer(el, doc_number: str, company_name: str = "",
                         company_address: str = "", *hash_payload):
    """Bottom verification line + SHA-256 + bedrijfs-regel."""
    s = _styles()
    el.append(Spacer(1, 24))
    el.append(Paragraph("✓ GEVERIFIEERD ORIGINEEL · AUTHENTIEK DOCUMENT", s["FooterVerify"]))
    h = _doc_hash(doc_number, *hash_payload)
    short_hash = f"{h[:16]} … {h[-4:]}"
    el.append(Paragraph(f"Document-hash (SHA-256): {short_hash}", s["FooterHash"]))
    parts = [p for p in [company_name, company_address, doc_number] if p]
    el.append(Paragraph(" · ".join(parts), s["FooterHash"]))


# ============== Legacy header (oranje balk) — behouden voor speciale PDFs ==============
def _header(elements, styles, title, subtitle="", company="SuriRent N.V."):
    elements.append(Paragraph(f"<b>{company}</b>", styles["Body"]))
    elements.append(Paragraph(title, styles["H1Orange"]))
    if subtitle:
        elements.append(Paragraph(subtitle, styles["Sub"]))
    line = Table([[""]], colWidths=[170 * mm], rowHeights=[2])
    line.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ORANGE)]))
    elements.append(line)
    elements.append(Spacer(1, 10))


def _kv_table(rows):
    data = []
    for k, v in rows:
        data.append([Paragraph(f"<b>{k}</b>", _styles()["Body"]), Paragraph(str(v or "—"), _styles()["Body"])])
    t = Table(data, colWidths=[55 * mm, 115 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, LIGHT]),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def _build(doc_elements, *, with_bg: bool = True):
    """Bouwt A4 PDF met optionele grijze pagina-achtergrond."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=20 * mm, bottomMargin=20 * mm)
    if with_bg:
        doc.build(doc_elements, onFirstPage=_bg_canvas, onLaterPages=_bg_canvas)
    else:
        doc.build(doc_elements)
    buf.seek(0)
    return buf.getvalue()


def _build_a6(doc_elements):
    """A6 (105 x 148mm) print — ideaal voor stickers naast de voordeur."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A6,
        leftMargin=6 * mm, rightMargin=6 * mm,
        topMargin=6 * mm, bottomMargin=6 * mm)
    doc.build(doc_elements)
    buf.seek(0)
    return buf.getvalue()


# ============== Receipt PDF (KWITANTIE-look) ==============
def receipt_pdf(payment: dict) -> bytes:
    """Genereert de gestilte SuriRent kwitantie met grijze achtergrond,
    centrale titel, two-col details, groot bedrag, status + signature blok,
    en geverifieerde footer met SHA-256 hash."""
    el = []
    _brand_header(el, payment)
    _brand_title(el, "Kwitantie", payment.get("receipt_number", ""))

    period = ""
    if payment.get("period_month") and payment.get("period_year"):
        period = f"{MONTHS_NL[payment['period_month'] - 1]} {payment['period_year']}"

    rows = [
        ("Datum", _fmt_date_nl(payment.get("paid_at"))),
        ("Huurder", payment.get("tenant_name", "")),
        ("Appartement", payment.get("apartment_number") or "—"),
        ("Type betaling", (payment.get("category") or "").capitalize() or "Huurbetaling"),
    ]
    if period:
        rows.append(("Betaling voor", period))
    rows.append(("Betalingswijze", (payment.get("method") or "").capitalize() or "Contant"))
    _two_col_block(el, rows, label_col_mm=48, gap_after=14)

    # Ontvangen bedrag — groot blok
    amount = float(payment.get("amount") or 0)
    currency = payment.get("currency") or "SRD"
    _amount_block(el, "Ontvangen bedrag", amount, currency)
    el.append(Spacer(1, 6))

    # Status — VOLDAAN of openstaand bedrag
    outstanding_after = float(payment.get("outstanding_after") or 0)
    if outstanding_after <= 0.01:
        _status_row(el, "Openstaand na betaling", "VOLDAAN", is_paid=True)
        _status_row(el, "Totaal openstaand", "VOLDAAN", is_paid=True)
    else:
        _status_row(el, "Openstaand na betaling", _fmt_money(outstanding_after, currency), is_paid=False)
        _status_row(el, "Totaal openstaand", _fmt_money(outstanding_after, currency), is_paid=False)

    # Notitie (optioneel — niet in alle kwitanties)
    if payment.get("note"):
        s = _styles()
        el.append(Spacer(1, 10))
        el.append(Paragraph(f"<b>Notitie:</b> {payment['note']}", s["Body"]))

    # Signature blok
    received = payment.get("received_by") or ""
    if received and payment.get("kiosk_employee_name"):
        received = f"{payment['kiosk_employee_name']}  ·  KIOSK MEDEWERKER"
    approved = payment.get("approved_by") or payment.get("company_name") or ""
    _signature_block(
        el,
        received_by=received or payment.get("tenant_name") or "",
        approved_by=approved,
        company_name=payment.get("company_name") or "",
        signature_data=payment.get("signature_data") or "",
    )

    # Geverifieerde footer
    _verification_footer(
        el,
        payment.get("receipt_number", ""),
        payment.get("company_name") or "",
        payment.get("company_address") or "",
        amount, currency, payment.get("tenant_id", ""),
    )
    return _build(el)


# ============== Contract PDF ==============
def contract_pdf(contract: dict, tenant: dict, apartment: dict) -> bytes:
    s = _styles()
    el = []
    # Bedrijfs-info aanwezig op contract dict (geinjecteerd door server.py)
    _brand_header(el, contract)
    _brand_title(el, "Huurovereenkomst", contract.get("contract_number", ""))

    # Partijen
    _two_col_block(el, [
        ("Verhuurder", contract.get("landlord") or contract.get("company_name") or ""),
        ("Huurder", tenant.get("name", "")),
        ("Telefoon", tenant.get("phone", "")),
        ("E-mail", tenant.get("email", "")),
    ], gap_after=10)

    # Object
    _two_col_block(el, [
        ("Appartement", apartment.get("number", "")),
        ("Adres", apartment.get("address", "")),
        ("Beschrijving", apartment.get("description") or "—"),
    ], gap_after=10)

    # Voorwaarden
    cur = apartment.get("currency", "SRD")
    _two_col_block(el, [
        ("Maandhuur", _fmt_money(apartment.get("rent_amount", 0), cur)),
        ("Borg", _fmt_money(contract.get("deposit_amount", 0), cur)),
        ("Startdatum", contract.get("start_date", "")),
        ("Einddatum", contract.get("end_date") or "Onbepaalde tijd"),
        ("Betaaldag", f"{contract.get('payment_day', 1)}e van de maand"),
    ], gap_after=14)

    # Algemene bepalingen
    el.append(Paragraph("ALGEMENE BEPALINGEN", s["SectionHead"]))
    el.append(Paragraph(
        contract.get("terms",
            "1. Huurder verklaart het gehuurde in goede staat te ontvangen.<br/>"
            "2. Huurder betaalt de maandhuur uiterlijk op de overeengekomen betaaldag.<br/>"
            "3. Verhuurder verzorgt het noodzakelijk onderhoud aan het pand.<br/>"
            "4. Schade door huurder of derden komt voor rekening van huurder.<br/>"
            "5. Bij opzegging geldt een termijn van één maand."
        ),
        s["Body"]
    ))

    # Signature
    signed = contract.get("signed_at")
    received = ""
    if signed:
        try:
            dt = datetime.fromisoformat(signed.replace("Z", "+00:00"))
            received = f"{contract.get('signed_by', tenant.get('name', ''))} · {dt.strftime('%d-%m-%Y %H:%M')}"
        except Exception:
            received = contract.get("signed_by", tenant.get("name", ""))
    else:
        received = tenant.get("name", "")
    _signature_block(
        el,
        received_by=received,
        approved_by=contract.get("company_name") or "",
        company_name=contract.get("company_name") or "",
        signature_data=contract.get("signature_data") or "",
    )

    _verification_footer(
        el,
        contract.get("contract_number", ""),
        contract.get("company_name") or "",
        contract.get("company_address") or "",
        tenant.get("id", ""), apartment.get("id", ""),
    )
    return _build(el)


# ============== Invoice PDF ==============
def invoice_pdf(invoice: dict, tenant: dict, apartment: dict, payments: list) -> bytes:
    s = _styles()
    el = []
    _brand_header(el, invoice)
    _brand_title(el, "Factuur", invoice.get("invoice_number", ""))

    cur = apartment.get("currency", invoice.get("currency", "SRD"))
    period = ""
    if invoice.get("period_month") and invoice.get("period_year"):
        period = f"{MONTHS_NL[invoice['period_month'] - 1]} {invoice['period_year']}"

    _two_col_block(el, [
        ("Factuurdatum", _fmt_date_nl(invoice.get("created_at"))),
        ("Huurder", tenant.get("name", "")),
        ("Appartement", apartment.get("number", "")),
        ("Periode", period),
    ], gap_after=14)

    # Specificatie — eenvoudige twee-koloms zonder oranje header
    el.append(Paragraph("SPECIFICATIE", s["SectionHead"]))
    el.append(Spacer(1, 4))
    spec_data = [[
        Paragraph(f"Maandhuur appartement {apartment.get('number', '')}", s["Body"]),
        Paragraph(_fmt_money(invoice.get("amount", 0), cur), s["AmountValue"]),
    ]]
    t = Table(spec_data, colWidths=[120 * mm, 50 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, HAIRLINE),
    ]))
    el.append(t)
    el.append(Spacer(1, 14))

    # Totalen
    total = float(invoice.get("amount", 0) or 0)
    paid = sum(float(p.get("amount", 0) or 0) for p in (payments or []))
    due = max(total - paid, 0)
    _amount_block(el, "Totaal", total, cur)
    el.append(Spacer(1, 4))
    if paid > 0:
        _status_row(el, "Reeds betaald", _fmt_money(paid, cur), is_paid=True)
    if due > 0.01:
        _status_row(el, "Nog te betalen", _fmt_money(due, cur), is_paid=False)
    else:
        _status_row(el, "Status", "VOLDAAN", is_paid=True)

    el.append(Spacer(1, 16))
    el.append(Paragraph(
        "Gelieve dit bedrag binnen 14 dagen te voldoen via de kiosk of bankoverschrijving.",
        s["Small"]
    ))

    _verification_footer(
        el,
        invoice.get("invoice_number", ""),
        invoice.get("company_name") or "",
        invoice.get("company_address") or "",
        total, cur, tenant.get("id", ""),
    )
    return _build(el)


# ============== Deposit refund PDF ==============
def deposit_refund_pdf(deposit: dict, tenant: dict, apartment: dict) -> bytes:
    el = []
    _brand_header(el, deposit)
    nr = (deposit.get("id") or "")[:8].upper()
    _brand_title(el, "Borg restitutie", nr)

    cur = deposit.get("currency", "SRD")
    _two_col_block(el, [
        ("Huurder", tenant.get("name", "")),
        ("Appartement", apartment.get("number") or "—"),
        ("Borg ontvangen", _fmt_date_nl(deposit.get("created_at"))),
        ("Borg restitutie", _fmt_date_nl(deposit.get("refunded_at"))),
    ], gap_after=14)

    _amount_block(el, "Borgbedrag", deposit.get("amount", 0), cur)
    if float(deposit.get("deduction", 0) or 0) > 0:
        _status_row(el, "Aftrek", _fmt_money(deposit.get("deduction", 0), cur), is_paid=False)
    _amount_block(el, "Terugbetaald", deposit.get("refund_amount", 0), cur)

    if deposit.get("refund_note"):
        s = _styles()
        el.append(Spacer(1, 12))
        el.append(Paragraph("TOELICHTING AFTREK", s["SectionHead"]))
        el.append(Paragraph(deposit["refund_note"], s["Body"]))

    _signature_block(
        el,
        received_by=tenant.get("name", ""),
        approved_by=deposit.get("company_name") or "",
        company_name=deposit.get("company_name") or "",
        signature_data=deposit.get("signature_data") or "",
    )
    _verification_footer(
        el, f"BORG-{nr}",
        deposit.get("company_name") or "",
        deposit.get("company_address") or "",
        deposit.get("refund_amount", 0), cur, tenant.get("id", ""),
    )
    return _build(el)


# ============== Payslip PDF ==============
def payslip_pdf(salary: dict, employee: dict) -> bytes:
    s = _styles()
    el = []
    _brand_header(el, salary)
    period_label = ""
    if salary.get("period_month") and salary.get("period_year"):
        period_label = f"{MONTHS_NL[salary['period_month'] - 1]} {salary['period_year']}"
    nr = f"LS-{salary.get('id','')[:8].upper()}" if salary.get("id") else "LS"
    _brand_title(el, "Loonstrook", nr)

    cur = salary.get("currency", "SRD")
    _two_col_block(el, [
        ("Werknemer", employee.get("name", "")),
        ("Functie", employee.get("role") or "—"),
        ("Periode", period_label),
        ("Uitbetaald op", _fmt_date_nl(salary.get("paid_at"))),
    ], gap_after=14)

    el.append(Paragraph("LOONSPECIFICATIE", s["SectionHead"]))
    el.append(Spacer(1, 4))
    rows = []
    if salary.get("gross") is not None:
        rows.append(("Bruto salaris", _fmt_money(salary.get("gross", 0), cur)))
    if float(salary.get("advance", 0) or 0) > 0:
        rows.append(("Voorschotten", "- " + _fmt_money(salary.get("advance", 0), cur)))
    if float(salary.get("deductions", 0) or 0) > 0:
        rows.append(("Inhoudingen", "- " + _fmt_money(salary.get("deductions", 0), cur)))
    _two_col_block(el, rows, label_col_mm=80, gap_after=6)

    _amount_block(el, "Netto uitbetaald", salary.get("net", 0), cur)

    if salary.get("note"):
        el.append(Spacer(1, 10))
        el.append(Paragraph(f"<b>Notitie:</b> {salary['note']}", s["Body"]))

    _signature_block(
        el,
        received_by=employee.get("name", ""),
        approved_by=salary.get("company_name") or "",
        company_name=salary.get("company_name") or "",
        signature_data=salary.get("signature_data") or "",
    )
    _verification_footer(
        el, nr,
        salary.get("company_name") or "",
        salary.get("company_address") or "",
        salary.get("net", 0), cur, employee.get("id", ""),
    )
    return _build(el)



def _make_qr_png(url: str, size_px: int = 360) -> bytes:
    """Generate a QR-code PNG for the given URL. Returns raw PNG bytes."""
    import qrcode
    qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M,
                       box_size=10, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#1a1a1a", back_color="white")
    img = img.resize((size_px, size_px))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def onboarding_pdf(*, company_name: str, contact_name: str, email: str,
                   plan_name: str, plan_price_text: str,
                   login_url: str, subdomain_url: str | None,
                   kiosk_pin: str | None,
                   primary_hex: str = "#FF5C00") -> bytes:
    """Premium onboarding PDF — login info + QR code + iOS/Android install steps.
    Sent as attachment to the welcome email."""
    from reportlab.platypus import Image as RLImage
    s = _styles()
    accent = colors.HexColor(primary_hex) if primary_hex.startswith("#") else ORANGE
    elements = []

    # Title
    elements.append(Paragraph(
        f'<font color="{accent.hexval()}">Welkom bij SuriRent!</font>', s["H1Orange"]
    ))
    elements.append(Paragraph(
        f"Uw eigen Vastgoed-omgeving voor <b>{company_name}</b> is klaar.",
        s["Sub"],
    ))
    elements.append(Spacer(1, 8))

    # Two-column layout: QR (left) + Login info (right)
    qr_png = _make_qr_png(login_url, size_px=360)
    qr_img = RLImage(io.BytesIO(qr_png), width=55 * mm, height=55 * mm)

    info_rows = [
        ["Bedrijf", company_name],
        ["Contactpersoon", contact_name],
        ["E-mailadres", email],
        ["Wachtwoord", "(zoals opgegeven bij registratie)"],
    ]
    if kiosk_pin:
        info_rows.append(["Kiosk PIN", kiosk_pin])
    info_rows.append(["Pakket", plan_name])
    info_rows.append(["Prijs", plan_price_text])
    info_rows.append(["Proefperiode", "14 dagen gratis"])

    info_table = Table(info_rows, colWidths=[35 * mm, 75 * mm])
    info_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("TEXTCOLOR", (1, 0), (1, -1), DARK),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LIGHT),
    ]))

    qr_caption = Paragraph(
        '<para align="center"><font size="8" color="#6b7280">Scan om direct in te loggen</font></para>',
        s["Body"],
    )
    qr_block = Table([[qr_img], [qr_caption]], colWidths=[60 * mm])
    qr_block.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, LIGHT),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))

    top = Table([[qr_block, info_table]], colWidths=[65 * mm, 115 * mm])
    top.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(top)

    elements.append(Spacer(1, 14))
    elements.append(Paragraph("UW LOGIN LINK", s["SectionHead"]))
    elements.append(Paragraph(
        f'<font color="{accent.hexval()}"><b><link href="{login_url}">{login_url}</link></b></font>',
        ParagraphStyle("Link", parent=s["Body"], fontSize=10, leading=13, wordWrap="CJK"),
    ))
    if subdomain_url:
        elements.append(Spacer(1, 4))
        elements.append(Paragraph(
            f'<font color="#6b7280" size="9">Zodra wildcard DNS actief is, kunt u ook gebruik maken van uw eigen subdomein:<br/><b>{subdomain_url}</b></font>',
            s["Body"],
        ))

    elements.append(Spacer(1, 14))

    # Install instructions: two columns (iOS / Android)
    elements.append(Paragraph("INSTALLEER ALS APP OP UW TELEFOON", s["SectionHead"]))
    elements.append(Paragraph(
        "Voor een ware app-ervaring (eigen icoon, fullscreen) installeer SuriRent als PWA:",
        s["Body"],
    ))
    elements.append(Spacer(1, 6))

    ios_steps = [
        ["1.", "Open de link op uw iPhone of iPad <b>via Safari</b>"],
        ["2.", "Tik op het <b>Delen</b>-icoon (vierkant met pijl omhoog)"],
        ["3.", "Scroll en kies <b>'Zet op beginscherm'</b>"],
        ["4.", "Bevestig met <b>Voeg toe</b> — klaar!"],
    ]
    android_steps = [
        ["1.", "Open de link in <b>Chrome</b> of <b>Edge</b>"],
        ["2.", "Tik op de prompt <b>'Installeren'</b> onderaan"],
        ["3.", "Of via het menu: <b>'App installeren'</b>"],
        ["4.", "SuriRent verschijnt op uw startscherm — klaar!"],
    ]

    def _steps_table(title: str, rows):
        body = [[Paragraph(f'<b><font color="{accent.hexval()}">{title}</font></b>', s["Body"])]]
        body += [[Paragraph(f'<b>{n}</b> {t}', s["Body"])] for n, t in rows]
        tbl = Table(body, colWidths=[85 * mm])
        tbl.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
            ("BOX", (0, 0), (-1, -1), 0.4, LIGHT),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, LIGHT),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ]))
        return tbl

    install_row = Table([[
        _steps_table("iOS — iPhone / iPad", ios_steps),
        _steps_table("Android — Chrome / Edge", android_steps),
    ]], colWidths=[90 * mm, 90 * mm])
    install_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(install_row)

    elements.append(Spacer(1, 14))
    elements.append(Paragraph("HULP NODIG?", s["SectionHead"]))
    elements.append(Paragraph(
        "Heeft u vragen of loopt u ergens vast? Beantwoord de welkomst-mail "
        "of stuur een bericht via WhatsApp. Wij helpen graag persoonlijk.",
        s["Body"],
    ))

    return _build(elements)



# ============== Kiosk sticker PDF ==============
def kiosk_sticker_pdf(*, apartment_number: str, address: str,
                     tenant_name: str | None, company_name: str,
                     kiosk_url: str, primary_hex: str = "#FF5C00") -> bytes:
    """A4 printable poster met grote QR-code voor naast de voordeur.
    Scant naar de Huurder Kiosk met apartment_id voorgevuld."""
    from reportlab.platypus import Image as RLImage
    s = _styles()
    accent = colors.HexColor(primary_hex) if str(primary_hex).startswith("#") else ORANGE

    elements = []
    elements.append(Spacer(1, 8 * mm))
    elements.append(Paragraph(
        f'<font color="{accent.hexval()}"><b>HUURDER KIOSK</b></font>',
        ParagraphStyle("StickerEyebrow", parent=s["Body"], fontSize=12,
                       alignment=1, spaceAfter=4, fontName="Helvetica-Bold"),
    ))
    elements.append(Paragraph(
        f"<b>Appartement {apartment_number}</b>",
        ParagraphStyle("StickerTitle", parent=s["H1Orange"], fontSize=36,
                       alignment=1, leading=42, spaceAfter=4),
    ))
    if address:
        elements.append(Paragraph(
            address,
            ParagraphStyle("StickerAddr", parent=s["Sub"], fontSize=11,
                           alignment=1, spaceAfter=14),
        ))

    # Grote QR (centered)
    qr_png = _make_qr_png(kiosk_url, size_px=600)
    qr_img = RLImage(io.BytesIO(qr_png), width=110 * mm, height=110 * mm)
    qr_table = Table([[qr_img]], colWidths=[170 * mm])
    qr_table.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
    elements.append(qr_table)
    elements.append(Spacer(1, 10 * mm))

    elements.append(Paragraph(
        "Scan deze code met uw telefoon en log in met uw PIN-code.",
        ParagraphStyle("StickerInstr", parent=s["Body"], fontSize=14,
                       alignment=1, leading=20, spaceAfter=6),
    ))
    elements.append(Paragraph(
        "Betalen · Onderhoud melden · Mijn gegevens · Contact",
        ParagraphStyle("StickerSubInstr", parent=s["Sub"], fontSize=11,
                       alignment=1, spaceAfter=18),
    ))

    if tenant_name:
        elements.append(Paragraph(
            f'<font color="{MUTED.hexval()}">Toegewezen aan</font> <b>{tenant_name}</b>',
            ParagraphStyle("StickerTenant", parent=s["Body"], fontSize=10,
                           alignment=1, spaceAfter=4),
        ))
    elements.append(Spacer(1, 8 * mm))
    elements.append(Paragraph(
        f"<font color='{MUTED.hexval()}'>{company_name}</font>",
        ParagraphStyle("StickerFooter", parent=s["Small"], fontSize=9,
                       alignment=1),
    ))

    return _build(elements)



# ============== Tenant Portal A6 Poster ==============
def portal_poster_pdf(*, company_name: str, portal_url: str,
                      tenant_name: str | None = None,
                      apartment_number: str | None = None,
                      apartment_address: str | None = None,
                      primary_hex: str = "#FF5C00") -> bytes:
    """A6 (105 x 148mm) printbaar kaartje voor naast de voordeur of in een
    welkomstmap. QR linkt naar het huurportaal van het bedrijf.
    Per-huurder variant: `portal_url` bevat al `?identifier=…` zodat de
    huurder alleen nog een PIN hoeft in te voeren."""
    from reportlab.platypus import Image as RLImage
    s = _styles()
    accent = colors.HexColor(primary_hex) if str(primary_hex).startswith("#") else ORANGE

    # A6 binnenwerk (na 6mm marge): ~93mm breed x 136mm hoog
    inner_w = 93 * mm

    el = []

    # 1) Brand band — bedrijfsnaam + label
    brand_band = Table(
        [[
            Paragraph(
                f'<para align="center"><font color="white" size="9"><b>{(company_name or "").upper()}</b></font></para>',
                s["Body"],
            )
        ],
        [
            Paragraph(
                '<para align="center"><font color="white" size="14"><b>MIJN HUURPORTAAL</b></font></para>',
                s["Body"],
            )
        ]],
        colWidths=[inner_w], rowHeights=[7 * mm, 9 * mm],
    )
    brand_band.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), accent),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROUNDEDCORNERS", [4, 4, 0, 0]),
    ]))
    el.append(brand_band)

    # 2) Grote QR — gecentreerd
    qr_png = _make_qr_png(portal_url, size_px=600)
    qr_img = RLImage(io.BytesIO(qr_png), width=70 * mm, height=70 * mm)
    qr_block = Table([[qr_img]], colWidths=[inner_w])
    qr_block.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    el.append(qr_block)

    # 3) Hoofd-instructie
    el.append(Paragraph(
        '<para align="center"><b>Scan voor mijn huurportaal</b></para>',
        ParagraphStyle("PosterMain", parent=s["Body"], fontSize=11, leading=13,
                       textColor=DARK, spaceAfter=2),
    ))
    el.append(Paragraph(
        '<para align="center"><font color="#6b7280" size="8">'
        'Betalen · Kwitanties · Onderhoud melden'
        '</font></para>',
        s["Body"],
    ))
    el.append(Spacer(1, 4 * mm))

    # 4) Tenant + appartement info (alleen bij per-huurder variant)
    if tenant_name or apartment_number:
        rows = []
        if tenant_name:
            rows.append([
                Paragraph(
                    '<font color="#6b7280" size="7">VOOR</font>',
                    s["Body"],
                ),
                Paragraph(
                    f'<b>{tenant_name}</b>',
                    ParagraphStyle("PosterTenant", parent=s["Body"], fontSize=9,
                                   leading=11, textColor=DARK),
                ),
            ])
        if apartment_number:
            apt_label = f"Appt. {apartment_number}"
            if apartment_address:
                apt_label += f" · {apartment_address}"
            rows.append([
                Paragraph(
                    '<font color="#6b7280" size="7">ADRES</font>',
                    s["Body"],
                ),
                Paragraph(
                    apt_label,
                    ParagraphStyle("PosterAddr", parent=s["Body"], fontSize=8,
                                   leading=10, textColor=DARK),
                ),
            ])
        info = Table(rows, colWidths=[14 * mm, inner_w - 14 * mm])
        info.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
            ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#E5E7EB")),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        el.append(info)
        el.append(Spacer(1, 3 * mm))

    # 5) Footer
    el.append(Paragraph(
        f'<para align="center"><font color="#9CA3AF" size="6">'
        f'{(company_name or "SuriRent")} · Powered by SuriRent'
        f'</font></para>',
        s["Body"],
    ))

    return _build_a6(el)
