import { useEffect, useMemo, useReducer, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/Button';
import { Money } from '@/components/Money';
import { Skeleton } from '@/components/Skeleton';
import { ArrowLeftIcon, ArrowRightIcon } from '@/components/icons';
import { useItems } from '@/api/storefront';
import { useVenue } from '@/api/venue';
import { formErrorMessage } from '@/lib/form';
import { DateStep } from './DateStep';
import { ItemsStep } from './ItemsStep';
import {
  type BookingDraft,
  draftReducer,
  hasDates,
  isStepOneComplete,
  loadDraft,
  saveDraft,
} from './draft';
import { STEP_LABELS, WIZARD_STEPS, type WizardStep, parseStep, stepIndex } from './steps';
import styles from './BookingWizard.module.css';

/**
 * Wizard de reserva (§13.2).
 *
 * Três responsabilidades, e nada de regra de negócio: manter o passo em sincronia
 * com a URL, manter o rascunho vivo entre recarregamentos, e mostrar o total
 * parcial no rodapé.
 *
 * A revisão e o envio entram na próxima entrega. O corte é proposital: aqui a
 * pessoa **escolhe**, lá ela **se compromete** — e são dois conjuntos de regras
 * diferentes (orçamento do servidor, desvio por login, mapa de erros).
 */

/** Estimativa local do rodapé. Nunca é o total oficial (§13.2). */
function estimateItemsCents(draft: BookingDraft, prices: Map<string, number>): number {
  return draft.items.reduce(
    (total, item) => total + item.quantity * (prices.get(item.itemId) ?? 0),
    0,
  );
}

export function BookingWizard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const step = parseStep(searchParams.get('step'));

  // O rascunho nasce do que estava guardado: quem voltou de /entrar continua
  // de onde parou (§13.2).
  const [draft, dispatch] = useReducer(draftReducer, undefined, loadDraft);
  const [showErrors, setShowErrors] = useState(false);

  const venue = useVenue();
  const catalog = useItems();

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  const itemPrices = useMemo(() => {
    const prices = new Map<string, number>();
    for (const item of catalog.data ?? []) prices.set(item.id, item.priceCents);
    return prices;
  }, [catalog.data]);

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

    const next = WIZARD_STEPS[stepIndex(step) + 1];
    if (next) goTo(next);
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

  const errors = showErrors
    ? {
        range: hasDates(draft) ? undefined : 'Escolha as datas da festa.',
        eventType: draft.eventType ? undefined : 'Escolha o tipo de festa.',
        guestCount: draft.guestCount ? undefined : 'Informe quantas pessoas são esperadas.',
      }
    : {};

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
               * datas, o passo de itens não sabe o que está disponível.
               */
              const reachable = index === 0 || isStepOneComplete(draft);

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
        <DateStep draft={draft} dispatch={dispatch} venue={venue.data} errors={errors} />
      ) : null}

      {step === 'itens' ? <ItemsStep draft={draft} dispatch={dispatch} /> : null}

      {step === 'revisao' ? (
        <section>
          <h2 className={styles.title}>Revisão</h2>
          <p>
            O resumo com o valor calculado pela chácara e o envio do pedido entram na próxima
            entrega. Suas escolhas estão guardadas.
          </p>
        </section>
      ) : null}

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          {/*
            Estimativa, e marcada como tal. O total oficial vem do
            `POST /pricing/quote` na revisão: o front não soma preço para exibir
            valor de verdade (§13.2).
          */}
          <p className={styles.estimate}>
            <span className={styles.estimateLabel}>
              {draft.items.length === 0
                ? 'Só a chácara, sem itens'
                : `Itens escolhidos (${draft.items.length})`}
            </span>
            <span className={styles.estimateValue}>
              <Money cents={itemsEstimate} />
            </span>
            <span className={styles.estimateLabel}>As diárias entram no total na revisão.</span>
          </p>

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
