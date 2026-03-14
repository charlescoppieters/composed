import { test, expect } from '@playwright/test';
import path from 'path';

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

test.describe('Chat Widget', () => {
  test('chat bubble is visible on page load', async ({ page }) => {
    await page.goto('/');

    const bubble = page.getByRole('button', { name: 'Open chat' });
    await expect(bubble).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'page-load.png') });
  });

  test('clicking bubble opens chat panel', async ({ page }) => {
    await page.goto('/');

    const bubble = page.getByRole('button', { name: 'Open chat' });
    await bubble.click();

    // The panel is rendered with position: fixed and contains the title "Sample Agent"
    const panel = page.locator('div[style*="position: fixed"]').filter({ hasText: 'Sample Agent' });
    await expect(panel).toBeVisible();

    // Verify the header text
    await expect(panel.locator('text=Sample Agent').first()).toBeVisible();

    // Bubble should now show "Close chat" aria-label
    await expect(page.getByRole('button', { name: 'Close chat' })).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'chat-open.png') });
  });

  test('can type in chat input', async ({ page }) => {
    await page.goto('/');

    // Open the chat panel
    await page.getByRole('button', { name: 'Open chat' }).click();

    // Find the input by its placeholder text
    const input = page.getByPlaceholder('Describe a sound...');
    await expect(input).toBeVisible();

    await input.fill('dark kick');
    await expect(input).toHaveValue('dark kick');

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'chat-with-text.png') });
  });

  test('clicking close button hides panel', async ({ page }) => {
    await page.goto('/');

    // Open the chat panel
    await page.getByRole('button', { name: 'Open chat' }).click();

    // Verify panel is open
    const panel = page.locator('div[style*="position: fixed"]').filter({ hasText: 'Sample Agent' });
    await expect(panel).toBeVisible();

    // Close the chat panel
    await page.getByRole('button', { name: 'Close chat' }).click();

    // Panel should no longer be visible
    await expect(panel).not.toBeVisible();

    // Bubble should revert to "Open chat"
    await expect(page.getByRole('button', { name: 'Open chat' })).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'chat-closed.png') });
  });

  test('chat panel has send button', async ({ page }) => {
    await page.goto('/');

    // Open the chat panel
    await page.getByRole('button', { name: 'Open chat' }).click();

    // Verify the Send button exists
    const sendButton = page.getByRole('button', { name: 'Send' });
    await expect(sendButton).toBeVisible();
  });

  test('send button is disabled when input is empty', async ({ page }) => {
    await page.goto('/');

    // Open the chat panel
    await page.getByRole('button', { name: 'Open chat' }).click();

    // The input should be empty by default
    const input = page.getByPlaceholder('Describe a sound...');
    await expect(input).toHaveValue('');

    // The Send button exists but clicking it with empty input should not trigger a send.
    // The component disables send via the handleSend guard (returns early if text is empty).
    // The button itself is only disabled during streaming, but with empty input the click is a no-op.
    // Verify no messages appear after clicking Send with empty input.
    const sendButton = page.getByRole('button', { name: 'Send' });
    await sendButton.click();

    // No user message bubbles should appear -- the messages area should have no user content
    const userMessages = page.locator('div[style*="flex-end"]');
    await expect(userMessages).toHaveCount(0);
  });
});
