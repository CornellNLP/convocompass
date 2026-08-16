//<nowiki>
/**
 * Filename: wiki-talk-page-llm-script.js
 * ConvoCompass LLM – Newcomer-oriented talk-page assistance (Wikipedia userscript)
 *
 * Fork of the live User:Laerdon/ConvoWizard.js (fetched 2026-08-12). Same widget
 * detection, corpus extraction, token auth, mute handling, panel DOM, and
 * Toolforge transport — but instead of CRAFT tension scores and threshold-
 * colored alerts, the panels show:
 *   - Discussion Summary: a plain-language summary of the ongoing discussion
 *   - Suggested Reading: 1-3 Wikipedia policy/guideline links with reasons
 * Both are produced server-side (extension backend -> gemini-service); this
 * script only renders them. Links are built with DOM APIs from server-
 * whitelisted URLs — nothing model-authored is ever inserted as HTML.
 */
(async function () {
  'use strict';

  // Load core util module via ResourceLoader
  await mw.loader.using(['mediawiki.util', 'mediawiki.user', 'mediawiki.api']);

  // /llm/ routes forward to the convocompass demo backend (jacqueline :8087);
  // the /api/ routes keep serving the live craft study (:8083) untouched.
  const SERVER = 'https://convocompass.toolforge.org/llm/';

  // ---- UI strings and thresholds ----
  const NAME = 'ConvoCompass';
  const DEBUG = /(?:\?|&)convowizardDebug=1(?:&|$)/.test(location.search);
  const OPTION_KEY = 'userjs-convowizard-token';
  const SUMMARY_PLACEHOLDER = `${NAME} is reading this discussion and will summarize it here.`;
  const GUIDANCE_PLACEHOLDER = `As you write, ${NAME} will suggest Wikipedia pages here that are worth reading for this discussion.`;
  // Only links whose URL passes this prefix check are ever rendered. The server
  // builds URLs from its own whitelist; this is defense in depth.
  const ALLOWED_LINK_PREFIX = 'https://en.wikipedia.org/wiki/Wikipedia:';

  // Keep ConvoWizard logs quiet by default to reduce console noise on Wikimedia pages.
  const nativeConsole = window.console;
  const console = {
    log: (...args) => {
      if (!DEBUG && typeof args[0] === 'string' && args[0].startsWith(`[${NAME}]`)) {
        return;
      }
      nativeConsole.log(...args);
    },
    warn: (...args) => nativeConsole.warn(...args),
    error: (...args) => nativeConsole.error(...args)
  };

  const isWikipediaHost = /(^|\.)wikipedia\.org$/.test(location.hostname);
  const namespaceNumber = Number(mw.config.get('wgNamespaceNumber'));
  const isTalkNamespace = Number.isFinite(namespaceNumber) && namespaceNumber % 2 === 1;
  const isViewAction = mw.config.get('wgAction') === 'view';

  // Gadget scope guard: only run on Wikipedia talk pages in normal view mode.
  if (!isWikipediaHost || !isViewAction) {
    console.log(
      `[${NAME}] Skipping page (host=${location.hostname}, ns=${namespaceNumber}, action=${mw.config.get('wgAction')})`
    );
    return;
  }

  // ---------- helpers ----------
  function throttle(fn, waitMs) {
    let last = 0, timer = 0, pendingArgs = null;
    return (...args) => {
      const now = Date.now();
      const remaining = waitMs - (now - last);
      if (remaining <= 0) {
        last = now;
        fn(...args);
      } else {
        pendingArgs = args;
        clearTimeout(timer);
        timer = setTimeout(() => { last = Date.now(); fn(...pendingArgs); }, remaining);
      }
    };
  }

  // Rewrite Wikipedia URL so the reddit-style backend can extract a post_id.
  // Backend does: url.split("comments/")[1][:6]
  // We inject "comments/<hash>" where hash is derived from the wiki page path.
  function wikiUrlToPostId(href) {
    try {
      const pagePath = href.split('/wiki/')[1] || href;
      // Simple hash to produce a stable 6-char hex id per page
      let h = 0;
      for (let i = 0; i < pagePath.length; i++) {
        h = ((h << 5) - h) + pagePath.charCodeAt(i);
        h = h & h;
      }
      const hex = Math.abs(h).toString(16).padStart(6, '0').slice(0, 6);
      return href.split('/wiki/')[0] + '/comments/' + hex;
    } catch {
      return href;
    }
  }

	async function postJson(route, body) {
	  try {
	    const res = await fetch(SERVER + route, {
	      method: 'POST',
	      headers: { 'Content-Type': 'application/json' },
	      body: JSON.stringify(body)
	    });
	
	    const text = await res.text();
	    nativeConsole.log(`[${NAME}] response from ${route}: status=${res.status}`, text);
	
	    try {
	      const data = JSON.parse(text);
	      nativeConsole.log(`[${NAME}] json from ${route}:`, data);
	      return data;
	    } catch (err) {
	      console.warn(`[${NAME}] non-json response from ${route}:`, text);
	      return {};
	    }
	  } catch (err) {
	    console.warn(`[${NAME}] request failed for ${route}:`, err);
	    return {};
	  }
	}

  function getTokenFromOptions() {
    try {
      if (mw.user && mw.user.options && typeof mw.user.options.get === 'function') {
        const raw = mw.user.options.get(OPTION_KEY);
        if (typeof raw === 'string') {
          const trimmed = raw.trim();
          return trimmed.length > 0 ? trimmed : null;
        }
      }
    } catch (err) {
      console.warn(`[${NAME}] Failed to read token from user options`, err);
    }
    return null;
  }

  async function persistToken(storageKey, token) {
    if (!token) {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, token);
    }

    if (!(mw.user && mw.user.options && typeof mw.user.options.set === 'function')) {
      return;
    }

    try {
      mw.user.options.set(OPTION_KEY, token || '');
      await new mw.Api().saveOption(OPTION_KEY, token || '');
      console.log(`[${NAME}] ${token ? 'Saved' : 'Cleared'} token in user options (notepad)`);
    } catch (err) {
      console.warn(`[${NAME}] Could not persist token to user options`, err);
    }
  }

  async function validateToken(token, username) {
    try {
      const response = await postJson('claim_token', { token, username });
      return response.valid === true;
    } catch {
      return false;
    }
  }

  // ========== CREDENTIAL SETUP ==========
  const USERNAME = mw.config.get('wgUserName');
  if (!USERNAME) {
    console.log(`[${NAME}] Not logged in, skipping`);
    return;
  }

  let TOKEN = null;
  const STORAGE_KEY = `ConvoWizard:token:${USERNAME}`;

  // Load persisted token (options → localStorage), validate, sync stores
  async function loadPersistedToken() {
    let token = getTokenFromOptions();
    let source = 'options';
    if (!token) {
      token = localStorage.getItem(STORAGE_KEY);
      source = 'localStorage';
    }
    if (token && typeof token === 'string') {
      token = token.trim();
    }
    if (!token) return;

    const valid = await validateToken(token, USERNAME);
    if (valid) {
      TOKEN = token;
      // Sync both stores
      if (source === 'options') {
        localStorage.setItem(STORAGE_KEY, token);
      } else {
        await persistToken(STORAGE_KEY, token);
      }
      console.log(`[${NAME}] Token loaded from ${source}`);
    } else {
      console.log(`[${NAME}] Persisted token invalid, clearing`);
      await persistToken(STORAGE_KEY, null);
    }
  }

  await loadPersistedToken();

  console.log(`[${NAME}] === SCRIPT LOADED SUCCESSFULLY ===`);
  console.log(`[${NAME}] Server: ${SERVER}`);
  console.log(`[${NAME}] User: ${USERNAME}`);
  console.log(`[${NAME}] Token: ${TOKEN ? 'present' : 'none (will prompt)'}`);
  console.log(`[${NAME}] Page URL: ${location.href}`);
  console.log(`[${NAME}] Installing click and mutation observers...`);

  // ========== TOKEN INPUT FORM ==========
  function showTokenForm(widgetEl) {
    // Don't add duplicate forms
    if (widgetEl.querySelector('.convowizard-auth-form')) return;

    const form = document.createElement('div');
    form.className = 'convowizard-auth-form';
    form.style.cssText = `
      margin:8px 0;padding:16px 20px;border-radius:8px;border:2px solid #0645ad;
      background:linear-gradient(135deg,#f8f9fa 0%,#ffffff 100%);
      box-shadow:0 2px 8px rgba(0,0,0,.1);
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    `;

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:600;font-size:14px;color:#0645ad;margin-bottom:8px;';
    title.textContent = `${NAME}: Authorization Required`;

    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:13px;color:#333;margin-bottom:12px;line-height:1.4;';
    desc.textContent = `Please paste your ${NAME} token below to activate the extension.`;

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center;';

    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = 'Paste token here';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.style.cssText = `
      flex:1;padding:8px 10px;font-size:13px;border:1px solid #a2a9b1;border-radius:4px;
      font-family:monospace;outline:none;transition:border-color 0.2s ease;
    `;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Authorize';
    btn.style.cssText = `
      padding:8px 16px;font-size:13px;font-weight:600;border:none;border-radius:4px;
      background:#0645ad;color:#fff;cursor:pointer;transition:background 0.2s ease;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    `;
    btn.addEventListener('mouseenter', () => { btn.style.background = '#0b5cce'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#0645ad'; });

    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'font-size:12px;color:#d73027;margin-top:8px;display:none;';

    async function onAuthorize() {
      const raw = input.value.trim();
      // Input validation: 33 hex chars
      if (!/^[0-9a-f]{33}$/i.test(raw)) {
        errDiv.textContent = 'Invalid token format. A token is 33 hexadecimal characters.';
        errDiv.style.display = 'block';
        input.value = '';
        input.focus();
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Validating...';
      errDiv.style.display = 'none';

      const valid = await validateToken(raw, USERNAME);
      // Clear input immediately after use
      input.value = '';

      if (valid) {
        TOKEN = raw;
        await persistToken(STORAGE_KEY, TOKEN);
        // Remove all auth forms on page
        document.querySelectorAll('.convowizard-auth-form').forEach(f => f.remove());
        // Activate the widget
        startForWidget(widgetEl);
      } else {
        errDiv.textContent = 'Token is invalid or expired. Please check and try again.';
        errDiv.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Authorize';
        input.focus();
      }
    }

    btn.addEventListener('click', onAuthorize);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onAuthorize(); }
    });

    row.appendChild(input);
    row.appendChild(btn);
    form.appendChild(title);
    form.appendChild(desc);
    form.appendChild(row);
    form.appendChild(errDiv);
    widgetEl.prepend(form);
    input.focus();
  }

  // ---- state + logs ----
  const widgetState = new WeakMap();

  function cleanupDuplicatePanels() {
    const allPanels = document.querySelectorAll('.craftDisplay, .passiveModeDisplay');
    const seen = new Set();
    allPanels.forEach(panel => {
      const pid = panel.id;
      if (pid && pid.includes('_')) {
        const parts = pid.split('_');
        const type = parts[0];
        const wid = parts.slice(1).join('_').replace('_d', '');
        const key = `${type}|${wid}`;
        if (seen.has(key)) panel.remove(); else seen.add(key);
      }
    });
  }

  // ========== MUTE THREAD ==========

  /**
   * Generates a unique thread identifier by combining URL section, DOM position, and content hash.
   * Ensures each thread on a page gets a distinct ID for per-thread mute functionality.
   */
  function getThreadIdForWidget(widgetEl) {
    try {
      const urlHash = location.hash ? location.hash.replace('#', '') : 'root';

      // Generate DOM path for widget position
      const widgetPath = [];
      let el = widgetEl;
      for (let i = 0; i < 8 && el; i++) {
        const parent = el.parentElement;
        if (!parent || parent === document.body) break;
        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(el);
        widgetPath.unshift(`${parent.tagName}_${index}`);
        el = parent;
      }
      const domPath = widgetPath.length > 0 ? widgetPath.join('_') : 'unknown';

      // Get content-based hash from first comment
      const context = getContextStringFor(widgetEl);
      let contentHash = '';
      if (context && context.length > 0) {
        const firstComment = context.split('\n\n')[0] || context.substring(0, 150);
        let hash = 0;
        for (let i = 0; i < Math.min(firstComment.length, 150); i++) {
          const char = firstComment.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        contentHash = Math.abs(hash).toString(36);
      } else {
        const parentText = widgetEl.parentElement ?
          (widgetEl.parentElement.textContent || '').substring(0, 50).trim() : '';
        if (parentText) {
          let hash = 0;
          for (let i = 0; i < parentText.length; i++) {
            hash = ((hash << 5) - hash) + parentText.charCodeAt(i);
            hash = hash & hash;
          }
          contentHash = Math.abs(hash).toString(36);
        } else {
          contentHash = Math.random().toString(36).slice(2, 8);
        }
      }

      return `thread_${urlHash}_${domPath.substring(0, 50)}_${contentHash}`;
    } catch (err) {
      console.warn(`[${NAME}] Error generating thread ID:`, err);
      return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    }
  }

  function getMutedThreads() {
    try {
      const storageKey = `ConvoWizard:mutedThreads:${USERNAME}`;
      const stored = localStorage.getItem(storageKey);
      if (!stored) return new Set();
      const threads = JSON.parse(stored);
      return new Set(Array.isArray(threads) ? threads : []);
    } catch {
      return new Set();
    }
  }

  function saveMutedThreads(threadSet) {
    try {
      const storageKey = `ConvoWizard:mutedThreads:${USERNAME}`;
      const threads = Array.from(threadSet);
      localStorage.setItem(storageKey, JSON.stringify(threads));
    } catch (err) {
      console.warn(`[${NAME}] Error saving muted threads:`, err);
    }
  }

  function isThreadMuted(threadId) {
    if (!threadId) return false;
    const muted = getMutedThreads();
    return muted.has(threadId);
  }


  function toggleThreadMute(threadId) {
    if (!threadId) return false;
    const muted = getMutedThreads();
    const wasMuted = muted.has(threadId);
    if (wasMuted) {
      muted.delete(threadId);
    } else {
      muted.add(threadId);
    }
    saveMutedThreads(muted);
    return !wasMuted;
  }

  /**
   * Creates an unmute indicator button that appears when a thread is muted
   * Allows users to restore ConvoWizard for a muted thread
   */
  function ensureUnmuteIndicator(widgetEl, threadId, widgetId) {
    const existingIndicator = widgetEl.querySelector('.convowizard-unmute-indicator');
    if (existingIndicator) return;
    const indicator = document.createElement('div');
    indicator.id = `convowizard-unmute-${widgetId}`;
    indicator.className = 'convowizard-unmute-indicator';
    indicator.style.cssText = `
      margin: 4px 0;
      padding: 6px 10px;
      font-size: 11px;
      border: 1px solid #a2a9b1;
      border-radius: 4px;
      background: #f8f9fa;
      color: #54595d;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
    `;

    const icon = document.createElement('span');
    icon.textContent = '🔊';
    icon.style.fontSize = '12px';

    const text = document.createElement('span');
    text.textContent = `${NAME} is muted for this thread. Click to unmute.`;
    text.style.flex = '1';

    indicator.appendChild(icon);
    indicator.appendChild(text);

    indicator.addEventListener('mouseenter', () => {
      indicator.style.background = '#e9ecef';
      indicator.style.borderColor = '#0645ad';
    });

    indicator.addEventListener('mouseleave', () => {
      indicator.style.background = '#f8f9fa';
      indicator.style.borderColor = '#a2a9b1';
    });

    indicator.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();

      const newMuteState = toggleThreadMute(threadId);

      // Show panels and remove indicator
      const contextPanel = document.getElementById(`context_${widgetId}_d`);
      const replyPanel = document.getElementById(`reply_${widgetId}_d`);
      if (contextPanel) contextPanel.style.display = '';
      if (replyPanel) replyPanel.style.display = '';
      widgetEl.querySelectorAll('.convowizard-unmute-indicator').forEach(ind => ind.remove());

      // Update mute buttons
      document.querySelectorAll(`button[data-thread-id="${threadId}"]`).forEach(btn => {
        btn.textContent = '🔇 Mute thread';
        btn.title = 'Mute ConvoWizard for this thread';
        btn.style.background = '#ffffff';
      });

      // Re-trigger analysis to refresh display
      const st = widgetState.get(widgetEl);
      if (st && st.inputEl) {
        // Re-run the continue request to refresh the display
        const inputText = st.inputEl.innerText || st.inputEl.textContent || st.inputEl.value || '';
        if (inputText.trim().length > 0) {
          const contextUtterances = st.context.split(/\s*\(UTC\)\s*/).filter(text => text.trim().length > 0);
          const existingForContinue = contextUtterances.map((text, index) => ({
            id: `wiki_${st.interactionId}_${index}`,
            text: text.trim()
          }));

          const data = await postJson('continue', {
            existing: existingForContinue,
            new: inputText,
            interaction_id: st.interactionId,
            token: TOKEN,
            username: USERNAME
          });

          if (data && !data.error) {
            handleIntervention(widgetEl, st.inputEl, data);
          }
        } else {
          const contextUtterances = st.context.split(/\s*\(UTC\)\s*/).filter(text => text.trim().length > 0);
          const existing = contextUtterances.map((text, index) => ({
            id: `wiki_${st.interactionId}_${index}`,
            text: text.trim()
          }));

          const data = await postJson('start', {
            existing,
            reply_id: existing.length > 0 ? existing[existing.length - 1].id : null,
            url: wikiUrlToPostId(location.href),
            token: TOKEN,
            username: USERNAME
          });

          if (data && !data.error && data.interaction_id) {
            widgetState.set(widgetEl, { ...st, interactionId: data.interaction_id });
            handleIntervention(widgetEl, st.inputEl, data);
          }
        }
      } else {
        startForWidget(widgetEl);
      }
    });

    // Insert at the beginning of the widget
    widgetEl.insertBefore(indicator, widgetEl.firstChild);
  }

  function createMuteButton(threadId, widgetId, isMuted) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'convowizard-mute-btn';
    btn.setAttribute('data-thread-id', threadId);
    btn.setAttribute('data-widget-id', widgetId);
    btn.style.cssText = `
      margin-left: auto;
      padding: 4px 8px;
      font-size: 11px;
      border: 1px solid #a2a9b1;
      border-radius: 4px;
      background: ${isMuted ? '#f8f9fa' : '#ffffff'};
      color: #54595d;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    btn.textContent = isMuted
      ? '🔊 Unmute thread'
      : '🔇 Mute thread';
    btn.title = isMuted
      ? 'Unmute ConvoWizard for this thread'
      : 'Mute ConvoWizard for this thread';

    btn.addEventListener('mouseenter', () => {
      btn.style.background = isMuted ? '#e9ecef' : '#f8f9fa';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = isMuted ? '#f8f9fa' : '#ffffff';
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      const newMuteState = toggleThreadMute(threadId);

      // Update button state
      btn.textContent = newMuteState
        ? '🔊 Unmute thread'
        : '🔇 Mute thread';
      btn.title = newMuteState
        ? 'Unmute ConvoWizard for this thread'
        : 'Mute ConvoWizard for this thread';
      btn.style.background = newMuteState ? '#f8f9fa' : '#ffffff';

      // Hide/show panels and unmute indicator
      const contextPanel = document.getElementById(`context_${widgetId}_d`);
      const replyPanel = document.getElementById(`reply_${widgetId}_d`);
      const widgetEl = contextPanel?.closest('.ext-discussiontools-ui-replyWidget') ||
                       replyPanel?.closest('.ext-discussiontools-ui-replyWidget') ||
                       contextPanel?.closest('.ext-discussiontools-ui-newTopicWidget') ||
                       replyPanel?.closest('.ext-discussiontools-ui-newTopicWidget');

      if (contextPanel) contextPanel.style.display = newMuteState ? 'none' : '';
      if (replyPanel) replyPanel.style.display = newMuteState ? 'none' : '';

      // Clear textbox background when muting
      if (newMuteState) {
        const st = widgetState.get(widgetEl);
        if (st && st.inputEl) {
          st.inputEl.style.setProperty('background-color', 'transparent', 'important');
        }
      }

      if (newMuteState && widgetEl) {
        ensureUnmuteIndicator(widgetEl, threadId, widgetId);
      } else if (widgetEl) {
        widgetEl.querySelectorAll('.convowizard-unmute-indicator').forEach(ind => ind.remove());
      }

      // Update all mute buttons for this thread
      document.querySelectorAll(`button[data-thread-id="${threadId}"]`).forEach(otherBtn => {
        if (otherBtn !== btn) {
          otherBtn.textContent = newMuteState
            ? '🔊 Unmute thread'
            : '🔇 Mute thread';
          otherBtn.title = newMuteState
            ? 'Unmute ConvoWizard for this thread'
            : 'Mute ConvoWizard for this thread';
          otherBtn.style.background = newMuteState ? '#f8f9fa' : '#ffffff';
        }
      });
    });

    return btn;
  }

  function ensurePanels(widgetEl, threadId = null) {
    cleanupDuplicatePanels();
    // Clean up duplicate unmute indicators
    const unmuteIndicators = widgetEl.querySelectorAll('.convowizard-unmute-indicator');
    if (unmuteIndicators.length > 1) {
      for (let i = 1; i < unmuteIndicators.length; i++) {
        unmuteIndicators[i].remove();
      }
    }
    const widgetId = widgetEl.id || `widget_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    if (!widgetEl.id) widgetEl.id = widgetId;
    const contextId = `context_${widgetId}`;
    const replyId = `reply_${widgetId}`;

    const isMuted = threadId ? isThreadMuted(threadId) : false;

    // Ensure Context panel
    if (!document.getElementById(`${contextId}_d`)) {
      const contextBox = document.createElement('div');
      contextBox.id = `${contextId}_d`;
      contextBox.className = 'craftDisplay';
      contextBox.style.cssText = `
        margin:8px 0;padding:12px 16px;border-radius:8px;border:2px solid #0645ad;
        background:linear-gradient(135deg,#f8f9fa 0%,#ffffff 100%);
        box-shadow:0 2px 8px rgba(0,0,0,.1);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;transition:all .3s ease;position:relative;
      `;
      const cheader = document.createElement('div');
      cheader.id = `${contextId}_h`;
      cheader.style.cssText = `font-weight:600;font-size:14px;color:#0645ad;margin-bottom:8px;display:flex;align-items:center;gap:8px;`;
      const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      iconSvg.setAttribute('width', '16');
      iconSvg.setAttribute('height', '16');
      iconSvg.setAttribute('viewBox', '0 0 16 16');
      iconSvg.setAttribute('fill', 'currentColor');
      iconSvg.innerHTML = '<path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm1 13H7v-2h2v2zm0-3H7V4h2v6z"/>';
      const textSpan = document.createElement('span');
      textSpan.className = 'convowizard-header-text';
      textSpan.textContent = `${NAME}: Discussion Summary`;
      cheader.appendChild(iconSvg);
      cheader.appendChild(textSpan);
      if (threadId) {
        const muteBtn = createMuteButton(threadId, widgetId, isMuted);
        cheader.appendChild(muteBtn);
      }
      const ccontent = document.createElement('div');
      ccontent.id = `${contextId}_p`;
      ccontent.style.cssText = `font-size:13px;line-height:1.4;color:#333;margin:0;`;
      ccontent.textContent = SUMMARY_PLACEHOLDER;
      contextBox.appendChild(cheader);
      contextBox.appendChild(ccontent);
      if (isMuted) contextBox.style.display = 'none';
      widgetEl.prepend(contextBox);
    } else if (threadId) {
      const existingPanel = document.getElementById(`${contextId}_d`);
      if (existingPanel) {
        existingPanel.style.display = isThreadMuted(threadId) ? 'none' : '';
      }
    }

    // Show unmute indicator when muted (only if panels don't exist yet)
    if (threadId && isMuted && !document.getElementById(`${contextId}_d`) && !document.getElementById(`${replyId}_d`)) {
      ensureUnmuteIndicator(widgetEl, threadId, widgetId);
    } else if (threadId && !isMuted) {
      widgetEl.querySelectorAll('.convowizard-unmute-indicator').forEach(ind => ind.remove());
    }

    // Ensure Reply panel
    if (!document.getElementById(`${replyId}_d`)) {
      const replyBox = document.createElement('div');
      replyBox.id = `${replyId}_d`;
      replyBox.className = 'craftDisplay';
      replyBox.style.cssText = `
        margin:8px 0;padding:12px 16px;border-radius:8px;border:2px solid #0645ad;
        background:linear-gradient(135deg,#f8f9fa 0%,#ffffff 100%);
        box-shadow:0 2px 8px rgba(0,0,0,.1);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;transition:all .3s ease;position:relative;
      `;
      const header = document.createElement('div');
      header.id = `${replyId}_h`;
      header.style.cssText = `font-weight:600;font-size:14px;color:#0645ad;margin-bottom:8px;display:flex;align-items:center;gap:8px;`;
      const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      iconSvg.setAttribute('width', '16');
      iconSvg.setAttribute('height', '16');
      iconSvg.setAttribute('viewBox', '0 0 16 16');
      iconSvg.setAttribute('fill', 'currentColor');
      iconSvg.innerHTML = '<path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm1 13H7v-2h2v2zm0-3H7V4h2v6z"/>';
      const textSpan = document.createElement('span');
      textSpan.className = 'convowizard-header-text';
      textSpan.textContent = `${NAME}: Suggested Reading`;
      header.appendChild(iconSvg);
      header.appendChild(textSpan);
      if (threadId) {
        const muteBtn = createMuteButton(threadId, widgetId, isMuted);
        header.appendChild(muteBtn);
      }
      const content = document.createElement('div');
      content.id = `${replyId}_p`;
      content.style.cssText = `font-size:13px;line-height:1.4;color:#333;margin:0;`;
      content.textContent = GUIDANCE_PLACEHOLDER;
      replyBox.appendChild(header);
      replyBox.appendChild(content);
      if (isMuted) replyBox.style.display = 'none';
      const preview = widgetEl.querySelector('.ext-discussiontools-ui-replyWidget-preview')
        || document.querySelector('.ext-discussiontools-ui-replyWidget-preview');
      if (preview && preview.parentElement) {
        preview.parentElement.insertBefore(replyBox, preview.nextSibling);
      } else {
        widgetEl.append(replyBox);
      }
    } else if (threadId) {
      const existingPanel = document.getElementById(`${replyId}_d`);
      if (existingPanel) {
        existingPanel.style.display = isThreadMuted(threadId) ? 'none' : '';
      }
    }

    return { replyId, contextId };
  }

  // Renders the server-provided discussion summary. No scores, no thresholds:
  // one neutral style, and a null summary keeps the placeholder text.
  function updateSummaryPanel(contextId, summary) {
    console.log(`[${NAME}] updateSummaryPanel called - contextId: ${contextId}`);

    const box = document.getElementById(`${contextId}_d`);
    const p = document.getElementById(`${contextId}_p`);
    const h = document.getElementById(`${contextId}_h`);
    if (!box || !p) return;

    const muteBtn = box.querySelector('.convowizard-mute-btn');
    if (muteBtn) {
      const threadId = muteBtn.getAttribute('data-thread-id');
      if (threadId && isThreadMuted(threadId)) {
        box.style.display = 'none';
        return;
      }
    }
    if (box.style.display === 'none') box.style.display = '';

    p.textContent = summary || SUMMARY_PLACEHOLDER;
    if (h) {
      const textSpan = h.querySelector('span.convowizard-header-text');
      if (textSpan) textSpan.textContent = `${NAME}: Discussion Summary`;
    }
  }

  // Renders the suggested-reading links. Links arrive as
  // {shortcut, title, url, reason} with server-whitelisted URLs; everything is
  // inserted via DOM APIs (createElement/textContent), never innerHTML.
  function updateGuidancePanel(replyId, links, inputEl) {
    // The editor background never tints in this condition.
    if (inputEl) {
      inputEl.style.setProperty('background-color', 'transparent', 'important');
    }

    const box = document.getElementById(`${replyId}_d`);
    const p = document.getElementById(`${replyId}_p`);
    const h = document.getElementById(`${replyId}_h`);
    if (!box || !p) return;

    const muteBtn = box.querySelector('.convowizard-mute-btn');
    if (muteBtn) {
      const threadId = muteBtn.getAttribute('data-thread-id');
      if (threadId && isThreadMuted(threadId)) {
        box.style.display = 'none';
        return;
      }
    }
    if (box.style.display === 'none') box.style.display = '';

    const safeLinks = (Array.isArray(links) ? links : []).filter(
      (l) => l && typeof l.url === 'string' && l.url.startsWith(ALLOWED_LINK_PREFIX)
            && typeof l.title === 'string' && typeof l.reason === 'string'
    );

    p.textContent = '';
    if (safeLinks.length === 0) {
      p.textContent = GUIDANCE_PLACEHOLDER;
    } else {
      for (const link of safeLinks) {
        const item = document.createElement('div');
        item.style.cssText = 'margin:0 0 6px 0;';

        const a = document.createElement('a');
        a.href = link.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.style.cssText = 'font-weight:600;color:#0645ad;text-decoration:none;';
        a.textContent = link.shortcut ? `${link.title} (${link.shortcut})` : link.title;

        const reason = document.createElement('span');
        reason.textContent = ` — ${link.reason}`;

        item.appendChild(a);
        item.appendChild(reason);
        p.appendChild(item);
      }
    }

    if (h) {
      const textSpan = h.querySelector('span.convowizard-header-text');
      if (textSpan) textSpan.textContent = `${NAME}: Suggested Reading`;
    }
  }


  function getContextStringFor(widgetEl) {
    try {
      console.log(`[${NAME}] === Extracting context for widget ===`);

      // Helper to check if element is a comment container
      const isCommentNode = (el) => !!el && (el.tagName === 'DD' || el.tagName === 'LI' || el.tagName === 'P');

      // Extract clean comment text, removing nested replies and UI elements
      // IMPORTANT: Keep timestamps (UTC) because backend splits on them!
      const extractCommentText = (el) => {
        if (!el) return '';
        const clone = el.cloneNode(true);
        // Remove nested discussion lists, widgets, and UI elements
        // NOTE: DO NOT remove .ext-discussiontools-init-timestamplink - backend needs timestamps to split utterances!
        clone.querySelectorAll('dl, .ext-discussiontools-ui-replyWidget, .craftDisplay, .passiveModeDisplay, .ext-discussiontools-init-replylink-buttons, [role="button"]').forEach(n => n.remove());
        const text = (clone.innerText || '').trim();
        return text;
      };

      // Wikipedia Talk pages have structure: <dd>comment text<dl><dd>reply<dl><dd>widget
      // When widget appears, it's nested inside a new <dd> inside a new <dl>
      // We need to find the parent <dd> that contains actual comment text

      let commentDD = null;

      // Strategy 1: Widget is inside <dd> → <dl> → <dd> (the target comment)
      // Find the <dd> containing the widget
      const widgetDD = widgetEl.closest('dd, li');
      console.log(`[${NAME}] Widget container DD:`, widgetDD ? widgetDD.tagName : 'not found');

      if (widgetDD) {
        // Check if this DD has meaningful text (not just the widget)
        const widgetDDText = extractCommentText(widgetDD);
        console.log(`[${NAME}] Widget DD text length:`, widgetDDText.length);

        if (widgetDDText.length > 20) {
          // This DD has actual comment text
          commentDD = widgetDD;
        } else {
          // This DD is empty/minimal - the widget was just inserted
          // Go up: DD → DL → parent DD (which should have the comment)
          const parentDL = widgetDD.parentElement;
          console.log(`[${NAME}] Parent DL:`, parentDL ? parentDL.tagName : 'not found');

          if (parentDL && (parentDL.tagName === 'DL' || parentDL.tagName === 'UL' || parentDL.tagName === 'OL')) {
            // Find the parent DD/LI/P that contains this DL
            commentDD = parentDL.closest('dd, li, p');
            console.log(`[${NAME}] Found parent comment node:`, commentDD ? commentDD.tagName : 'not found');
          }
        }
      }

      // Strategy 2: Look for preceding paragraph with comment markers (flat structure)
      if (!commentDD) {
        console.log(`[${NAME}] Trying flat structure search...`);
        let probe = widgetEl;
        let hops = 0;
        while (probe && hops++ < 10) {
          probe = probe.previousElementSibling || (probe.parentElement ? probe.parentElement.previousElementSibling : null);
          if (probe && probe.tagName === 'P' && probe.querySelector('[data-mw-comment-start], [data-mw-comment-end]')) {
            commentDD = probe;
            console.log(`[${NAME}] Found comment via flat search at hop ${hops}`);
            break;
          }
        }
      }

      // Strategy 3: Last resort - traverse DOM looking for any comment node
      if (!commentDD) {
        console.log(`[${NAME}] Trying fallback search...`);
        let probe = widgetEl;
        let hops = 0;
        while (probe && hops++ < 20) {
          if (isCommentNode(probe) && extractCommentText(probe).length > 20) {
            commentDD = probe;
            console.log(`[${NAME}] Found comment via fallback at hop ${hops}`);
            break;
          }
          probe = probe.previousElementSibling ||
                  (probe.parentElement ? probe.parentElement.previousElementSibling : null) ||
                  (probe.parentElement ? probe.parentElement.parentElement : null);
        }
      }

      if (!commentDD) {
        console.warn(`[${NAME}] Could not find any comment node!`);
        return '';
      }

      // Now traverse up the comment chain collecting all parent comments
      const texts = [];
      const seen = new Set();
      let current = commentDD;
      let iterations = 0;

      console.log(`[${NAME}] Starting comment chain traversal from:`, current.tagName);

      while (current && iterations++ < 20) {
        if (seen.has(current)) {
          console.log(`[${NAME}] Already seen this node, breaking`);
          break;
        }
        seen.add(current);

        const text = extractCommentText(current);
        if (text && text.length > 0) {
          console.log(`[${NAME}] Extracted comment (${text.length} chars):`, text.substring(0, 100) + '...');
          texts.unshift(text);  // Add to beginning to maintain chronological order
        }

        // Navigate up the discussion tree
        // Structure: <p>text</p><dl><dd>reply<dl><dd>reply</dd></dl></dd></dl>
        // From current <dd>, go to parent element (should be <dl>)
        const parentList = current.parentElement;
        if (!parentList) {
          console.log(`[${NAME}] No parent element, stopping`);
          break;
        }

        console.log(`[${NAME}] Parent list:`, parentList.tagName);

        // From <dl>, find the parent <dd> or <li> or <p>
        if (parentList.tagName === 'DL' || parentList.tagName === 'UL' || parentList.tagName === 'OL') {
          // First try to find an ancestor comment node
          current = parentList.closest('dd, li, p');
          if (current) {
            console.log(`[${NAME}] Found ancestor comment:`, current.tagName);
          } else {
            // No ancestor found - the <p> might be a SIBLING of this <dl>
            // This happens in flat structure: <p>comment</p><dl><dd>reply...
            console.log(`[${NAME}] No ancestor, searching for previous sibling of DL...`);
            let sibling = parentList.previousElementSibling;
            let siblingHops = 0;
            while (sibling && siblingHops++ < 10) {
              console.log(`[${NAME}] Checking sibling:`, sibling.tagName);
              if (isCommentNode(sibling) && !seen.has(sibling)) {
                const siblingText = extractCommentText(sibling);
                if (siblingText.length > 20) {
                  current = sibling;
                  console.log(`[${NAME}] Found sibling comment with text (${siblingText.length} chars)`);
                  break;
                }
              }
              sibling = sibling.previousElementSibling;
            }

            if (!current || current === parentList.closest('dd, li, p')) {
              console.log(`[${NAME}] No more comments found, stopping`);
              break;
            }
          }
        } else if (isCommentNode(parentList)) {
          // Parent is itself a comment node
          current = parentList;
        } else {
          // Try to find previous sibling comment
          let sibling = current.previousElementSibling;
          while (sibling && !isCommentNode(sibling)) {
            sibling = sibling.previousElementSibling;
          }
          if (sibling && !seen.has(sibling)) {
            current = sibling;
            console.log(`[${NAME}] Moving to sibling:`, current.tagName);
          } else {
            console.log(`[${NAME}] No more siblings, stopping`);
            break;
          }
        }
      }

      console.log(`[${NAME}] Extracted ${texts.length} comments, total length: ${texts.join('\n\n').length}`);

      // Additional pass: Look for any <p> elements with comment markers that might have been missed
      // This catches the case where the first comment in a thread is a <p> that's a sibling of the DL
      if (commentDD && commentDD.tagName === 'DD') {
        const topDL = commentDD.closest('dl');
        if (topDL && topDL.previousElementSibling) {
          let probe = topDL.previousElementSibling;
          let probeHops = 0;
          console.log(`[${NAME}] Scanning backwards from top DL for more context...`);
          while (probe && probeHops++ < 5) {
            if (probe.tagName === 'P' && !seen.has(probe)) {
              const probeText = extractCommentText(probe);
              if (probeText.length > 20 && (probe.querySelector('[data-mw-comment-start]') || probe.querySelector('[data-mw-comment-end]'))) {
                console.log(`[${NAME}] Found additional preceding comment (${probeText.length} chars):`, probeText.substring(0, 100) + '...');
                texts.unshift(probeText);
                seen.add(probe);
              }
            }
            probe = probe.previousElementSibling;
          }
        }
      }

      console.log(`[${NAME}] Final extraction: ${texts.length} comments, total length: ${texts.join('\n\n').length}`);

      if (texts.length > 0) {
        const fullContext = texts.join('\n\n');
        console.log(`[${NAME}] Full context:`, fullContext);
        return fullContext;
      }

      console.warn(`[${NAME}] No context found, returning empty string`);
      return '';

    } catch (err) {
      console.error(`[${NAME}] Error extracting context:`, err);
      return '';
    }
  }

  async function startForWidget(widgetEl) {
    if (!TOKEN) { showTokenForm(widgetEl); return; }
    if (widgetState.has(widgetEl) || widgetEl.getAttribute('data-convowizard-processing') === 'true') return;
    widgetEl.setAttribute('data-convowizard-processing', 'true');
    console.log(`[${NAME}] Starting widget processing:`, widgetEl.className);

    function findInput(scope) {
      // Prefer DT textbox role, then VE contenteditable surface, then textarea
      return (
        scope.querySelector('div[role="textbox"]') ||
        scope.querySelector('[contenteditable="true"]') ||
        scope.querySelector('.ve-ce-surface [contenteditable="true"]') ||
        scope.querySelector('.ve-ce-surface') ||
        scope.querySelector('textarea')
      );
    }

    async function waitForInput(scope, timeoutMs = 8000) {
      const deadline = Date.now() + timeoutMs;
      return new Promise((resolve) => {
        const tick = () => {
          const el = findInput(scope) || findInput(document);
          if (el) return resolve(el);
          if (Date.now() > deadline) return resolve(null);
          setTimeout(tick, 100);
        };
        tick();
      });
    }

    const inputEl = await waitForInput(widgetEl);
    if (!inputEl) {
      console.warn(`[${NAME}] No input element found in widget (after waiting)`);
      return;
    }
    console.log(`[${NAME}] Input element found:`, inputEl.tagName, inputEl.getAttribute('role') || (inputEl.getAttribute('contenteditable') ? 'contenteditable' : ''));

    const context = getContextStringFor(widgetEl);
    console.log(`[${NAME}] Context extracted, length: ${context.length} chars`);
    console.log(`[${NAME}] Context preview:`, context.substring(0, 200));

    // Split context on (UTC) timestamps to create separate utterances like Reddit does
    // This prevents backend caching bug where all Wikipedia convos share id=None
    const utterances = context.split(/\s*\(UTC\)\s*/).filter(text => text.trim().length > 0);
    const existing = utterances.map((text, index) => ({
      id: `wiki_${Date.now()}_${index}`,  // Unique ID prevents cache collision
      text: text.trim()
    }));

    console.log(`[${NAME}] Created ${existing.length} utterances with unique IDs`);
    existing.forEach((utt, i) => {
      console.log(`[${NAME}]   ${i}: ID=${utt.id}, text=${utt.text.substring(0, 60)}...`);
    });

    const data = await postJson('start', {
      existing,  // Send as array like Reddit, not context string!
      reply_id: existing.length > 0 ? existing[existing.length - 1].id : null,
      url: wikiUrlToPostId(location.href),
      token: TOKEN,
      username: USERNAME
    });

    console.log(`[${NAME}] Received response from /start:`, data);

    // Handle invalid token - clear and show auth form
    if (data && data.error === 'Invalid Token') {
      TOKEN = null;
      await persistToken(STORAGE_KEY, null);
      showTokenForm(widgetEl);
      return;
    }

    if (!data || !data.interaction_id) return;

    widgetState.set(widgetEl, { interactionId: data.interaction_id, inputEl, context });
    handleIntervention(widgetEl, inputEl, data);

    const sendContinue = throttle(async () => {
      const st = widgetState.get(widgetEl);
      if (!st) return;

      // Check if thread is muted
      const threadId = getThreadIdForWidget(widgetEl);
      if (threadId && isThreadMuted(threadId)) {
        // Clear input background if muted
        if (st.inputEl) {
          st.inputEl.style.setProperty('background-color', 'transparent', 'important');
        }
        return;
      }

      const widgetId = widgetEl.id;
      const h = document.getElementById(`reply_${widgetId}_h`);
      if (h) {
        // Update the SVG icon
        const existingSvg = h.querySelector('svg:not(.convowizard-mute-btn svg)');
        if (existingSvg) {
          const temp = document.createElement('div');
          temp.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm1 13H7v-2h2v2zm0-3H7V4h2v6z"/>
            </svg>
          `;
          const newSvg = temp.querySelector('svg');
          if (newSvg) {
            existingSvg.replaceWith(newSvg);
          }
        }
        // Update text span with processing indicator
        const textSpan = h.querySelector('span.convowizard-header-text');
        if (textSpan) {
          textSpan.textContent = `${NAME}: Suggested Reading (Processing...)`;
        }
      }
      // Recreate existing array from cached context for continue requests
      const contextUtterances = st.context.split(/\s*\(UTC\)\s*/).filter(text => text.trim().length > 0);
      const existingForContinue = contextUtterances.map((text, index) => ({
        id: `wiki_${st.interactionId}_${index}`,  // Use interaction_id for consistency
        text: text.trim()
      }));

      const data2 = await postJson('continue', {
        existing: existingForContinue,
        new: (st.inputEl.innerText || st.inputEl.textContent || st.inputEl.value || ''),
        interaction_id: st.interactionId,
        token: TOKEN,
        username: USERNAME
      });

      // Handle invalid token on continue
      if (data2 && data2.error === 'Invalid Token') {
        TOKEN = null;
        await persistToken(STORAGE_KEY, null);
        showTokenForm(widgetEl);
        return;
      }

      handleIntervention(widgetEl, st.inputEl, data2);
    }, 6000);

    inputEl.addEventListener('input', sendContinue);
    inputEl.addEventListener('keyup', sendContinue);
    inputEl.addEventListener('paste', sendContinue);

    let postBtn = widgetEl.querySelector(".oo-ui-buttonElement-button[title*='Reply']");
    if (!postBtn) {
      postBtn = Array.from(widgetEl.querySelectorAll('.oo-ui-buttonElement-button'))
        .find(b => /reply/i.test((b.title || b.innerText || '').trim()));
    }
    if (postBtn) {
      postBtn.addEventListener('click', async () => {
        const st = widgetState.get(widgetEl);
        if (!st) return;
        try {
          // Recreate existing array from cached context for submit
          const contextUtterances = st.context.split(/\s*\(UTC\)\s*/).filter(text => text.trim().length > 0);
          const existingForSubmit = contextUtterances.map((text, index) => ({
            id: `wiki_${st.interactionId}_${index}`,
            text: text.trim()
          }));

          await postJson('submit', {
            existing: existingForSubmit,
            new: (st.inputEl.innerText || st.inputEl.textContent || st.inputEl.value || ''),
            interaction_id: st.interactionId,
            submitted_id: null,
            token: TOKEN,
            username: USERNAME
          });
        } finally {
          widgetState.delete(widgetEl);
        }
      });
    }
  }

  function handleIntervention(widgetEl, inputEl, data) {
    if (!data) {
      console.warn(`[${NAME}] handleIntervention called with no data`);
      return;
    }

    console.log(`[${NAME}] handleIntervention called with data:`, data);

    if (data.error) {
      return;
    }

    const interactionId = data.interaction_id;
    if (!interactionId) {
      console.warn(`[${NAME}] No interaction_id in data`);
      return;
    }

    const threadId = getThreadIdForWidget(widgetEl);

    // Skip display if thread is muted
    if (threadId && isThreadMuted(threadId)) {
      const widgetId = widgetEl.id || `widget_${Date.now()}`;
      if (!widgetEl.id) widgetEl.id = widgetId;
      ensureUnmuteIndicator(widgetEl, threadId, widgetId);
      return;
    }

    const { replyId, contextId } = ensurePanels(widgetEl, threadId);
    const showScores = Object.prototype.hasOwnProperty.call(data, 'show_scores');

    console.log(`[${NAME}] Panel IDs - context: ${contextId}, reply: ${replyId}`);
    console.log(`[${NAME}] Show scores: ${showScores}`);

    const which = data.which || '';
    console.log(`[${NAME}] Response type (which): ${which}`);

    // Clear any "(Processing...)" header state no matter which condition the
    // backend served — otherwise a non-llm response leaves it stuck.
    const replyHeader = document.getElementById(`${replyId}_h`);
    if (replyHeader) {
      const procSpan = replyHeader.querySelector('span.convowizard-header-text');
      if (procSpan) procSpan.textContent = `${NAME}: Suggested Reading`;
    }

    if (which.startsWith('llm')) {
      console.log(`[${NAME}] LLM mode - summary:`, data.llm_summary != null);
      console.log(`[${NAME}] LLM mode - links:`, (data.llm_links || []).length);

      updateSummaryPanel(contextId, data.llm_summary);
      updateGuidancePanel(replyId, data.llm_links, inputEl);
    } else {
      const noteId = `passivenote${interactionId}_d`;
      if (!data.message && !document.getElementById(noteId)) {
        const box = document.createElement('div');
        box.id = noteId;
        box.className = 'passiveModeDisplay';
        box.style.cssText = `
          margin:8px 0;padding:8px 12px;border-radius:6px;border:1px solid #a2a9b1;
          background:linear-gradient(135deg,#f8f9fa 0%,#ffffff 100%);
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;opacity:.8;
        `;
        const content = document.createElement('div');
        content.id = `passivenote${interactionId}_p`;
        content.style.cssText = `font-size:12px;color:#54595d;margin:0;font-style:italic;`;
        content.textContent = `${NAME} is currently not active on this thread.`;
        box.appendChild(content);
        widgetEl.prepend(box);
      }
    }
  }

  function installClickDelegation() {
    document.addEventListener('click', (e) => {
      console.log(`[${NAME}] Click detected on:`, e.target.tagName, e.target.className);

      // Match reply buttons and links (both old and new DiscussionTools formats)
      // Need to check the actual clicked element AND traverse up
      const link = e.target.closest && (
        e.target.closest('.ext-discussiontools-init-replybutton') ||
        e.target.closest('.ext-discussiontools-init-replylink-reply') ||
        e.target.closest('a.ext-discussiontools-init-replylink') ||
        e.target.closest('.ext-discussiontools-init-replylink-buttons') ||
        e.target.closest('[class*="ext-discussiontools-init-"][class*="reply"]')
      );

      if (!link) return;
      console.log(`[${NAME}] Reply link clicked:`, link.className);

      // For flat discussion structures (like Research talk pages), the widget may be inserted
      // outside the immediate parent. Search more broadly.
      const anchorScope = link.closest('dd, li, p, div, section') || document.body;
      const broadScope = anchorScope.closest('#mw-content-text, .mw-parser-output, #content') || document.body;

      console.log(`[${NAME}] Anchor scope:`, anchorScope.tagName, anchorScope.className);
      console.log(`[${NAME}] Broad scope:`, broadScope.tagName, broadScope.className);

      const timeoutAt = Date.now() + 8000;
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        // Try multiple search strategies:
        // 1. In immediate anchor scope (for nested structures like dd/li)
        // 2. As sibling to anchor scope (for flat structures like p)
        // 3. In broader content scope
        // 4. Document-wide fallback
        const widget = anchorScope.querySelector('.ext-discussiontools-ui-replyWidget')
                    || anchorScope.querySelector('.ext-discussiontools-ui-newTopicWidget')
                    || (anchorScope.nextElementSibling && (
                         anchorScope.nextElementSibling.classList.contains('ext-discussiontools-ui-replyWidget') ||
                         anchorScope.nextElementSibling.classList.contains('ext-discussiontools-ui-newTopicWidget')
                       ) ? anchorScope.nextElementSibling : null)
                    || (anchorScope.parentElement && anchorScope.parentElement.querySelector('.ext-discussiontools-ui-replyWidget:last-child'))
                    || (anchorScope.parentElement && anchorScope.parentElement.querySelector('.ext-discussiontools-ui-newTopicWidget:last-child'))
                    || broadScope.querySelector('.ext-discussiontools-ui-replyWidget')
                    || broadScope.querySelector('.ext-discussiontools-ui-newTopicWidget')
                    || document.querySelector('.ext-discussiontools-ui-replyWidget')
                    || document.querySelector('.ext-discussiontools-ui-newTopicWidget');

        if (widget) {
          console.log(`[${NAME}] Widget found after ${attempts} attempts:`, widget.className);
          clearInterval(poll);
          startForWidget(widget);
        }
        else if (Date.now() > timeoutAt) {
          console.log(`[${NAME}] Widget timeout after ${attempts} attempts - no widget found`);
          console.log(`[${NAME}] Searched in anchorScope:`, anchorScope);
          console.log(`[${NAME}] Searched in broadScope:`, broadScope);
          clearInterval(poll);
        } else if (attempts % 10 === 0) {
          console.log(`[${NAME}] Still searching for widget, attempt ${attempts}...`);
        }
      }, 100);
    });
  }

  function installWidgetObserver() {
    const root = document.getElementById('content') || document.body;
    console.log(`[${NAME}] Setting up mutation observer on:`, root.id || root.tagName);

    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;

          // Log all significant additions for debugging
          if (n.className && typeof n.className === 'string' && n.className.includes('ext-discussiontools')) {
            console.log(`[${NAME}] DOM addition detected:`, n.tagName, n.className);
          }

          // Match specific DiscussionTools widgets
          if (n.matches('.ext-discussiontools-ui-replyWidget') || n.matches('.ext-discussiontools-ui-newTopicWidget')) {
            console.log(`[${NAME}] *** Widget detected via observer ***:`, n.className);
            startForWidget(n);
          } else {
            const nested = n.querySelector && (
              n.querySelector('.ext-discussiontools-ui-replyWidget') ||
              n.querySelector('.ext-discussiontools-ui-newTopicWidget')
            );
            if (nested) {
              console.log(`[${NAME}] *** Nested widget detected ***:`, nested.className);
              startForWidget(nested);
            }
          }
        }
      }
    });
    obs.observe(root, { childList: true, subtree: true });
    console.log(`[${NAME}] Mutation observer is now watching for widget creation`);

    // Check for existing widgets on page load
    const existingWidgets = document.querySelectorAll('.ext-discussiontools-ui-replyWidget, .ext-discussiontools-ui-newTopicWidget');
    if (existingWidgets.length > 0) {
      console.log(`[${NAME}] Found ${existingWidgets.length} existing widget(s) on page load`);
      existingWidgets.forEach(w => {
        console.log(`[${NAME}] Processing existing widget:`, w.className);
        startForWidget(w);
      });
    } else {
      console.log(`[${NAME}] No existing widgets found on page load`);
    }
  }

  // kick off
  installClickDelegation();
  installWidgetObserver();
  console.log(`[${NAME}] === INITIALIZATION COMPLETE ===`);
  console.log(`[${NAME}] Click delegation: ACTIVE`);
  console.log(`[${NAME}] Mutation observer: ACTIVE`);
  console.log(`[${NAME}] Waiting for user interaction...`);
})();
//</nowiki>