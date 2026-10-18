# Сторонние уведомления

Небольшие значения compatibility-fixtures в Rust format tests основаны на публичных тестах и примерах формата Casewright 0.16.0. Полная лицензия MIT включена ниже; исходный текст также сохранён в [`casewright-main/LICENSE`](../../../casewright-main/LICENSE).

Парсер run checklist в `domain/formats/run/case.rs` адаптирует поведение алгоритма из `casewright-main/apps/desktop/src/services/format/run.ts`: распознавание ordinal/glyph, tri-state checkbox и разделение последнего ` !! ` для failure note. Реализация переписана на Rust и дополняет upstream-поведение сохранением исходного текста и неизвестного содержимого. Остальные format models и preservation edits реализованы отдельно и сверяются с upstream-тестами/схемами; совместимые примеры в tests происходят из публичных fixture inputs Casewright 0.16.0.

```text
MIT License

Copyright (c) 2026 Jim Buck

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
