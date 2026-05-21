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
