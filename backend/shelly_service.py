"""Shelly Cloud service.

Shelly Cloud API (1st gen "Gen1" devices like Shelly 1/Plus 1/Pro 1 use this endpoint):
  POST {server}/device/relay/control
    form: id=<device_id>&channel=<0|1>&turn=<on|off>&auth_key=<token>
  GET  {server}/device/status?id=<device_id>&auth_key=<token>
    returns relay state + power consumption (W) + energy (Wh)

Newer Shelly Gen2 devices use different endpoints, but cloud relay control
remains compatible via the same gateway in most cases.

The "server" is regional (shown in Shelly Cloud → Settings → Authorization),
typical: shelly-65-eu.shelly.cloud, shelly-cloud.shelly.cloud, etc.
"""
import httpx


class ShellyError(Exception):
    pass


def _server_url(cfg: dict) -> str:
    server = (cfg.get("server") or "shelly-cloud.shelly.cloud").strip()
    if not server.startswith(("http://", "https://")):
        server = "https://" + server
    return server.rstrip("/")


async def control_relay(cfg: dict, device_id: str, turn: str, channel: int = 0) -> dict:
    """turn = 'on' | 'off' | 'toggle'"""
    if not cfg.get("enabled"):
        raise ShellyError("Shelly is niet ingeschakeld")
    token = (cfg.get("cloud_token") or "").strip()
    if not token:
        raise ShellyError("Shelly Cloud token ontbreekt")
    if turn not in ("on", "off", "toggle"):
        raise ShellyError("turn moet 'on', 'off' of 'toggle' zijn")
    data = {"id": device_id, "channel": channel, "turn": turn, "auth_key": token}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(f"{_server_url(cfg)}/device/relay/control", data=data)
    except (httpx.HTTPError, OSError) as e:
        raise ShellyError(f"Shelly netwerk fout: {e}") from e
    if r.status_code >= 400:
        raise ShellyError(f"Shelly fout ({r.status_code}): {r.text[:200]}")
    try:
        j = r.json()
    except ValueError:
        raise ShellyError("Shelly antwoord niet leesbaar")
    if j.get("isok") is False:
        raise ShellyError(j.get("errors") or "Shelly weigerde commando")
    return j


async def device_status(cfg: dict, device_id: str) -> dict:
    """Returns parsed status with relay state + power + energy."""
    if not cfg.get("enabled"):
        raise ShellyError("Shelly is niet ingeschakeld")
    token = (cfg.get("cloud_token") or "").strip()
    if not token:
        raise ShellyError("Shelly Cloud token ontbreekt")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{_server_url(cfg)}/device/status",
                                 params={"id": device_id, "auth_key": token})
    except (httpx.HTTPError, OSError) as e:
        raise ShellyError(f"Shelly netwerk fout: {e}") from e
    if r.status_code >= 400:
        raise ShellyError(f"Shelly fout ({r.status_code}): {r.text[:200]}")
    try:
        raw = r.json()
    except ValueError:
        raise ShellyError("Shelly status niet leesbaar")
    if raw.get("isok") is False:
        raise ShellyError(raw.get("errors") or "Shelly status niet beschikbaar")
    data = raw.get("data", {}).get("device_status") or {}
    relays = data.get("relays") or [{}]
    meters = data.get("meters") or [{}]
    return {
        "online": bool(data.get("_dev_info", {}).get("ip") or data.get("cloud", {}).get("connected")),
        "ison": bool(relays[0].get("ison")),
        "power_w": float(meters[0].get("power", 0) or 0),
        "energy_wh": float(meters[0].get("total", 0) or 0),  # cumulative
        "raw": raw,
    }


async def list_devices(cfg: dict) -> list[dict]:
    """Used for the Test verbinding button — just fetch a directory of devices.
    The Shelly Cloud "list_devices" endpoint returns a dict keyed by device_id.
    """
    token = (cfg.get("cloud_token") or "").strip()
    if not token:
        raise ShellyError("Shelly Cloud token ontbreekt")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(f"{_server_url(cfg)}/interface/device/list",
                                  data={"auth_key": token})
    except (httpx.HTTPError, OSError) as e:
        raise ShellyError(f"Shelly netwerk fout: {e}") from e
    if r.status_code >= 400:
        raise ShellyError(f"Shelly fout ({r.status_code}): {r.text[:200]}")
    try:
        j = r.json()
    except ValueError:
        raise ShellyError("Shelly antwoord niet leesbaar")
    if j.get("isok") is False:
        raise ShellyError(j.get("errors") or "Shelly weigerde de aanvraag")
    return list((j.get("data", {}).get("devices") or {}).values())
