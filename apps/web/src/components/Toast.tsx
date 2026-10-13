import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import styles from './Toast.module.css';

/**
 * Aviso curto depois de uma ação (§16.4).
 *
 * Existe porque salvar um formulário em diálogo fecha o diálogo, e sem retorno a
 * pessoa fica sem saber se gravou. A mensagem diz **o que aconteceu**, no passado
 * ("Item salvo."), nunca "Sucesso!".
 *
 * `role` muda com o tom: sucesso é `status` (não interrompe quem usa leitor de
 * tela), falha é `alert` (interrompe, porque exige ação).
 */

export type ToastTone = 'success' | 'error';

type Toast = { id: number; message: string; tone: ToastTone };

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/** Tempo de leitura confortável para uma frase curta. */
const DISMISS_AFTER_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = nextId.current;
    nextId.current += 1;

    setToasts((current) => [...current, { id, message, tone }]);

    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, DISMISS_AFTER_MS);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/*
       * A região existe sempre, mesmo vazia: leitor de tela só anuncia conteúdo
       * novo em região que já estava no DOM quando a página carregou.
       */}
      <div className={styles.region} aria-live="polite">
        {toasts.map((toast) => (
          <p
            key={toast.id}
            className={[styles.toast, styles[toast.tone]].join(' ')}
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            {toast.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) throw new Error('useToast precisa estar dentro de <ToastProvider>.');

  return context;
}
