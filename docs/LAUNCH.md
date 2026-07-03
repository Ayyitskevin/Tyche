# Launch kit

Everything between "the code is done" and "strangers pay monthly". Companion docs:
[`BILLING.md`](./BILLING.md) (Stripe), [`../SECURITY.md`](../SECURITY.md) (posture),
`scripts/deploy.sh` (one-command production deploy).

## 7-day launch checklist

### Day 1 — Infrastructure
- [ ] VPS (2 vCPU / 2 GB is plenty to start) with Docker + compose.
- [ ] Domain + DNS A/AAAA record → the VPS.
- [ ] `git clone && ./scripts/deploy.sh` → edit `.env.prod` (domain, admin email) → re-run.
- [ ] Verify: `https://<domain>` serves the terminal over TLS; register — first account is admin;
      `ADMIN` shows the dashboard; a second browser profile gets an isolated trial account.
- [ ] Snapshot/backup schedule for the `tyche-data` volume (it holds every customer's data).

### Day 2 — Billing
- [ ] Stripe account → product + $29/mo price → webhook endpoint
      (`https://<domain>/api/billing/webhook`) per [`BILLING.md`](./BILLING.md).
- [ ] `.env.prod`: `TYCHE_BILLING=stripe` + the three `STRIPE_*` keys → `./scripts/deploy.sh`.
- [ ] Test-mode dry run: register a throwaway → `ACCOUNT` → upgrade with card `4242 4242 4242 4242`
      → plan flips to Pro → cancel in the Stripe portal → paywall returns. Flip to live keys.

### Day 3 — Landing & measurement
- [ ] Publish `marketing/landing.html` (any static host, or your web root): swap
      `tyche.example.com` for your domain, point the CTAs at the app, add a real 1200×630 OG image
      (the `og:image` tags are placeholders).
- [ ] Publish Terms + Privacy from `marketing/legal/` (lawyer-reviewed, placeholders filled) at
      `/terms.html` and `/privacy.html` — the landing footer already links there. Required before
      taking payments.
- [ ] Privacy-friendly analytics (Plausible/GoatCounter class) on the landing page only.
- [ ] Set up a support email and put it in the landing footer.

### Day 4 — Content & proof
- [ ] Record a 60–90s demo: cold start → ⌘K → `AAPL GP` → `EQS` → `ALERT` → layouts. Speed IS the pitch.
- [ ] Write the launch post: the honest angle ("a terminal that doesn't resell market data —
      bring your own keys, or self-host it free") is the differentiator; lead with it.
- [ ] 5–10 screenshots for the landing page / posts.

### Day 5 — Soft launch
- [ ] 10–20 hand-picked traders/analysts get the link (DMs, small communities you're actually in).
- [ ] Watch `ADMIN` (signups, trials) + the audit log; fix the first-session papercuts same-day.
- [ ] Ask every early user the one question: "what did you look for that wasn't there?"

### Day 6 — Hardening from feedback
- [ ] Auth endpoints are rate-limited in-process (20/10min per IP) — add proxy-level limits at
      Caddy only if abuse outpaces that.
- [ ] Triage feedback: fix trial-killers now, backlog the rest as tickets (docs/roadmap/tickets).
- [ ] Verify backups actually restore (spin the volume snapshot up locally).
- [ ] Send the beta-invite email (template: `marketing/beta-invite-email.md`) to the next batch.

### Day 7 — Public launch
- [ ] Post where finance-tooling people already are (HN Show, r/algotrading tools threads,
      finance-dev Discords, X — thread ready at `marketing/launch-thread.md`). Self-host free +
      hosted trial is the whole funnel — no gate.
- [ ] Reply to every comment for 48h; the objection you'll hear most ("where's the data from?")
      is answered by the honest-positioning FAQ — link it.
- [ ] End of day: write down MRR, trials, activation rate from `ADMIN`. That's your baseline.

## Backup & restore

All tenant data — accounts, per-user workspaces/notes/alerts/portfolios, and the audit log —
lives in the `tyche-data` Docker volume. Losing it loses every paying customer, so back it up
**before** you take a single sign-up.

```bash
./scripts/backup.sh                 # → ./backups/tyche-<UTC>.tar.gz  (stops the API ~1s)
```

The API stops briefly for a consistent snapshot (graceful shutdown checkpoints the SQLite WAL
first), tars the whole volume, and restarts — even if the tar fails, so a backup never leaves the
service down. The snapshot captures both persistence backends (file or SQLite).

**Get a copy off the box.** A backup on the same disk dies with the disk. Copy each tarball to
object storage, e.g. nightly at 03:17:

```cron
17 3 * * *  cd /path/to/tyche && ./scripts/backup.sh && rclone copy ./backups remote:tyche-backups
```

**Restore** replaces the entire volume from a chosen tarball (everything newer is lost):

```bash
./scripts/restore.sh ./backups/tyche-20260703T031700Z.tar.gz
```

### Restore drill — run once before launch

Do not trust a backup you have never restored. On a **staging** box (or right after first deploy,
before any real users):

1. Register a throwaway account and make a change (add a watchlist, save a note).
2. `./scripts/backup.sh` — note the tarball.
3. Change something else (add another note) so the live state now differs from the backup.
4. `./scripts/restore.sh ./backups/<that tarball>` and type `restore` to confirm.
5. Sign in: the account and the step-2 change are present; the step-3 change is gone. The backup
   is now proven — schedule it.

## 30-day roadmap (weekly)

**Week 1 — Launch & listen (Days 1–7).** The checklist above. Goal: live deployment, working
Stripe loop, first 20 trials, a baseline funnel number. Ship nothing new; fix onboarding friction
same-day.

**Week 2 — Activation (Days 8–14).** Make trials stick: email verification + password reset
(the biggest auth gap), a `TOUR` replay of the welcome tour, argument-level autocomplete (FRED
series ids, screener fields), and one more role preset informed by what Week-1 users actually
opened first. Goal: >50% of trials return on day 2.

**Week 3 — Conversion (Days 15–21).** Make paying obvious: trial-ending email (day 11) + in-app
nudge beyond the chip, annual pricing (2 months free) as a second Stripe price, team mode
(closed-signup instance docs + seat count on ADMIN), and testimonial quotes on the landing page.
Goal: first 5 paying customers.

**Week 4 — Retention & moat (Days 22–30).** Make leaving expensive (honestly): scheduled
workspace-snapshot backups users can download, watchlist/journal CSV round-trip, a second
real data adapter chosen by user demand (SEC company-facts fundamentals is the likely winner),
and publish a public changelog. Goal: churn < 1 account, a shippable weekly-changelog habit,
and the next 30-day plan written from real usage data — not guesses.

### The viability math

At $29/mo: 35 subscribers ≈ $1k MRR — a strong signal for a solo product; 170 ≈ $5k MRR — a
living. The stack costs ~$20/mo to run at that scale (one VPS, Stripe fees aside) because there
are no per-seat data licensing costs — that's the point of bring-your-own-key. Every feature above
is retention/conversion work on an already-working loop, not table-stakes construction.
