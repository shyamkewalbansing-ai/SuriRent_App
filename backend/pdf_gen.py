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


# =====================================================================
# Getal-naar-woorden (Nederlands) — gebruikt voor "zegge" formulering
# op huurcontracten. Werkt voor 0..999.999 en rondt af op hele eenheden.
# =====================================================================
_NL_UNITS = ["nul", "een", "twee", "drie", "vier", "vijf", "zes", "zeven",
             "acht", "negen", "tien", "elf", "twaalf", "dertien", "veertien",
             "vijftien", "zestien", "zeventien", "achttien", "negentien"]
_NL_TENS = ["", "", "twintig", "dertig", "veertig", "vijftig", "sestig",
            "zeventig", "tachtig", "negentig"]  # noqa: (typo behouden voor 60 fix hieronder)
_NL_TENS[6] = "zestig"  # correcte spelling


def _nl_under_hundred(n: int) -> str:
    if n < 20:
        return _NL_UNITS[n]
    tens, unit = divmod(n, 10)
    if unit == 0:
        return _NL_TENS[tens]
    # Klinkerbotsing: tweeen → tweeën, drieen → drieën
    unit_word = _NL_UNITS[unit]
    joined = f"{unit_word}en{_NL_TENS[tens]}"
    joined = joined.replace("eeen", "eeën").replace("drieen", "drieën").replace("tweeen", "tweeën")
    return joined


def _nl_under_thousand(n: int) -> str:
    if n < 100:
        return _NL_under_hundred(n) if False else _nl_under_hundred(n)
    hundreds, rest = divmod(n, 100)
    h_word = "honderd" if hundreds == 1 else f"{_NL_UNITS[hundreds]}honderd"
    if rest == 0:
        return h_word
    return f"{h_word}{_nl_under_hundred(rest)}"


def number_to_nl_words(amount: float) -> str:
    """Getal naar Nederlandse woorden. Rondt af op hele eenheden."""
    n = int(round(float(amount or 0)))
    if n == 0:
        return "nul"
    if n < 0:
        return f"min {number_to_nl_words(-n)}"
    parts = []
    millions, rest = divmod(n, 1_000_000)
    if millions:
        m_word = "miljoen" if millions == 1 else f"{_nl_under_thousand(millions)} miljoen"
        parts.append(m_word)
    thousands, rest = divmod(rest, 1_000)
    if thousands:
        t_word = "duizend" if thousands == 1 else f"{_nl_under_thousand(thousands)}duizend"
        parts.append(t_word)
    if rest:
        parts.append(_nl_under_thousand(rest))
    return " ".join(parts)


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


def _two_col_block(el, rows: list, label_col_mm: float = 50, gap_after: int = 14,
                   accent=None):
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
    line_color = _hairline_color(accent) if accent is not None else HAIRLINE
    t = Table(data, colWidths=[label_col_mm * mm, total_w - label_col_mm * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, line_color),
    ]))
    el.append(t)
    el.append(Spacer(1, gap_after))


def _amount_block(el, label: str, amount: float, currency: str = "SRD", accent=None):
    """Groot bedrag-blok: label links, bedrag groot rechts."""
    s = _styles()
    data = [[
        Paragraph(label.upper(), s["AmountLabel"]),
        Paragraph(_fmt_money(amount, currency), s["AmountValue"]),
    ]]
    border = _hairline_color(accent) if accent is not None else HAIRLINE
    t = Table(data, colWidths=[100 * mm, 70 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.5, border),
    ]))
    el.append(t)
    el.append(Spacer(1, 10))


def _status_row(el, label: str, value: str, is_paid: bool = False, accent=None):
    """Status-rij: label links, status rechts (groen=VOLDAAN, accent=open).

    `accent` overschrijft de standaard ORANGE voor "openstaand" status zodat
    de PDF-kleur synchroon loopt met `branding.primary_color` van de company.
    """
    s = _styles()
    if is_paid:
        value_style = s["StatusValue"]
    elif accent is not None:
        # Bouw inline style met dynamische accent kleur
        value_style = ParagraphStyle(
            name=f"StatusAccent_{id(accent)}", parent=s["Normal"],
            fontName="Helvetica-Bold", fontSize=12, textColor=accent, alignment=2,
        )
    else:
        value_style = s["StatusOpen"]
    line_color = _hairline_color(accent) if accent is not None else HAIRLINE
    data = [[
        Paragraph(label.upper(), s["KVLabel"]),
        Paragraph(value.upper(), value_style),
    ]]
    t = Table(data, colWidths=[100 * mm, 70 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, line_color),
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


def _accent_color(doc: dict):
    """Bepaal accentkleur uit doc-dict (`company_primary_color`). Valt terug
    op brand-oranje (#FF5C00) wanneer niet aanwezig of ongeldig."""
    raw = (doc or {}).get("company_primary_color") or ""
    if not raw or not isinstance(raw, str):
        return ORANGE
    s = raw.strip().lower()
    if not s.startswith("#") or len(s) not in (4, 7):
        return ORANGE
    try:
        return colors.HexColor(s)
    except Exception:
        return ORANGE


def _hairline_color(accent):
    """Zeer subtiele getinte hairline: 12% accent op witte basis."""
    try:
        r, g, b = accent.red, accent.green, accent.blue
        return colors.Color(
            r + (1 - r) * 0.88,
            g + (1 - g) * 0.88,
            b + (1 - b) * 0.88,
        )
    except Exception:
        return HAIRLINE



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
def payment_plan_pdf(plan: dict) -> bytes:
    """Bonnetje voor een betalingsregeling die zojuist is aangemaakt in de Kiosk.
    Toont totaal, aantal termijnen, per-termijn-bedrag en tabel met alle
    vervaldatums + bedragen. Huurder krijgt dit mee voor administratie.
    """
    el = []
    accent = colors.HexColor("#FF5C00")
    _brand_header(el, plan)
    _brand_title(el, "Betalingsregeling", plan.get("plan_number") or plan.get("id", "")[:8].upper())

    rows = [
        ("Datum afspraak", _fmt_date_nl(plan.get("created_at"))),
        ("Huurder", plan.get("tenant_name", "")),
        ("Appartement", plan.get("apartment_number") or "—"),
        ("Aantal termijnen", f"{plan.get('num_installments', 0)}× termijn"),
        ("Eerste vervaldatum", _fmt_date_nl(plan.get("first_due_date") or "")),
    ]
    if plan.get("notes"):
        rows.append(("Betreft", plan["notes"]))
    _two_col_block(el, rows, label_col_mm=48, gap_after=14, accent=accent)

    total = float(plan.get("total_amount") or 0)
    currency = plan.get("currency") or "SRD"
    _amount_block(el, "Totaal regeling", total, currency, accent=accent)
    el.append(Spacer(1, 6))

    n = int(plan.get("num_installments") or 0)
    per = float(plan.get("installment_amount") or (total / n if n else 0))
    _status_row(el, "Per termijn", _fmt_money(per, currency), is_paid=False, accent=accent)

    # Termijnen-tabel
    insts = plan.get("installments") or []
    if insts:
        s = _styles()
        el.append(Spacer(1, 12))
        el.append(Paragraph("<b>Termijn-overzicht</b>", s["Body"]))
        el.append(Spacer(1, 4))
        data = [["#", "Vervaldatum", "Bedrag", "Status"]]
        for inst in insts:
            data.append([
                str(inst.get("sequence", "")),
                _fmt_date_nl(inst.get("due_date", "")),
                _fmt_money(float(inst.get("amount") or 0), currency),
                (inst.get("status") or "open").capitalize(),
            ])
        t = Table(data, colWidths=[12 * mm, 50 * mm, 40 * mm, 30 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), accent),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (2, 0), (2, -1), "RIGHT"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
            ("GRID", (0, 0), (-1, -1), 0.25, HAIRLINE),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
        ]))
        el.append(t)

    # Footer note
    s = _styles()
    el.append(Spacer(1, 14))
    el.append(Paragraph(
        "<b>Belangrijk:</b> de huurder verbindt zich tot betaling van bovenstaande "
        "termijnen op de aangegeven vervaldatums. Betaling kan via de Kiosk, "
        "Mope, contant of bankoverschrijving. Bij niet-nakoming behoudt de "
        "verhuurder het recht de regeling te annuleren.",
        s["Body"],
    ))

    _signature_block(
        el,
        received_by=plan.get("tenant_name") or "Huurder",
        approved_by=plan.get("company_name") or "",
        company_name=plan.get("company_name") or "",
        signature_data=plan.get("signature_data") or "",
    )

    _verification_footer(
        el,
        plan.get("plan_number") or plan.get("id", "")[:8].upper(),
        plan.get("company_name") or "",
        plan.get("company_address") or "",
        total, currency, plan.get("tenant_id", ""),
    )
    return _build(el)


def receipt_pdf(payment: dict) -> bytes:
    """Genereert de gestilte SuriRent kwitantie met grijze achtergrond,
    centrale titel, two-col details, groot bedrag, status + signature blok,
    en geverifieerde footer met SHA-256 hash."""
    el = []
    accent = _accent_color(payment)
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
    _two_col_block(el, rows, label_col_mm=48, gap_after=14, accent=accent)

    # Ontvangen bedrag — groot blok
    amount = float(payment.get("amount") or 0)
    currency = payment.get("currency") or "SRD"
    _amount_block(el, "Ontvangen bedrag", amount, currency, accent=accent)
    el.append(Spacer(1, 6))

    # Status — VOLDAAN of openstaand bedrag
    outstanding_after = float(payment.get("outstanding_after") or 0)
    if outstanding_after <= 0.01:
        _status_row(el, "Openstaand na betaling", "VOLDAAN", is_paid=True, accent=accent)
        _status_row(el, "Totaal openstaand", "VOLDAAN", is_paid=True, accent=accent)
    else:
        _status_row(el, "Openstaand na betaling", _fmt_money(outstanding_after, currency),
                    is_paid=False, accent=accent)
        _status_row(el, "Totaal openstaand", _fmt_money(outstanding_after, currency),
                    is_paid=False, accent=accent)

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
def contract_pdf(contract: dict, tenant: dict, apartment: dict,
                 id_photo_bytes: bytes | None = None,
                 id_photo_back_bytes: bytes | None = None,
                 signature_bytes: bytes | None = None) -> bytes:
    """Officiële HUUROVEREENKOMST — Surinaams recht.

    Volgt de door de opdrachtgever vastgestelde structuur met 10 artikelen.
    Missende gegevens (geboortedatum, ID-nummers) worden als invulregel
    weergegeven zodat de PDF met pen kan worden aangevuld en dubbel worden
    ondertekend.

    Als `id_photo_bytes` is meegegeven, wordt aan het eind een extra pagina
    toegevoegd met de ID-kaart foto van de huurder als bewijs (bijlage).
    """
    s = _styles()
    el = []
    _brand_header(el, contract)

    # === Titel ===
    title_style = ParagraphStyle(
        name="ContractTitle", parent=s["Normal"],
        fontName="Helvetica-Bold", fontSize=18, textColor=DARK,
        leading=22, alignment=1, spaceBefore=6, spaceAfter=14,
    )
    el.append(Paragraph("HUUROVEREENKOMST", title_style))

    # === Body & artikel stijlen ===
    body = ParagraphStyle(
        name="ContractBody", parent=s["Normal"],
        fontName="Helvetica", fontSize=10, textColor=DARK,
        leading=14, spaceAfter=6, alignment=0,
    )
    art = ParagraphStyle(
        name="ContractArticle", parent=s["Normal"],
        fontName="Helvetica-Bold", fontSize=11, textColor=DARK,
        leading=14, spaceBefore=10, spaceAfter=4,
    )
    small = ParagraphStyle(
        name="ContractSmall", parent=s["Normal"],
        fontName="Helvetica", fontSize=9, textColor=MUTED, leading=12,
    )

    # Placeholder voor missende gegevens — user vult met pen aan bij ondertekenen
    UNSET = "____________________"

    landlord_name = contract.get("landlord") or contract.get("company_name") or UNSET
    landlord_dob = contract.get("landlord_dob") or UNSET
    landlord_id = contract.get("landlord_id") or UNSET

    tenant_name = tenant.get("name") or UNSET
    tenant_dob = tenant.get("birth_date") or tenant.get("dob") or UNSET
    tenant_id = tenant.get("id_number") or tenant.get("id_no") or UNSET

    apt_number = apartment.get("number") or UNSET
    apt_address = apartment.get("address") or contract.get("company_address") or UNSET
    cur = apartment.get("currency", "SRD")
    rent_amount = _fmt_money(apartment.get("rent_amount", 0), cur)
    # "Zegge" — huurprijs in woorden voor extra juridische zekerheid
    rent_words = number_to_nl_words(apartment.get("rent_amount", 0))
    cur_word = {"SRD": "Surinaamse dollars", "USD": "Amerikaanse dollars",
                "EUR": "euro"}.get(cur, cur)
    rent_zegge = f"zegge: {rent_words} {cur_word}"
    start_date = contract.get("start_date") or UNSET

    # === Ondergetekenden ===
    el.append(Paragraph("<b>Ondergetekenden</b>", body))
    el.append(Paragraph(
        f"De heer/mevrouw <b>{landlord_name}</b>,<br/>"
        f"Geboren op: {landlord_dob},<br/>"
        f"ID-nummer: {landlord_id},<br/>"
        "hierna te noemen: &quot;<b>Verhuurder</b>&quot;,",
        body,
    ))
    el.append(Paragraph("en", body))
    el.append(Paragraph(
        f"<b>{tenant_name}</b>,<br/>"
        f"geboren op: {tenant_dob},<br/>"
        f"ID-nummer: {tenant_id},<br/>"
        "hierna te noemen: &quot;<b>Huurder</b>&quot;,",
        body,
    ))
    el.append(Paragraph(
        "verklaren met elkaar de volgende huurovereenkomst te zijn aangegaan.",
        body,
    ))

    # === Artikel 1 ===
    el.append(Paragraph("Artikel 1 – Het gehuurde", art))
    el.append(Paragraph(
        f"De verhuurder verhuurt aan de huurder het appartement gelegen aan:<br/>"
        f"<b>{apt_address}</b>.<br/>"
        f"Het betreft specifiek:<br/><b>{apt_number}</b><br/><br/>"
        "Het gehuurde mag uitsluitend worden gebruikt als woonruimte door de huurder.",
        body,
    ))

    # === Artikel 2 ===
    el.append(Paragraph("Artikel 2 – Huurprijs en ingangsdatum", art))
    el.append(Paragraph(
        f"De maandelijkse huurprijs bedraagt <b>{rent_amount}</b>,- "
        f"(<i>{rent_zegge}</i>).<br/>"
        f"De huurovereenkomst gaat in op <b>[{start_date}]</b>.<br/>"
        "De huur dient maandelijks te worden betaald en dient uiterlijk op de "
        "<b>10e dag</b> van iedere kalendermaand te zijn voldaan.",
        body,
    ))

    # === Artikel 3 ===
    el.append(Paragraph("Artikel 3 – Betalingsvoorwaarden, herinneringen en boete", art))
    el.append(Paragraph(
        "Indien de huur niet uiterlijk op de 10e van de maand is betaald, geldt de "
        "volgende procedure:",
        body,
    ))
    el.append(Paragraph(
        "&nbsp;&nbsp;• Vanaf de <b>11e</b> van de maand ontvangt de huurder de eerste betalingsherinnering.<br/>"
        "&nbsp;&nbsp;• Eén week daarna ontvangt de huurder de tweede betalingsherinnering.<br/>"
        "&nbsp;&nbsp;• Eén week daarna ontvangt de huurder de derde betalingsherinnering.",
        body,
    ))
    el.append(Paragraph(
        "Indien de huur na de derde betalingsherinnering nog steeds niet volledig is "
        "betaald, is de huurder een eenmalige boete van <b>SRD 500,-</b> verschuldigd "
        "voor die betreffende huurmaand, onverminderd de verplichting tot betaling van "
        "de achterstallige huur.",
        body,
    ))

    # === Artikel 4 ===
    el.append(Paragraph("Artikel 4 – Betalingsachterstand en ontbinding", art))
    el.append(Paragraph(
        "Indien de huurder een huurachterstand van <b>twee (2) maanden</b> heeft, "
        "zullen partijen indien mogelijk in overleg treden om een betalingsregeling "
        "te treffen.",
        body,
    ))
    el.append(Paragraph(
        "Indien de huurachterstand <b>drie (3) maanden of meer</b> bedraagt en de "
        "huurder ondanks schriftelijke herinneringen en aanmaningen niet aan zijn "
        "betalingsverplichtingen voldoet, is de verhuurder gerechtigd de ontbinding "
        "van deze huurovereenkomst en de ontruiming van het gehuurde te vorderen "
        "overeenkomstig het Surinaamse recht.",
        body,
    ))
    el.append(Paragraph(
        "Indien de huurder vrijwillig instemt met beëindiging van de huurovereenkomst "
        "wegens de betalingsachterstand, krijgt de huurder maximaal <b>één (1) maand</b> "
        "de tijd om het appartement te verlaten en een andere woonruimte te vinden.",
        body,
    ))
    el.append(Paragraph(
        "Bij het verlaten van het gehuurde dient het appartement leeg, bezemschoon en "
        "in goede staat te worden opgeleverd, behoudens normale slijtage.",
        body,
    ))

    # === Artikel 5 ===
    el.append(Paragraph("Artikel 5 – Onderhoud en reparaties", art))
    el.append(Paragraph("<b>Voor rekening van de verhuurder:</b>", body))
    el.append(Paragraph(
        "&nbsp;&nbsp;• Reparaties aan de elektrische installatie.<br/>"
        "&nbsp;&nbsp;• Het verhelpen van verstoppingen in de afvoer of riolering, tenzij deze door onjuist gebruik van de huurder zijn ontstaan.<br/>"
        "&nbsp;&nbsp;• Groot onderhoud aan het appartement.",
        body,
    ))
    el.append(Paragraph("<b>Voor rekening van de huurder:</b>", body))
    el.append(Paragraph(
        "&nbsp;&nbsp;• Het vervangen van lampen.<br/>"
        "&nbsp;&nbsp;• Het vervangen of repareren van de wc-bril.<br/>"
        "&nbsp;&nbsp;• Alle kleine dagelijkse onderhoudswerkzaamheden.<br/>"
        "&nbsp;&nbsp;• Schade ontstaan door onzorgvuldig, onjuist of nalatig gebruik van het gehuurde.",
        body,
    ))

    # === Artikel 6 ===
    el.append(Paragraph("Artikel 6 – Waarborgsom", art))
    el.append(Paragraph(
        "Na beëindiging van de huurovereenkomst wordt de waarborgsom, na verrekening "
        "van eventuele openstaande huur, schade of andere verschuldigde bedragen, "
        "binnen <b>dertig (30) dagen</b> terugbetaald.",
        body,
    ))

    # === Artikel 7 ===
    el.append(Paragraph("Artikel 7 – Gebruik van het gehuurde", art))
    el.append(Paragraph("De huurder zal het appartement als een goed huurder gebruiken.", body))
    el.append(Paragraph(
        "Het is zonder voorafgaande schriftelijke toestemming van de verhuurder niet toegestaan:",
        body,
    ))
    el.append(Paragraph(
        "&nbsp;&nbsp;• het appartement geheel of gedeeltelijk onder te verhuren;<br/>"
        "&nbsp;&nbsp;• het appartement aan derden in gebruik te geven;<br/>"
        "&nbsp;&nbsp;• wijzigingen aan het appartement aan te brengen die niet eenvoudig ongedaan kunnen worden gemaakt.",
        body,
    ))

    # === Artikel 8 ===
    el.append(Paragraph("Artikel 8 – Oplevering", art))
    el.append(Paragraph(
        "Bij aanvang en beëindiging van de huurovereenkomst kunnen partijen gezamenlijk "
        "een inspectie van het appartement uitvoeren.",
        body,
    ))
    el.append(Paragraph(
        "Bij beëindiging dient het appartement leeg, schoon en in goede staat te worden "
        "opgeleverd, behoudens normale slijtage.",
        body,
    ))

    # === Artikel 9 ===
    el.append(Paragraph("Artikel 9 – Opzegging en verhuizing", art))
    el.append(Paragraph(
        "De huurder is verplicht om de verhuurder minimaal <b>één (1) maand</b> vóór de "
        "geplande verhuisdatum schriftelijk op de hoogte te stellen van de beëindiging "
        "van de huurovereenkomst.",
        body,
    ))
    el.append(Paragraph(
        "Indien de huurder zonder de vereiste voorafgaande schriftelijke kennisgeving "
        "verhuist of de woning voortijdig verlaat, is de huurder een contractuele boete "
        "van <b>SRD 3.000</b> verschuldigd.",
        body,
    ))
    el.append(Paragraph(
        "Deze boete laat de verplichting van de huurder onverlet om eventuele achterstallige "
        "huur, schade aan het gehuurde, openstaande kosten voor water, elektriciteit, "
        "internet en overige verschuldigde bedragen volledig te betalen.",
        body,
    ))
    el.append(Paragraph(
        "De verhuurder is gerechtigd de openstaande bedragen en de overeengekomen boete te "
        "verrekenen met de waarborgsom, voor zover dit wettelijk is toegestaan. Indien de "
        "waarborgsom onvoldoende is, blijft de huurder verplicht het resterende bedrag te "
        "voldoen.",
        body,
    ))

    # === Artikel 10 ===
    el.append(Paragraph("Artikel 10 – Slotbepalingen", art))
    el.append(Paragraph("Op deze overeenkomst is het Surinaamse recht van toepassing.", body))
    el.append(Paragraph(
        "Wijzigingen of aanvullingen op deze overeenkomst zijn uitsluitend geldig indien "
        "deze schriftelijk door beide partijen zijn overeengekomen.",
        body,
    ))
    el.append(Paragraph(
        "Partijen verklaren deze overeenkomst te hebben gelezen, de inhoud te begrijpen en "
        "hiermee akkoord te gaan.",
        body,
    ))

    el.append(Spacer(1, 10))
    el.append(Paragraph(
        "Aldus in tweevoud opgemaakt en ondertekend te <b>Paramaribo, Suriname</b>.",
        body,
    ))
    # Datum-regel (dd/mm/yyyy invulplekken)
    now_year = datetime.utcnow().year
    el.append(Paragraph(
        f"Datum: ____ / ____ / {now_year}",
        body,
    ))
    el.append(Spacer(1, 18))

    # === Handtekening blok — twee koloms ===
    sig_style = ParagraphStyle(
        name="ContractSigLabel", parent=s["Normal"],
        fontName="Helvetica-Bold", fontSize=10, textColor=DARK,
        leading=12, spaceAfter=4,
    )
    sig_line_style = ParagraphStyle(
        name="ContractSigLine", parent=s["Normal"],
        fontName="Helvetica", fontSize=9, textColor=MUTED,
        leading=12, spaceAfter=2,
    )
    sig_table_data = [[
        [
            Paragraph("Verhuurder", sig_style),
            Paragraph(f"Naam: <b>{landlord_name}</b>", sig_line_style),
            Spacer(1, 30),
            Paragraph("Handtekening: ________________________", sig_line_style),
        ],
        [
            Paragraph("Huurder", sig_style),
            Paragraph(f"Naam: <b>{tenant_name}</b>", sig_line_style),
            Spacer(1, 30),
            Paragraph("Handtekening: ________________________", sig_line_style),
        ],
    ]]
    sig_table = Table(sig_table_data, colWidths=[85 * mm, 85 * mm])
    sig_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    el.append(sig_table)

    # Optionele digitale ondertekening — als de kiosk een signatuur heeft
    # vastgelegd tonen we dat + datum onderaan als bewijs.
    signed = contract.get("signed_at")
    if signed:
        el.append(Spacer(1, 14))
        try:
            dt = datetime.fromisoformat(signed.replace("Z", "+00:00"))
            when = dt.strftime("%d-%m-%Y %H:%M")
        except Exception:
            when = signed
        el.append(Paragraph(
            f"<i>Digitaal ondertekend door: {contract.get('signed_by') or tenant_name} · {when}</i>",
            small,
        ))

    _verification_footer(
        el,
        contract.get("contract_number", ""),
        contract.get("company_name") or "",
        contract.get("company_address") or "",
        tenant.get("id", ""), apartment.get("id", ""),
    )

    # === Bijlage 1 — ID-kaart foto van huurder (indien beschikbaar) ===
    # Wordt op een aparte A4 pagina getoond met kader en toelichting. Dient
    # als bewijs bij het contract en past binnen 170mm x 220mm bounding box.
    def _safe_image(el_list, raw_bytes, title, subtitle=""):
        try:
            from PIL import Image as PILImage
            src = PILImage.open(io.BytesIO(raw_bytes))
            if src.mode not in ("RGB", "L"):
                src = src.convert("RGB")
            buf = io.BytesIO()
            src.save(buf, format="PNG")
            safe = buf.getvalue()
            iw, ih = src.size
            max_w, max_h = 170 * mm, 200 * mm
            ratio = min(max_w / iw, max_h / ih)
            w, h = iw * ratio, ih * ratio
            el_list.append(PageBreak())
            el_list.append(Paragraph(title, title_style))
            if subtitle:
                el_list.append(Spacer(1, 6))
                el_list.append(Paragraph(subtitle, body))
            el_list.append(Spacer(1, 10))
            img = Image(io.BytesIO(safe), width=w, height=h)
            img.hAlign = "CENTER"
            el_list.append(img)
            return True
        except Exception:
            return False

    if id_photo_bytes:
        _safe_image(
            el, id_photo_bytes,
            "BIJLAGE 1 — LEGITIMATIEBEWIJS HUURDER (VOORKANT)",
            f"Naam: <b>{tenant.get('name') or ''}</b> · ID-nr: <b>{tenant.get('id_number') or ''}</b> · "
            f"Geboortedatum: <b>{tenant.get('birth_date') or ''}</b>",
        )
    if id_photo_back_bytes:
        _safe_image(
            el, id_photo_back_bytes,
            "BIJLAGE 2 — LEGITIMATIEBEWIJS HUURDER (ACHTERKANT)",
            f"Naam: <b>{tenant.get('name') or ''}</b>",
        )
    if signature_bytes:
        _safe_image(
            el, signature_bytes,
            "BIJLAGE 3 — DIGITALE HANDTEKENING HUURDER",
            f"Ondertekend door <b>{tenant.get('name') or ''}</b>"
            + (f" op <b>{tenant.get('signature_signed_at', '')[:10]}</b>." if tenant.get('signature_signed_at') else "."),
        )

    return _build(el)


# ============== Invoice PDF ==============
def invoice_pdf(invoice: dict, tenant: dict, apartment: dict, payments: list) -> bytes:
    s = _styles()
    el = []
    accent = _accent_color(invoice)
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
    ], gap_after=14, accent=accent)

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
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, _hairline_color(accent)),
    ]))
    el.append(t)
    el.append(Spacer(1, 14))

    # Totalen
    total = float(invoice.get("amount", 0) or 0)
    paid = sum(float(p.get("amount", 0) or 0) for p in (payments or []))
    due = max(total - paid, 0)
    _amount_block(el, "Totaal", total, cur, accent=accent)
    el.append(Spacer(1, 4))
    if paid > 0:
        _status_row(el, "Reeds betaald", _fmt_money(paid, cur), is_paid=True, accent=accent)
    if due > 0.01:
        _status_row(el, "Nog te betalen", _fmt_money(due, cur), is_paid=False, accent=accent)
    else:
        _status_row(el, "Status", "VOLDAAN", is_paid=True, accent=accent)

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


# ============== SaaS subscription invoice PDF ==============
def saas_invoice_pdf(invoice: dict, company: dict, saas_provider: dict | None = None) -> bytes:
    """PDF factuur van de SaaS-eigenaar (SuriRent) naar een klant-bedrijf.
    Gebruikt zelfde brand-stijl als andere PDFs. Optioneel `saas_provider`
    dict {name, address, ...} voor de header; anders defaults.
    """
    s = _styles()
    el = []
    accent = _accent_color(invoice)
    # Force brand-header met SaaS eigenaar (default SuriRent) als afzender.
    header_doc = {
        "company_name": (saas_provider or {}).get("name", "SuriRent N.V."),
        "company_address": (saas_provider or {}).get("address", "Paramaribo, Suriname"),
        "company_email": (saas_provider or {}).get("email", ""),
        "company_phone": (saas_provider or {}).get("phone", ""),
    }
    _brand_header(el, header_doc)

    inv_nr = invoice.get("id", "")[:8].upper()
    _brand_title(el, "SaaS Factuur", f"INV-{inv_nr}")

    cur = invoice.get("currency", "SRD")
    plan_label = str(invoice.get("plan", "")).capitalize() or "Abonnement"
    kind_label = "Termijnfactuur" if invoice.get("kind") == "installment" else "Abonnement"

    _two_col_block(el, [
        ("Factuurdatum", _fmt_date_nl(invoice.get("created_at"))),
        ("Klant", company.get("name", "")),
        ("Klant slug", f"/{company.get('slug', '')}"),
        ("Plan", plan_label),
    ], gap_after=10, accent=accent)

    period_start = _fmt_date_nl(invoice.get("period_start"))
    period_end = _fmt_date_nl(invoice.get("period_end"))
    _two_col_block(el, [
        ("Periode", f"{period_start} → {period_end}"),
        ("Type", kind_label),
        ("Termijn", (
            f"{invoice.get('installment_seq')}/{invoice.get('installment_total')}"
            if invoice.get("kind") == "installment" else "—"
        )),
    ], gap_after=14, accent=accent)

    # Specificatie
    el.append(Paragraph("SPECIFICATIE", s["SectionHead"]))
    el.append(Spacer(1, 4))
    desc = f"{kind_label} · {plan_label} · {period_start} – {period_end}"
    spec_data = [[
        Paragraph(desc, s["Body"]),
        Paragraph(_fmt_money(invoice.get("amount", 0), cur), s["AmountValue"]),
    ]]
    t = Table(spec_data, colWidths=[120 * mm, 50 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, _hairline_color(accent)),
    ]))
    el.append(t)
    el.append(Spacer(1, 14))

    total = float(invoice.get("amount", 0) or 0)
    _amount_block(el, "Totaal", total, cur, accent=accent)
    el.append(Spacer(1, 4))

    if invoice.get("status") == "paid":
        _status_row(el, "Status", "VOLDAAN", is_paid=True, accent=accent)
        if invoice.get("paid_at"):
            el.append(Spacer(1, 4))
            el.append(Paragraph(
                f"Ontvangen op {_fmt_date_nl(invoice.get('paid_at'))}.",
                s["Small"]
            ))
    else:
        _status_row(el, "Nog te betalen", _fmt_money(total, cur), is_paid=False, accent=accent)

    el.append(Spacer(1, 16))
    el.append(Paragraph(
        "Gelieve dit bedrag binnen 14 dagen te voldoen via bankoverschrijving of "
        "Uni5Pay. Vermeld de factuurreferentie bij uw betaling.",
        s["Small"]
    ))

    _verification_footer(
        el, f"INV-{inv_nr}", header_doc["company_name"], header_doc["company_address"],
        total, cur, company.get("id", ""),
    )
    return _build(el)


# ============== Deposit refund PDF ==============
def deposit_refund_pdf(deposit: dict, tenant: dict, apartment: dict) -> bytes:
    el = []
    accent = _accent_color(deposit)
    _brand_header(el, deposit)
    nr = (deposit.get("id") or "")[:8].upper()
    _brand_title(el, "Borg restitutie", nr)

    cur = deposit.get("currency", "SRD")
    _two_col_block(el, [
        ("Huurder", tenant.get("name", "")),
        ("Appartement", apartment.get("number") or "—"),
        ("Borg ontvangen", _fmt_date_nl(deposit.get("created_at"))),
        ("Borg restitutie", _fmt_date_nl(deposit.get("refunded_at"))),
    ], gap_after=14, accent=accent)

    _amount_block(el, "Borgbedrag", deposit.get("amount", 0), cur, accent=accent)
    if float(deposit.get("deduction", 0) or 0) > 0:
        _status_row(el, "Aftrek", _fmt_money(deposit.get("deduction", 0), cur),
                    is_paid=False, accent=accent)
    _amount_block(el, "Terugbetaald", deposit.get("refund_amount", 0), cur, accent=accent)

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
    accent = _accent_color(salary)
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
    ], gap_after=14, accent=accent)

    el.append(Paragraph("LOONSPECIFICATIE", s["SectionHead"]))
    el.append(Spacer(1, 4))
    rows = []
    if salary.get("gross") is not None:
        rows.append(("Bruto salaris", _fmt_money(salary.get("gross", 0), cur)))
    if float(salary.get("advance", 0) or 0) > 0:
        rows.append(("Voorschotten", "- " + _fmt_money(salary.get("advance", 0), cur)))
    if float(salary.get("deductions", 0) or 0) > 0:
        rows.append(("Inhoudingen", "- " + _fmt_money(salary.get("deductions", 0), cur)))
    _two_col_block(el, rows, label_col_mm=80, gap_after=6, accent=accent)

    _amount_block(el, "Netto uitbetaald", salary.get("net", 0), cur, accent=accent)

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
        # Legacy parameter — subdomein-feature is verwijderd. Genegeerd.
        pass

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



def luxury_plate_pdf(*, tenant_name: str, apartment_number: str,
                     address: str, company_name: str,
                     kiosk_url: str, company_logo: bytes | None = None,
                     accent_hex: str = "#D4AF37",
                     size: str = "medium") -> bytes:
    """Luxueuze "gouden plaat" QR-poster per huurder, gegenereerd door de
    door de gebruiker geleverde template-afbeelding (1536×1024 PNG) als
    achtergrond te gebruiken en alleen de dynamische delen erboven te
    overlayen: bedrijfsnaam, transparante QR-code, HUIS-nummer, en adres.

    Template-bestand: /app/backend/assets/qr-plate-template.png
    """
    import os
    from PIL import Image as PILImage
    from PIL import ImageDraw, ImageFont
    import qrcode

    # 1) Template laden
    template_path = "/app/backend/assets/qr-plate-template.png"
    if not os.path.exists(template_path):
        # Fallback: laadbare alternatieve template, anders error
        raise FileNotFoundError(f"QR plate template ontbreekt: {template_path}")
    img = PILImage.open(template_path).convert("RGB")
    W, H = img.size  # 1536 × 1024
    draw = ImageDraw.Draw(img)

    # Goud-kleur die overeenkomt met de template (gesampled uit de afbeelding)
    GOLD = (212, 174, 92)
    GOLD_LIGHT = (232, 199, 102)
    PLATE_BLACK = (14, 13, 10)  # warm-zwart, exact gesampled uit template

    # Helper om TTF te laden (Liberation Sans Bold lijkt visueel op Helvetica)
    def font_at(size: int):
        for fp in (
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ):
            if os.path.exists(fp):
                return ImageFont.truetype(fp, size)
        return ImageFont.load_default()

    # STAP 0 — Maskeer de COMPLETE binnenkant van de plaat met flat zwart,
    # zodat we vers kunnen tekenen. Bewust GEEN cropping uit andere delen
    # van de template (kopieerde de bestaande tekst over zichzelf heen!).
    # We behouden:
    #   • Gouden buitenrand
    #   • Logo regio links (x < 600, y in 150..820)
    #   • Schroef-cirkels in onderhoeken
    # Alles binnen het zwarte vlak wordt vers opgebouwd.

    # Mask alle bestaande sjabloon-tekst zodat we vers kunnen overschilderen.
    # We behouden bewust: gouden buitenrand, het S-huis logo links, en de
    # 4 schroef-cirkels bij de onderhoeken.
    # Bovenste rechterzone — verbergt "Gopi", "Appartement's", QR, scan-tekst
    draw.rectangle([540, 130, W - 130, 640], fill=PLATE_BLACK)
    # Onderste midden-strook — verbergt "HUIS 7B" + "Kewalbansingweg 7 B".
    # Begin/eind binnen de schroef-zone (~x=260 ↔ x=1280) zodat de schroeven
    # in de hoeken intact blijven.
    draw.rectangle([260, 640, W - 260, H - 130], fill=PLATE_BLACK)

    # 2) BEDRIJFSNAAM — alles in rechterhelft is al zwart gemaskeerd in STAP 0.
    company_name_clean = (company_name or "").strip() or "Bedrijf"
    # Tekst-zone (rechts van logo, met marge zodat het logo intact blijft)
    cn_x0, cn_y0, cn_x1, cn_y1 = 600, 230, 1080, 480
    # Auto-fit font op breedte
    cn_size = 130
    while cn_size > 50:
        cn_font = font_at(cn_size)
        bbox = draw.textbbox((0, 0), company_name_clean, font=cn_font)
        if (bbox[2] - bbox[0]) <= (cn_x1 - cn_x0) and (bbox[3] - bbox[1]) <= 160:
            break
        cn_size -= 8
    cn_font = font_at(cn_size)
    bbox = draw.textbbox((0, 0), company_name_clean, font=cn_font)
    cn_h = bbox[3] - bbox[1]
    text_x = cn_x0
    text_y = cn_y0 + ((cn_y1 - cn_y0) - cn_h) // 2 - bbox[1] - 30
    draw.text((text_x, text_y), company_name_clean, fill=GOLD, font=cn_font)
    # "Appartement's" subtekst onder bedrijfsnaam
    sub_font = font_at(50)
    sub_x = cn_x0 + 8
    sub_y = text_y + cn_h + 30
    draw.text((sub_x, sub_y), "Appartement's", fill=GOLD_LIGHT, font=sub_font)

    # 3) QR-CODE — overlay vers in de top-right zone (al gemaskeerd in STAP 0)
    qr_x0, qr_y0, qr_x1, qr_y1 = 1120, 160, 1395, 440
    # Gouden frame rond QR (vers tekenen)
    frame_thickness = 6
    draw.rectangle([qr_x0, qr_y0, qr_x1, qr_y1], outline=GOLD, width=frame_thickness)
    # Klein binnen-margin tussen frame en QR
    inner = 14
    # Nieuwe transparante QR (goud op plaat-zwart, naadloos met achtergrond)
    qr_box_size = qr_x1 - qr_x0 - 2 * inner  # ~257px
    qr = qrcode.QRCode(box_size=10, border=0, error_correction=qrcode.constants.ERROR_CORRECT_H)
    qr.add_data(kiosk_url)
    qr.make(fit=True)
    qr_pil = qr.make_image(fill_color=GOLD, back_color=PLATE_BLACK).convert("RGB")
    qr_resized = qr_pil.resize((qr_box_size, qr_box_size), PILImage.NEAREST)
    img.paste(qr_resized, (qr_x0 + inner, qr_y0 + inner))

    # Horizontale scheidingslijn boven HUIS-tekst (gouden lijn vers tekenen)
    div_y = 620
    draw.line([(180, div_y), (W - 180, div_y)], fill=GOLD, width=4)

    # 4) HUIS XX
    apt_clean = (apartment_number or "").strip()
    upper = apt_clean.upper()
    if upper.startswith("HUIS "):
        apt_clean = apt_clean[5:].strip()
    elif upper.startswith("APPARTEMENT "):
        apt_clean = apt_clean[12:].strip()
    headline = f"HUIS {apt_clean}".upper()
    huis_y0, huis_y1 = 660, 830
    # Auto-fit font
    huis_size = 200
    while huis_size > 80:
        huis_font = font_at(huis_size)
        bbox = draw.textbbox((0, 0), headline, font=huis_font)
        if (bbox[2] - bbox[0]) <= (W - 360):
            break
        huis_size -= 10
    huis_font = font_at(huis_size)
    bbox = draw.textbbox((0, 0), headline, font=huis_font)
    hw = bbox[2] - bbox[0]
    hh = bbox[3] - bbox[1]
    hx = (W - hw) // 2
    hy = huis_y0 + ((huis_y1 - huis_y0) - hh) // 2 - bbox[1]
    draw.text((hx, hy), headline, fill=GOLD, font=huis_font)

    # 5) ADRES (al gemaskeerd in STAP 0)
    addr_x0, addr_y0, addr_x1, addr_y1 = 240, 860, 1280, 940
    if address:
        addr_text = address
        addr_size = 56
        while addr_size > 24:
            addr_font = font_at(addr_size)
            bbox = draw.textbbox((0, 0), addr_text, font=addr_font)
            if (bbox[2] - bbox[0]) <= (addr_x1 - addr_x0 - 100):
                break
            addr_size -= 4
        addr_font = font_at(addr_size)
        bbox = draw.textbbox((0, 0), addr_text, font=addr_font)
        aw = bbox[2] - bbox[0]
        ah = bbox[3] - bbox[1]
        # Pin-icoon + tekst, samen gecentreerd
        pin_d = max(20, addr_size // 2)
        total_w = pin_d + 12 + aw
        start_x = (W - total_w) // 2
        addr_baseline_y = addr_y0 + ((addr_y1 - addr_y0) - ah) // 2 - bbox[1]
        # Pin tekenen (druppel-shape: cirkel + driehoek)
        pin_cx = start_x + pin_d // 2
        pin_cy = addr_baseline_y + ah // 2 - 4
        draw.ellipse(
            [pin_cx - pin_d // 2, pin_cy - pin_d // 2,
             pin_cx + pin_d // 2, pin_cy + pin_d // 2],
            fill=GOLD,
        )
        draw.polygon(
            [(pin_cx - pin_d // 3, pin_cy + pin_d // 4),
             (pin_cx + pin_d // 3, pin_cy + pin_d // 4),
             (pin_cx, pin_cy + pin_d)],
            fill=GOLD,
        )
        # Gat in pin
        hole_r = max(3, pin_d // 6)
        draw.ellipse(
            [pin_cx - hole_r, pin_cy - hole_r,
             pin_cx + hole_r, pin_cy + hole_r],
            fill=PLATE_BLACK,
        )
        # Adres tekst
        draw.text((start_x + pin_d + 12, addr_baseline_y), addr_text,
                  fill=GOLD_LIGHT, font=addr_font)

    # 6) PNG → PDF conversie. Behoud volledige resolutie, 3:2 landscape.
    pdf_buf = io.BytesIO()
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.utils import ImageReader
    SIZE_MAP = {
        "small":  (200, 133),
        "medium": (300, 200),
        "large":  (400, 267),
    }
    pw, ph = SIZE_MAP.get(size, SIZE_MAP["medium"])
    PAGE_W = pw * mm
    PAGE_H = ph * mm
    c = rl_canvas.Canvas(pdf_buf, pagesize=(PAGE_W, PAGE_H))
    c.setFillColor(colors.HexColor("#dcd6cd"))
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    out.seek(0)
    c.drawImage(ImageReader(out), 0, 0, PAGE_W, PAGE_H,
                preserveAspectRatio=True, anchor='c')
    c.showPage()
    c.save()
    pdf_buf.seek(0)
    return pdf_buf.getvalue()



# ---------------------------------------------------------------------------
# AI-powered "Luxury Gold Plaque" generator — gebruikt Gemini Nano Banana om
# de dynamische tekst in de template afbeelding te vervangen met behoud van
# het 3D-embossed gouden effect, lederen textuur en schroef-details.
# ---------------------------------------------------------------------------

async def _nano_banana_edit_plate(template_bytes: bytes, *, company_name: str,
                                  apartment_number: str, address: str,
                                  session_suffix: str = "") -> bytes:
    """Stuurt template + edit-instructies naar Gemini Nano Banana.

    Returns: edited PNG bytes (1536x1024).
    Raises: RuntimeError als generatie faalt of geen image teruggegeven wordt.
    """
    import os
    import base64
    import uuid
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY ontbreekt in environment")

    # Normaliseer huisnummer ("HUIS 7B" stijl)
    apt = (apartment_number or "").strip()
    upper = apt.upper()
    if upper.startswith("HUIS "):
        apt = apt[5:].strip()
    elif upper.startswith("APPARTEMENT "):
        apt = apt[12:].strip()
    huis_label = f"HUIS {apt}".upper() if apt else "HUIS"

    company_clean = (company_name or "").strip() or "Bedrijf"
    address_clean = (address or "").strip()

    # Prompt — uiterst expliciet zodat de AI alléén de tekst vervangt en
    # niet de hele compositie hertekent. Engels werkt het meest betrouwbaar.
    prompt = (
        "You are editing a luxury 3D-embossed gold-on-black house plaque. "
        "Keep the EXACT same composition, materials, lighting, leather texture, "
        "polished gold outer border, and the two metal screw heads in the "
        "bottom corners. "
        "CRITICAL — DO NOT REMOVE OR MODIFY THE LOGO: There is a large 3D "
        "embossed gold 'S-shaped house' logo on the LEFT side of the plaque "
        "(an S that doubles as a stylized house with a triangular roof and four "
        "small window squares inside). This logo MUST remain fully intact, in "
        "the same position, with the same 3D embossing and gold finish. Do not "
        "shrink it, move it, replace it with text, or remove it. "
        "Also keep the horizontal gold divider line below the QR area. "
        "Do NOT redesign the plaque. Only replace the text content as follows, "
        "preserving the same embossed gold typography (3D extruded letters with "
        "realistic highlights and shadows, matching the existing engraving "
        "depth):\n\n"
        f"1. Replace the large company-name text (currently 'Gopi') with: '{company_clean}'. "
        "If the company name is long, wrap it onto two lines so it stays inside "
        "the left-half region (must NOT cross to the right of approximately x=1050 "
        "in a 1536-wide image — the QR code on the right must remain clear).\n"
        f"2. Keep the smaller subtext 'Appartement\u2019s' directly underneath it.\n"
        f"3. Replace the large bottom heading (currently 'HUIS 7B') with: '{huis_label}'\n"
        f"4. Replace the address line with pin icon (currently 'Kewalbansingweg 7 B') with: "
        f"'{address_clean or 'Adres niet ingevuld'}'\n"
        "5. CRITICAL: Completely REMOVE both the existing QR code pattern AND its "
        "gold frame from the top-right area. In that entire region, render only "
        "the flat warm-black plaque background with the same leather/grain texture "
        "as the rest of the plaque — no QR pixels, no frame, no border, no "
        "rectangle, nothing. We will draw a new QR code with its own gold frame "
        "on top afterwards. Leave that ~340x310 px area in the top-right corner "
        "as a clean empty black surface.\n"
        "6. Keep the small 'Scan voor mijn huurportaal / Betalen \u00b7 Kwitanties \u00b7 Onderhoud melden' "
        "text under the QR exactly as it appears.\n\n"
        "Output: a single full-resolution photorealistic PNG of the edited plaque, "
        "identical aspect ratio and dimensions to the input (1536\u00d71024). "
        "No extra borders, no white margins, no captions."
    )

    image_b64 = base64.b64encode(template_bytes).decode("utf-8")

    # Retry tot 3x — Nano Banana faalt soms zonder fout (lege response).
    last_err: Exception | None = None
    for attempt in range(3):
        chat = LlmChat(
            api_key=api_key,
            session_id=f"plate-{uuid.uuid4().hex[:8]}{session_suffix}-{attempt}",
            system_message=(
                "You are a precision image editor that preserves source "
                "compositions while replacing only the specified text."
            ),
        )
        chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(
            modalities=["image", "text"]
        )
        msg = UserMessage(text=prompt, file_contents=[ImageContent(image_b64)])
        try:
            _text, images = await chat.send_message_multimodal_response(msg)
        except Exception as e:
            last_err = e
            continue
        if images:
            return base64.b64decode(images[0]["data"])
        last_err = RuntimeError("Nano Banana gaf geen afbeelding terug")

    raise last_err or RuntimeError("Nano Banana faalde na 3 pogingen")


async def luxury_plate_pdf_ai(*, tenant_name: str, apartment_number: str,
                              address: str, company_name: str,
                              kiosk_url: str, company_logo: bytes | None = None,
                              accent_hex: str = "#D4AF37",
                              size: str = "medium") -> bytes:
    """AI-versie van :func:`luxury_plate_pdf`. Gebruikt Gemini Nano Banana om
    de dynamische tekst in de template te vervangen met behoud van het
    3D-embossed gouden effect, en plakt vervolgens een echte scanbare QR-code
    over het door de AI gegenereerde QR-gebied (anders is de QR niet
    betrouwbaar scanbaar).
    """
    import os
    from PIL import Image as PILImage
    import qrcode

    template_path = "/app/backend/assets/qr-plate-template.png"
    if not os.path.exists(template_path):
        raise FileNotFoundError(f"QR plate template ontbreekt: {template_path}")
    with open(template_path, "rb") as f:
        template_bytes = f.read()

    # 1) AI-edit van de plaat
    edited_png = await _nano_banana_edit_plate(
        template_bytes,
        company_name=company_name,
        apartment_number=apartment_number,
        address=address,
    )

    # 2) Echte scanbare QR genereren en op het QR-gebied plakken.
    # Nano Banana kan geen pixel-perfecte scanbare QR-code garanderen, dus we
    # overlayen een echte QR op de bekende positie van het QR-frame. We maken
    # de mask-zone bewust groter dan het frame zodat eventuele AI-resten
    # (offset/groter getekende QR) volledig overschilderd worden.
    img = PILImage.open(io.BytesIO(edited_png)).convert("RGB")
    # Resize naar canonieke 1536x1024 voor consistente coördinaten.
    if img.size != (1536, 1024):
        img = img.resize((1536, 1024), PILImage.LANCZOS)

    from PIL import ImageDraw as _ImageDraw
    draw = _ImageDraw.Draw(img)

    GOLD = (212, 174, 92)
    PLATE_BLACK = (14, 13, 10)
    # QR-frame coördinaten in het template
    qr_x0, qr_y0, qr_x1, qr_y1 = 1120, 160, 1395, 440
    # STAP 2a: Mask het hele QR-gebied zwart (iets ruimer dan het frame zodat
    # eventueel AI-restant van frame/QR verdwijnt). We blijven binnen veilige
    # grenzen: rechts/onder dicht bij de plaquette-rand, links niet over de
    # bedrijfsnaam (die op 2 regels staat tot ~x=1060) heen.
    safety = 16
    mask_x0 = qr_x0 - safety
    mask_y0 = qr_y0 - safety
    mask_x1 = qr_x1 + safety
    mask_y1 = qr_y1 + safety
    draw.rectangle([mask_x0, mask_y0, mask_x1, mask_y1], fill=PLATE_BLACK)

    # STAP 2b: Teken zelf een 3D-achtig gouden frame op vaste coördinaten
    # zodat het altijd uitgelijnd is met de QR-overlay. Meerdere concentrische
    # lijnen met goud-tinten suggereren een bevel/emboss-effect.
    GOLD_LIGHT = (240, 210, 130)
    GOLD_DARK = (140, 110, 50)
    # 6px dik frame opgebouwd uit: 1px donker (buiten) + 4px goud + 1px licht (binnen)
    # buitenste donkere schaduwlijn
    draw.rectangle([qr_x0, qr_y0, qr_x1, qr_y1], outline=GOLD_DARK, width=1)
    # 4 goud-lijnen voor body
    for k in range(1, 5):
        draw.rectangle(
            [qr_x0 + k, qr_y0 + k, qr_x1 - k, qr_y1 - k],
            outline=GOLD, width=1,
        )
    # binnenste licht-goud hooglicht op boven + linkerrand (bevel boven-links)
    draw.line([(qr_x0 + 5, qr_y0 + 5), (qr_x1 - 5, qr_y0 + 5)],
              fill=GOLD_LIGHT, width=1)  # boven
    draw.line([(qr_x0 + 5, qr_y0 + 5), (qr_x0 + 5, qr_y1 - 5)],
              fill=GOLD_LIGHT, width=1)  # links
    # binnenste donker-goud op onder + rechterrand (schaduw onder-rechts)
    draw.line([(qr_x0 + 5, qr_y1 - 5), (qr_x1 - 5, qr_y1 - 5)],
              fill=GOLD_DARK, width=1)  # onder
    draw.line([(qr_x1 - 5, qr_y0 + 5), (qr_x1 - 5, qr_y1 - 5)],
              fill=GOLD_DARK, width=1)  # rechts
    # STAP 2c: De echte scanbare QR-code centreren binnen het mask-paneel.
    inner = 14
    qr_box_size = qr_x1 - qr_x0 - 2 * inner

    qr = qrcode.QRCode(box_size=10, border=0,
                       error_correction=qrcode.constants.ERROR_CORRECT_H)
    qr.add_data(kiosk_url)
    qr.make(fit=True)
    qr_pil = qr.make_image(fill_color=GOLD, back_color=PLATE_BLACK).convert("RGB")
    qr_resized = qr_pil.resize((qr_box_size, qr_box_size), PILImage.NEAREST)
    img.paste(qr_resized, (qr_x0 + inner, qr_y0 + inner))

    # 3) PNG → PDF (zelfde layout als de PIL-versie)
    pdf_buf = io.BytesIO()
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.utils import ImageReader
    # PDF-pagina exact 3:2 landschap formaat, configureerbare grootte.
    SIZE_MAP = {
        "small":  (200, 133),   # ~A5 landschap
        "medium": (300, 200),   # ~A4 landschap (default)
        "large":  (400, 267),   # ~A3 landschap
    }
    pw, ph = SIZE_MAP.get(size, SIZE_MAP["medium"])
    PAGE_W = pw * mm
    PAGE_H = ph * mm
    c = rl_canvas.Canvas(pdf_buf, pagesize=(PAGE_W, PAGE_H))
    c.setFillColor(colors.HexColor("#dcd6cd"))
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # Plaat volledig vullend (geen marges, hele pagina = de plaat-image,
    # ratio matcht exact 1536×1024 = 3:2 dus geen vervorming).
    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    out.seek(0)
    c.drawImage(ImageReader(out), 0, 0, PAGE_W, PAGE_H,
                preserveAspectRatio=True, anchor='c')
    c.showPage()
    c.save()
    pdf_buf.seek(0)
    return pdf_buf.getvalue()
