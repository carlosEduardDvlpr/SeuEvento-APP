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
 * sincronia com a URL, manter o rascunho vivo entre recarregamentos, pedir o
 * orçamento ao servidor e mandar o pedido.
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

/**
 * Aplica ao rascunho o que a landing escolheu (§13.1).
 *
 * `?data=` vem de clicar numa data livre no hero; `?estilo=` de clicar num
 * cartão de estilo. O que vem na URL **vence** o que estava guardado: a pessoa
 * acabou de apontar o que quer, e manter o rascunho antigo faria o clique dela
 * parecer ignorado.
 *
 * A data preenche as duas pontas, porque um clique é uma festa de um dia (§7.3) —
 * e ela fica editável no calendário, que é o passo onde a pessoa cai.
 *
 * A data também escolhe a **chácara** (T32): as datas livres do hero são as da
 * agenda da chácara, e abrir o wizard na decoração com uma delas trocaria a
 * pergunta que a pessoa respondeu ao clicar.
 */
function withLandingChoice(
  draft: BookingDraft,
  choice: { date: string | null; themeId: string | null },
): BookingDraft {
  const isDate = choice.date !== null && /^\d{4}-\d{2}-\d{2}$/.test(choice.date);

  return {
    ...draft,
    ...(isDate ? { kind: 'VENUE' as const, startDate: choice.date, endDate: choice.date } : {}),
    ...(choice.themeId ? { themeId: choice.themeId } : {}),
  };
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
   * O rascunho nasce do que estava guardado — quem voltou de /entrar continua de
   * onde parou (§13.2) — e já recebe o que a landing mandou na URL.
   *
   * A aplicação acontece na **inicialização**, não num efeito: a §13.1 pede que
   * clicar numa data livre abra o wizard "já preenchido", e fazer isso depois da
   * primeira renderização mostraria o calendário vazio por um instante.
   */
  const [draft, dispatch] = useReducer(draftReducer, undefined, () =>
    withLandingChoice(loadDraft(), {
      date: searchParams.get('data'),
      themeId: searchParams.get('estilo'),
    }),
  );
  const [showErrors, setShowErrors] = useState(false);
  const [blocker, setBlocker] = useState<{ step: WizardStep; message: string } | null>(null);

  /** Só a decoração, sem a chácara (T32). Muda texto e exigência, não o fluxo. */
  const decoration = draft.kind === 'DECORATION';

  const venue = useVenue();
  const catalog = useItems();
  const createBooking = useCreateBooking();
  const sentBooking = useBooking(sentBookingId);

  /*
   * Espelho do rascunho, com um dono só.
   *
   * O `reset` devolve a **mesma** referência de `EMPTY_DRAFT`, e é só o que
   * produz essa referência: por isso ele serve para distinguir "pedido enviado,
   * pode esquecer" de "rascunho em branco porque a pessoa ainda não escolheu".
   * Sem esse ramo, apagar a chave no envio não serviria de nada — este efeito
   * rodaria em seguida e regravaria um rascunho vazio.
   */
  useEffect(() => {
    if (draft === EMPTY_DRAFT) clearDraft();
    else saveDraft(draft);
  }, [draft]);

  /*
   * A escolha da landing sai da URL depois de aplicada.
   *
   * Sem isto, mudar a data no calendário e recarregar a página traria de volta a
   * data do link — o parâmetro venceria a escolha mais recente da pessoa.
   * `replace` para a limpeza não criar uma entrada no histórico.
   */
  useEffect(() => {
    if (!searchParams.has('data') && !searchParams.has('estilo')) return;

    const next = new URLSearchParams(searchParams);
    next.delete('data');
    next.delete('estilo');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const itemPrices = useMemo(() => {
    const prices = new Map<string, number>();
    for (const item of catalog.data ?? []) prices.set(item.id, item.priceCents);
    return prices;
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
    // `replace: false` de propósito: cada passo entra no histórico, que é o que
    // faz o botão voltar do navegador andar um passo (§13.2).
    setSearchParams({ step: next });
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
       * Só agora o rascunho pode ser esquecido: a §13.2 proíbe tratamento
       * otimista para reserva, e limpar antes do 201 perderia o pedido se o envio
       * falhasse. O `reset` apaga o espelho pelo efeito acima.
       *
       * `replace: true` para o botão voltar não trazer a pessoa de volta a uma
       * revisão de um pedido que já foi enviado.
       */
      dispatch({ type: 'reset' });
      setSearchParams({ reserva: booking.id }, { replace: true });
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
