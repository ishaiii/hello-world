import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Kind = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  kind: Kind;
  text: string;
}

export interface Feedback {
  /** Show a toast. Errors stay until dismissed; others fade after a few seconds. */
  toast(text: string, kind?: Kind): void;
  /** Politely announce to assistive technology without showing anything. */
  announce(text: string): void;
}

const Ctx = createContext<Feedback | null>(null);

export function useFeedback(): Feedback {
  const v = useContext(Ctx);
  if (!v) throw new Error('FeedbackProvider missing');
  return v;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [live, setLive] = useState('');
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (text: string, kind: Kind = 'info') => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, kind, text }]);
      if (kind !== 'error') setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );
  const announce = useCallback((text: string) => {
    // Clear first so repeating the same sentence is still announced.
    setLive('');
    setTimeout(() => setLive(text), 30);
  }, []);
  const value = useMemo<Feedback>(() => ({ toast, announce }), [toast, announce]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="live-region">
        {live}
      </div>
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'toast--error' : ''}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            {t.kind === 'error' ? <CircleAlert size={18} aria-hidden="true" /> : t.kind === 'success' ? <CircleCheck size={18} aria-hidden="true" /> : <Info size={18} aria-hidden="true" />}
            <div className="toast__text">{t.text}</div>
            <button type="button" className="btn btn--ghost btn--icon btn--sm" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
