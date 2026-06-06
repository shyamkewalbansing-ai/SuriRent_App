"""Payment gateway service (Uni5Pay primary + SumUp for EUR).

Uni5Pay docs: https://payment.uni5pay.sr/api/v1/
- POST /api/v1/transactions  body: {description, amount, order_id, currency, redirect_url}
  Returns: {id, url, qr_url}  (url = hosted payment page; qr_url = direct QR image)
- GET  /api/v1/transactions/{id}
- Webhook: Uni5Pay POSTs {id, status} with Bearer auth when status changes.
  Statuses: open | scanned | paid | expired

CURRENT STATE: Uni5Pay implementatie is een MOCK die een fake payment URL
+ QR teruggeeft. Vervang de UNI5PAY_BASE + endpoints zodra de echte API
credentials beschikbaar zijn. De Mope-functies hieronder zijn aliassen die
naar Uni5Pay delegeren — dit voorkomt breken van bestaande database records
(provider="mope") en webhooks tijdens de migratie.
"""
import os
import uuid
import httpx


class GatewayError(Exception):
    pass


# ============== Uni5Pay (MOCK — vervang zodra echte API live is) ==============
UNI5PAY_BASE = os.environ.get("UNI5PAY_BASE", "https://payment.uni5pay.sr/api/v1")
UNI5PAY_MOCK = os.environ.get("UNI5PAY_MOCK", "1") not in ("0", "false", "False", "")


def _bearer_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


async def uni5pay_create_payment_request(cfg: dict, *, description: str, amount: float,
                                         currency: str, order_id: str,
                                         redirect_url: str) -> dict:
    """Create a Uni5Pay payment request.

    Returns {id, url, qr_url} on success.
    In MOCK mode (default during integration) returns a synthetic payment URL
    that the kiosk can display together with a QR. Webhook is simulated by the
    /api/payments/mock-complete/{id} endpoint (zie server.py).
    """
    if amount <= 0:
        raise GatewayError("Bedrag moet groter dan 0 zijn")

    if UNI5PAY_MOCK or not (cfg.get("api_key") or "").strip():
        # Mock-mode: genereer een fake payment URL + QR data.
        mock_id = f"u5p_mock_{uuid.uuid4().hex[:16]}"
        # De URL wijst naar een Mock Pay pagina (geserveerd door de backend).
        # Klanten zien hier een grote QR + "Markeer als betaald" knop.
        payment_url = f"{redirect_url.split('?')[0].rsplit('/', 1)[0]}/mock-pay/{mock_id}"
        return {
            "id": mock_id,
            "url": payment_url,
            "qr_url": payment_url,  # zelfde URL — kiosk encodet hem als QR
            "mock": True,
        }

    # ===== Echte Uni5Pay API call (klaar voor productie) =====
    token = (cfg.get("api_key") or "").strip()
    amount_cents = int(round(amount * 100))
    payload = {
        "description": description[:120],
        "amount": amount_cents,
        "order_id": order_id[:120],
        "currency": currency,
        "redirect_url": redirect_url[:255],
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(f"{UNI5PAY_BASE}/transactions",
                                  json=payload, headers=_bearer_headers(token))
    except (httpx.HTTPError, OSError) as e:
        raise GatewayError(f"Uni5Pay netwerk fout: {e}") from e
    if r.status_code >= 400:
        try:
            j = r.json()
            raise GatewayError(f"Uni5Pay fout ({r.status_code}): {j.get('message') or j.get('error') or r.text[:200]}")
        except ValueError:
            raise GatewayError(f"Uni5Pay fout ({r.status_code}): {r.text[:200]}")
    data = r.json()
    if not data.get("id") or not data.get("url"):
        raise GatewayError("Uni5Pay antwoord onvolledig (verwacht id + url)")
    return data


async def uni5pay_get_payment_request(cfg: dict, provider_id: str) -> dict:
    """Status check. In mock-mode geeft 'paid' terug zodra een mock-callback
    is binnengekomen, anders 'open'."""
    if UNI5PAY_MOCK or not (cfg.get("api_key") or "").strip():
        # Status wordt door server.py beheerd via in-memory dict; deze functie
        # is een no-op in mock-mode (server.py update zelf de DB record).
        return {"id": provider_id, "status": "open", "mock": True}

    token = (cfg.get("api_key") or "").strip()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{UNI5PAY_BASE}/transactions/{provider_id}",
                                 headers=_bearer_headers(token))
    except (httpx.HTTPError, OSError) as e:
        raise GatewayError(f"Uni5Pay netwerk fout: {e}") from e
    if r.status_code == 404:
        raise GatewayError("Betaalverzoek niet (meer) gevonden bij Uni5Pay")
    if r.status_code >= 400:
        raise GatewayError(f"Uni5Pay fout ({r.status_code}): {r.text[:200]}")
    return r.json()


def is_uni5pay_test_mode(cfg: dict) -> bool:
    if UNI5PAY_MOCK:
        return True
    token = (cfg.get("api_key") or "")
    return token.startswith("test_") or cfg.get("env") == "sandbox"


# ============== Mope (DEPRECATED — aliassen naar Uni5Pay) ==============
# Deze functies blijven bestaan voor backward compatibility met:
# 1) Bestaande DB records die `provider: "mope"` opgeslagen hebben
# 2) Bestaande webhook URLs `/api/webhooks/mope` en `/api/webhooks/mope-saas`
# 3) Imports verspreid door server.py (140+ refs) — geleidelijke migratie
#
# Nieuwe code MOET de uni5pay_* functies gebruiken. Mope wordt in de UI
# nergens meer getoond — alle labels zeggen "Uni5Pay".
MOPE_BASE = UNI5PAY_BASE  # alias voor oude code paden


async def mope_create_payment_request(cfg: dict, **kwargs) -> dict:
    """DEPRECATED alias — delegeert naar uni5pay_create_payment_request."""
    return await uni5pay_create_payment_request(cfg, **kwargs)


async def mope_get_payment_request(cfg: dict, provider_id: str) -> dict:
    """DEPRECATED alias — delegeert naar uni5pay_get_payment_request."""
    return await uni5pay_get_payment_request(cfg, provider_id)


def is_mope_test_mode(cfg: dict) -> bool:
    """DEPRECATED alias — delegeert naar is_uni5pay_test_mode."""
    return is_uni5pay_test_mode(cfg)


# ============== SumUp Hosted Online Checkout (EUR) ==============
SUMUP_BASE = "https://api.sumup.com"


async def sumup_create_checkout(cfg: dict, *, description: str, amount_eur: float,
                                checkout_reference: str, redirect_url: str,
                                return_url: str) -> dict:
    """Create a SumUp Hosted Checkout for EUR payments.

    Returns the full checkout JSON, including `id`, `status`, and `hosted_checkout_url`.
    See: https://developer.sumup.com/online-payments/checkouts/hosted-checkout/
    """
    api_key = (cfg.get("api_key") or "").strip()
    merchant_code = (cfg.get("merchant_code") or "").strip()
    if not api_key:
        raise GatewayError("SumUp API key ontbreekt — configureer onder SaaS Instellingen.")
    if not merchant_code:
        raise GatewayError("SumUp merchant code ontbreekt — configureer onder SaaS Instellingen.")
    if amount_eur <= 0:
        raise GatewayError("Bedrag moet groter dan 0 zijn")
    payload = {
        "merchant_code": merchant_code,
        "amount": round(float(amount_eur), 2),
        "currency": "EUR",
        "checkout_reference": checkout_reference[:120],
        "description": description[:120],
        "redirect_url": redirect_url[:255],
        "return_url": return_url[:255],
        "hosted_checkout": {"enabled": True},
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(f"{SUMUP_BASE}/v0.1/checkouts", json=payload, headers=headers)
    except (httpx.HTTPError, OSError) as e:
        raise GatewayError(f"SumUp netwerk fout: {e}") from e
    if r.status_code >= 400:
        try:
            j = r.json()
            msg = j.get("message") or j.get("error_message") or j.get("error") or r.text[:200]
            raise GatewayError(f"SumUp fout ({r.status_code}): {msg}")
        except ValueError:
            raise GatewayError(f"SumUp fout ({r.status_code}): {r.text[:200]}")
    data = r.json()
    if not data.get("id"):
        raise GatewayError("SumUp antwoord onvolledig (verwacht id)")
    # Hosted Checkout URL is what the user is redirected to
    if not data.get("hosted_checkout_url"):
        raise GatewayError("SumUp gaf geen hosted_checkout_url terug (Hosted Checkout staat mogelijk uit)")
    return data


async def sumup_get_checkout(cfg: dict, checkout_id: str) -> dict:
    api_key = (cfg.get("api_key") or "").strip()
    if not api_key:
        raise GatewayError("SumUp API key ontbreekt")
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{SUMUP_BASE}/v0.1/checkouts/{checkout_id}", headers=headers)
    except (httpx.HTTPError, OSError) as e:
        raise GatewayError(f"SumUp netwerk fout: {e}") from e
    if r.status_code == 404:
        raise GatewayError("Checkout niet (meer) gevonden bij SumUp")
    if r.status_code >= 400:
        raise GatewayError(f"SumUp fout ({r.status_code}): {r.text[:200]}")
    return r.json()


def is_sumup_test_mode(cfg: dict) -> bool:
    """SumUp uses sandbox merchant accounts; consumers can flag test_mode in config."""
    return bool(cfg.get("test_mode"))
