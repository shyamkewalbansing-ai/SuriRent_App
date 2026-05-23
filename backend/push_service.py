"""Web Push notifications via VAPID.

Belangrijk: pywebpush 2.3.0 verwacht `vapid_private_key` als ofwel een
Vapid01 instance, een file path, of een raw/DER string. PEM strings worden
NIET correct geparsed door de moderne `Vapid.from_string` (die assumeert
raw 32-byte of DER). Daarom laden we de PEM eenmaal naar een Vapid01
instance en gebruiken die voor elke push.
"""
import os
import json
import base64
from py_vapid import Vapid01
from pywebpush import webpush, WebPushException

VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_PEM_B64 = os.environ.get("VAPID_PRIVATE_KEY_B64", "")
VAPID_CONTACT = os.environ.get("VAPID_CONTACT", "mailto:admin@vastgoed.sr")

_vapid_instance = None


def _get_vapid() -> Vapid01:
    """Lazy-load + cache the VAPID instance from the base64-encoded PEM."""
    global _vapid_instance
    if _vapid_instance is not None:
        return _vapid_instance
    if not VAPID_PRIVATE_PEM_B64:
        raise RuntimeError("VAPID_PRIVATE_KEY_B64 not configured")
    pem_bytes = base64.b64decode(VAPID_PRIVATE_PEM_B64)
    _vapid_instance = Vapid01.from_pem(pem_bytes)
    return _vapid_instance


def send_push(subscription: dict, title: str, body: str, data: dict | None = None) -> bool:
    """Stuur een Web Push naar één subscription.

    Retourneert True bij succes, False bij elke fout. De caller verwijdert
    de subscription bij False (verlopen/ongeldig).
    """
    if not subscription or not subscription.get("endpoint"):
        return False
    payload = json.dumps({
        "title": title, "body": body, "data": data or {},
    })
    try:
        vv = _get_vapid()
        webpush(
            subscription_info=subscription,
            data=payload,
            vapid_private_key=vv,
            vapid_claims={"sub": VAPID_CONTACT},
        )
        return True
    except WebPushException as e:
        # 410 = expired, 4xx = bad request. Caller schoont op.
        status = e.response.status_code if e.response is not None else "n/a"
        print(f"[push] WebPushException status={status}: {str(e)[:200]}")
        return False
    except Exception as e:
        print(f"[push] Unexpected error: {type(e).__name__}: {e}")
        return False
