import type { GalleryImage } from '@chacara/shared';
import {
  type FocusEvent,
  type MouseEvent,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ArrowLeftIcon, ArrowRightIcon, PauseIcon, PlayIcon } from '@/components/icons';
import { PhotoFrame } from '@/components/PhotoFrame';
import { revealOnScroll } from './reveal';
import styles from './VenueCarousel.module.css';

/**
 * Carrossel das áreas da chácara (§13.1, item 2; pedido do dono em novembro de
 * 2026, no lugar da grade de fotos).
 *
 * A faixa rola de verdade, com `scroll-snap`, em vez de uma biblioteca ou de um
 * `transform` comandado por JavaScript: o dedo arrasta com a física do próprio
 * navegador, o HTML pré-renderizado já mostra as fotos antes do JavaScript, e
 * nada disso precisa de dependência nova (§3). O código aqui acompanha qual
 * foto está no centro, para os pontos, o contador e as setas.
 *
 * A foto da vez fica inteira e as vizinhas espiam nas bordas, menores e
 * esmaecidas: é o que diz "arraste para o lado" sem texto.
 *
 * **Sem fim, nos dois sentidos.** Depois da última foto vem a primeira. No
 * navegador a lista aparece três vezes e o passeio acontece na cópia do meio:
 * quando a faixa para numa cópia das pontas, ela pula, sem animação, para a
 * mesma foto na cópia do meio. As duas são idênticas, então o pulo não se vê, e
 * a seta seguinte sempre tem para onde ir. As cópias das pontas são `inert` e
 * `aria-hidden`: o leitor de tela, o teclado e o Ctrl+F encontram cada área uma
 * vez só. O HTML pré-renderizado tem uma cópia só, porque sem JavaScript não há
 * quem dê o pulo; as outras duas chegam logo depois da hidratação.
 *
 * **Passa sozinho a cada 2 segundos**, a pedido do dono. É a exceção dele à
 * proibição de carrossel automático da §14.8, e vem com as garantias que tornam
 * o movimento aceitável (WCAG 2.2.2):
 *
 * - um botão pausa e retoma, e a escolha vale enquanto a página estiver aberta;
 * - só passa com o carrossel na tela, e sem `IntersectionObserver` não passa;
 * - para enquanto o ponteiro está em cima, o foco do teclado está dentro, o dedo
 *   está na faixa e até um segundo depois de a pessoa rolá-la;
 * - não passa para quem pede menos movimento (`prefers-reduced-motion`);
 * - qualquer troca, sozinha ou pela pessoa, recomeça a contagem.
 *
 * Segue o padrão de carrossel da WAI-ARIA: região com nome, cada foto é um grupo
 * "3 de 9", setas, pontos e pausa são botões com nome, e a troca é anunciada sem
 * roubar o foco. Enquanto passa sozinho, o anúncio se cala: uma frase a cada 2
 * segundos atropelaria o que o leitor de tela estivesse lendo.
 */
export type VenueCarouselProps = {
  areas: GalleryImage[];
};

/** Intervalo da troca automática, pedido pelo dono. */
const AUTOPLAY_MS = 2000;

/** Silêncio de eventos de rolagem que conta como "a faixa parou". */
const SETTLE_MS = 150;

/*
 * Prazo para uma rolagem pedida pelo código começar. Se nada rolar até lá, a
 * marca de "fui eu que rolei" sai mesmo assim: presa, ela faria a rolagem
 * seguinte da pessoa passar por nossa, e a troca automática não pararia.
 */
const SETTLE_FALLBACK_MS = 600;

/** Depois de a pessoa rolar a faixa, a troca automática espera isto para voltar. */
const USER_SCROLL_PAUSE_MS = 1000;

/** Quanto da faixa precisa estar na tela para ela passar sozinha. */
const VISIBLE_RATIO = 0.5;

/** Resto sempre positivo: a foto antes da primeira é a última, não a "−1". */
function mod(value: number, size: number): number {
  return ((value % size) + size) % size;
}

/*
 * "Já estamos no navegador?" sem efeito e sem estado: vale `false` no servidor e
 * na hidratação, e `true` logo depois. É o que deixa o HTML pré-renderizado com
 * uma cópia só da lista, igual ao primeiro desenho do cliente, e o cliente já
 * hidratado com as três.
 */
const subscribeNothing = () => () => {};
const onClient = () => true;
const onServer = () => false;

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};

  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Sem `matchMedia` (o jsdom não tem), vale como quem não pediu nada. */
function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches;
}

/**
 * Foco que veio do teclado. O do clique e o do toque não contam: o ponteiro e o
 * dedo já seguram a troca enquanto estão ali, e contar o foco que fica no botão
 * depois de um toque faria "Passar as fotos sozinhas" parecer não funcionar.
 */
function isKeyboardFocus(element: Element): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    // Navegador que não conhece o seletor: na dúvida, segura a troca.
    return true;
  }
}

export function VenueCarousel({ areas }: VenueCarouselProps) {
  const total = areas.length;
  const isClient = useSyncExternalStore(subscribeNothing, onClient, onServer);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    onServer,
  );

  /** Uma foto sozinha não tem para onde dar a volta. */
  const looping = isClient && total > 1;
  /** Onde começa a cópia do meio, que é a de verdade. */
  const middle = looping ? total : 0;
  /** A cópia 1 é a do meio: a do HTML pré-renderizado continua sendo a de verdade. */
  const copies = looping ? [0, 1, 2] : [1];

  const trackRef = useRef<HTMLDivElement>(null);
  /** Posição na faixa inteira, com as cópias. Só a rolagem usa; a tela desenha `active`. */
  const slotRef = useRef(0);
  /** A rolagem em curso foi pedida pelo código: setas, pontos, troca automática ou pulo. */
  const programmaticRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | undefined>(undefined);
  const userScrollTimerRef = useRef<number | undefined>(undefined);

  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touching, setTouching] = useState(false);
  const [userScrolled, setUserScrolled] = useState(false);

  // Uma nova leitura da galeria pode trazer menos fotos; o resto mantém a da vez válida.
  const index = total > 0 ? active % total : 0;
  const current = areas[index];

  /** O botão de pausa só existe onde a troca automática pode existir. */
  const canAutoplay = total > 1 && !reducedMotion;
  const running =
    looping &&
    canAutoplay &&
    !paused &&
    visible &&
    !hovered &&
    !focused &&
    !touching &&
    !userScrolled;

  /** Onde a faixa precisa estar para a foto `slot` ficar no centro. */
  function leftOf(slot: number): number | null {
    const track = trackRef.current;
    const slide = track?.children[slot];
    if (!track || !(slide instanceof HTMLElement)) return null;

    return slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2;
  }

  function armSettle(delay: number) {
    window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(settle, delay);
  }

  /**
   * Leva a faixa até a foto `slot`. Sem `instant`, a suavidade vem do CSS, que a
   * desliga para quem pede menos movimento; com ele, é o pulo entre cópias, que
   * precisa vencer o `scroll-behavior: smooth` da faixa.
   */
  function scrollTrack(slot: number, instant: boolean) {
    const track = trackRef.current;
    const left = leftOf(slot);
    if (!track || left === null) return;

    // Já está lá: nada vai rolar, e nenhum evento de rolagem viria tirar a marca.
    if (Math.abs(track.scrollLeft - left) < 1) return;

    programmaticRef.current = true;
    armSettle(SETTLE_FALLBACK_MS);

    if (typeof track.scrollTo === 'function') {
      track.scrollTo(instant ? { left, behavior: 'instant' } : { left });
    } else {
      track.scrollLeft = left;
    }
  }

  /** Traz a posição para a cópia do meio, sem animação. Devolve a posição nova. */
  function normalize(): number {
    const slot = slotRef.current;
    if (!looping || (slot >= total && slot < 2 * total)) return slot;

    const twin = total + mod(slot, total);
    slotRef.current = twin;
    scrollTrack(twin, true);
    return twin;
  }

  /** A faixa parou. Se parou numa cópia das pontas, pula para a gêmea do meio. */
  function settle() {
    programmaticRef.current = false;
    normalize();
  }

  function goTo(slot: number) {
    slotRef.current = slot;
    setActive(mod(slot, total));
    scrollTrack(slot, false);
  }

  /*
   * Antes de andar, volta para a cópia do meio: com cliques seguidos, a faixa
   * ainda pode estar numa cópia das pontas, e daí em diante faltaria foto.
   */
  function step(delta: 1 | -1) {
    goTo(normalize() + delta);
  }

  function show(areaIndex: number) {
    normalize();
    goTo(middle + areaIndex);
  }

  /** A foto mais perto do centro da faixa é a da vez. */
  function syncFromLayout() {
    frameRef.current = null;

    const track = trackRef.current;
    if (!track || total === 0) return;

    const center = track.scrollLeft + track.clientWidth / 2;
    let closest = 0;
    let shortest = Number.POSITIVE_INFINITY;

    Array.from(track.children).forEach((child, slot) => {
      if (!(child instanceof HTMLElement)) return;

      const distance = Math.abs(child.offsetLeft + child.offsetWidth / 2 - center);
      if (distance < shortest) {
        shortest = distance;
        closest = slot;
      }
    });

    slotRef.current = closest;
    setActive(mod(closest, total));
  }

  function markUserScroll() {
    setUserScrolled(true);
    window.clearTimeout(userScrollTimerRef.current);
    userScrollTimerRef.current = window.setTimeout(
      () => setUserScrolled(false),
      USER_SCROLL_PAUSE_MS,
    );
  }

  function handleScroll() {
    // A rolagem pedida pelo código já sabe aonde vai. A da pessoa é acompanhada,
    // uma conta por quadro, e segura a troca automática por um tempo.
    if (!programmaticRef.current) {
      markUserScroll();
      if (frameRef.current === null) frameRef.current = requestAnimationFrame(syncFromLayout);
    }

    armSettle(SETTLE_MS);
  }

  /** Dedo ou roda do mouse na faixa: a rolagem que vem agora é da pessoa. */
  function handOverToUser() {
    programmaticRef.current = false;
  }

  /*
   * Conforto para o mouse e o toque: tocar numa vizinha a traz para o centro.
   * Fica na faixa, e não em cada foto, porque as cópias são `inert` e o clique
   * nelas chega à faixa. Teclado e leitor de tela usam as setas e os pontos.
   */
  function handleTrackClick(event: MouseEvent<HTMLDivElement>) {
    const track = trackRef.current;
    if (!track) return;

    const slot = Array.from(track.children).findIndex((child) => {
      const box = child.getBoundingClientRect();
      return event.clientX >= box.left && event.clientX < box.right;
    });

    if (slot === -1 || mod(slot, total) === index) return;
    goTo(slot);
  }

  function handleFocus(event: FocusEvent<HTMLDivElement>) {
    setFocused(isKeyboardFocus(event.target));
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  }

  /*
   * Quando as cópias chegam (logo depois da hidratação, ou ao montar no cliente),
   * a faixa vai para a foto da vez na cópia do meio, antes da pintura.
   */
  const centerActive = useEffectEvent(() => {
    const slot = middle + index;
    slotRef.current = slot;
    scrollTrack(slot, true);
  });

  useLayoutEffect(() => {
    centerActive();
  }, [looping, total]);

  /* Só passa sozinho com a faixa na tela. Sem o observador, `visible` fica falso. */
  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => setVisible((entries.at(-1)?.intersectionRatio ?? 0) >= VISIBLE_RATIO),
      { threshold: VISIBLE_RATIO },
    );
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  const advance = useEffectEvent(() => step(1));

  // `index` nas dependências de propósito: toda troca, sozinha ou pela pessoa, recomeça a contagem.
  useEffect(() => {
    if (!running) return;

    const timer = window.setTimeout(() => advance(), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [running, index]);

  /*
   * Nada fica agendado depois que o carrossel sai da página. O quadro volta a
   * `null` porque, no StrictMode, o mesmo carrossel monta de novo em seguida, e
   * um quadro cancelado ainda marcado impediria a próxima conta.
   */
  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      window.clearTimeout(settleTimerRef.current);
      window.clearTimeout(userScrollTimerRef.current);
    },
    [],
  );

  return (
    <div
      className={styles.carousel}
      role="region"
      aria-roledescription="carrossel"
      aria-label="Fotos da chácara"
      ref={revealOnScroll}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onTouchStart={() => {
        handOverToUser();
        setTouching(true);
      }}
      onTouchEnd={() => setTouching(false)}
      onTouchCancel={() => setTouching(false)}
    >
      <div
        className={styles.track}
        ref={trackRef}
        onScroll={handleScroll}
        onWheel={handOverToUser}
        onClick={handleTrackClick}
      >
        {/* Uma lista só, com chaves por cópia: as fotos hidratadas seguem sendo as do meio. */}
        {copies.flatMap((copy) =>
          areas.map((area, areaIndex) => {
            const clone = copy !== 1;

            return (
              <div
                key={`${copy}-${area.id}`}
                role="group"
                aria-roledescription="foto"
                aria-label={`${areaIndex + 1} de ${total}`}
                aria-hidden={clone || undefined}
                inert={clone || undefined}
                // Todas as cópias da foto da vez ficam acesas: no pulo entre cópias,
                // a que chega ao centro já está acesa, e nada pisca.
                className={[styles.slide, areaIndex === index ? styles.slideActive : null]
                  .filter(Boolean)
                  .join(' ')}
              >
                {/*
                  `alt=""` de propósito: o `alt` cadastrado é o nome da área, e ele
                  já aparece no `h3` logo abaixo. Repeti-lo na foto faria o leitor
                  de tela anunciar o mesmo nome duas vezes (§18.1).
                */}
                <PhotoFrame className={styles.photo} src={area.url || null} alt="" />

                <div className={styles.caption}>
                  <h3 className={styles.title}>{area.alt}</h3>
                  {area.caption ? <p className={styles.text}>{area.caption}</p> : null}
                </div>
              </div>
            );
          }),
        )}
      </div>

      {total > 1 ? (
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.control}
            aria-label="Foto anterior"
            onClick={() => step(-1)}
          >
            <ArrowLeftIcon size={20} />
          </button>

          <div className={styles.dots}>
            {areas.map((area, areaIndex) => (
              <button
                key={area.id}
                type="button"
                className={[styles.dot, areaIndex === index ? styles.dotActive : null]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={`Ver ${area.alt}`}
                aria-current={areaIndex === index ? 'true' : undefined}
                onClick={() => show(areaIndex)}
              />
            ))}
          </div>

          {/* O leitor de tela ouve a frase completa abaixo; este é só para os olhos. */}
          <p className={styles.counter} aria-hidden="true">
            {index + 1} / {total}
          </p>

          <button
            type="button"
            className={styles.control}
            aria-label="Próxima foto"
            onClick={() => step(1)}
          >
            <ArrowRightIcon size={20} />
          </button>

          {canAutoplay ? (
            <button
              type="button"
              className={[styles.control, styles.toggle].join(' ')}
              aria-label={paused ? 'Passar as fotos sozinhas' : 'Pausar as fotos'}
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? <PlayIcon size={20} /> : <PauseIcon size={20} />}
            </button>
          ) : null}
        </div>
      ) : null}

      <p className="sr-only" aria-live={running ? 'off' : 'polite'}>
        {current && total > 1 ? `Foto ${index + 1} de ${total}: ${current.alt}` : ''}
      </p>
    </div>
  );
}
