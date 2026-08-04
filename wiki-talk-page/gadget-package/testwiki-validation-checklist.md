# Testwiki Validation Record (Technical)

Test target: `https://test.wikipedia.org/`  
Purpose: validate technical readiness before enwiki proposal and IA handoff.

## A) Repository-backed validation (completed)

### Runtime scope and behavior
- [x] Gadget runtime restricted to Wikipedia host + talk namespaces + `view` action in `wiki-talk-page/wiki-talk-page-script.js`.
- [x] HTTPS-only backend endpoint configured in runtime (`SERVER` constant).
- [x] Default debug noise suppressed; debug enabled only with `?convowizardDebug=1`.

### Backend security controls
- [x] Strict origin guard implemented (`before_request`) to reject non-Wikimedia browser origins.
- [x] Flask-CORS origin allowlist restricted to HTTPS Wikimedia domains.
- [x] Route-level permissive CORS decorators removed.
- [x] Application-side rate limits added to all public extension endpoints.
- [x] Backend Python files compile without syntax errors.

### Policy and packaging artifacts
- [x] Gadget definition is opt-in (no `default` flag).
- [x] VPT proposal includes explicit external-backend disclosure and privacy link.
- [x] Gadget description page includes direct privacy link.
- [x] Privacy disclosure includes retention and deletion-request process.

## B) Live endpoint evidence (completed)

- [x] Production endpoint reachable over HTTPS.
- [x] TLS posture verified (TLS 1.3, valid certificate for `craft.infosci.cornell.edu`) on 2026-02-09.
- [x] Allowed-origin preflight behavior observed from `https://test.wikipedia.org`.

## C) On-wiki publication checks (to run at publish time)

These are execution steps, not blockers for proposal posting:

- Publish pages on testwiki:
  - `MediaWiki:Gadget-ConvoWizard.js`
  - `MediaWiki:Gadget-ConvoWizard.css`
  - `MediaWiki:Gadget-ConvoWizard`
  - `MediaWiki:Gadgets-definition` line
- Enable gadget in Preferences and run interactive UI checks in DiscussionTools reply widgets.
- Record screenshot evidence for enabled gadget behavior.

## Evidence log
- Date: 2026-02-09
- Tester: Codex validator pass
- Gadget revision/source hash: `d3cbdec` (repository HEAD during validation)
- Test page URLs:
  - `https://test.wikipedia.org/wiki/Main_Page`
  - `https://test.wikipedia.org/wiki/Special:Gadgets`
  - `https://test.wikipedia.org/w/api.php?action=query&titles=MediaWiki:Gadgets-definition&prop=revisions&rvprop=content&format=json&formatversion=2`
- Screenshots saved:
  - testwiki main page snapshot (`Browser View ID: 8aecf8`)
- Open issues:
  - Backend must be redeployed with this repository revision so strict origin/rate-limit controls are active in production.
  - On-wiki gadget pages are not yet published on testwiki (expected prior to IA deployment phase).
