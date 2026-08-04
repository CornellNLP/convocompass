// Shared setup for all ConvoWizard Playwright tests.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

export const MOCK_HTML   = readFileSync(join(__dir, 'mock-wiki-talk.html'),        'utf8');
export const SCRIPT_SRC  = readFileSync(join(__dir, '../wiki-talk-page-script.js'),'utf8');

// 33-char hex token that passes the script's format check
export const FAKE_TOKEN = 'aabbccddeeff00112233445566778899a';

export const WIKI_URL    = 'https://en.wikipedia.org/wiki/Talk:TestPage';
export const BACKEND_URL = 'https://craft.infosci.cornell.edu/extension/';

/**
 * Route the mock Wikipedia page and backend, inject mw global + ConvoWizard script.
 * Returns a helper `captureNextStart()` that resolves with the /start POST body.
 */
export async function setupConvoWizard(page) {
  // Serve mock HTML at the Wikipedia URL
  await page.route(WIKI_URL, route =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: MOCK_HTML })
  );

  // Mock all backend calls with a permissive default response
  await page.route(BACKEND_URL + '**', async route => {
    const url = route.request().url();
    let body = { interaction_id: 'test-iid-001', craft_ctx_score: 0.6, which: 'craft_control' };
    if (url.endsWith('claim_token')) {
      // Return valid:true so the script accepts the fake token and sets TOKEN
      body = { valid: true };
    } else if (url.endsWith('continue')) {
      body = {
        interaction_id: 'test-iid-001',
        craft_ctx_score: 0.6,
        craft_reply_score: 0.4,
        craft_reply_change: -0.2,
        which: 'craft_control',
      };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  // Inject mw mock BEFORE page scripts run
  await page.addInitScript(token => {
    window.mw = {
      loader: { using: () => Promise.resolve() },
      config: {
        get(key) {
          if (key === 'wgNamespaceNumber') return 1; // talk namespace
          if (key === 'wgAction')          return 'view';
          if (key === 'wgUserName')        return 'TestUser';
          return null;
        },
      },
      user: {
        options: {
          get: k => (k === 'userjs-convowizard-token' ? token : null),
          set: () => null,
        },
      },
      Api: function () { return { saveOption: () => Promise.resolve() }; },
      util: { addCSS: () => {} },
    };
  }, FAKE_TOKEN);

  await page.goto(WIKI_URL);

  // Inject ConvoWizard AFTER page load (same as userscript injection)
  await page.addScriptTag({ content: SCRIPT_SRC });

  // Give the script's IIFE + mw.loader.using() time to settle
  await page.waitForTimeout(600);
}

/**
 * Simulates a Reply button click, then injects a DiscussionTools-style widget.
 * Returns the body of the /start POST that ConvoWizard sends.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} threadId - the data-mw-thread-id of the comment to reply to
 */
export async function triggerReplyAndCapture(page, threadId) {
  // Set up capture BEFORE triggering the action
  const startReqPromise = page.waitForRequest(
    req => req.url() === BACKEND_URL + 'start' && req.method() === 'POST',
    { timeout: 8000 }
  );

  // 1. Click reply button → queues pendingReplyBinding + starts polling
  await page.evaluate(tid => {
    const btn = document.querySelector(
      `.ext-discussiontools-init-replylink-buttons[data-mw-thread-id="${tid}"] .ext-discussiontools-init-replylink-reply`
    );
    if (!btn) throw new Error(`Reply button not found for thread: ${tid}`);
    btn.click();
  }, threadId);

  // Small delay to let the click handler register pendingReplyBinding
  await page.waitForTimeout(150);

  // 2. Inject a DiscussionTools-style widget next to the reply button container
  //    (the polling loop will find it and call startForWidget)
  await page.evaluate(tid => {
    const container = document.querySelector(
      `.ext-discussiontools-init-replylink-buttons[data-mw-thread-id="${tid}"]`
    )?.parentElement;
    if (!container) throw new Error(`Container not found for thread: ${tid}`);

    const widget = document.createElement('div');
    widget.className = 'ext-discussiontools-ui-replyWidget';

    const textbox = document.createElement('div');
    textbox.setAttribute('role', 'textbox');
    textbox.setAttribute('contenteditable', 'true');
    textbox.style.cssText = 'min-height:60px;border:1px solid #ccc;padding:4px;';
    widget.appendChild(textbox);

    container.appendChild(widget);
  }, threadId);

  // 3. Wait for the /start POST to be captured
  const req = await startReqPromise;
  return JSON.parse(req.postData() || '{}');
}
