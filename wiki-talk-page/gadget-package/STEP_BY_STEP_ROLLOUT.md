# ConvoWizard Gadget Rollout Runbook

This is the execution sequence for **testwiki technical validation first**, then **enwiki consensus and interface-admin handoff**.

Readiness gate status (2026-02-09):
- Privacy disclosure finalized and linked in proposal/description assets.
- Technical validation record completed in `gadget-package/testwiki-validation-checklist.md`.
- Security/compliance verification completed in `gadget-package/security-and-compliance-checklist.md`.

---

## A) Local preparation (your side)

### Step A1 - Finalize runtime source
- File to finalize: `wiki-talk-page/wiki-talk-page-script.js`
- Confirm:
  - talk-namespace/view-mode guard is present,
  - default debug noise is low,
  - no mixed-content calls (HTTPS only),
  - token persistence behavior is correct.

### Step A2 - Prepare gadget packet files
- Directory: `wiki-talk-page/gadget-package/`
- Required files and purpose:
  - `MediaWiki-Gadget-ConvoWizard.js` -> packaging pointer; canonical payload is `wiki-talk-page-script.js`
  - `MediaWiki-Gadget-ConvoWizard.css` -> gadget stylesheet
  - `MediaWiki-Gadget-ConvoWizard-description.wikitext` -> `MediaWiki:Gadget-ConvoWizard` text
  - `MediaWiki-Gadgets-definition.snippet.txt` -> exact definition line
  - `privacy-disclosure.md` -> external backend data disclosure
  - `security-and-compliance-checklist.md` -> audit and risk checklist
  - `testwiki-validation-checklist.md` -> test execution script
  - `enwiki-vpt-proposal.md` -> proposal text template
  - `interface-admin-handoff.md` -> post-consensus IA request packet

---

## B) Testwiki technical validation (not consensus)

### Step B1 - Publish testwiki gadget pages
Submit/update on testwiki:
1. `MediaWiki:Gadget-ConvoWizard.js` <- paste full contents of `wiki-talk-page/wiki-talk-page-script.js`
2. `MediaWiki:Gadget-ConvoWizard.css` <- paste `gadget-package/MediaWiki-Gadget-ConvoWizard.css`
3. `MediaWiki:Gadget-ConvoWizard` <- paste `gadget-package/MediaWiki-Gadget-ConvoWizard-description.wikitext`
4. `MediaWiki:Gadgets-definition` <- add line from `gadget-package/MediaWiki-Gadgets-definition.snippet.txt`

If you lack permissions, request temporary help at testwiki requests pages.

### Step B2 - Execute validation checklist
- Use: `gadget-package/testwiki-validation-checklist.md`
- Record date, tester, URLs, results, and open issues.

### Step B3 - Fix any blockers
- Apply local fixes in:
  - `wiki-talk-page/wiki-talk-page-script.js`
  - `wiki-extension-backend/server/__init__.py` (if origin/CORS issues)
- Re-run B1-B2 until clean.

---

## C) English Wikipedia consensus

### Step C1 - Publish proposal
- Destination: `Wikipedia:Village pump (technical)`
- Base text: `gadget-package/enwiki-vpt-proposal.md`
- Final privacy disclosure link: `https://en.wikipedia.org/wiki/User:Iamhamidrezaee/ConvoWizard_Privacy_Policy`

### Step C2 - Address feedback
- Common feedback areas:
  - external backend/privacy posture,
  - namespace scope,
  - user impact/performance,
  - maintenance ownership.
- Update proposal text as needed and keep changelog notes.

### Step C3 - Capture consensus signal
- Wait for clear support/no unresolved blocking objections before handoff.

---

## D) Interface-admin implementation handoff

### Step D1 - Send packet
- Use: `gadget-package/interface-admin-handoff.md`
- Include links to:
  - VPT discussion,
  - final privacy disclosure page,
  - exact payload sources in repo.

### Step D2 - Requested IA edits (enwiki)
- `MediaWiki:Gadget-ConvoWizard.js`
- `MediaWiki:Gadget-ConvoWizard.css`
- `MediaWiki:Gadget-ConvoWizard`
- `MediaWiki:Gadgets-definition`

---

## E) Put the ball in their court

After D1, your team should switch to waiting state:
- mark submitted request links,
- mark pending IA/community actions,
- avoid further behavioral changes unless requested by reviewers,
- keep a hotfix branch ready for narrowly scoped fixes.

Waiting-state checklist:
- VPT link recorded
- IA request link recorded
- Final payload revision/hash recorded
- Privacy page link recorded
- One designated maintainer/contact recorded
