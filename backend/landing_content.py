"""Landing-page content store.

Stored in MongoDB collection `landing_content` with two documents:
  - {"id": "_published"}  — what the public marketing landing page renders
  - {"id": "_draft"}      — superadmin's working copy until they "Publish"

Image uploads are stored in collection `landing_assets` with
  {"id": "<uuid>", "filename": "...", "content_type": "...", "data_b64": "..."}
and served back via /api/landing/asset/{id}.
"""

from typing import Any
from copy import deepcopy

DRAFT_ID = "_draft"
PUBLISHED_ID = "_published"

# Master content schema with defaults — mirrors the original hardcoded landing.
# Every field is editable in the SaaS Landing Editor.
LANDING_DEFAULTS: dict = {
    "brand": {
        "name": "SuriRent",
        "suffix": "N.V.",
        "logo_url": "/kiosk-icons/kiosk-512.png",
    },
    "nav": {
        "items": [
            {"label": "Installeer", "anchor": "install"},
            {"label": "Functies", "anchor": "features"},
            {"label": "Prijzen", "anchor": "pricing"},
            {"label": "Contact", "anchor": "contact"},
        ],
        "cta_label": "Inloggen / Kiosk",
    },
    "hero": {
        "eyebrow": "Nieuw in Suriname",
        "title_pre": "De complete",
        "title_highlight": "huurbeheer",
        "title_post": "oplossing voor vastgoed.",
        "subtitle": ("Beheer appartementen, huurders en huurbetalingen. "
                     "Met een selfservice Kiosk terminal voor huurders — "
                     "speciaal voor de Surinaamse markt."),
        "cta_primary": "Open Kiosk",
        "cta_secondary": "Beheerder login",
        "trust_badges": ["4-cijferige PIN", "Digitale kwitanties"],
        # Optional override image (URL). Empty = use built-in inline card mock.
        "preview_image_url": "",
        "preview_caption": "Selfservice Terminal",
        "preview_subcaption": "Appartement A1 · maart 2026",
        "preview_amount_label": "Huur maart 2026",
        "preview_amount_value": "SRD 5.000",
    },
    "stats": [
        {"value": "24/7", "label": "Kiosk beschikbaar"},
        {"value": "3", "label": "Valutas"},
        {"value": "5+", "label": "Kernfuncties"},
        {"value": "100%", "label": "Mobile-first"},
    ],
    "features_header": {
        "eyebrow": "Functies",
        "title": "Alles in één systeem,",
        "title_accent": "van kiosk tot kwitantie.",
        "subtitle": ("Bundel je vastgoedbeheer in één app. Geen losse tools "
                     "meer — alles verbonden en in het Nederlands."),
    },
    "features": [
        {"icon": "Receipt", "title": "Huurbeheer & Kwitanties",
         "desc": "Snel een betaling vastleggen met automatisch genummerde kwitanties.",
         "featured": False},
        {"icon": "ScanFace", "title": "Kiosk Terminal",
         "desc": ("Selfservice terminal met 4-cijferige PIN voor snelle "
                  "huurbetaling door huurders. De kern van SuriRent."),
         "featured": True},
        {"icon": "Wallet", "title": "Multi-valuta",
         "desc": "SRD, USD en EUR zij aan zij. Aparte saldi per valuta.",
         "featured": False},
        {"icon": "Users", "title": "Huurders & Appartementen",
         "desc": "Beheer huurders en koppel ze aan appartementen in één klik.",
         "featured": False},
        {"icon": "CreditCard", "title": "Meerdere betalingswijzen",
         "desc": "Contant, bank, Mope en SumUp — flexibele opties.",
         "featured": False},
        {"icon": "Building2", "title": "Appartement overzicht",
         "desc": "Centraal beheer met bezettingsgraad en huurinkomsten.",
         "featured": False},
        {"icon": "Shield", "title": "JWT Beveiliging",
         "desc": "Veilige login met JWT cookies en bcrypt wachtwoord-hashing.",
         "featured": False},
        {"icon": "Zap", "title": "Live saldo",
         "desc": "Bekijk direct openstaande huur en betalingsgeschiedenis.",
         "featured": False},
        {"icon": "Cpu", "title": "Snelle interface",
         "desc": "Mobile-first design, geoptimaliseerd voor tablet & telefoon.",
         "featured": False},
        {"icon": "Sparkles", "title": "Schoon dashboard",
         "desc": "Eén overzicht voor appartementen, huurders en betalingen.",
         "featured": False},
        {"icon": "Globe", "title": "Nederlandse interface",
         "desc": "Volledig in het Nederlands met EUR/USD/SRD formattering.",
         "featured": False},
    ],
    "pricing_header": {
        "eyebrow": "Prijzen",
        "title": "Eén prijs,",
        "title_accent": "geen verrassingen.",
        "subtitle": "Maandelijks opzegbaar. Geen setup-kosten. Geen verborgen fees.",
    },
    "pricing_starter": {
        "name": "Starter",
        "desc": "Voor kleinere vastgoedbeheerders.",
        "features": ["Tot 15 huurders", "Alle kernfuncties", "Digitale kwitanties",
                     "Mobile-first interface", "SRD/USD/EUR support", "Email support"],
        "cta": "Start met Starter",
    },
    "pricing_pro": {
        "name": "Professional",
        "desc": "Met Kiosk terminal en alle functies.",
        "features": ["Onbeperkt huurders", "Alles uit Starter",
                     "Kiosk terminal (4-cijferige PIN)",
                     "Geavanceerde rapportages", "Prioritaire WhatsApp support"],
        "cta": "Start met Professional",
    },
    "cta_section": {
        "eyebrow": "Klaar om te starten?",
        "title_line_1": "Automatiseer je vastgoedbeheer",
        "title_line_2": "vanaf vandaag.",
        "subtitle": "Open de Kiosk of log in als beheerder. Direct beschikbaar.",
        "cta_primary": "Naar Kiosk / Login",
        "whatsapp_number": "5978815993",
        "whatsapp_label": "WhatsApp ons",
    },
    "footer": {
        "tagline": "Lichte huurbeheer & kiosk oplossing. Speciaal voor Surinaamse vastgoedbedrijven.",
        "phone_display": "+597 881 5993",
        "phone_tel": "+5978815993",
        "email": "info@surirent.sr",
        "address": "Paramaribo, Suriname",
        "copyright_text": "SuriRent N.V. Alle rechten voorbehouden.",
        "made_in_label": "Gemaakt in",
        "made_in_country": "Suriname",
        "links": [
            {"label": "Inloggen / PIN", "kind": "login"},
            {"label": "Mijn huurportaal", "kind": "tenant_portal"},
            {"label": "Prijzen", "kind": "anchor", "anchor": "pricing"},
            {"label": "Functies", "kind": "anchor", "anchor": "features"},
        ],
    },
}


def deep_merge(base: dict, override: Any) -> dict:
    """Recursively merge override on top of base. Override-only dicts merged key-by-key.
    Lists and primitives are replaced wholesale by override (so editor can shrink lists)."""
    if not isinstance(override, dict) or not isinstance(base, dict):
        return deepcopy(override) if override is not None else deepcopy(base)
    out = {}
    keys = set(base.keys()) | set(override.keys())
    for k in keys:
        if k in override and isinstance(base.get(k), dict) and isinstance(override[k], dict):
            out[k] = deep_merge(base[k], override[k])
        elif k in override:
            out[k] = deepcopy(override[k])
        else:
            out[k] = deepcopy(base[k])
    return out


def merge_with_defaults(stored: dict | None) -> dict:
    """Return a content document with defaults applied for any missing fields."""
    return deep_merge(LANDING_DEFAULTS, (stored or {}).get("content") if stored else {})


# Whitelist of lucide-react icons that the editor exposes for features.
# Keep small so the editor remains a curated picker, not a free-text field.
ALLOWED_FEATURE_ICONS = [
    "Receipt", "ScanFace", "Wallet", "Users", "CreditCard", "Building2",
    "Shield", "Zap", "Cpu", "Sparkles", "Globe", "Phone", "Mail", "MapPin",
    "ChevronRight", "ArrowRight", "Check", "Star", "Clock", "MessageCircle",
    "Smartphone", "Home", "Calendar", "Lock", "Bell", "Settings", "FileText",
]
