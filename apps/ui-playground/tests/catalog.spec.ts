import { describe, expect, it } from 'vitest';
import { filterEntries, reconcileSelection } from '../src/catalog/useCases/browse-components/catalogState';

describe('Выбор каталога', () => {
  it('ищет API и группу, нормализует запрос', () => {
    expect(filterEntries('  BUTTON ').every(e => e.name.toLowerCase().includes('button'))).toBe(true);
    expect(filterEntries('формы').every(e => e.group === 'Формы')).toBe(true);
    expect(filterEntries('')).toHaveLength(102);
    expect(filterEntries('input формы')).toHaveLength(0);
  });
  it('сохраняет видимый выбор, выбирает первый и восстанавливает Button после empty', () => {
    expect(reconcileSelection('Slider', filterEntries('формы'))).toBe('Slider');
    expect(reconcileSelection('Slider', filterEntries('menu'))).toBe('ButtonGroupMenu');
    expect(reconcileSelection('Slider', filterEntries('xxx-missing'))).toBeNull();
    expect(reconcileSelection(null, filterEntries(''))).toBe('Button');
  });
});
