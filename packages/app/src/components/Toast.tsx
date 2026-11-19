import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

interface ToastApi {
  show(text: string, action?: Toast["action"], ms?: number): void;
}

const ToastContext = createContext<ToastApi>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const show = useCallback<ToastApi["show"]>(
    (text, action, ms = 4000) => {
      const id = next.current++;
      setToasts((ts) => [...ts.slice(-2), { id, text, ...(action ? { action } : {}) }]);
      if (ms > 0) window.setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <span>{t.text}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
