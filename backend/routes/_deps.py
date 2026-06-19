"""Shared dependency-injection helpers voor route-modules.

Deze module wordt door server.py gevuld tijdens module-init (na de
declaratie van db, get_current_user, etc.). Route-modules importeren
hier vandaan i.p.v. uit server.py om circulaire imports te voorkomen.

Patroon:
    # in server.py, NA declaratie van db / get_current_user / etc:
    from routes import _deps
    _deps.db = db
    _deps.get_current_user = get_current_user
    _deps.get_kiosk_session = get_kiosk_session
    _deps.company_id_of = company_id_of
    _deps.scope = scope
"""

# Worden vanuit server.py gezet — placeholder Nones zodat IDE's de
# attribuut-toegang niet flaggen.
db = None
get_current_user = None
get_kiosk_session = None
company_id_of = None
scope = None
