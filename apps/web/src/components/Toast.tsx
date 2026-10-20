import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface ToastApi {
  show: (message: string, kind?: 'info' | 'error') => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; kind: 'info' | 'error'; id: number }>();
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback((message: string, kind: 'info' | 'error' = 'info') => {
    clearTimeout(timer.current);
    setToast({ message, kind, id: Date.now() });
    timer.current = setTimeout(() => setToast(undefined), 3200);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div
          key={toast.id}
          role="status"
          data-testid="toast"
          className={`animate-pop pointer-events-none fixed inset-x-4 bottom-28 z-50 mx-auto max-w-sm rounded-[10px] border-2 px-4 py-3 text-center font-semibold shadow-[0_4px_0_2px_rgb(var(--c-line))] ring-2 ring-line ${
            toast.kind === 'error'
              ? 'border-danger bg-danger text-white'
              : 'border-neon bg-panel text-ink'
          }`}
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}
