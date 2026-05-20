"""AI chat assistant using Emergent LLM key + Claude Sonnet 4.5."""
import os
from typing import List, Optional
from emergentintegrations.llm.chat import LlmChat, UserMessage

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
DEFAULT_MODEL = ("anthropic", "claude-sonnet-4-5-20250929")

SYSTEM_PROMPT = """Je bent een vriendelijke en behulpzame Nederlandse AI-assistent voor SuriRent N.V.,
een vastgoedbeheerder in Suriname. Je helpt beheerders met vragen over:
- Appartementen, huurders, en contracten
- Betalingen, facturen, kwitanties en openstaande huur
- Onderhoud, borgen en kasgeld
- Gebruik van de Kiosk terminal

Antwoord altijd in het Nederlands. Wees beknopt, professioneel en behulpzaam.
Als je context-data krijgt over appartementen, huurders of betalingen, gebruik deze om concrete antwoorden te geven.
Als je iets niet weet, zeg dat eerlijk en stel een vervolgvraag.
Gebruik bedragen met SRD/USD/EUR notatie en datums in Nederlandse formaat (dd-mm-yyyy)."""


def _summarize_context(ctx: dict) -> str:
    if not ctx:
        return ""
    lines = ["\n--- ACTUELE PORTEFEUILLE CONTEXT ---"]
    stats = ctx.get("stats", {})
    if stats:
        lines.append(
            f"Totaal: {stats.get('apartments_total',0)} appartementen "
            f"({stats.get('apartments_occupied',0)} bezet, "
            f"{stats.get('apartments_vacant',0)} vacant), "
            f"{stats.get('tenants_total',0)} huurders."
        )
        cur_data = stats.get("month_payments_by_currency", {})
        for cur, d in cur_data.items():
            lines.append(f"Inkomsten deze maand ({cur}): {d.get('total',0):.2f} ({d.get('count',0)} betalingen)")
    apts = ctx.get("apartments", [])
    if apts:
        lines.append("\nAppartementen:")
        for a in apts[:30]:
            lines.append(
                f"- {a.get('number')}: {a.get('rent_amount',0):.2f} {a.get('currency','SRD')}/maand · "
                f"{'bezet door ' + a.get('tenant_name', 'onbekend') if a.get('status') == 'occupied' else 'VACANT'}"
            )
    tenants = ctx.get("tenants_with_balance", [])
    if tenants:
        lines.append("\nHuurders met openstaande huur:")
        for t in tenants[:30]:
            lines.append(
                f"- {t.get('name')} (Appt. {t.get('apartment_number','—')}): "
                f"openstaand {t.get('balance',0):.2f} {t.get('currency','SRD')}"
            )
    return "\n".join(lines)


async def chat_send(session_id: str, message: str, history: List[dict], context: Optional[dict] = None) -> str:
    """Send message to LLM with history. history = [{role: 'user'|'assistant', text: '...'}, ...]"""
    if not EMERGENT_LLM_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY ontbreekt in omgeving")
    system = SYSTEM_PROMPT + _summarize_context(context or {})
    # Append last ~10 turns to system as conversation context (avoids expensive re-sends)
    if history:
        history_lines = ["\n--- VOORGAAND GESPREK ---"]
        for h in history[-10:]:
            role = "Gebruiker" if h.get("role") == "user" else "Assistent"
            history_lines.append(f"{role}: {h.get('text','')}")
        system += "\n" + "\n".join(history_lines)

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system,
    ).with_model(*DEFAULT_MODEL)
    response = await chat.send_message(UserMessage(text=message))
    return response if isinstance(response, str) else str(response)
