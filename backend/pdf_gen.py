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
