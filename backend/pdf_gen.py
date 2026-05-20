"""PDF generation helpers using ReportLab."""
import io
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
)

ORANGE = colors.HexColor("#FF5C00")
DARK = colors.HexColor("#1a1a1a")
MUTED = colors.HexColor("#6b7280")
LIGHT = colors.HexColor("#f5f5f5")


def _styles():
    base = getSampleStyleSheet()
    base.add(ParagraphStyle(
        name="H1Orange", parent=base["Heading1"],
        fontSize=22, textColor=DARK, spaceAfter=4, leading=26,
    ))
    base.add(ParagraphStyle(
        name="Sub", parent=base["Normal"],
        fontSize=9, textColor=MUTED, spaceAfter=12,
    ))
    base.add(ParagraphStyle(
        name="SectionHead", parent=base["Heading3"],
        fontSize=10, textColor=ORANGE, spaceAfter=6,
        textTransform="uppercase", fontName="Helvetica-Bold",
    ))
    base.add(ParagraphStyle(
        name="Body", parent=base["Normal"], fontSize=10, leading=14,
    ))
    base.add(ParagraphStyle(
        name="Small", parent=base["Normal"], fontSize=8, textColor=MUTED,
    ))
    return base


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


def _build(doc_elements):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=20 * mm, bottomMargin=20 * mm)
    doc.build(doc_elements)
    buf.seek(0)
    return buf.getvalue()


# ============== Receipt PDF ==============
def receipt_pdf(payment: dict) -> bytes:
    s = _styles()
    el = []
    _header(el, s, "Kwitantie", f"Nr. {payment['receipt_number']}")
    el.append(Paragraph("Betaling ontvangen", s["SectionHead"]))
    el.append(Spacer(1, 4))
    period = ""
    if payment.get("period_month") and payment.get("period_year"):
        months = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"]
        period = f"{months[payment['period_month'] - 1]} {payment['period_year']}"
    rows = [
        ("Kwitantienummer", payment["receipt_number"]),
        ("Datum", datetime.fromisoformat(payment["paid_at"].replace("Z", "+00:00")).strftime("%d-%m-%Y %H:%M")),
        ("Huurder", payment.get("tenant_name", "")),
        ("Appartement", payment.get("apartment_number", "—")),
        ("Categorie", payment.get("category", "").capitalize()),
        ("Periode", period),
        ("Betaalwijze", payment.get("method", "").capitalize()),
        ("Bedrag", f"{payment['currency']} {payment['amount']:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")),
    ]
    el.append(_kv_table(rows))
    el.append(Spacer(1, 16))
    if payment.get("note"):
        el.append(Paragraph("<b>Notitie:</b> " + payment["note"], s["Body"]))
        el.append(Spacer(1, 12))
    el.append(Paragraph("Dit is een officiële kwitantie. Bewaar deze voor uw administratie.", s["Small"]))
    el.append(Spacer(1, 30))
    el.append(Paragraph("___________________________", s["Body"]))
    el.append(Paragraph("Handtekening / Stempel", s["Small"]))
    return _build(el)


# ============== Contract PDF ==============
def contract_pdf(contract: dict, tenant: dict, apartment: dict) -> bytes:
    s = _styles()
    el = []
    _header(el, s, "Huurovereenkomst", f"Nr. {contract.get('contract_number', '')}")
    el.append(Paragraph("Partijen", s["SectionHead"]))
    el.append(_kv_table([
        ("Verhuurder", contract.get("landlord", "SuriRent N.V.")),
        ("Huurder", tenant.get("name", "")),
        ("Telefoon", tenant.get("phone", "")),
        ("E-mail", tenant.get("email", "")),
    ]))
    el.append(Spacer(1, 14))
    el.append(Paragraph("Object", s["SectionHead"]))
    el.append(_kv_table([
        ("Appartement", apartment.get("number", "")),
        ("Adres", apartment.get("address", "")),
        ("Beschrijving", apartment.get("description", "—")),
    ]))
    el.append(Spacer(1, 14))
    el.append(Paragraph("Voorwaarden", s["SectionHead"]))
    el.append(_kv_table([
        ("Maandhuur", f"{apartment.get('currency','SRD')} {apartment.get('rent_amount',0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")),
        ("Borg", f"{contract.get('deposit_amount',0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") + f" {apartment.get('currency','SRD')}"),
        ("Startdatum", contract.get("start_date", "")),
        ("Einddatum", contract.get("end_date", "Onbepaalde tijd")),
        ("Betaaldag", f"{contract.get('payment_day', 1)}e van de maand"),
    ]))
    el.append(Spacer(1, 14))
    el.append(Paragraph("Algemene bepalingen", s["SectionHead"]))
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
    el.append(Spacer(1, 24))

    # Signature block
    signed = contract.get("signed_at")
    if signed:
        el.append(Paragraph("<b>Digitaal ondertekend</b>", s["Body"]))
        el.append(_kv_table([
            ("Ondertekend door", contract.get("signed_by", tenant.get("name", ""))),
            ("Datum", datetime.fromisoformat(signed.replace("Z", "+00:00")).strftime("%d-%m-%Y %H:%M")),
            ("IP-adres", contract.get("signed_ip", "—")),
        ]))
    else:
        el.append(Paragraph("Handtekening huurder:", s["Body"]))
        el.append(Spacer(1, 20))
        el.append(Paragraph("___________________________", s["Body"]))
    return _build(el)


# ============== Invoice PDF ==============
def invoice_pdf(invoice: dict, tenant: dict, apartment: dict, payments: list) -> bytes:
    s = _styles()
    el = []
    _header(el, s, "Factuur", f"Nr. {invoice.get('invoice_number','')}")
    el.append(_kv_table([
        ("Factuurdatum", invoice.get("created_at", "")),
        ("Huurder", tenant.get("name", "")),
        ("Appartement", apartment.get("number", "")),
        ("Periode", f"{invoice.get('period_month','')}/{invoice.get('period_year','')}"),
    ]))
    el.append(Spacer(1, 14))
    el.append(Paragraph("Specificatie", s["SectionHead"]))
    data = [["Omschrijving", "Bedrag"]]
    data.append([
        f"Maandhuur appartement {apartment.get('number','')}",
        f"{apartment.get('currency','SRD')} {invoice.get('amount',0):,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
    ])
    t = Table(data, colWidths=[120 * mm, 50 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ORANGE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, MUTED),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    el.append(t)
    el.append(Spacer(1, 16))
    # Totals
    total = invoice.get("amount", 0)
    paid = sum(p.get("amount", 0) for p in payments)
    due = max(total - paid, 0)
    el.append(_kv_table([
        ("Totaal", f"{apartment.get('currency','SRD')} {total:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")),
        ("Reeds betaald", f"{apartment.get('currency','SRD')} {paid:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")),
        ("Te betalen", f"{apartment.get('currency','SRD')} {due:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")),
    ]))
    el.append(Spacer(1, 20))
    el.append(Paragraph(
        "Gelieve dit bedrag binnen 14 dagen te voldoen via de kiosk of bankoverschrijving.",
        s["Small"]
    ))
    return _build(el)


# ============== Deposit refund PDF ==============
def deposit_refund_pdf(deposit: dict, tenant: dict, apartment: dict) -> bytes:
    s = _styles()
    el = []
    _header(el, s, "Borg restitutie", f"Nr. {deposit.get('id','')[:8].upper()}")
    el.append(_kv_table([
        ("Huurder", tenant.get("name", "")),
        ("Appartement", apartment.get("number", "—")),
        ("Borg ontvangen", deposit.get("created_at", "")),
        ("Borg restitutie", deposit.get("refunded_at", "")),
        ("Borgbedrag", f"{deposit.get('currency','SRD')} {deposit.get('amount',0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")),
        ("Aftrek", f"{deposit.get('currency','SRD')} {deposit.get('deduction',0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")),
        ("Terugbetaald", f"{deposit.get('currency','SRD')} {deposit.get('refund_amount',0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")),
    ]))
    if deposit.get("refund_note"):
        el.append(Spacer(1, 12))
        el.append(Paragraph("<b>Toelichting aftrek</b>", s["SectionHead"]))
        el.append(Paragraph(deposit["refund_note"], s["Body"]))
    el.append(Spacer(1, 24))
    el.append(Paragraph("___________________________", s["Body"]))
    el.append(Paragraph("Handtekening voor ontvangst", s["Small"]))
    return _build(el)


# ============== Payslip PDF ==============
def payslip_pdf(salary: dict, employee: dict) -> bytes:
    s = _styles()
    el = []
    months = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"]
    period_label = ""
    if salary.get("period_month") and salary.get("period_year"):
        period_label = f"{months[salary['period_month'] - 1]} {salary['period_year']}"
    _header(el, s, "Loonstrook", period_label)
    el.append(_kv_table([
        ("Werknemer", employee.get("name", "")),
        ("Functie", employee.get("role", "—")),
        ("Periode", period_label),
        ("Uitbetaald op", salary.get("paid_at", "")),
    ]))
    el.append(Spacer(1, 14))
    el.append(Paragraph("Loonspecificatie", s["SectionHead"]))
    data = [["Omschrijving", "Bedrag"]]
    cur = salary.get("currency", "SRD")
    rows = [
        ("Bruto salaris", salary.get("gross", 0)),
        ("Voorschotten", -salary.get("advance", 0)),
        ("Inhoudingen", -salary.get("deductions", 0)),
    ]
    for label, amt in rows:
        data.append([label, f"{cur} {amt:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")])
    data.append(["Netto uitbetaald", f"{cur} {salary.get('net',0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")])
    t = Table(data, colWidths=[120 * mm, 50 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ORANGE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), LIGHT),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, MUTED),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    el.append(t)
    if salary.get("note"):
        el.append(Spacer(1, 12))
        el.append(Paragraph("<b>Notitie:</b> " + salary["note"], s["Body"]))
    return _build(el)
