"""Payment gateway service (Mope + Uni5Pay stub).

Mope docs: https://api.mope.sr/integration/doc
- POST /api/shop/payment_request  body: {description, amount, order_id, currency, redirect_url}
- GET  /api/shop/payment_request/{id}
- Webhook: Mope POSTs {id} with Bearer auth (your token) when status changes.
  Statuses: open | scanned | unconfirmed | paid

Test tokens have `test_` prefix; in test mode the returned status depends on amount
(1.00 = open, 2.00 = scanned, 3.00 = unconfirmed, other = paid).

Uni5Pay: docs not available yet. Stub raises so UI shows "nog niet geconfigureerd".
"""
import httpx


class GatewayError(Exception):
    pass


MOPE_BASE = "https://api.mope.sr/api"


def _bearer_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


async def mope_create_payment_request(cfg: dict, *, description: str, amount: float,
                                      currency: str, order_id: str,
                                      redirect_url: str) -> dict:
    """Returns {id, url} on success."""
    token = (cfg.get("api_key") or "").strip()
    if not token:
        raise GatewayError("Mope API key ontbreekt")
    amount_cents = int(round(amount * 100))
    if amount_cents <= 0:
        raise GatewayError("Bedrag moet groter dan 0 zijn")
    payload = {
        "description": description[:120],
        "amount": amount_cents,
        "order_id": order_id[:120],
        "currency": currency,
        "redirect_url": redirect_url[:255],
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(f"{MOPE_BASE}/shop/payment_request",
                                  json=payload, headers=_bearer_headers(token))
    except (httpx.HTTPError, OSError) as e:
        raise GatewayError(f"Mope netwerk fout: {e}") from e
    if r.status_code >= 400:
        try:
            j = r.json()
            raise GatewayError(f"Mope fout ({r.status_code}): {j.get('message') or j.get('error') or r.text[:200]}")
        except ValueError:
            raise GatewayError(f"Mope fout ({r.status_code}): {r.text[:200]}")
    data = r.json()
    if not data.get("id") or not data.get("url"):
        raise GatewayError("Mope antwoord onvolledig (verwacht id + url)")
    return data


async def mope_get_payment_request(cfg: dict, provider_id: str) -> dict:
    token = (cfg.get("api_key") or "").strip()
    if not token:
        raise GatewayError("Mope API key ontbreekt")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{MOPE_BASE}/shop/payment_request/{provider_id}",
                                 headers=_bearer_headers(token))
    except (httpx.HTTPError, OSError) as e:
        raise GatewayError(f"Mope netwerk fout: {e}") from e
    if r.status_code == 404:
        raise GatewayError("Betaalverzoek niet (meer) gevonden bij Mope")
    if r.status_code >= 400:
        raise GatewayError(f"Mope fout ({r.status_code}): {r.text[:200]}")
    return r.json()


def is_mope_test_mode(cfg: dict) -> bool:
    token = (cfg.get("api_key") or "")
    return token.startswith("test_") or cfg.get("env") == "sandbox"


# ============== Uni5Pay (stub — docs not yet available) ==============
async def uni5pay_create_payment_request(cfg: dict, **_kwargs) -> dict:
    raise GatewayError(
        "Uni5Pay integratie nog niet geconfigureerd. "
        "Deel de API-documentatie en we activeren deze gateway."
    )


async def uni5pay_get_payment_request(cfg: dict, provider_id: str) -> dict:
    raise GatewayError("Uni5Pay integratie nog niet geconfigureerd.")


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
