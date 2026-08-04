"""Gedeelde test-fixtures. Alle credentials komen uit environment variables
met sensible defaults voor lokale dev — CI/CD kan ze overschrijven met echte
test-account secrets. Voorkomt dat productie-secrets ooit in git terechtkomen
(deze DEFAULTS zijn met opzet publiek en dienen ALLEEN voor preview/dev)."""
import os
import pytest
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")


def _env(key: str, default: str) -> str:
    v = os.environ.get(key)
    return v if v else default


@pytest.fixture(scope="session")
def test_credentials():
    """Return dict met alle test-account credentials, gelezen uit env-vars.
    Fallbacks matchen /app/memory/test_credentials.md — preview-only."""
    return {
        "admin": {
            "email": _env("TEST_ADMIN_EMAIL", "admin@vastgoed.sr"),
            "password": _env("TEST_ADMIN_PASSWORD", "admin123"),
        },
        "admin_b": {
            "email": _env("TEST_ADMIN_B_EMAIL", "adminb@test.sr"),
            "password": _env("TEST_ADMIN_B_PASSWORD", "adminb123"),
        },
        "superadmin": {
            "email": _env("TEST_SUPER_EMAIL", "super@surirent.sr"),
            "password": _env("TEST_SUPER_PASSWORD", "super123"),
        },
        "kiosk_pin": _env("TEST_KIOSK_PIN", "1234"),
    }


@pytest.fixture(scope="session")
def api_base():
    """De basis-URL van de te testen API, altijd inclusief `/api`."""
    base = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
    assert base, "REACT_APP_BACKEND_URL is required in env"
    return f"{base}/api"


# Module-level helpers voor tests die (nog) geen pytest fixtures gebruiken —
# ze hoeven dan alleen ADMIN_EMAIL/PW/etc. te importeren en zijn direct
# env-driven. Dit vervangt hardcoded strings in oude test-bestanden.
ADMIN_EMAIL = _env("TEST_ADMIN_EMAIL", "admin@vastgoed.sr")
ADMIN_PASSWORD = _env("TEST_ADMIN_PASSWORD", "admin123")
ADMIN_B_EMAIL = _env("TEST_ADMIN_B_EMAIL", "adminb@test.sr")
ADMIN_B_PASSWORD = _env("TEST_ADMIN_B_PASSWORD", "adminb123")
SUPER_EMAIL = _env("TEST_SUPER_EMAIL", "super@surirent.sr")
SUPER_PASSWORD = _env("TEST_SUPER_PASSWORD", "super123")
KIOSK_PIN = _env("TEST_KIOSK_PIN", "1234")
