import { expect, it } from 'vitest';
import { createFieldSchema } from '../src/catalog/useCases/field-validation/schema';
it('локальная форма отклоняет whitespace и возвращает trim', () => { const schema = createFieldSchema('Обязательно'); expect(schema.safeParse({ name: '  ' }).success).toBe(false); expect(schema.parse({ name: '  Название  ' })).toEqual({ name: 'Название' }); });
