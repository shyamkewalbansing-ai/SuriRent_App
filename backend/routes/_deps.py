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
    _deps.require_role = require_role
    _deps.saas_email = _saas_email
    _deps.iso = iso
    _deps.now_utc = now_utc
    _deps.new_id = new_id
"""

# Worden vanuit server.py gezet — placeholder Nones zodat IDE's de
# attribuut-toegang niet flaggen.
db = None
get_current_user = None
get_kiosk_session = None
company_id_of = None
scope = None
require_role = None       # server.require_role factory (role_or_roles -> Depends)
saas_email = None          # async (to_email, subject, body_html) -> bool
iso = None                 # datetime → ISO-string helper
now_utc = None             # aware datetime.now(timezone.utc) helper
new_id = None              # nieuwe UUID string
billing_summary = None     # (company_doc) -> {billing_status, monthly_amount, currency, ...}
is_online = None           # (last_seen_iso, threshold_seconds=300) -> bool
