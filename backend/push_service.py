"""Web Push notifications via VAPID."""
import os
import json
import base64
from pywebpush import webpush, WebPushException

# VAPID keys are stored as PEM (private base64-encoded) and uncompressed pubkey base64 (URL-safe).
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_PEM_B64 = os.environ.get("VAPID_PRIVATE_KEY_B64", "")
VAPID_CONTACT = os.environ.get("VAPID_CONTACT", "mailto:admin@vastgoed.sr")


def _private_pem() -> str:
    if not VAPID_PRIVATE_PEM_B64:
        raise RuntimeError("VAPID_PRIVATE_KEY_B64 not configured")
    return base64.b64decode(VAPID_PRIVATE_PEM_B64).decode()


def send_push(subscription: dict, title: str, body: str, data: dict | None = None) -> bool:
    """subscription = browser-provided PushSubscription dict (endpoint + keys)."""
    if not subscription or not subscription.get("endpoint"):
        return False
    payload = json.dumps({
        "title": title, "body": body, "data": data or {},
    })
    try:
        webpush(
            subscription_info=subscription,
            data=payload,
            vapid_private_key=_private_pem(),
            vapid_claims={"sub": VAPID_CONTACT},
        )
        return True
    except WebPushException as e:
        # Expired/invalid subscription returns 410. Caller should clean up.
        print(f"[push] WebPushException: {e}")
        return False
    except Exception as e:
        print(f"[push] Unexpected error: {e}")
        return False
