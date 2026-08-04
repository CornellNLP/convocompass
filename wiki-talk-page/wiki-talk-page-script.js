//<nowiki>
/**
 * Filename: wiki-talk-page-script.js
 * ConvoWizard – Real-time Reply Feedback (Wikipedia userscript)
 * Runs on Talk pages inside DiscussionTools reply widgets.
 * Prompts for a token on first run; persists after authorization.
 */
(async function () {
  'use strict';
  
  // Load core util module via ResourceLoader
  await mw.loader.using(['mediawiki.util', 'mediawiki.user', 'mediawiki.api']);
  
  // === CONFIG ===
  const SERVER = 'https://craft.infosci.cornell.edu/extension/';
  
  // ---- UI strings and thresholds ----
  const NAME = 'ConvoWizard';
  const DEBUG = /(?:\?|&)convowizardDebug=1(?:&|$)/.test(location.search);
  const OPTION_KEY = 'userjs-convowizard-token';
  const SCORE_CHANGE_THRESH = 0.08;
  const MID_TENSION_THRESH = 0.50;
  const HIGH_TENSION_THRESH = 0.75;
  const CONTEXT_LOW = `${NAME} will notify you here if it detects anything in the preceding conversation.`;
  const CONTEXT_MID = `${NAME} thinks this discussion is getting somewhat tense - some other discussions that started like this one ended up with comments getting removed. Remember that you will be most likely to have a productive discussion with a civil, respectful, and open approach.`;
  const CONTEXT_HIGH = `${NAME} thinks this discussion is getting tense - some other discussions that started like this one ended up with comments getting removed. Remember that you will be most likely to have a productive discussion with a civil, respectful, and open approach.`;
  const CONTEXT_VERY_HIGH = `${NAME} thinks this discussion is getting very tense - some other discussions that started like this one ended up with comments getting removed. Remember that you will be most likely to have a productive discussion with a civil, respectful, and open approach.`;
  const REPLY_LOW = `${NAME} thinks this comment might decrease tension in this discussion.`;
  const REPLY_MID = `${NAME} will notify you here if it detects anything in your comment draft.`;
  const REPLY_HIGH = `${NAME} thinks this comment might increase the tension in this discussion. Remember that you will be most likely to have a productive discussion with a civil, respectful, and open approach.`;

  const TENSION_COLORS = {
    mid:      { border: '#e8825c', bg: 'linear-gradient(135deg, #fff0eb 0%, #fff8f5 100%)', icon: '#e8825c' },
    high:     { border: '#d73027', bg: 'linear-gradient(135deg, #ffeaea 0%, #fff5f5 100%)', icon: '#d73027' },
    veryHigh: { border: '#a50f15', bg: 'linear-gradient(135deg, #fdd 0%, #fee 100%)',       icon: '#a50f15' },
  };

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
  if (!isWikipediaHost || !isTalkNamespace || !isViewAction) {
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
      try { return JSON.parse(text); } catch { return {}; }
    } catch {
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
    desc.textContent = 'Please paste your ConvoWizard token below to activate the extension.';

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
  const widgetThreadIds = new WeakMap();
  const pendingReplyBindings = [];
  const COMMENT_CONTAINER_SELECTOR = 'dd, li, p, h1, h2, h3, h4, h5, h6';
  const COMMENT_START_SELECTOR = '[data-mw-comment-start][id]';
  const PENDING_BINDING_TTL_MS = 12000;

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function cleanupStalePendingBindings() {
    const cutoff = Date.now() - PENDING_BINDING_TTL_MS;
    for (let i = pendingReplyBindings.length - 1; i >= 0; i--) {
      const item = pendingReplyBindings[i];
      if (
        !item ||
        !item.threadId ||
        item.createdAt < cutoff ||
        (item.scopeEl && !item.scopeEl.isConnected)
      ) {
        pendingReplyBindings.splice(i, 1);
      }
    }
  }

  function queuePendingReplyBinding(threadId, scopeEl) {
    if (!threadId) return;
    cleanupStalePendingBindings();
    pendingReplyBindings.push({
      threadId,
      scopeEl: scopeEl || null,
      createdAt: Date.now()
    });
    if (pendingReplyBindings.length > 20) {
      pendingReplyBindings.splice(0, pendingReplyBindings.length - 20);
    }
  }

  function clearPendingReplyBinding(threadId) {
    if (!threadId) return;
    cleanupStalePendingBindings();
    for (let i = pendingReplyBindings.length - 1; i >= 0; i--) {
      if (pendingReplyBindings[i] && pendingReplyBindings[i].threadId === threadId) {
        pendingReplyBindings.splice(i, 1);
      }
    }
  }

  function consumePendingReplyBinding(widgetEl, preferredScopeEl = null) {
    cleanupStalePendingBindings();
    if (pendingReplyBindings.length === 0) return null;
    const now = Date.now();
    let bestIndex = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < pendingReplyBindings.length; i++) {
      const item = pendingReplyBindings[i];
      let score = 0;
      if (item.threadId) score += 5;
      const ageMs = now - item.createdAt;
      score += Math.max(0, 20 - Math.floor(ageMs / 500));
      if (preferredScopeEl && item.scopeEl === preferredScopeEl) score += 80;
      if (item.scopeEl && item.scopeEl.isConnected) {
        if (item.scopeEl.contains(widgetEl)) score += 120;
        if (widgetEl.contains(item.scopeEl)) score += 110;
        if (item.scopeEl.parentElement && item.scopeEl.parentElement.contains(widgetEl)) score += 70;
        const scopeComment = item.scopeEl.closest(COMMENT_CONTAINER_SELECTOR);
        const widgetComment = widgetEl.closest(COMMENT_CONTAINER_SELECTOR);
        if (scopeComment && widgetComment && scopeComment === widgetComment) score += 160;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) return null;
    const [best] = pendingReplyBindings.splice(bestIndex, 1);
    return best && best.threadId ? best.threadId : null;
  }

  function bindThreadIdToWidget(widgetEl, threadId) {
    if (!widgetEl || !threadId) return null;
    widgetThreadIds.set(widgetEl, threadId);
    widgetEl.setAttribute('data-convowizard-thread-id', threadId);
    return threadId;
  }

  function getBoundThreadId(widgetEl) {
    if (!widgetEl) return null;
    const fromMap = widgetThreadIds.get(widgetEl);
    if (fromMap) return fromMap;
    const fromAttr = widgetEl.getAttribute('data-convowizard-thread-id');
    if (fromAttr) {
      widgetThreadIds.set(widgetEl, fromAttr);
      return fromAttr;
    }
    return null;
  }
  
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

  function getThreadIdForWidget(widgetEl) {
    const boundThreadId = getBoundThreadId(widgetEl);
    if (boundThreadId) return boundThreadId;
    try {
      const nearbyThreadId = widgetEl
        .closest('dd, li, p, section, article, div')
        ?.querySelector('.ext-discussiontools-init-replylink-buttons[data-mw-thread-id]')
        ?.getAttribute('data-mw-thread-id');
      if (nearbyThreadId) {
        return bindThreadIdToWidget(widgetEl, nearbyThreadId);
      }

      const urlHash = location.hash ? location.hash.replace('#', '') : 'root';
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
      return `thread_${urlHash}_${domPath.substring(0, 80)}`;
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
        const existingEntries = Array.isArray(st.contextEntries) ? st.contextEntries : [];
        const existingForContinue = existingEntries.map(entry => ({
          id: entry.id,
          text: entry.text
        }));
        const replyTargetId = st.threadId || (existingForContinue.length > 0 ? existingForContinue[existingForContinue.length - 1].id : null);

        // Re-run request to refresh display
        const inputText = st.inputEl.innerText || st.inputEl.textContent || st.inputEl.value || '';
        if (inputText.trim().length > 0 && st.interactionId) {
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
          const data = await postJson('start', {
            existing: existingForContinue,
            reply_id: replyTargetId,
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
        startForWidget(widgetEl, threadId);
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
          setEditorBackgroundWhite(st.inputEl);
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
      textSpan.textContent = `${NAME}: Context Summary`;
      cheader.appendChild(iconSvg);
      cheader.appendChild(textSpan);
      if (threadId) {
        const muteBtn = createMuteButton(threadId, widgetId, isMuted);
        cheader.appendChild(muteBtn);
      }
      const ccontent = document.createElement('div');
      ccontent.id = `${contextId}_p`;
      ccontent.style.cssText = `font-size:13px;line-height:1.4;color:#333;margin:0;`;
      ccontent.textContent = `When you type a reply ${NAME} will give you some feedback on the discussion context.`;
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
      textSpan.textContent = `${NAME}: Reply Summary`;
      header.appendChild(iconSvg);
      header.appendChild(textSpan);
      if (threadId) {
        const muteBtn = createMuteButton(threadId, widgetId, isMuted);
        header.appendChild(muteBtn);
      }
      const content = document.createElement('div');
      content.id = `${replyId}_p`;
      content.style.cssText = `font-size:13px;line-height:1.4;color:#333;margin:0;`;
      content.textContent = `When you type a reply ${NAME} will give you some feedback on your comment.`;
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
  
  function updateContextPanel(contextId, score, showScores) {
    console.log(`[${NAME}] updateContextPanel called - contextId: ${contextId}, score: ${score}, showScores: ${showScores}`);
    
    const hasScore = typeof score === 'number';
    let text = showScores && hasScore ? `Context craft score: ${score.toFixed(4)} ` : '';
    let borderColor = '#0645ad';
    let bgGradient = 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)';
    let iconColor = '#0645ad';
    let icon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                 <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm1 13H7v-2h2v2zm0-3H7V4h2v6z"/>
               </svg>`;
    
    console.log(`[${NAME}] hasScore: ${hasScore}, score value: ${score}`);
    console.log(`[${NAME}] Thresholds - MID: ${MID_TENSION_THRESH}, HIGH: ${HIGH_TENSION_THRESH}`);
    
    if (hasScore && score > MID_TENSION_THRESH) {
      let level;
      if (score > HIGH_TENSION_THRESH) {
        console.log(`[${NAME}] Very high tension (score > ${HIGH_TENSION_THRESH})`);
        text += `${CONTEXT_VERY_HIGH}`;
        level = 'veryHigh';
      } else if (score > 0.60) {
        console.log(`[${NAME}] High tension (score > 0.60)`);
        text += `${CONTEXT_HIGH}`;
        level = 'high';
      } else {
        console.log(`[${NAME}] Mid tension (score > ${MID_TENSION_THRESH})`);
        text += `${CONTEXT_MID}`;
        level = 'mid';
      }
      borderColor = TENSION_COLORS[level].border;
      bgGradient = TENSION_COLORS[level].bg;
      iconColor = TENSION_COLORS[level].icon;
      icon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
               <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zM7 4h2v5H7V4zm0 6h2v2H7v-2z"/>
             </svg>`;
    } else {
      console.log(`[${NAME}] Low tension or no score`);
      text += `${CONTEXT_LOW}`;
    }
    
    const box = document.getElementById(`${contextId}_d`);
    const p = document.getElementById(`${contextId}_p`);
    const h = document.getElementById(`${contextId}_h`);
    
    console.log(`[${NAME}] DOM elements - box: ${!!box}, p: ${!!p}, h: ${!!h}`);
    
    if (box) {
      const muteBtn = box.querySelector('.convowizard-mute-btn');
      if (muteBtn) {
        const threadId = muteBtn.getAttribute('data-thread-id');
        if (threadId && isThreadMuted(threadId)) {
          box.style.display = 'none';
          return;
        }
      }
      
      box.style.borderColor = borderColor;
      box.style.background = bgGradient;
      box.style.boxShadow = `0 2px 8px ${borderColor}20`;
      if (box.style.display === 'none' && (!muteBtn || !isThreadMuted(muteBtn.getAttribute('data-thread-id')))) {
        box.style.display = '';
      }
    }
    if (p) {
      p.textContent = text;
      console.log(`[${NAME}] Updated text content (length: ${text.length})`);
    }
    if (h) {
      h.style.color = iconColor;
      // Update the SVG icon
      const existingSvg = h.querySelector('svg:not(.convowizard-mute-btn svg)');
      if (existingSvg) {
        const temp = document.createElement('div');
        temp.innerHTML = icon;
        const newSvg = temp.querySelector('svg');
        if (newSvg) {
          existingSvg.replaceWith(newSvg);
        }
      }
      // Update text span
      const textSpan = h.querySelector('span.convowizard-header-text');
      if (textSpan) {
        textSpan.textContent = `${NAME}: Context Summary`;
      }
      console.log(`[${NAME}] Updated header color: ${iconColor}`);
    }
  }

  function setEditorBackgroundWhite(inputEl) {
    if (!inputEl) return;
    inputEl.style.setProperty('background-color', '#ffffff', 'important');
    inputEl.style.setProperty('background-image', 'none', 'important');
    inputEl.style.setProperty('transition', 'background-color 0.2s ease', 'important');
  }
  
  function updateReplyPanel(replyId, scoreChange, rawScore, showScores, inputEl) {
    let text = showScores ? `Change in craft score after your comment: ${scoreChange.toFixed(4)} ` : '';
    let borderColor = '#0645ad';
    let bgGradient = 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)';
    let iconColor = '#0645ad';
    let icon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                 <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm1 13H7v-2h2v2zm0-3H7V4h2v6z"/>
               </svg>`;
    
    if (scoreChange > SCORE_CHANGE_THRESH || (rawScore > 0.55 && scoreChange > 0)) {
      text += `${REPLY_HIGH}`;
      const level = rawScore > HIGH_TENSION_THRESH ? 'veryHigh' : rawScore > 0.60 ? 'high' : 'mid';
      borderColor = TENSION_COLORS[level].border;
      bgGradient = TENSION_COLORS[level].bg;
      iconColor = TENSION_COLORS[level].icon;
      icon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
               <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zM7 4h2v5H7V4zm0 6h2v2H7v-2z"/>
             </svg>`;
    } else if (rawScore - scoreChange > 0.55 && scoreChange < -SCORE_CHANGE_THRESH) {
      text += `${REPLY_LOW}`;
      borderColor = '#4caf50';
      bgGradient = 'linear-gradient(135deg, #f1f8e9 0%, #f9fbe7 100%)';
      iconColor = '#4caf50';
      icon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
               <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm3.5 6L6.5 11 4 8.5l1-1 1.5 1.5L10.5 5l1 1z"/>
             </svg>`;
    } else {
      text += `${REPLY_MID}`;
    }
    
    if (inputEl) {
      let threadId = null;
      const replyBox = document.getElementById(`${replyId}_d`);
      if (replyBox) {
        const muteBtn = replyBox.querySelector('.convowizard-mute-btn');
        if (muteBtn) {
          threadId = muteBtn.getAttribute('data-thread-id');
        }
      }
      // If no thread ID from panel, try to get from widget
      if (!threadId) {
        const widgetEl = inputEl.closest('.ext-discussiontools-ui-replyWidget') || 
                         inputEl.closest('.ext-discussiontools-ui-newTopicWidget');
        if (widgetEl) {
          threadId = getThreadIdForWidget(widgetEl);
        }
      }
      // If muted, clear background and return
      if (threadId && isThreadMuted(threadId)) {
        setEditorBackgroundWhite(inputEl);
        return;
      }
      setEditorBackgroundWhite(inputEl);
    }
    
    const box = document.getElementById(`${replyId}_d`);
    const p = document.getElementById(`${replyId}_p`);
    const h = document.getElementById(`${replyId}_h`);
    if (box) {
      const muteBtn = box.querySelector('.convowizard-mute-btn');
      if (muteBtn) {
        const threadId = muteBtn.getAttribute('data-thread-id');
        if (threadId && isThreadMuted(threadId)) {
          box.style.display = 'none';
          return;
        }
      }
      
      box.style.borderColor = borderColor;
      box.style.background = bgGradient;
      box.style.boxShadow = `0 2px 8px ${borderColor}20`;
      if (box.style.display === 'none' && (!muteBtn || !isThreadMuted(muteBtn.getAttribute('data-thread-id')))) {
        box.style.display = '';
      }
    }
    if (p) p.textContent = text;
    if (h) {
      h.style.color = iconColor;
      // Update the SVG icon
      const existingSvg = h.querySelector('svg:not(.convowizard-mute-btn svg)');
      if (existingSvg) {
        const temp = document.createElement('div');
        temp.innerHTML = icon;
        const newSvg = temp.querySelector('svg');
        if (newSvg) {
          existingSvg.replaceWith(newSvg);
        }
      }
      // Update text span
      const textSpan = h.querySelector('span.convowizard-header-text');
      if (textSpan) {
        textSpan.textContent = `${NAME}: Reply Summary`;
      }
    }
  }
  
  
  function normalizeCommentText(text) {
    return (text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function findCommentStartMarker(threadId) {
    if (!threadId) return null;
    return document.querySelector(`[data-mw-comment-start][id="${cssEscape(threadId)}"]`);
  }

  function findCommentEndMarker(threadId) {
    if (!threadId) return null;
    return document.querySelector(`[data-mw-comment-end="${cssEscape(threadId)}"]`);
  }

  function extractCommentTextByThreadId(threadId) {
    const startMarker = findCommentStartMarker(threadId);
    if (!startMarker) return '';
    const endMarker = findCommentEndMarker(threadId);
    const host = document.createElement('div');
    try {
      const range = document.createRange();
      range.setStartAfter(startMarker);
      if (endMarker) {
        range.setEndBefore(endMarker);
      } else {
        const fallbackContainer = startMarker.closest(COMMENT_CONTAINER_SELECTOR) || startMarker.parentElement;
        if (fallbackContainer && fallbackContainer.lastChild) {
          range.setEndAfter(fallbackContainer.lastChild);
        } else {
          range.setEndAfter(startMarker);
        }
      }
      host.appendChild(range.cloneContents());
    } catch (err) {
      const fallbackContainer = startMarker.closest(COMMENT_CONTAINER_SELECTOR) || startMarker.parentElement;
      if (fallbackContainer) {
        host.appendChild(fallbackContainer.cloneNode(true));
      }
      console.warn(`[${NAME}] Failed marker-bounded extraction for ${threadId}, using fallback`, err);
    }

    host.querySelectorAll(
      'dl, ul, ol, .ext-discussiontools-ui-replyWidget, .ext-discussiontools-ui-newTopicWidget, .craftDisplay, .passiveModeDisplay, .ext-discussiontools-init-replylink-buttons, [role="button"], style, script'
    ).forEach(n => n.remove());
    const raw = host.innerText || host.textContent || '';
    return normalizeCommentText(raw);
  }

  function resolveParentThreadIdFromCommentId(threadId, currentStartMarker = null) {
    if (!threadId || !threadId.startsWith('c-')) return null;
    const match = threadId.match(/^c-(.+)-(\d{14})-(.+)$/);
    if (!match) return null;
    const parentSuffix = match[3];
    if (!parentSuffix) return null;

    const currentMarker = currentStartMarker || findCommentStartMarker(threadId);
    const headingBase = `h-${parentSuffix}`;
    const headingMarkers = Array.from(
      document.querySelectorAll(`[data-mw-comment-start][id^="${cssEscape(headingBase)}"]`)
    ).filter(marker => (
      marker.id === headingBase ||
      marker.id.startsWith(`${headingBase}-`)
    ));
    if (headingMarkers.length > 0) {
      headingMarkers.sort((a, b) => {
        if (a === b) return 0;
        return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });
      if (currentMarker) {
        const precedingHeading = headingMarkers.filter(marker => (
          marker.compareDocumentPosition(currentMarker) & Node.DOCUMENT_POSITION_FOLLOWING
        ));
        if (precedingHeading.length > 0) {
          return precedingHeading[precedingHeading.length - 1].id;
        }
      }
      return headingMarkers[headingMarkers.length - 1].id;
    }

    const markerPrefix = `c-${parentSuffix}-`;
    const candidateMarkers = Array.from(
      document.querySelectorAll(`[data-mw-comment-start][id^="${cssEscape(markerPrefix)}"]`)
    );
    const exactCommentId = `c-${parentSuffix}`;
    const exactMarker = findCommentStartMarker(exactCommentId);
    if (exactMarker) candidateMarkers.push(exactMarker);
    if (candidateMarkers.length === 0) return null;

    const uniqueMarkers = [];
    const seenIds = new Set();
    candidateMarkers.forEach(marker => {
      if (!marker || !marker.id || seenIds.has(marker.id)) return;
      seenIds.add(marker.id);
      uniqueMarkers.push(marker);
    });

    uniqueMarkers.sort((a, b) => {
      if (a === b) return 0;
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    if (!currentMarker) {
      return uniqueMarkers[uniqueMarkers.length - 1].id;
    }

    const preceding = uniqueMarkers.filter(marker => (
      marker.compareDocumentPosition(currentMarker) & Node.DOCUMENT_POSITION_FOLLOWING
    ));
    if (preceding.length > 0) {
      return preceding[preceding.length - 1].id;
    }
    return uniqueMarkers[uniqueMarkers.length - 1].id;
  }

  function buildLineageIdsForThread(targetThreadId) {
    const lineageIds = [];
    const seen = new Set();
    let currentThreadId = targetThreadId;
    let guard = 0;
    while (currentThreadId && guard++ < 40) {
      if (seen.has(currentThreadId)) break;
      const startMarker = findCommentStartMarker(currentThreadId);
      if (!startMarker) {
        console.warn(`[${NAME}] Missing marker for thread id ${currentThreadId}, stopping lineage traversal`);
        break;
      }
      seen.add(currentThreadId);
      lineageIds.unshift(currentThreadId);
      const parentThreadId = resolveParentThreadIdFromCommentId(currentThreadId, startMarker);
      if (!parentThreadId) break;
      currentThreadId = parentThreadId;
    }
    return lineageIds;
  }

  function buildContextEntriesForThread(targetThreadId) {
    if (!targetThreadId) return [];
    const lineageIds = buildLineageIdsForThread(targetThreadId);
    const entries = lineageIds
      .map(id => ({ id, text: extractCommentTextByThreadId(id) }))
      .filter(entry => entry.text && entry.text.length > 0);
    console.log(`[${NAME}] Thread ${targetThreadId} lineage IDs:`, lineageIds);
    console.log(`[${NAME}] Thread ${targetThreadId} extracted entries:`, entries.map(e => e.id));
    return entries;
  }

  function getFallbackContextEntriesForWidget(widgetEl) {
    const fallbackThreadId = widgetEl
      .closest('dd, li, p, section, article, div')
      ?.querySelector('.ext-discussiontools-init-replylink-buttons[data-mw-thread-id]')
      ?.getAttribute('data-mw-thread-id');
    if (!fallbackThreadId) return [];
    return buildContextEntriesForThread(fallbackThreadId);
  }

  function getContextEntriesForWidget(widgetEl, threadIdHint = null) {
    try {
      const threadId = threadIdHint || getThreadIdForWidget(widgetEl);
      if (threadId && (/^c-/.test(threadId) || /^h-/.test(threadId))) {
        const markerEntries = buildContextEntriesForThread(threadId);
        if (markerEntries.length > 0) return markerEntries;
      }
      return getFallbackContextEntriesForWidget(widgetEl);
    } catch (err) {
      console.error(`[${NAME}] Error building context entries:`, err);
      return [];
    }
  }

  function getContextStringFor(widgetEl, threadIdHint = null) {
    const entries = getContextEntriesForWidget(widgetEl, threadIdHint);
    return entries.map(entry => entry.text).join('\n\n');
  }
  
  async function startForWidget(widgetEl, threadIdHint = null) {
    const consumedThreadId = threadIdHint ? null : consumePendingReplyBinding(widgetEl);
    const boundThreadId = bindThreadIdToWidget(widgetEl, threadIdHint || consumedThreadId);
    if (threadIdHint) {
      clearPendingReplyBinding(threadIdHint);
    }
    if (boundThreadId) {
      console.log(`[${NAME}] Bound widget to thread id: ${boundThreadId}`);
    }

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

    setEditorBackgroundWhite(inputEl);

    const st = widgetState.get(widgetEl);
    const threadId = (st && st.threadId) || getThreadIdForWidget(widgetEl);
    if (st && !st.threadId && threadId) {
      st.threadId = threadId;
    }
    const contextEntries = getContextEntriesForWidget(widgetEl, threadId);
    const context = contextEntries.map(entry => entry.text).join('\n\n');
    const existing = contextEntries.map(entry => ({
      id: entry.id,
      text: entry.text
    }));
    const replyTargetId = (
      threadId && (/^c-/.test(threadId) || /^h-/.test(threadId))
        ? threadId
        : (existing.length > 0 ? existing[existing.length - 1].id : null)
    );

    console.log(`[${NAME}] Target thread id: ${replyTargetId || 'none'}`);
    console.log(`[${NAME}] Existing entry IDs:`, existing.map(entry => entry.id));
    console.log(`[${NAME}] Context extracted, length: ${context.length} chars`);
    console.log(`[${NAME}] Context preview:`, context.substring(0, 200));
    
    const data = await postJson('start', {
      existing,
      reply_id: replyTargetId,
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
    
    widgetState.set(widgetEl, {
      interactionId: data.interaction_id,
      inputEl,
      context,
      contextEntries,
      threadId: replyTargetId
    });
    handleIntervention(widgetEl, inputEl, data);
    
    const sendContinue = throttle(async () => {
      const st = widgetState.get(widgetEl);
      if (!st) return;
      
      // Check if thread is muted
      const threadId = st.threadId || getThreadIdForWidget(widgetEl);
      if (threadId && isThreadMuted(threadId)) {
        // Clear input background if muted
        if (st.inputEl) {
          setEditorBackgroundWhite(st.inputEl);
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
          textSpan.textContent = `${NAME}: Reply Summary (Processing...)`;
        }
      }
      const existingForContinue = (Array.isArray(st.contextEntries) ? st.contextEntries : []).map(entry => ({
        id: entry.id,
        text: entry.text
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
    }, 3000);
    
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
          const existingForSubmit = (Array.isArray(st.contextEntries) ? st.contextEntries : []).map(entry => ({
            id: entry.id,
            text: entry.text
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
    
    const state = widgetState.get(widgetEl);
    const threadId = (state && state.threadId) || getThreadIdForWidget(widgetEl);
    if (state && !state.threadId && threadId) {
      state.threadId = threadId;
    }
    
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
    
    const which = (data.which || '').substring(0, 5);
    console.log(`[${NAME}] Response type (which): ${which}`);
    
    if (which === 'craft') {
      console.log(`[${NAME}] CRAFT mode - craft_ctx_score:`, data.craft_ctx_score);
      console.log(`[${NAME}] CRAFT mode - craft_reply_score:`, data.craft_reply_score);
      console.log(`[${NAME}] CRAFT mode - craft_reply_change:`, data.craft_reply_change);
      
      if (data.craft_ctx_score != null) {
        console.log(`[${NAME}] Updating context panel with score: ${data.craft_ctx_score}`);
        updateContextPanel(contextId, data.craft_ctx_score, showScores);
      } else {
        console.log(`[${NAME}] No context score, updating context panel with null`);
        updateContextPanel(contextId, null, showScores);
      }
      if (data.craft_reply_change != null && data.craft_reply_score != null) {
        console.log(`[${NAME}] Updating reply panel with change: ${data.craft_reply_change}, score: ${data.craft_reply_score}`);
        updateReplyPanel(replyId, data.craft_reply_change, data.craft_reply_score, showScores, inputEl);
      } else {
        console.log(`[${NAME}] No reply scores, updating reply panel with zeros`);
        updateReplyPanel(replyId, 0, 0, showScores, inputEl);
      }
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

  function getReplyThreadIdFromLink(linkEl) {
    if (!linkEl) return null;
    const threadHolder = linkEl.closest('.ext-discussiontools-init-replylink-buttons[data-mw-thread-id], [data-mw-thread-id]');
    const threadId = threadHolder ? threadHolder.getAttribute('data-mw-thread-id') : null;
    return threadId || null;
  }

  function findBestWidgetCandidate(scopeEl, broadScopeEl) {
    const root = broadScopeEl || document;
    const candidates = Array.from(
      root.querySelectorAll('.ext-discussiontools-ui-replyWidget, .ext-discussiontools-ui-newTopicWidget')
    ).filter(widget => (
      !widgetState.has(widget) &&
      widget.getAttribute('data-convowizard-processing') !== 'true'
    ));
    if (candidates.length === 0) return null;
    if (!scopeEl) return candidates[0];
    const scopeComment = scopeEl.closest(COMMENT_CONTAINER_SELECTOR);
    let bestWidget = null;
    let bestScore = -Infinity;
    for (const widget of candidates) {
      let score = 0;
      if (scopeEl.contains(widget)) score += 120;
      if (widget.contains(scopeEl)) score += 110;
      if (scopeEl.parentElement && scopeEl.parentElement.contains(widget)) score += 70;
      const widgetComment = widget.closest(COMMENT_CONTAINER_SELECTOR);
      if (scopeComment && widgetComment && scopeComment === widgetComment) score += 180;
      if (score > bestScore) {
        bestScore = score;
        bestWidget = widget;
      }
    }
    return bestWidget || candidates[0];
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
      const clickedThreadId = getReplyThreadIdFromLink(link);
      if (clickedThreadId) {
        queuePendingReplyBinding(clickedThreadId, anchorScope);
      }
      console.log(`[${NAME}] Clicked thread id: ${clickedThreadId || 'none'}`);
      
      console.log(`[${NAME}] Anchor scope:`, anchorScope.tagName, anchorScope.className);
      console.log(`[${NAME}] Broad scope:`, broadScope.tagName, broadScope.className);
      
      const timeoutAt = Date.now() + 8000;
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        const widget = findBestWidgetCandidate(anchorScope, broadScope)
                    || findBestWidgetCandidate(null, document);
        
        if (widget) { 
          console.log(`[${NAME}] Widget found after ${attempts} attempts:`, widget.className);
          clearInterval(poll); 
          startForWidget(widget, clickedThreadId); 
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
            startForWidget(n, consumePendingReplyBinding(n));
          } else {
            const nested = n.querySelector && (
              n.querySelector('.ext-discussiontools-ui-replyWidget') ||
              n.querySelector('.ext-discussiontools-ui-newTopicWidget')
            );
            if (nested) {
              console.log(`[${NAME}] *** Nested widget detected ***:`, nested.className);
              startForWidget(nested, consumePendingReplyBinding(nested));
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