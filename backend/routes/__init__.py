"""Routes package — modulaire APIRouters die door server.py worden
ingelad via app.include_router(). Doel: server.py modulariseren in
behapbare logische modules zonder runtime-gedrag te veranderen.

Patroon per module:
  - Define APIRouter met prefix die past binnen /api (server.py mount
    de hoofdapi onder /api).
  - Routes gebruiken dezelfde dependencies (get_current_user,
    get_kiosk_session, db, etc.) — module importeert deze uit een
    `_deps.py` om circulaire imports te voorkomen.
  - server.py importeert de router en doet `api.include_router(router)`.
"""
