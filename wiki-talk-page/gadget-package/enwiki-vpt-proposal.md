== Proposal: New opt-in gadget "ConvoWizard" for talk-page drafting feedback ==

Hello all - we are proposing a new **opt-in** gadget, '''ConvoWizard''', for talk-page workflows.

=== What it does ===
ConvoWizard adds lightweight feedback in DiscussionTools reply/new-topic widgets:
- analyzes current thread context and draft reply text,
- shows pre-submit guidance aimed at reducing escalation,
- supports per-thread mute/unmute.

=== Scope and safety ===
- **Opt-in only** (not default-enabled).
- Runs only on talk namespaces in view mode.
- Uses MediaWiki ResourceLoader modules (`mediawiki.api`, `mediawiki.user`, `mediawiki.util`).
- Source and registration are intended for normal gadget pages (`MediaWiki:Gadget-ConvoWizard.js/.css`, `MediaWiki:Gadgets-definition`).

=== External backend disclosure ===
ConvoWizard currently calls an external Cornell-hosted HTTPS backend for scoring.  
Data sent includes context text, draft reply text, username, URL, and token/interaction metadata.
- Current retention/deletion policy is documented on the linked privacy page (including contact and request-processing window).

Privacy disclosure: [https://en.wikipedia.org/wiki/User:Iamhamidrezaee/ConvoWizard_Privacy_Policy User:Iamhamidrezaee/ConvoWizard_Privacy_Policy]

=== Why gadget instead of userscript ===
- Easier installation and maintenance via Preferences.
- Community visibility/auditability of code.
- Cleaner rollback/update path through interface-admin workflow.

=== Requested outcome ===
If there is support, we request interface-admin implementation of:
- `MediaWiki:Gadget-ConvoWizard.js`
- `MediaWiki:Gadget-ConvoWizard.css`
- `MediaWiki:Gadget-ConvoWizard`
- `MediaWiki:Gadgets-definition` registration line

Proposed definition snippet:
<pre>
* ConvoWizard[ResourceLoader|dependencies=mediawiki.api,mediawiki.user,mediawiki.util|namespaces=1,3,5,7,9,11,13,15,101,119,829]|ConvoWizard.js|ConvoWizard.css
</pre>

Thanks for feedback, especially on privacy language, scope boundaries, and deployment expectations.
