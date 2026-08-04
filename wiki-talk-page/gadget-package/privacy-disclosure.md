# ConvoWizard External Backend Disclosure

Canonical on-wiki privacy page target:
`https://en.wikipedia.org/wiki/User:Iamhamidrezaee/ConvoWizard_Privacy_Policy`

Disclosure draft source page in this repository:
`gadget-package/User-Iamhamidrezaee-ConvoWizard-Privacy-Policy.wikitext`

## Data sent from gadget to backend
- Wikipedia username (`mw.config.get('wgUserName')`).
- Page URL (`location.href`).
- Discussion context text extracted from the current thread.
- Draft reply text while the user is typing (for `continue` scoring calls).
- Generated interaction IDs and token IDs.

## Data stored by backend (from code audit)
- The backend inserts action logs into the `actions` table including:
  - interaction id, token id, timestamps, URL, reply ids, and `text` payload.
- Token metadata is stored in `tokens` (username, token, timing/stage fields).

## Retention policy (current)
- Action-log records (`actions` table): retained until manual deletion by maintainers.
- Token metadata (`tokens` table): retained until manual deletion by maintainers.
- Hosting/proxy access logs (for example IP/user-agent, where collected): retained per host defaults, currently up to 30 days.

## Infrastructure-level data
- Standard web/server logs may include request metadata (such as IP address and user agent), depending on host/proxy configuration.

## Deletion request process
- Contact: `hr328@cornell.edu`
- Include:
  - Wikipedia username,
  - approximate UTC date/time window,
  - affected page URL(s), if available.
- Processing target: requests acknowledged as soon as practical and processed within 30 days.

## User control and opt-in
- Gadget remains opt-in (not default-enabled).
- Users can disable the gadget at any time from Preferences.
- Token can be cleared from user options by gadget logic when invalidated.
