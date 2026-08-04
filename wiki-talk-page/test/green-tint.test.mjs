import { test, expect } from '@playwright/test';
import { setupConvoWizard, triggerReplyAndCapture, BACKEND_URL } from './helpers.mjs';

const TARGET = 'c-UserBob-20240101130000-UserAlice'; // tense context

test.describe('Green Tint Prevention', () => {

  test('input box is white immediately after widget detection (before scoring)', async ({ page }) => {
    await setupConvoWizard(page);

    // Capture /start to know when script has processed the widget
    const startReqPromise = page.waitForRequest(
      req => req.url() === BACKEND_URL + 'start' && req.method() === 'POST',
      { timeout: 8000 }
    );

    // Trigger reply (but don't wait for startReqPromise yet — just inject widget)
    await page.evaluate(tid => {
      const btn = document.querySelector(
        `.ext-discussiontools-init-replylink-buttons[data-mw-thread-id="${tid}"] .ext-discussiontools-init-replylink-reply`
      );
      if (!btn) throw new Error('Reply button missing');
      btn.click();
    }, TARGET);
    await page.waitForTimeout(150);

    // Inject widget
    await page.evaluate(tid => {
      const container = document.querySelector(
        `.ext-discussiontools-init-replylink-buttons[data-mw-thread-id="${tid}"]`
      )?.parentElement;
      const widget = document.createElement('div');
      widget.className = 'ext-discussiontools-ui-replyWidget';
      const textbox = document.createElement('div');
      textbox.setAttribute('role', 'textbox');
      textbox.setAttribute('contenteditable', 'true');
      textbox.style.cssText = 'min-height:60px;border:1px solid #ccc;padding:4px;';
      widget.appendChild(textbox);
      container.appendChild(widget);
    }, TARGET);

    // Wait for /start to be called (script has now seen the widget and run setEditorBackgroundWhite)
    await startReqPromise;
    await page.waitForTimeout(200); // let any async style updates settle

    // Measure input background
    const inputBg = await page.evaluate(() => {
      const tb = document.querySelector('div[role="textbox"]');
      if (!tb) return null;
      return window.getComputedStyle(tb).backgroundColor;
    });

    // Take screenshot for human verification
    await page.screenshot({ path: 'screenshots/before-scoring.png', fullPage: true });

    // Input must not be green — white is rgb(255, 255, 255)
    expect(inputBg).toBe('rgb(255, 255, 255)');
    console.log(`Input background before scoring: ${inputBg}`);
  });

  test('panel turns green but input stays white after peaceful reply to tense context', async ({ page }) => {
    // Override the /continue mock to return strong de-escalation signal
    // IMPORTANT: register specific route BEFORE setupConvoWizard sets up the wildcard route
    await page.route(BACKEND_URL + 'continue', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          interaction_id: 'test-iid-001',
          craft_ctx_score: 0.70,
          craft_reply_score: 0.45,
          craft_reply_change: -0.25,  // significant decrease → green
          // Green condition: rawScore - scoreChange > 0.55 && scoreChange < -SCORE_CHANGE_THRESH
          // 0.45 - (-0.25) = 0.70 > 0.55, and -0.25 < -0.08  => green
          which: 'craft_control',
        }),
      });
    });

    await setupConvoWizard(page);
    // Trigger the widget and wait for /start
    await triggerReplyAndCapture(page, TARGET);
    await page.waitForTimeout(300);

    // Simulate typing (triggers the throttled input listener → /continue)
    const textbox = page.locator('div[role="textbox"]');
    await textbox.click();
    await textbox.type('I apologize for the heated exchange. Let us focus on the article.');

    // Wait for /continue to fire
    await page.waitForRequest(
      req => req.url() === BACKEND_URL + 'continue' && req.method() === 'POST',
      { timeout: 8000 }
    );
    await page.waitForTimeout(500); // let updateReplyPanel run

    // Take screenshot
    await page.screenshot({ path: 'screenshots/after-green-continue.png', fullPage: true });

    // Check the REPLY display panel (.craftDisplay with id starting "reply_") has green border.
    // There are two .craftDisplay panels: context panel (id="context_*_d") and reply panel
    // (id="reply_*_d"). querySelector returns the first match (context), so we must select
    // specifically the reply panel.
    const panelBorderColor = await page.evaluate(() => {
      const panel = document.querySelector('[id^="reply_"].craftDisplay');
      if (!panel) return null;
      return window.getComputedStyle(panel).borderColor;
    });

    // Check input is still white
    const inputBg = await page.evaluate(() => {
      const tb = document.querySelector('div[role="textbox"]');
      if (!tb) return null;
      return window.getComputedStyle(tb).backgroundColor;
    });

    console.log(`Panel border: ${panelBorderColor}`);
    console.log(`Input background: ${inputBg}`);

    // Panel must have green border: rgb(76, 175, 80) = #4caf50
    expect(panelBorderColor).toBe('rgb(76, 175, 80)');

    // Input must remain white
    expect(inputBg).toBe('rgb(255, 255, 255)');
    console.log('Green tint correctly on panel only, not on input');
  });

});
