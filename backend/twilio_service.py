"""Twilio WhatsApp + SMS service.

Direct REST integration (no SDK) so credentials stay encrypted-at-rest per
company and decrypted only at send-time.

API reference:
  POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json
  Basic auth: AccountSid:AuthToken
  Form fields: From, To, Body, optional MediaUrl
"""
import httpx


class TwilioError(Exception):
    pass


TWILIO_API = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"


def _validate_number(num: str, kind: str) -> str:
    n = (num or "").strip()
    if not n:
        raise TwilioError(f"{kind} nummer is leeg")
    if kind == "whatsapp" and not n.startswith("whatsapp:"):
        n = "whatsapp:" + n
    # Allow + and digits and spaces in the actual number part
    return n


async def _send(cfg: dict, channel: str, to: str, body: str, media_url: str | None = None) -> dict:
    """Send a single message. channel = 'sms' or 'whatsapp'."""
    sid = (cfg.get("account_sid") or "").strip()
    token = (cfg.get("auth_token") or "").strip()
    if not sid or not token:
        raise TwilioError("Account SID of Auth Token ontbreekt")
    from_field = cfg.get("whatsapp_from") if channel == "whatsapp" else cfg.get("sms_from")
    from_field = _validate_number(from_field, channel)
    to_field = _validate_number(to, channel)
    if not body:
        raise TwilioError("Bericht is leeg")

    data = {"From": from_field, "To": to_field, "Body": body[:1500]}
    if media_url:
        data["MediaUrl"] = media_url

    url = TWILIO_API.format(sid=sid)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(url, data=data, auth=(sid, token))
    except (httpx.HTTPError, OSError) as e:
        raise TwilioError(f"Twilio netwerk fout: {e}") from e

    if r.status_code >= 400:
        # Twilio returns JSON {code, message, more_info, status}
        try:
            j = r.json()
            msg = j.get("message") or j.get("detail") or r.text
            code = j.get("code")
            raise TwilioError(f"Twilio fout ({code or r.status_code}): {msg}")
        except ValueError:
            raise TwilioError(f"Twilio fout ({r.status_code}): {r.text[:200]}")
    return r.json()


async def send_whatsapp(cfg: dict, to: str, body: str, media_url: str | None = None) -> dict:
    if not cfg.get("enabled"):
        raise TwilioError("Twilio is niet ingeschakeld")
    return await _send(cfg, "whatsapp", to, body, media_url)


async def send_sms(cfg: dict, to: str, body: str) -> dict:
    if not cfg.get("enabled"):
        raise TwilioError("Twilio is niet ingeschakeld")
    return await _send(cfg, "sms", to, body)
