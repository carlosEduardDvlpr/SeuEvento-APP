import { useEffect, useRef } from 'react';

/**
 * Botão "Continuar com o Google" (§10.3).
 *
 * Renderiza **nada** quando `VITE_GOOGLE_CLIENT_ID` não está definido, que é o
 * estado antes de a credencial existir no Google Cloud. Assim a tela de entrada
 * não mostra um caminho que a API recusaria com 503.
 *
 * O script do Google é carregado sob demanda, e não no `index.html`, para quem
 * nunca abre a tela de entrada não pagar por ele.
 */
const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

type GoogleCredentialResponse = { credential?: string };

type GoogleIdentityApi = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
      }) => void;
      renderButton: (
        parent: HTMLElement,
        options: { theme: string; size: string; text: string; locale: string; width?: number },
      ) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentityApi;
  }
}

function loadGoogleScript(): Promise<GoogleIdentityApi> {
  if (window.google) return Promise.resolve(window.google);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_SCRIPT_SRC}"]`,
    );

    const script = existing ?? document.createElement('script');
    const onLoad = () => {
      if (window.google) resolve(window.google);
      else reject(new Error('Script do Google carregou sem expor a API.'));
    };

    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', () => reject(new Error('Falha ao carregar o Google.')), {
      once: true,
    });

    if (!existing) {
      script.src = GOOGLE_SCRIPT_SRC;
      script.async = true;
      document.head.append(script);
    }
  });
}

export function GoogleSignInButton({ onCredential }: { onCredential: (idToken: string) => void }) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clientId || !container.current) return;

    let active = true;
    const parent = container.current;

    void loadGoogleScript()
      .then((google) => {
        if (!active) return;

        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) onCredential(response.credential);
          },
        });

        google.accounts.id.renderButton(parent, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          locale: 'pt-BR',
        });
      })
      .catch(() => {
        // Sem Google disponível, o formulário de e-mail e senha continua servindo.
      });

    return () => {
      active = false;
    };
  }, [clientId, onCredential]);

  if (!clientId) return null;

  return <div ref={container} />;
}

/** A tela usa isto para decidir se mostra o separador "ou". */
export function isGoogleSignInAvailable(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
}
