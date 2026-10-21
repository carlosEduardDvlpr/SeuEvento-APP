import type { PublicVenue, Quote, QuoteIssue } from '@chacara/shared';
import { EVENT_TYPE_LABELS } from '@chacara/shared';
import { Money } from '@/components/Money';
import { Skeleton } from '@/components/Skeleton';
import { Textarea } from '@/components/Textarea';
import { formatDateRange, formatWeekdayAndDay } from '@/lib/format';
import type { BookingDraft, DraftAction } from './draft';
import styles from './ReviewStep.module.css';

/**
 * Passo 3: revisão (§13.2).
 *
 * Aqui o **servidor decide**. Todo número desta tela vem do `POST /pricing/quote`:
 * a diária de cada dia com o nome da regra que a definiu, os itens pelo preço de
 * tabela, os combos aplicados e o total. O front não soma nada para exibir.
 *
 * Os `issues` do orçamento aparecem sem esvaziar a tela. É o ponto todo do
 * contrato da §11.3: a data ter sido tomada ou o item ter acabado não é erro de
 * requisição, é informação que a pessoa precisa para ajustar o que montou.
 */

export type ReviewStepProps = {
  draft: BookingDraft;
  dispatch: (action: DraftAction) => void;
  venue: PublicVenue;
  quote: Quote | undefined;
  isLoading: boolean;
  /** Mensagem do envio recusado, quando o problema é desta tela. */
  notice?: string;
};

/** Nome do item no pedido, para a mensagem de estoque falar do que a pessoa vê. */
function itemName(quote: Quote | undefined, itemId: string): string {
  return quote?.lines.find((line) => line.itemId === itemId)?.name ?? 'um dos itens';
}

/**
 * Texto do problema, no tom da §16.4: o que aconteceu e o que fazer.
 *
 * A mensagem é montada aqui e não vem da API porque `issues` não é erro: a rota
 * responde 200 e entrega dados crus, e cada tela decide como contar.
 */
function issueMessage(issue: QuoteIssue, quote: Quote | undefined, decoration: boolean): string {
  if (issue.code === 'DATE_UNAVAILABLE') {
    const dates = issue.dates.map((date) => formatDateRange(date, date)).join(', ');

    // Na decoração ninguém "reserva o dia": o que tira a data é bloqueio ou prazo (T32).
    if (decoration) {
      return `O dia ${dates} não está mais disponível para a decoração. Volte ao primeiro passo e escolha outro.`;
    }

    return issue.dates.length === 1
      ? `O dia ${dates} acabou de ser reservado. Volte ao passo das datas e escolha outro.`
      : `Estes dias acabaram de ser reservados: ${dates}. Volte ao passo das datas e escolha outro período.`;
  }

  const name = itemName(quote, issue.itemId);

  return issue.available === 0
    ? `“${name}” não está mais disponível nessas datas. Volte aos itens e tire do pedido.`
    : `Só temos ${issue.available} ${issue.available === 1 ? 'unidade' : 'unidades'} de “${name}” nessas datas. Volte aos itens e ajuste a quantidade.`;
}

export function ReviewStep({ draft, dispatch, venue, quote, isLoading, notice }: ReviewStepProps) {
  const hasDates = draft.startDate !== null && draft.endDate !== null;
  /** Só a decoração (T32): sem diária, sem convidados, sem regras da casa. */
  const decoration = draft.kind === 'DECORATION';

  return (
    <div className={styles.step}>
      <h2 className={styles.title}>Confira seu pedido</h2>

      {notice ? (
        <p className={styles.problem} role="alert">
          {notice}
        </p>
      ) : null}

      {/*
        Os problemas vêm antes do resumo: quem chegou aqui com uma data tomada
        precisa saber disso antes de ler um total que não vai poder enviar.
      */}
      {quote?.issues.map((issue) => (
        <p
          key={issue.code === 'DATE_UNAVAILABLE' ? issue.dates.join(',') : issue.itemId}
          className={styles.problem}
          role="alert"
        >
          {issueMessage(issue, quote, decoration)}
        </p>
      ))}

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>{decoration ? 'A decoração' : 'A festa'}</h3>

        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>{decoration ? 'Dia da festa' : 'Datas'}</dt>
            <dd>{hasDates ? formatDateRange(draft.startDate!, draft.endDate!) : '—'}</dd>
          </div>
          <div className={styles.fact}>
            <dt>Tipo</dt>
            <dd>{draft.eventType ? EVENT_TYPE_LABELS[draft.eventType] : '—'}</dd>
          </div>
          {decoration ? (
            <div className={styles.fact}>
              <dt>Retirada</dt>
              <dd>combinada com a gente</dd>
            </div>
          ) : (
            <>
              <div className={styles.fact}>
                <dt>Convidados</dt>
                <dd>{draft.guestCount ?? '—'}</dd>
              </div>
              <div className={styles.fact}>
                <dt>Horário</dt>
                <dd>
                  entrada {venue.checkInTime}, saída {venue.checkOutTime}
                </dd>
              </div>
            </>
          )}
        </dl>
      </section>

      {isLoading && !quote ? <Skeleton rows={6} /> : null}

      {quote ? (
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>Valores</h3>

          {/*
            O nome da regra aparece para a diária mais alta não parecer erro. Sem
            dias (decoração), o bloco inteiro some: "Diárias R$ 0,00" faria parecer
            que a chácara entrou de graça no pedido.
          */}
          {quote.days.length > 0 ? (
            <ul className={styles.lines}>
              {quote.days.map((day) => (
                <li key={day.date} className={styles.line}>
                  <span className={styles.lineName}>
                    {formatWeekdayAndDay(day.date)}
                    {day.ruleName ? <span className={styles.rule}>{day.ruleName}</span> : null}
                  </span>
                  <span className={styles.lineValue}>
                    <Money cents={day.priceCents} />
                  </span>
                </li>
              ))}

              <li className={[styles.line, styles.subtotal].join(' ')}>
                <span className={styles.lineName}>
                  {quote.days.length === 1 ? 'Diária' : `Diárias (${quote.days.length} dias)`}
                </span>
                <span className={styles.lineValue}>
                  <Money cents={quote.dailyTotalCents} />
                </span>
              </li>
            </ul>
          ) : null}

          {quote.lines.length > 0 ? (
            <ul className={styles.lines}>
              {quote.lines.map((line) => (
                <li key={line.itemId} className={styles.line}>
                  <span className={styles.lineName}>
                    {line.quantity}× {line.name}
                  </span>
                  <span className={styles.lineValue}>
                    <Money cents={line.totalCents} />
                  </span>
                </li>
              ))}

              <li className={[styles.line, styles.subtotal].join(' ')}>
                <span className={styles.lineName}>Itens do pegue e monte</span>
                <span className={styles.lineValue}>
                  <Money cents={quote.itemsTotalCents} />
                </span>
              </li>
            </ul>
          ) : (
            <p className={styles.hint}>
              Sem itens de decoração neste pedido. Você aluga só a chácara.
            </p>
          )}

          {quote.combos.length > 0 ? (
            <ul className={styles.lines}>
              {quote.combos.map((combo) => (
                <li key={combo.comboId} className={[styles.line, styles.discount].join(' ')}>
                  <span className={styles.lineName}>
                    {combo.name}
                    {combo.times > 1 ? <span className={styles.rule}>{combo.times}×</span> : null}
                  </span>
                  <span className={styles.lineValue}>
                    −<Money cents={combo.discountCents} />
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <p className={styles.total}>
            <span>Total</span>
            <strong className={isLoading ? styles.recalculating : undefined}>
              <Money cents={quote.totalCents} />
            </strong>
          </p>

          {isLoading ? (
            <p className={styles.hint} role="status">
              Recalculando…
            </p>
          ) : null}

          {quote.discountTotalCents > 0 ? (
            <p className={styles.saving}>
              Você economiza <Money cents={quote.discountTotalCents} /> com os combos.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className={styles.card}>
        <Textarea
          label="Alguma observação?"
          help={
            decoration
              ? 'Conte o que ajuda a separar a decoração: quando você prefere retirar, onde vai ser a festa, alguma cor que precisa combinar.'
              : 'Conte o que ajuda a chácara a se preparar: horário de chegada para montar, se vai ter bolo grande, se precisa de mais mesas.'
          }
          rows={4}
          maxLength={600}
          value={draft.customerNotes}
          onChange={(event) => dispatch({ type: 'setNotes', customerNotes: event.target.value })}
        />
      </section>

      {/* §13.2: regras da casa e política de cancelamento em texto curto. */}
      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Antes de enviar</h3>

        {decoration ? (
          <ul className={styles.rules}>
            <li>
              O pedido chega como <strong>aguardando confirmação</strong>. Os itens ficam separados
              para você por até {venue.holdHours} horas enquanto a gente responde.
            </li>
            <li>
              Dá para cancelar pelo site até {venue.freeCancelUntilDays} dias antes da festa. Depois
              disso, é só falar com a gente.
            </li>
            <li>
              A decoração é <strong>pegue e monte</strong>: você retira os itens, monta a festa e
              devolve depois. O horário da retirada e da devolução é combinado com a gente.
            </li>
          </ul>
        ) : (
          <ul className={styles.rules}>
            <li>
              O pedido chega como <strong>aguardando confirmação</strong>. As datas ficam seguras
              por até {venue.holdHours} horas enquanto a chácara responde.
            </li>
            <li>
              Dá para cancelar pelo site até {venue.freeCancelUntilDays} dias antes do início.
              Depois disso, é só falar com a gente.
            </li>
            <li>
              A decoração é <strong>pegue e monte</strong>: você retira os itens, monta no dia e
              devolve ao final.
            </li>
          </ul>
        )}

        {/* Regras da casa são da chácara: quem leva só a decoração não vai estar lá. */}
        {venue.houseRules && !decoration ? (
          <>
            <h3 className={styles.cardTitle}>Regras da casa</h3>
            <p className={styles.houseRules}>{venue.houseRules}</p>
          </>
        ) : null}
      </section>
    </div>
  );
}
