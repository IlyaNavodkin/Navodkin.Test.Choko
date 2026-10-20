import { test, expect, type Page } from '@playwright/test';

/** Демо-страница броска пяти шестигранных кубиков. */
const DEMO_PAGE = `<!doctype html>
<html lang="ru">
  <body>
    <button id="roll" type="button">Бросить кубики</button>
    <ul id="dice"></ul>
    <script>
      document.getElementById('roll').addEventListener('click', () => {
        const dice = document.getElementById('dice');
        dice.innerHTML = '';
        for (let i = 0; i < 5; i++) {
          const item = document.createElement('li');
          item.textContent = String(1 + Math.floor(Math.random() * 6));
          dice.appendChild(item);
        }
      });
    </script>
  </body>
</html>`;

async function openDemo(page: Page): Promise<void> {
  await page.setContent(DEMO_PAGE);
}

test(
  'бросает пять кубиков и показывает значение от 1 до 6',
  {
    tag: '@tt:dice-roller-faces',
    annotation: [
      { type: 'testoritto.caseId', description: 'c217ab9043' },
      { type: 'testoritto.automationId', description: 'dice-roller-faces' },
    ],
  },
  async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'Бросить кубики' }).click();

    const faces = await page.locator('#dice li').allTextContents();
    expect(faces).toHaveLength(5);
    for (const face of faces) {
      const value = Number(face);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
    }
  },
);
