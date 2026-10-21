import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Select } from '../src/components/ui/select';
import '../src/styles/app.css';

// Served only by Vite in UI tests; not included in the production entry or build.
function Fixture() {
  const [value, setValue] = useState('first');
  const [disabled, setDisabled] = useState(false);
  const options = [
    { value: '', label: 'None' },
    { value: 'first', label: 'First' },
    { value: 'blocked', label: 'Unavailable', disabled: true },
    { value: 'option:', label: 'Literal prefix value' },
    ...Array.from({ length: 80 }, (_, i) => ({ value: `long-${i}`, label: `${i + 1}. Длинное название тест-кейса: пользователь входит в магазин и проверяет содержимое корзины` })),
  ];
  return <main className="p-4">
    <div className="max-w-xs"><Select aria-label="Example choice" value={value} onValueChange={setValue} disabled={disabled} options={options} /></div>
    <output aria-label="Stored value">{JSON.stringify(value)}</output>
    <button className="block" onClick={() => setDisabled(!disabled)}>Toggle disabled</button>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
