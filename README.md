# Synapse Pip (on-page helper for claude.ai)

Pip is a small parrot that sits on the claude.ai message box. While you type it can suggest
experts; its bubble adds Synapse commands (like `+stats consult` or `#reviewer`) to the start
of your message. **It never sends anything and makes no network requests.**

This repo is published automatically — do not edit it by hand. Source and docs live in the
private Synapse plugin repo (`extras/pip-userscript/`, ADR 0009).

## Install (Chrome)
1. Install **Tampermonkey** from the Chrome Web Store.
2. Right-click the Tampermonkey icon → **Manage extension** → turn on **Allow User Scripts**
   (older Chrome: turn on Developer mode on `chrome://extensions`).
3. Open the raw file `synapse-pip.user.js` in this repo → Tampermonkey shows **Install** → click it.
4. Optional, for every computer: Tampermonkey Dashboard → Settings → **Script Sync** → Google Drive.

Updates install automatically on Tampermonkey's update check (Dashboard → Settings →
"Userscript Update" sets the interval; "Check for userscript updates" runs it now).

Hide or show Pip: Tampermonkey icon → **Hide Pip** / **Show Pip**, or "Hide Pip" in its bubble.
