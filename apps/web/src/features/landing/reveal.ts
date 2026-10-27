import './reveal.css';

/**
 * Entrada dos blocos da landing ao rolar a página (pedido do dono, outubro de 2026).
 *
 * Cada bloco marcado com `ref={revealOnScroll}` aparece com o mesmo movimento do
 * hero, subindo 16 px e acendendo em 700 ms, na primeira vez que entra na tela.
 * Os que entram juntos, como os cartões de uma mesma linha, saem em sequência.
 *
 * Quatro cuidados, e é por eles que o código é este e não uma biblioteca:
 *
 * - **Nada fica escondido sem JavaScript.** O estado escondido só existe depois
 *   que este código marca o elemento. O HTML pré-renderizado, o navegador sem
 *   `IntersectionObserver` e os testes mostram tudo.
 * - **Só se esconde o que está fora da tela.** Bloco que já está à vista quando
 *   aparece fica como está. É o caso de quem recarrega no meio da página com o
 *   HTML pré-renderizado: ele já foi pintado, e escondê-lo na hidratação o faria
 *   piscar antes de entrar de novo.
 * - **Quem pede menos movimento vê tudo de uma vez** (§14.8): o CSS só esconde e
 *   anima sob `prefers-reduced-motion: no-preference`.
 * - **Uma vez só.** Revelado, o bloco deixa de ser observado e não some ao voltar
 *   a rolagem.
 *
 * É um observador para a página inteira, criado no primeiro uso: no pré-render
 * não há `window`, e nada aqui roda na importação.
 */

/** Atraso entre blocos que entram juntos na tela. */
const STAGGER_MS = 90;

/** A partir daqui o atraso para de crescer: uma linha comprida não pode demorar a aparecer. */
const MAX_STAGGER_STEPS = 4;

let observer: IntersectionObserver | null = null;

/** Blocos que acabaram de entrar na página, à espera da medida. */
const pending = new Set<HTMLElement>();
let measureScheduled = false;

function reveal(entries: IntersectionObserverEntry[], current: IntersectionObserver): void {
  let step = 0;

  for (const entry of entries) {
    if (!entry.isIntersecting) continue;

    const node = entry.target as HTMLElement;
    current.unobserve(node);

    /*
     * Bloco que já tem o foco aparece sem animação: o `:focus-within` do CSS já o
     * mostrou, e animar a partir do invisível o faria piscar debaixo do foco.
     */
    if (node.contains(document.activeElement)) {
      node.dataset.reveal = 'static';
      continue;
    }

    node.style.setProperty('--reveal-delay', `${Math.min(step, MAX_STAGGER_STEPS) * STAGGER_MS}ms`);
    node.dataset.reveal = 'shown';
    step += 1;
  }
}

function getObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;

  // O bloco é revelado depois de passar um pouco da borda de baixo, para o movimento ser visto.
  observer ??= new IntersectionObserver(reveal, { rootMargin: '0px 0px -10% 0px' });
  return observer;
}

/**
 * Decide, de uma vez, quais blocos novos ficam escondidos.
 *
 * Roda num microtask: depois do commit do React, que é quando os blocos novos
 * chegam, e antes da pintura, então nenhum aparece e some. Todas as leituras de
 * posição vêm antes de todas as escritas, para o navegador calcular o layout uma
 * vez só em vez de uma por bloco.
 */
function measurePending(): void {
  measureScheduled = false;

  const nodes = [...pending];
  pending.clear();

  const current = observer;
  if (!current || nodes.length === 0) return;

  const viewportHeight = window.innerHeight;
  const inView = nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return box.bottom > 0 && box.top < viewportHeight;
  });

  nodes.forEach((node, index) => {
    if (!node.isConnected) return;

    if (inView[index]) {
      node.dataset.reveal = 'static';
      return;
    }

    node.dataset.reveal = 'hidden';
    current.observe(node);
  });
}

/**
 * Ref de callback: `<div ref={revealOnScroll}>`.
 *
 * A marca vai num atributo `data-`, e não numa classe, porque o React reescreve
 * o `className` inteiro quando ele muda e apagaria a classe posta por aqui.
 */
export function revealOnScroll(node: HTMLElement | null): (() => void) | undefined {
  if (!node) return undefined;

  const state = node.dataset.reveal;
  if (state === 'shown' || state === 'static') return undefined;

  const current = getObserver();
  if (!current) return undefined;

  if (state === 'hidden') {
    // Já medido e escondido: só volta a ser observado.
    current.observe(node);
  } else {
    pending.add(node);

    if (!measureScheduled) {
      measureScheduled = true;
      queueMicrotask(measurePending);
    }
  }

  return () => {
    pending.delete(node);
    current.unobserve(node);
  };
}

/** Zera o estado entre testes, que trocam o `IntersectionObserver` por um de mentira. */
export function resetRevealForTests(): void {
  observer?.disconnect();
  observer = null;
  pending.clear();
  measureScheduled = false;
}
