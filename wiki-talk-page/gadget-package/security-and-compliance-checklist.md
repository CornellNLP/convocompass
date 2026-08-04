# ConvoWizard Security and Compliance Checklist

## Verified process facts (checked against Wikimedia docs)
- New enwiki gadget proposals belong at `Wikipedia:Village pump (technical)` (not the deprecated gadget proposals page).
- Gadget registration is done via:
  - `MediaWiki:Gadget-ConvoWizard.js`
  - `MediaWiki:Gadget-ConvoWizard.css`
  - `MediaWiki:Gadget-ConvoWizard` (description)
  - `MediaWiki:Gadgets-definition`
- Interface-protected pages require interface admins (or interface-protected edit requests).
- `mw.Api().saveOption(...)` / `action=options` is valid for `userjs-*` option persistence.
- Testwiki is appropriate for technical validation, but not a meaningful consensus venue.

## Runtime safety checks
- [x] Gadget only runs on `*.wikipedia.org`.
- [x] Gadget only runs on talk namespaces (`wgNamespaceNumber` odd).
- [x] Gadget only runs in `view` action.
- [x] Debug logging is off by default (enabled only with `?convowizardDebug=1`).
- [x] Avoided avoidable dynamic HTML writes (`textContent` used where HTML markup is not required).

## API + token checks
- [x] API base URL uses HTTPS.
- [x] Token stored under `userjs-convowizard-token`.
- [x] Invalid token path clears local + user-option token state.
- [x] Non-logged-in users exit early.

## Backend checks
- [x] CORS tightened to HTTPS Wikimedia origins in `wiki-extension-backend/server/__init__.py`, and route-level wildcard decorators removed from `wiki-extension-backend/server/extension.py` so app-level origin policy is enforced.
- [x] Added strict server-side origin guard (`before_request`) that rejects non-Wikimedia browser origins even if middleware configuration drifts.
- [x] Verified production endpoint TLS posture (TLS 1.3, valid cert for `craft.infosci.cornell.edu`, certificate validity window checked on 2026-02-09).
- [x] Added application-side rate-limiting guardrails for `/claim_token`, `/add_user`, `/view_users`, `/start`, `/continue`, `/submit`, and `/submit_feedback` in `wiki-extension-backend/server/extension.py`.
- [x] Deployment note captured: backend must be redeployed with this revision for origin/rate-limit controls to be active.

## Policy-risk checks (external backend)
- [x] Keep gadget opt-in only (no `default` flag in definition).
- [x] Publish clear privacy disclosure with data categories + retention + deletion contact.
- [x] Include external-backend disclosure in VPT proposal and gadget description page.
- [x] Prepare for community feedback requesting WMCS/WMF-hosted endpoint instead (covered in proposal/rollout notes).
