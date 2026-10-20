import { useState, type CSSProperties } from 'react';
import { Logo } from '@/components/Logo';

const BARKS = ['Гав!', 'Тяв!', 'Гав-гав!', 'Тяф!', 'Ав-ав!', 'Вуф!', 'Тяв-тяв!', 'Р-р… гав!', 'Гав ♡', 'Тяф-тяф!'];

interface Bark {
  id: number;
  text: string;
  drift: number;
}

/** A little stress relief; animation completion removes each disposable bubble. */
export function MascotButton() {
  const [state, setState] = useState<{ sequence: number; barks: Bark[] }>({ sequence: 0, barks: [] });

  const bark = () => {
    const text = BARKS[Math.floor(Math.random() * BARKS.length)];
    const drift = 12 + Math.random() * 28;
    setState((current) => ({
      sequence: current.sequence + 1,
      // Keep rapid clicking lightweight, while letting recent barks fly together.
      barks: [...current.barks.slice(-11), { id: current.sequence + 1, text, drift }],
    }));
  };

  const dismiss = (id: number) => {
    setState((current) => ({ ...current, barks: current.barks.filter((bubble) => bubble.id !== id) }));
  };

  return (
    <div className="mascot-playground relative mb-2 size-10 shrink-0">
      <button
        type="button"
        className="mascot-trigger grid size-10 place-items-center rounded-md bg-panel-2"
        aria-label="Поиграть с Chioko — гав!"
        title="Нажми, чтобы погавкать 🐾"
        onClick={bark}
      >
        <span className="mascot-lift" aria-hidden="true">
          <span key={state.sequence} className={state.sequence ? 'mascot-wiggle mascot-barking' : 'mascot-wiggle'}>
            <Logo size={36} />
          </span>
        </span>
      </button>
      <div className="pointer-events-none absolute inset-0 z-40" aria-hidden="true">
        {state.barks.map((bubble) => (
          <span
            key={bubble.id}
            className="mascot-bark"
            style={{ '--bark-drift': `${bubble.drift}px` } as CSSProperties}
            onAnimationEnd={() => dismiss(bubble.id)}
          >
            {bubble.text}
          </span>
        ))}
      </div>
    </div>
  );
}
