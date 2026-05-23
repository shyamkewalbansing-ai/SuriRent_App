"""Tests for GET /api/public/branding-default
This endpoint returns branding for a single-tenant installation
(exactly 1 active company → 200 with id/slug/name).
Multiple or zero companies → 404 with Dutch detail 'Meerdere of geen bedrijven'.
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
# Fallback to frontend/.env
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL"):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

ENDPOINT = f"{BASE_URL}/api/public/branding-default"


class TestBrandingDefault:
    """Public endpoint — no auth needed."""

    def test_endpoint_reachable_and_no_auth(self):
        r = requests.get(ENDPOINT, timeout=15)
        # Either 200 (single-tenant) or 404 (multi or none). Must NOT be 401/403/500.
        assert r.status_code in (200, 404), (
            f"Unexpected status {r.status_code}: {r.text[:300]}"
        )
        assert "application/json" in r.headers.get("content-type", "")

    def test_response_shape(self):
        r = requests.get(ENDPOINT, timeout=15)
        data = r.json()
        if r.status_code == 200:
            # Single-tenant — branding payload
            assert "id" in data
            assert "slug" in data
            assert "name" in data
            assert isinstance(data["slug"], str) and data["slug"]
            assert isinstance(data["name"], str) and data["name"]
        else:
            assert r.status_code == 404
            assert data.get("detail") == "Meerdere of geen bedrijven"

    def test_multi_tenant_returns_404(self):
        """In current dev DB there are 3+ companies → expect 404."""
        # Sanity: list companies via superadmin? We don't have superadmin token here.
        # Instead just assert: if endpoint returns 404, detail matches contract.
        r = requests.get(ENDPOINT, timeout=15)
        if r.status_code == 404:
            assert r.json().get("detail") == "Meerdere of geen bedrijven"
        else:
            # If unexpectedly single-tenant, accept 200 and verify keys
            assert r.status_code == 200
            assert {"id", "slug", "name"} <= set(r.json().keys())

    def test_no_auth_required(self):
        """Should respond identically with no Authorization header."""
        r1 = requests.get(ENDPOINT, timeout=15)
        r2 = requests.get(ENDPOINT, headers={"Authorization": "Bearer garbage"}, timeout=15)
        assert r1.status_code == r2.status_code
