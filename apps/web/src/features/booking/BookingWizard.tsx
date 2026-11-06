import type { QuoteRequest } from '@chacara/shared';
import { DECORATION_NEEDS_FULFILLMENT_ERROR, DECORATION_NEEDS_ITEMS_ERROR } from '@chacara/shared';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ApiError } from '@/api/client';
import { useCreateBooking, useBooking, useQuote } from '@/api/bookings';
import { useItems, useItemsAvailability } from '@/api/storefront';
import { useVenue } from '@/api/venue';
import { Button } from '@/components/Button';
import { Money } from '@/components/Money';
import { Skeleton } from '@/components/Skeleton';
import { ArrowLeftIcon, ArrowRightIcon } from '@/components/icons';
import { AddressDialog } from '@/features/account/AddressDialog';
import { formErrorMessage } from '@/lib/form';
import { ConfirmationStep } from './ConfirmationStep';
import { DateStep } from './DateStep';
import { DecorationStep } from './DecorationStep';
import { GuestsStep } from './GuestsStep';
import { KindPicker } from './KindPicker';
import { ReviewStep } from './ReviewStep';
import { SubmitGate } from './SubmitGate';
import {
  type BookingDraft,
  EMPTY_DRAFT,
  agendaItemId,
  clearDraft,
  draftReducer,
  hasDates,
  isStepComplete,
  loadDraft,
  reachableStep,
  requestItems,
  saveDraft,
} from './draft';
import { type WizardStep, parseStep, stepsFor } from './steps';
import { useUnavailableInRange } from './useAvailableDays';
import { useDebouncedValue } from './useDebouncedValue';
import styles from './BookingWizard.module.css';

/**
 * Wizard de reserva (§13.2).
 *
 * Quatro responsabilidades, e nada de regra de negócio: manter o passo em
 * sincronia com a URL, guardar o pedido que chegou à revisão até ele ser
 * enviado, pedir o orçamento ao servidor e mandar o pedido.
 *
 * Desde novembro de 2026, a pedido do dono, é uma pergunta por passo, e o rodapé
 * dos passos só tem "Voltar" e "Continuar": o resumo com o total aparece no fim,
 * na revisão, e é sempre o do servidor (§13.2).
 */

/** O que a landing escolheu e mandou na URL (§13.1). */
type LandingChoice = { date: string | null; itemId: string | null };

/** A escolha da landing, ou `null` quando a pessoa chegou sem nenhuma. */
function landingChoice(params: URLSearchParams): LandingChoice | null {
  const choice = { date: params.get('data'), itemId: params.get('item') };

  return choice.date === null && choice.itemId === null ? null : choice;
}

/**
 * Pedido novo a partir do que a landing escolheu (§13.1).
 *
 * `?item=` vem do cartão de uma decoração na landing: a pessoa está alugando
 * aquela decoração, e o pedido já nasce **só de decoração**, com ela escolhida
 * e o passo do tipo fora do caminho (novembro de 2026, a pedido do dono).
 *
 * `?data=` vem dos links de data do hero antigo, que podem estar salvos por aí:
 * preenche as duas pontas, porque um clique é uma festa de um dia (§7.3). O
 * `?estilo=` dos cartões de estilo, que saíram com os estilos, é ignorado.
 *
 * Só o formato é conferido aqui. Decoração que saiu do catálogo cai fora do
 * pedido assim que o catálogo carrega, pelo mesmo caminho de qualquer item
 * desativado.
 */
function draftFromLanding(choice: LandingChoice): BookingDraft {
  const date = choice.date !== null && /^\d{4}-\d{2}-\d{2}$/.test(choice.date) ? choice.date : null;
  const itemId =
    choice.itemId !== null && /^[0-9a-f-]{36}$/i.test(choice.itemId) ? choice.itemId : null;

  return {
    ...EMPTY_DRAFT,
    ...(date ? { startDate: date, endDate: date } : {}),
    ...(itemId ? { kind: 'DECORATION' as const, kindLocked: true, itemId } : {}),
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
 * conserto: o que resolve está no passo da data. Os outros códigos são sobre o
 * envio em si e ficam onde estão.
 */
function stepForError(error: unknown): WizardStep {
  if (!(error instanceof ApiError)) return 'revisao';

  if (error.code === 'DATE_UNAVAILABLE') return 'data';
  if (error.code === 'STOCK_INSUFFICIENT') return 'decoracao';

  return 'revisao';
}

/** O que dizer no passo para onde o envio devolveu a pessoa por falta de resposta. */
function missingMessage(step: WizardStep, decoration: boolean): string {
  if (step === 'convidados') return 'Confira o número de convidados.';
  if (step === 'decoracao') return DECORATION_NEEDS_ITEMS_ERROR;

  return decoration ? 'Confira o dia da festa.' : 'Confira as datas da festa.';
}

export function BookingWizard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sentBookingId = searchParams.get('reserva');

  /*
   * O pedido nasce na **inicialização**, não num efeito: quem chega por um
   * cartão da landing espera o wizard "já preenchido", e aplicar a escolha
   * depois da primeira renderização mostraria o pedido vazio por um instante.
   */
  const [start] = useState(() => startingPoint(searchParams));
  const [draft, dispatch] = useReducer(draftReducer, start.draft);

  const venue = useVenue();
  const catalog = useItems();
  const createBooking = useCreateBooking();
  const sentBooking = useBooking(sentBookingId);

  /*
   * O passo pedido na URL, dentro dos passos deste pedido e sem pular pergunta:
   * `?step=convidados` num pedido de decoração cai no primeiro passo, e um link
   * para a revisão com o pedido pela metade cai no primeiro passo que falta.
   */
  const steps = useMemo(
    () => stepsFor(draft.kind, draft.kindLocked),
    [draft.kind, draft.kindLocked],
  );
  const requested = parseStep(searchParams.get('step'));
  const wanted = requested && steps.includes(requested) ? requested : steps[0]!;
  const step = venue.data ? reachableStep(draft, steps, wanted, venue.data) : wanted;

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
  const [addressOpen, setAddressOpen] = useState(false);

  /** Só a decoração, sem a chácara (T32). Muda texto e exigência, não o fluxo. */
  const decoration = draft.kind === 'DECORATION';

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
   * que a pessoa mudou depois (outra data, outra decoração) voltaria ao que o
   * link dizia. `replace` para a limpeza não criar uma entrada no histórico. O
   * `?estilo=` dos links antigos sai junto, sem efeito.
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

  /*
   * Decoração que saiu do catálogo sai do pedido.
   *
   * Sem isso, uma decoração desativada entre a escolha e o envio faria a API
   * recusar com "um dos itens saiu do catálogo" (T19), e o calendário de quem
   * veio da landing pediria a agenda de uma decoração que não existe mais.
   */
  useEffect(() => {
    if (!catalog.data || draft.itemId === null) return;

    if (!catalog.data.some((item) => item.id === draft.itemId)) {
      dispatch({ type: 'setItem', itemId: null });
    }
  }, [catalog.data, draft.itemId]);

  /*
   * A decoração do pedido, do catálogo: a foto e o preço avulso da revisão. Vem
   * do catálogo, e não do orçamento: foto não é preço, e a linha do orçamento
   * traz só o que entra na conta.
   */
  const chosenItem = useMemo(
    () => catalog.data?.find((item) => item.id === draft.itemId),
    [catalog.data, draft.itemId],
  );

  const range = useMemo(
    () => (draft.startDate && draft.endDate ? { from: draft.startDate, to: draft.endDate } : null),
    [draft.startDate, draft.endDate],
  );

  /*
   * O que segura o "Continuar" além do que o rascunho já diz: um dia ocupado no
   * meio do período e a decoração escolhida em uso nessa data. As duas consultas
   * só rodam no passo que as mostra, e são as mesmas que o passo usa para
   * explicar o problema.
   */
  const unavailableInRange = useUnavailableInRange(
    step === 'data' ? range : null,
    draft.kind,
    agendaItemId(draft),
  );
  const itemsStock = useItemsAvailability(step === 'decoracao' ? range : null);
  const chosenUnavailable =
    draft.itemId !== null &&
    itemsStock.data !== undefined &&
    (itemsStock.data.items.find((line) => line.itemId === draft.itemId)?.freeStock ?? 0) === 0;

  /*
   * Pedido do orçamento, memoizado para o debounce enxergar só mudança real.
   *
   * Só na revisão: nos passos anteriores a pessoa está experimentando, e pedir o
   * valor a cada toque seria uma requisição por clique sem ninguém olhando o
   * número (§13.2).
   */
  const quoteRequest = useMemo<QuoteRequest | null>(() => {
    if (step !== 'revisao' || !draft.startDate || !draft.endDate) return null;

    // Decoração sem decoração a API recusaria com 400: não há o que orçar ainda.
    if (draft.kind === 'DECORATION' && draft.itemId === null) return null;

    return {
      kind: draft.kind,
      startDate: draft.startDate,
      endDate: draft.endDate,
      items: draft.itemId ? [{ itemId: draft.itemId, quantity: 1 }] : [],
    };
  }, [step, draft.kind, draft.startDate, draft.endDate, draft.itemId]);

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
    if (!venue.data) return;

    const blocked =
      !isStepComplete(draft, step, venue.data) ||
      (step === 'data' && unavailableInRange.length > 0) ||
      (step === 'decoracao' && chosenUnavailable);

    if (blocked) {
      setShowErrors(true);
      return;
    }

    const next = steps[steps.indexOf(step) + 1];
    if (next) goTo(next);
  }

  async function handleSubmit() {
    const limits = venue.data;
    if (!limits) return;

    /*
     * A revisão só abre com os passos respondidos, então isto é rede de
     * segurança: se algo ficou para trás, a pessoa volta para o passo certo com
     * o motivo, em vez de receber a recusa da API.
     */
    const missing = steps.find((candidate) => !isStepComplete(draft, candidate, limits));

    if (missing || !draft.startDate || !draft.endDate) {
      const target = missing ?? 'data';
      setBlocker({ step: target, message: missingMessage(target, decoration) });
      goTo(target);
      return;
    }

    // Retirada ou entrega é pergunta da própria revisão (§9.12).
    if (decoration && draft.fulfillment === null) {
      setShowErrors(true);
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
        // O número fica no rascunho para quem volta à chácara, mas não vai no pedido.
        guestCount: decoration ? null : draft.guestCount,
        items: requestItems(draft),
        // Na chácara a decoração já está lá: a API ignora, e o pedido nem manda.
        fulfillment: decoration ? draft.fulfillment : null,
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

  const limits = venue.data;
  const notice = blocker?.step === step ? blocker.message : undefined;
  const position = steps.indexOf(step);
  const back = steps[position - 1];
  const oneDay = draft.startDate === draft.endDate;

  const dateError =
    showErrors && !hasDates(draft)
      ? decoration
        ? 'Escolha o dia da festa.'
        : 'Escolha as datas da festa.'
      : undefined;

  // A escolhida em uso aparece na hora; a que falta, só quando a pessoa tenta avançar.
  const decorationError = chosenUnavailable
    ? decoration
      ? 'A decoração escolhida não está livre nesse dia. Escolha outra, ou volte e troque o dia.'
      : `A decoração escolhida não está livre ${oneDay ? 'nessa data' : 'nessas datas'}. Escolha outra ou siga sem decoração.`
    : showErrors && decoration && draft.itemId === null
      ? DECORATION_NEEDS_ITEMS_ERROR
      : undefined;

  const fulfillmentError =
    showErrors && decoration && draft.fulfillment === null
      ? DECORATION_NEEDS_FULFILLMENT_ERROR
      : undefined;

  return (
    <div className={styles.wizard}>
      <header className={styles.header}>
        <h1 className={styles.title}>Montar meu pedido</h1>
      </header>

      {step === 'tipo' ? (
        <KindPicker value={draft.kind} onChange={(kind) => dispatch({ type: 'setKind', kind })} />
      ) : null}

      {step === 'data' ? (
        <DateStep
          draft={draft}
          dispatch={dispatch}
          venue={limits}
          unavailable={unavailableInRange}
          error={dateError}
          notice={notice}
        />
      ) : null}

      {step === 'convidados' ? (
        <GuestsStep
          draft={draft}
          dispatch={dispatch}
          venue={limits}
          showErrors={showErrors}
          notice={notice}
        />
      ) : null}

      {step === 'decoracao' ? (
        <DecorationStep
          draft={draft}
          dispatch={dispatch}
          stock={{
            data: itemsStock.data,
            isPending: itemsStock.isPending,
            isError: itemsStock.isError,
          }}
          notice={notice}
          error={decorationError}
        />
      ) : null}

      {step === 'revisao' ? (
        <>
          <ReviewStep
            draft={draft}
            dispatch={dispatch}
            venue={limits}
            item={chosenItem}
            quote={quote.data}
            isLoading={quote.isFetching}
            notice={quote.isError ? (formErrorMessage(quote.error) ?? undefined) : undefined}
            fulfillmentError={fulfillmentError}
            onEditAddress={() => setAddressOpen(true)}
          />

          <SubmitGate
            error={notice ?? fulfillmentError ?? null}
            isSubmitting={createBooking.isPending}
            onSubmit={() => void handleSubmit()}
            delivery={decoration && draft.fulfillment === 'DELIVERY'}
            onAddAddress={() => setAddressOpen(true)}
          />

          {/* Montado só enquanto aberto: cada abertura começa do endereço salvo. */}
          {addressOpen ? <AddressDialog onClose={() => setAddressOpen(false)} /> : null}
        </>
      ) : null}

      {/*
        Antes da revisão, só a navegação: o total é do servidor e aparece no fim
        (§13.2). Na revisão, o rodapé repete o total do orçamento ao lado do
        "Voltar".
      */}
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
          ) : null}

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
