# Privacy Policy — TEMPLATE

> **This is a starting template, not legal advice.** Have a lawyer review before launch (GDPR/CCPA
> applicability depends on your customers), replace every {{placeholder}}, publish as
> `/privacy.html`, and link it from the sign-up screen. Delete this banner.

**Effective date:** {{date}} · **Controller:** {{legal_name}}, {{support_email}}.

**What we collect.**
- *Account*: your email address and a salted hash of your password (never the password itself).
- *Product data you create*: workspaces, watchlists, notes, alerts, portfolios, preferences —
  stored in a per-account datastore isolated from other users.
- *Billing*: handled by Stripe; we store only Stripe customer/subscription identifiers, never card
  numbers.
- *Operational*: an audit log of significant account actions (sign-in, billing changes) and
  coarse last-active timestamps. {{analytics_disclosure — e.g. "Our landing page uses
  privacy-friendly analytics (no cookies, no cross-site tracking)."}}

**What we do NOT do.** We do not sell your data, show ads, track you across sites, or train
models on your research. Your API keys for data providers are used only to proxy your requests.

**Where it lives.** {{hosting_provider_and_region}}. Backups are encrypted and age out within
{{backup_retention_days}} days.

**Your rights.** Export everything (ACCOUNT → "Export my data" — works even after your plan
lapses) and delete your account irreversibly (ACCOUNT → "Delete account"). For anything else —
access, correction, complaints — email {{support_email}}; we respond within {{response_days}} days.

**Sub-processors.** Stripe (payments), {{hosting_provider}} (infrastructure),
{{email_provider_if_any}}.

**Changes.** Material changes announced by email at least {{notice_days}} days in advance.
