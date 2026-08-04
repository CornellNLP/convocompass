import { test, expect } from '@playwright/test';
import { setupConvoWizard, triggerReplyAndCapture } from './helpers.mjs';

// Helper: extract just the IDs from the 'existing' array in a /start payload
function ids(payload) {
  return (payload.existing || []).map(e => e.id);
}

// Helper: assert array is a prefix-free subset
function expectIds(actual, expected) {
  expect(actual).toEqual(expected);
}

test.describe('Corpus Extraction — Edge Cases', () => {

  // ── EC1: Reply to top-level comment (L1) ──────────────────────────────────
  // Target: UserAlice (replies directly to heading section)
  // Expected lineage: heading → Alice
  test('EC1 — L1 comment: lineage is [heading, alice]', async ({ page }) => {
    await setupConvoWizard(page);
    const payload = await triggerReplyAndCapture(
      page, 'c-UserAlice-20240101120000-PolicyDisagreement'
    );
    expectIds(ids(payload), [
      'h-PolicyDisagreement',
      'c-UserAlice-20240101120000-PolicyDisagreement',
    ]);
  });

  // ── EC2: Reply to L2 comment (Bob → Alice) ────────────────────────────────
  // Target: UserBob
  // Expected lineage: heading → Alice → Bob
  test('EC2 — L2 reply: lineage is [heading, alice, bob]', async ({ page }) => {
    await setupConvoWizard(page);
    const payload = await triggerReplyAndCapture(
      page, 'c-UserBob-20240101130000-UserAlice'
    );
    expectIds(ids(payload), [
      'h-PolicyDisagreement',
      'c-UserAlice-20240101120000-PolicyDisagreement',
      'c-UserBob-20240101130000-UserAlice',
    ]);
  });

  // ── EC3: Reply to L3 comment (Carol → Bob → Alice) ────────────────────────
  // Expected lineage: heading → Alice → Bob → Carol
  test('EC3 — L3 reply: lineage is [heading, alice, bob, carol]', async ({ page }) => {
    await setupConvoWizard(page);
    const payload = await triggerReplyAndCapture(
      page, 'c-UserCarol-20240101140000-UserBob'
    );
    expectIds(ids(payload), [
      'h-PolicyDisagreement',
      'c-UserAlice-20240101120000-PolicyDisagreement',
      'c-UserBob-20240101130000-UserAlice',
      'c-UserCarol-20240101140000-UserBob',
    ]);
  });

  // ── EC4: Reply to L4 comment (Dave → Carol → Bob → Alice) — deep nesting ──
  // Expected lineage: heading → Alice → Bob → Carol → Dave
  test('EC4 — L4 deep nesting: 5-element lineage including heading', async ({ page }) => {
    await setupConvoWizard(page);
    const payload = await triggerReplyAndCapture(
      page, 'c-UserDave-20240101150000-UserCarol'
    );
    expectIds(ids(payload), [
      'h-PolicyDisagreement',
      'c-UserAlice-20240101120000-PolicyDisagreement',
      'c-UserBob-20240101130000-UserAlice',
      'c-UserCarol-20240101140000-UserBob',
      'c-UserDave-20240101150000-UserCarol',
    ]);
  });

  // ── EC5: SIBLING ISOLATION — reply to Eve (sibling of Alice) ──────────────
  // Eve is at L1 but is a DIFFERENT top-level comment than Alice.
  // Expected lineage: heading → Eve
  // MUST NOT contain any of Alice/Bob/Carol/Dave
  test('EC5 — sibling isolation: replying to Eve excludes Alice subtree', async ({ page }) => {
    await setupConvoWizard(page);
    const payload = await triggerReplyAndCapture(
      page, 'c-UserEve-20240101160000-PolicyDisagreement'
    );
    const result = ids(payload);
    expectIds(result, [
      'h-PolicyDisagreement',
      'c-UserEve-20240101160000-PolicyDisagreement',
    ]);
    // Explicitly assert siblings are absent
    expect(result).not.toContain('c-UserAlice-20240101120000-PolicyDisagreement');
    expect(result).not.toContain('c-UserBob-20240101130000-UserAlice');
    expect(result).not.toContain('c-UserCarol-20240101140000-UserBob');
    expect(result).not.toContain('c-UserDave-20240101150000-UserCarol');
  });

  // ── EC6: Reply to Frank (nested inside Eve's subtree) ─────────────────────
  // Expected lineage: heading → Eve → Frank
  // MUST NOT contain Alice, Bob, Carol, or Dave
  test('EC6 — reply to Frank (child of Eve): correct subtree, no Alice subtree', async ({ page }) => {
    await setupConvoWizard(page);
    const payload = await triggerReplyAndCapture(
      page, 'c-UserFrank-20240101170000-UserEve'
    );
    const result = ids(payload);
    expectIds(result, [
      'h-PolicyDisagreement',
      'c-UserEve-20240101160000-PolicyDisagreement',
      'c-UserFrank-20240101170000-UserEve',
    ]);
    expect(result).not.toContain('c-UserAlice-20240101120000-PolicyDisagreement');
    expect(result).not.toContain('c-UserBob-20240101130000-UserAlice');
  });

});
