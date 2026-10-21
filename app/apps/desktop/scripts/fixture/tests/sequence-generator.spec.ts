import { test, expect, type Page } from '@playwright/test';

/**
 * Демо-страница генератора последовательностей.
 *
 * Она специально содержит баг: минимальное значение 1 считается невалидным. Поэтому второй
 * тест в этом файле ожидаемо красный — на нём удобно смотреть, как Chioko показывает
 * автотест и как из него сделать дефект.
 */
const DEMO_PAGE = `<!doctype html>
<html lang="ru">
  <body>
    <form id="form">
      <label for="min">Минимум</label>
      <input id="min" type="number" value="1" />
      <label for="max">Максимум</label>
      <input id="max" type="number" value="10" />
      <button id="generate" type="submit">Сгенерировать</button>
    </form>
    <p id="error" role="alert"></p>
    <ol id="out"></ol>
    <script>
      const form = document.getElementById('form');
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const min = Number(document.getElementById('min').value);
        const max = Number(document.getElementById('max').value);
        const error = document.getElementById('error');
        const out = document.getElementById('out');
        out.innerHTML = '';
        error.textContent = '';

        // Демо-баг: валидное минимальное значение 1 отклоняется.
        if (min < 2) {
          error.textContent = 'Минимум должен быть не меньше 2';
          return;
        }

        const values = [];
        for (let value = min; value <= max; value++) values.push(value);
        for (let i = values.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [values[i], values[j]] = [values[j], values[i]];
        }
        for (const value of values) {
          const item = document.createElement('li');
          item.textContent = String(value);
          out.appendChild(item);
        }
      });
    </script>
  </body>
</html>`;

async function openDemo(page: Page): Promise<void> {
  await page.setContent(DEMO_PAGE);
}

test.describe('Демо: генератор последовательностей', () => {
  test(
    'возвращает полную перестановку без повторов',
    {
      tag: '@tt:seq-generator-permutation',
      annotation: [
        { type: 'testoritto.caseId', description: 'b8d4e6017a' },
        { type: 'testoritto.automationId', description: 'seq-generator-permutation' },
      ],
    },
    async ({ page }) => {
      await openDemo(page);
      await page.getByLabel('Минимум').fill('2');
      await page.getByLabel('Максимум').fill('10');
      await page.getByRole('button', { name: 'Сгенерировать' }).click();

      await expect(page.locator('#error')).toHaveText('');
      const values = await page.locator('#out li').allTextContents();
      expect(values).toHaveLength(9);
      expect(new Set(values).size).toBe(9);
      expect(values.map(Number).sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    },
  );

  test(
    'принимает минимальное значение 1 (демо-баг)',
    {
      tag: '@tt:seq-generator-min-validation',
      annotation: [
        { type: 'testoritto.caseId', description: 'b8d4e6017a' },
        { type: 'testoritto.automationId', description: 'seq-generator-min-validation' },
      ],
    },
    async ({ page }) => {
      await openDemo(page);
      await page.getByLabel('Минимум').fill('1');
      await page.getByLabel('Максимум').fill('10');
      await page.getByRole('button', { name: 'Сгенерировать' }).click();

      // Ожидаем, что валидация пропустит 1. На демо-странице это не так — тест красный.
      await expect(page.locator('#error')).toHaveText('');
      await expect(page.locator('#out li')).toHaveCount(10);
    },
  );
});
