import type { QuoteRequest } from '@chacara/shared';
import { DECORATION_NEEDS_ITEMS_ERROR } from '@chacara/shared';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ApiError } from '@/api/client';
import { useCreateBooking, useBooking, useQuote } from '@/api/bookings';
import { useItems } from '@/api/storefront';
import { useVenue } from '@/api/venue';
import { Button } from '@/components/Button';
import { Money } from '@/components/Money';
import { Skeleton } from '@/components/Skeleton';
import { ArrowLeftIcon, ArrowRightIcon } from '@/components/icons';
import { formErrorMessage } from '@/lib/form';
import { ConfirmationStep } from './ConfirmationStep';
import { DateStep } from './DateStep';
import { ItemsStep } from './ItemsStep';
import { ReviewStep } from './ReviewStep';
import { SubmitGate } from './SubmitGate';
import {
  type BookingDraft,
  EMPTY_DRAFT,
  clearDraft,
  draftReducer,
  hasDates,
  isItemsStepComplete,
  isStepOneComplete,
  loadDraft,
  saveDraft,
} from './draft';
import { STEP_LABELS, WIZARD_STEPS, type WizardStep, parseStep, stepIndex } from './steps';
import { useDebouncedValue } from './useDebouncedValue';
import styles from './BookingWizard.module.css';

/**
 * Wizard de reserva (§13.2).
 *
 * Quatro responsabilidades, e nada de regra de negócio: manter o passo em
 * sincronia com a URL, guardar o pedido que chegou à revisão até ele ser
 * enviado, pedir o orçamento ao servidor e mandar o pedido.
 *
 * **O servidor decide.** O total oficial vem do `POST /pricing/quote`; o rodapé
 * só estima enquanto o orçamento não existe, e diz que está estimando (§13.2).
 */

/** Estimativa do rodapé nos passos anteriores à revisão. Nunca é o total. */
function estimateItemsCents(draft: BookingDraft, prices: Map<string, number>): number {
  return draft.items.reduce(
    (total, item) => total + item.quantity * (prices.get(item.itemId) ?? 0),
    0,
  );
}

/** O que a landing escolheu e mandou na URL (§13.1). */
type LandingChoice = { date: string | null; themeId: string | null; itemId: string | null };

/** A escolha da landing, ou `null` quando a pessoa chegou sem nenhuma. */
function landingChoice(params: URLSearchParams): LandingChoice | null {
  const choice = {
    date: params.get('data'),
    themeId: params.get('estilo'),
    itemId: params.get('item'),
  };

  return choice.date === null && choice.themeId === null && choice.itemId === null ? null : choice;
}

/**
 * Pedido novo a partir do que a landing escolheu (§13.1).
 *
 * `?item=` vem do cartão da vitrine de itens, e o item entra **sozinho**, com
 * uma unidade: a pessoa clicou numa decoração, e o wizard abre com ela. Antes o
 * item somava ao que tinha sobrado da visita anterior, como num carrinho, e
 * quem voltava à landing e escolhia outro caía na reserva com dois.
 *
 * `?estilo=` vem de um cartão de estilo e só preenche o filtro do passo de
 * itens. `?data=` vem dos links de data do hero antigo, que podem estar salvos
 * por aí: preenche as duas pontas, porque um clique é uma festa de um dia
 * (§7.3), e fica na chácara, que é de onde eram aquelas datas (T32).
 *
 * Só o formato é conferido aqui. Item que saiu do catálogo cai fora no passo de
 * itens, pelo mesmo caminho de qualquer item desativado.
 */
function draftFromLanding(choice: LandingChoice): BookingDraft {
  const date = choice.date !== null && /^\d{4}-\d{2}-\d{2}$/.test(choice.date) ? choice.date : null;
  const itemId =
    choice.itemId !== null && /^[0-9a-f-]{36}$/i.test(choice.itemId) ? choice.itemId : null;

  return {
    ...EMPTY_DRAFT,
    ...(date ? { startDate: date, endDate: date } : {}),
    ...(choice.themeId ? { themeId: choice.themeId } : {}),
    ...(itemId ? { items: [{ itemId, quantity: 1 }] } : {}),
  };
}

/**
 * Por onde o pedido começa (§12.2).
 *
 * Escolha vinda da landing é sempre um pedido novo, e o que estava guardado fica
 * para trás. Sem escolha na URL (o botão do hero, o "Reservar" do cabeçalho, a
 * volta do login), o pedido que chegou à revisão continua de onde parou; se não
 * houver nenhum, o wizard abre vazio.
 */
function startingPoint(params: URLSearchParams): { draft: BookingDraft; saved: boolean } {
  const choice = landingChoice(params);
  if (choice) return { draft: draftFromLanding(choice), saved: false };

  const saved = loadDraft();
  return saved ? { draft: saved, saved: true } : { draft: EMPTY_DRAFT, saved: false };
}

/**
 * Para qual passo um erro de envio manda a pessoa de volta (§13.2).
 *
 * Mostrar "a data foi reservada" na tela de revisão deixaria o problema sem
 * conserto: o que resolve está no passo 1. Os outros códigos são sobre o envio em
 * si e ficam onde estão.
 */
function stepForError(error: unknown): WizardStep {
  if (!(error instanceof ApiError)) return 'revisao';

  if (error.code === 'DATE_UNAVAILABLE') return 'datas';
  if (error.code === 'STOCK_INSUFFICIENT') return 'itens';

  return 'revisao';
}

export function BookingWizard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const step = parseStep(searchParams.get('step'));
  const sentBookingId = searchParams.get('reserva');

  /*
   * O pedido nasce na **inicialização**, não num efeito: quem chega por um
   * cartão da landing espera o wizard "já preenchido", e aplicar a escolha
   * depois da primeira renderização mostraria o pedido vazio por um instante.
   */
  const [start] = useState(() => startingPoint(searchParams));
  const [draft, dispatch] = useReducer(draftReducer, start.draft);

  /*
   * O pedido não é carrinho (§12.2): enquanto a pessoa monta, ele vive só nesta
   * tela, e sair dela o esquece. Chegar à revisão é tentar agendar, e daí em
   * diante ele fica guardado até ser enviado, mesmo que a pessoa volte um passo
   * para ajustar. É o que sobrevive ao desvio por login e cadastro.
   */
  const [attempted, setAttempted] = useState(start.saved);
  const keepDraft = attempted || step === 'revisao';

  const [showErrors, setShowErrors] = useState(false);
  const [blocker, setBlocker] = useState<{ step: WizardStep; message: string } | null>(null);

  /** Só a decoração, sem a chácara (T32). Muda texto e exigência, não o fluxo. */
  const decoration = draft.kind === 'DECORATION';

  const venue = useVenue();
  const catalog = useItems();
  const createBooking = useCreateBooking();
  const sentBooking = useBooking(sentBookingId);

  /*
   * Espelho do pedido, com um dono só.
   *
   * Antes da revisão a chave é **apagada**, e não deixada como estava: quem
   * chega com uma escolha da landing começa outro pedido, e o antigo não pode
   * reaparecer depois pelo "Reservar" do cabeçalho.
   *
   * O `reset` do envio devolve a **mesma** referência de `EMPTY_DRAFT`, e é só o
   * que produz essa referência: é ela que diz "pedido enviado, pode esquecer",
   * mesmo enquanto a tela ainda está na revisão.
   */
  useEffect(() => {
    if (keepDraft && draft !== EMPTY_DRAFT) saveDraft(draft);
    else clearDraft();
  }, [draft, keepDraft]);

  /*
   * A escolha da landing sai da URL depois de aplicada.
   *
   * Sem isto, recarregar a página começaria outro pedido a partir do link, e o
   * que a pessoa mudou depois (outra data, o item tirado) voltaria ao que o
   * link dizia. `replace` para a limpeza não criar uma entrada no histórico.
   */
  useEffect(() => {
    if (!searchParams.has('data') && !searchParams.has('estilo') && !searchParams.has('item')) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.delete('data');
    next.delete('estilo');
    next.delete('item');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const itemPrices = useMemo(() => {
    const prices = new Map<string, number>();
    for (const item of catalog.data ?? []) prices.set(item.id, item.priceCents);
    return prices;
  }, [catalog.data]);

  /*
   * Foto de cada item, para a revisão mostrar o que a pessoa vai retirar. Vem do
   * catálogo, e não do orçamento: foto não é preço, e a linha do orçamento traz
   * só o que entra na conta.
   */
  const itemImages = useMemo(() => {
    const images = new Map<string, string>();
    for (const item of catalog.data ?? []) {
      if (item.imageUrl) images.set(item.id, item.imageUrl);
    }
    return images;
  }, [catalog.data]);

  /*
   * Pedido do orçamento, memoizado para o debounce enxergar só mudança real.
   *
   * Só na revisão: nos passos anteriores a pessoa está experimentando, e pedir o
   * valor a cada clique de quantidade seria uma requisição por toque sem ninguém
   * olhando o número (§13.2).
   */
  const quoteRequest = useMemo<QuoteRequest | null>(() => {
    if (step !== 'revisao' || !draft.startDate || !draft.endDate) return null;

    // Decoração sem item a API recusaria com 400: não há o que orçar ainda.
    if (draft.kind === 'DECORATION' && draft.items.length === 0) return null;

    return {
      kind: draft.kind,
      startDate: draft.startDate,
      endDate: draft.endDate,
      items: draft.items,
    };
  }, [step, draft.kind, draft.startDate, draft.endDate, draft.items]);

  const debouncedRequest = useDebouncedValue(quoteRequest);
  const quote = useQuote(debouncedRequest);

  function goTo(next: WizardStep) {
    setShowErrors(false);

    // Quem chegou à revisão tentou agendar: o pedido segue guardado até o envio.
    if (step === 'revisao' || next === 'revisao') setAttempted(true);

    // `replace: false` de propósito: cada passo entra no histórico, que é o que
    // faz o botão voltar do navegador andar um passo (§13.2).
    setSearchParams({ step: next });

    /*
     * O passo novo começa do topo. A troca é só na query, e a rolagem ficava onde
     * estava: quem tocava em "Continuar" no fim de um passo longo caía no meio
     * do seguinte. Voltar pelo navegador não passa por aqui, e fica com ele.
     */
    window.scrollTo(0, 0);
  }

  function goForward() {
    if (step === 'datas' && !isStepOneComplete(draft)) {
      setShowErrors(true);
      return;
    }

    // Na decoração, os itens são o pedido: sem eles, a revisão não teria o que mostrar.
    if (step === 'itens' && !isItemsStepComplete(draft)) {
      setShowErrors(true);
      return;
    }

    const next = WIZARD_STEPS[stepIndex(step) + 1];
    if (next) goTo(next);
  }

  async function handleSubmit() {
    if (!draft.startDate || !draft.endDate || !draft.eventType || !isStepOneComplete(draft)) {
      setBlocker({
        step: 'datas',
        message: decoration
          ? 'Confira o dia e o tipo de festa.'
          : 'Confira as datas, o tipo de festa e os convidados.',
      });
      goTo('datas');
      return;
    }

    if (!isItemsStepComplete(draft)) {
      setBlocker({ step: 'itens', message: DECORATION_NEEDS_ITEMS_ERROR });
      goTo('itens');
      return;
    }

    /*
     * O total enviado é o que a pessoa viu, e ele vem do orçamento (§9.7). Sem
     * orçamento carregado não há envio: mandar um total estimado pelo front faria
     * a API recusar com `PRICE_CHANGED` sempre que a estimativa divergisse.
     */
    if (!quote.data) {
      setBlocker({ step: 'revisao', message: 'Aguarde o valor terminar de calcular.' });
      return;
    }

    setBlocker(null);

    try {
      const booking = await createBooking.mutateAsync({
        kind: draft.kind,
        startDate: draft.startDate,
        endDate: draft.endDate,
        eventType: draft.eventType,
        // O número fica no rascunho para quem volta à chácara, mas não vai no pedido.
        guestCount: decoration ? null : draft.guestCount,
        items: draft.items,
        customerNotes: draft.customerNotes.trim() === '' ? null : draft.customerNotes.trim(),
        expectedTotalCents: quote.data.totalCents,
      });

      /*
       * Só agora o pedido pode ser esquecido: a §13.2 proíbe tratamento
       * otimista para reserva, e limpar antes do 201 perderia o pedido se o envio
       * falhasse. O `reset` apaga o espelho pelo efeito acima, e o próximo
       * pedido volta a só ser guardado quando chegar à revisão.
       *
       * `replace: true` para o botão voltar não trazer a pessoa de volta a uma
       * revisão de um pedido que já foi enviado.
       */
      dispatch({ type: 'reset' });
      setAttempted(false);
      setSearchParams({ reserva: booking.id }, { replace: true });

      // A confirmação começa do topo: o botão de enviar fica no fim da revisão.
      window.scrollTo(0, 0);
    } catch (error) {
      const target = stepForError(error);
      const message = formErrorMessage(error) ?? 'Não conseguimos enviar o pedido.';

      setBlocker({ step: target, message });

      /*
       * `PRICE_CHANGED` vem com o orçamento novo nos detalhes, mas em vez de
       * confiar nele a gente refaz a consulta: o resultado passa pelo mesmo
       * caminho de sempre e a tela não precisa de um segundo formato de dado.
       */
      void quote.refetch();

      if (target !== step) goTo(target);
    }
  }

  if (venue.isPending) {
    return (
      <div className={styles.wizard}>
        <Skeleton rows={6} />
      </div>
    );
  }

  if (venue.isError || !venue.data) {
    return (
      <div className={styles.state}>
        <h1 className={styles.title}>Não conseguimos carregar a página</h1>
        <p>{formErrorMessage(venue.error) ?? 'Tente de novo em instantes.'}</p>
      </div>
    );
  }

  // Pedido enviado: a confirmação substitui o wizard, inclusive o rodapé.
  if (sentBookingId) {
    return (
      <div className={styles.wizard}>
        <ConfirmationStep
          booking={sentBooking.data}
          venue={venue.data}
          isLoading={sentBooking.isPending}
          error={sentBooking.error}
        />
      </div>
    );
  }

  const errors = showErrors
    ? {
        range: hasDates(draft)
          ? undefined
          : decoration
            ? 'Escolha o dia da festa.'
            : 'Escolha as datas da festa.',
        eventType: draft.eventType ? undefined : 'Escolha o tipo de festa.',
        guestCount:
          decoration || draft.guestCount ? undefined : 'Informe quantas pessoas são esperadas.',
      }
    : {};

  // Some sozinho quando a pessoa escolhe o primeiro item: a condição é recalculada.
  const itemsError =
    showErrors && !isItemsStepComplete(draft) ? DECORATION_NEEDS_ITEMS_ERROR : undefined;

  const notice = blocker?.step === step ? blocker.message : undefined;
  const itemsEstimate = estimateItemsCents(draft, itemPrices);
  const back = WIZARD_STEPS[stepIndex(step) - 1];

  return (
    <div className={styles.wizard}>
      <header className={styles.header}>
        <h1 className={styles.title}>Montar meu pedido</h1>

        <nav aria-label="Passos do pedido">
          <ol className={styles.steps}>
            {WIZARD_STEPS.map((candidate, index) => {
              const current = candidate === step;
              const done = index < stepIndex(step);
              /*
               * Pular para a frente só depois de o passo 1 estar completo: sem
               * datas, o passo de itens não sabe o que está disponível. Na
               * decoração, a revisão também espera o primeiro item.
               */
              const reachable =
                index === 0 ||
                (isStepOneComplete(draft) &&
                  (candidate !== 'revisao' || isItemsStepComplete(draft)));

              return (
                <li key={candidate} className={styles.stepItem}>
                  <button
                    type="button"
                    className={[
                      styles.stepLink,
                      current ? styles.stepLinkCurrent : null,
                      done ? styles.stepLinkDone : null,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => goTo(candidate)}
                    disabled={!reachable}
                    aria-current={current ? 'step' : undefined}
                  >
                    <span className={styles.stepNumber}>{index + 1}</span>
                    {STEP_LABELS[candidate]}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </header>

      {step === 'datas' ? (
        <DateStep
          draft={draft}
          dispatch={dispatch}
          venue={venue.data}
          errors={errors}
          notice={notice}
        />
      ) : null}

      {step === 'itens' ? (
        <ItemsStep
          draft={draft}
          dispatch={dispatch}
          {...(notice ? { notice } : {})}
          {...(itemsError ? { error: itemsError } : {})}
        />
      ) : null}

      {step === 'revisao' ? (
        <>
          <ReviewStep
            draft={draft}
            dispatch={dispatch}
            venue={venue.data}
            itemImages={itemImages}
            quote={quote.data}
            isLoading={quote.isFetching}
            {...(quote.isError ? { notice: formErrorMessage(quote.error) ?? undefined } : {})}
          />

          <SubmitGate
            error={notice ?? null}
            isSubmitting={createBooking.isPending}
            onSubmit={() => void handleSubmit()}
          />
        </>
      ) : null}

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          {step === 'revisao' && quote.data ? (
            <p className={styles.estimate}>
              <span className={styles.estimateLabel}>
                Total{quote.isFetching ? ' (calculando…)' : ''}
              </span>
              <span className={styles.estimateValue}>
                <Money cents={quote.data.totalCents} />
              </span>
            </p>
          ) : (
            /*
              Estimativa, e marcada como tal. O total oficial vem do
              `POST /pricing/quote` na revisão: o front não soma preço para exibir
              valor de verdade (§13.2).
            */
            <p className={styles.estimate}>
              <span className={styles.estimateLabel}>
                {draft.items.length > 0
                  ? `Itens escolhidos (${draft.items.length})`
                  : decoration
                    ? 'Nenhum item escolhido'
                    : 'Só a chácara, sem itens'}
              </span>
              <span className={styles.estimateValue}>
                <Money cents={itemsEstimate} />
              </span>
              <span className={styles.estimateLabel}>
                {decoration
                  ? 'O total, com os combos, sai na revisão.'
                  : 'As diárias entram no total na revisão.'}
              </span>
            </p>
          )}

          <div className={styles.actions}>
            {back ? (
              <Button onClick={() => goTo(back)}>
                <ArrowLeftIcon size={20} />
                Voltar
              </Button>
            ) : null}

            {step === 'revisao' ? null : (
              <Button variant="primary" onClick={goForward}>
                Continuar
                <ArrowRightIcon size={20} />
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
