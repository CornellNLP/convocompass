# Interface-Admin Handoff Packet

Use this after VPT consensus is established.

Privacy disclosure link to include in handoff:
`https://en.wikipedia.org/wiki/User:Iamhamidrezaee/ConvoWizard_Privacy_Policy`

## 1) Create/update gadget runtime page
Target: `MediaWiki:Gadget-ConvoWizard.js`  
Payload source in repo: `wiki-talk-page/wiki-talk-page-script.js`  
Packaging pointer: `wiki-talk-page/gadget-package/MediaWiki-Gadget-ConvoWizard.js`

## 2) Create/update gadget stylesheet page
Target: `MediaWiki:Gadget-ConvoWizard.css`  
Payload source in repo: `wiki-talk-page/gadget-package/MediaWiki-Gadget-ConvoWizard.css`

## 3) Create/update gadget description page
Target: `MediaWiki:Gadget-ConvoWizard`  
Payload source in repo: `wiki-talk-page/gadget-package/MediaWiki-Gadget-ConvoWizard-description.wikitext`

## 4) Register gadget definition
Target: `MediaWiki:Gadgets-definition`  
Insert (under appropriate section):

```text
* ConvoWizard[ResourceLoader|dependencies=mediawiki.api,mediawiki.user,mediawiki.util|namespaces=1,3,5,7,9,11,13,15,101,119,829]|ConvoWizard.js|ConvoWizard.css
```

## 5) Post-implementation verification
- Gadget visible at `Special:Gadgets`.
- Gadget appears in `Special:Preferences#mw-prefsection-gadgets`.
- Enabling gadget loads without JS errors on talk pages.
- Non-talk namespaces remain unaffected.

## Suggested edit summary
`Implementing ConvoWizard gadget per VPT consensus (JS/CSS/description/definition).`
