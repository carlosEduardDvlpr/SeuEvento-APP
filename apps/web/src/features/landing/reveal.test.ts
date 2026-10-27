import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetRevealForTests, revealOnScroll } from './reveal';

/**
 * Entrada dos blocos ao rolar.
 *
 * O jsdom não tem `IntersectionObserver` nem calcula layout, então o observador
 * é trocado por um de mentira, que entrega as entradas quando o teste manda, e a
 * posição de cada bloco é dita pelo teste. O que se cobra aqui é o contrato com
 * o CSS: o atributo que esconde, o que revela e o atraso entre blocos que entram
 * juntos.
 */
class FakeObserver {
  static current: FakeObserver | null = null;

  readonly callback: IntersectionObserverCallback;
  readonly options: IntersectionObserverInit | undefined;
  readonly observed = new Set<Element>();

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeObserver.current = this;
  }

  observe(element: Element) {
    this.observed.add(element);
  }

  unobserve(element: Element) {
    this.observed.delete(element);
  }

  disconnect() {
    this.observed.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Simula os blocos entrando na tela, juntos e na ordem dada. */
  enter(...elements: Element[]) {
    this.callback(
      elements.map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry),
      this as unknown as IntersectionObserver,
    );
  }
}

/** A janela do jsdom tem 768 px de altura: 2000 px é abaixo da dobra. */
const BELOW_THE_FOLD = 2000;

/** Um bloco na página, na altura dada em relação ao topo da janela. */
function block(top = BELOW_THE_FOLD): HTMLDivElement {
  const element = document.createElement('div');
  element.getBoundingClientRect = () =>
    ({ top, bottom: top + 100, left: 0, right: 0, width: 0, height: 100, x: 0, y: top }) as DOMRect;
  document.body.append(element);
  return element;
}

/** Espera a medida dos blocos novos, que roda num microtask. */
function measured(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function observer(): FakeObserver {
  if (!FakeObserver.current) throw new Error('Nenhum observador foi criado.');
  return FakeObserver.current;
}

afterEach(() => {
  resetRevealForTests();
  FakeObserver.current = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('revealOnScroll', () => {
  /* É o caso dos testes, do pré-render e de navegador antigo: nada some. */
  it('não esconde nada quando o navegador não tem IntersectionObserver', async () => {
    const element = block();

    expect(revealOnScroll(element)).toBeUndefined();
    await measured();

    expect(element.dataset.reveal).toBeUndefined();
  });

  it('esconde o bloco fora da tela até ele entrar, e aí o revela uma vez', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const element = block();

    revealOnScroll(element);
    await measured();

    expect(element.dataset.reveal).toBe('hidden');
    expect(observer().observed.has(element)).toBe(true);

    observer().enter(element);

    expect(element.dataset.reveal).toBe('shown');
    // Revelado, deixa de ser observado: voltar a rolagem não o esconde de novo.
    expect(observer().observed.has(element)).toBe(false);
  });

  /*
   * Quem recarrega no meio da página vê o HTML pré-renderizado já pintado. O
   * bloco que está à vista fica como está, em vez de sumir e entrar de novo.
   */
  it('deixa como está o bloco que já está à vista quando aparece', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const element = block(100);

    revealOnScroll(element);
    await measured();

    expect(element.dataset.reveal).toBe('static');
    expect(observer().observed.has(element)).toBe(false);
  });

  it('põe em sequência os blocos que entram juntos', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const blocks = [block(), block(), block()];
    blocks.forEach((element) => revealOnScroll(element));
    await measured();

    observer().enter(...blocks);

    expect(blocks.map((element) => element.style.getPropertyValue('--reveal-delay'))).toEqual([
      '0ms',
      '90ms',
      '180ms',
    ]);
  });

  /* Uma linha comprida não pode fazer o último cartão demorar a aparecer. */
  it('limita o atraso de quem vem por último', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const blocks = Array.from({ length: 7 }, () => block());
    blocks.forEach((element) => revealOnScroll(element));
    await measured();

    observer().enter(...blocks);

    expect(blocks.at(-1)?.style.getPropertyValue('--reveal-delay')).toBe('360ms');
  });

  it('mostra sem animação o bloco que já tem o foco', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const element = block();
    const button = document.createElement('button');
    element.append(button);
    revealOnScroll(element);
    await measured();

    button.focus();
    observer().enter(element);

    expect(element.dataset.reveal).toBe('static');
  });

  it('esquece o bloco que sai da página antes da medida', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const element = block();

    const cleanup = revealOnScroll(element);
    cleanup?.();
    await measured();

    expect(element.dataset.reveal).toBeUndefined();
    expect(observer().observed.has(element)).toBe(false);
  });

  it('para de observar o bloco escondido que sai da página', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const element = block();

    const cleanup = revealOnScroll(element);
    await measured();
    cleanup?.();

    expect(observer().observed.has(element)).toBe(false);
  });

  it('não esconde de novo um bloco já revelado', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const element = block();
    revealOnScroll(element);
    await measured();
    observer().enter(element);

    expect(revealOnScroll(element)).toBeUndefined();
    expect(element.dataset.reveal).toBe('shown');
  });

  it('usa um observador só para a página inteira', () => {
    const created = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class extends FakeObserver {
        constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          super(callback, options);
          created();
        }
      },
    );

    revealOnScroll(block());
    revealOnScroll(block());

    expect(created).toHaveBeenCalledTimes(1);
  });
});
