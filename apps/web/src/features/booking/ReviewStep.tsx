import type {
  CatalogItem,
  FulfillmentMethod,
  PublicVenue,
  Quote,
  QuoteIssue,
} from '@chacara/shared';
import { FULFILLMENT_LABELS } from '@chacara/shared';
import { useId } from 'react';
import { Button } from '@/components/Button';
import { Money } from '@/components/Money';
import { Skeleton } from '@/components/Skeleton';
import { Textarea } from '@/components/Textarea';
import { ImageIcon } from '@/components/icons';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatAddress, formatDateRange, formatWeekdayAndDay } from '@/lib/format';
import type { BookingDraft, DraftAction } from './draft';
import styles from './ReviewStep.module.css';

/**
 * Último passo: a revisão (§13.2).
 *
 * Aqui o **servidor decide**. Todo número desta tela vem do `POST /pricing/quote`:
 * a diária de cada dia com o nome da regra que a definiu, a decoração pelo preço
 * que vale para o pedido e o total. O front não soma nada para exibir.
 *
 * Os `issues` do orçamento aparecem sem esvaziar a tela. É o ponto todo do
 * contrato da §11.3: a data ter sido tomada ou a decoração ter saído para outra
 * festa não é erro de requisição, é informação que a pessoa precisa para ajustar
 * o que montou.
 *
 * Na decoração sozinha, é aqui que a pessoa diz se retira a decoração na
 * chácara ou se recebe no endereço (§9.12, novembro de 2026).
 */

export type ReviewStepProps = {
  draft: BookingDraft;
  dispatch: (action: DraftAction) => void;
  venue: PublicVenue;
  /** A decoração do pedido, do catálogo: a foto e o preço avulso. */
  item: CatalogItem | undefined;
  quote: Quote | undefined;
  isLoading: boolean;
  /** Mensagem do envio recusado, quando o problema é desta tela. */
  notice?: string;
  /** Tentou enviar a decoração sem dizer se retira ou recebe. */
  fulfillmentError?: string;
  /** Abre o cadastro do endereço de entrega. */
  onEditAddress: () => void;
};

/** Nome da decoração no pedido, para a mensagem falar do que a pessoa vê. */
function itemName(quote: Quote | undefined, itemId: string): string {
  return quote?.lines.find((line) => line.itemId === itemId)?.name ?? 'A decoração';
}

/**
 * Texto do problema, no tom da §16.4: o que aconteceu e o que fazer.
 *
 * A mensagem é montada aqui e não vem da API porque `issues` não é erro: a rota
 * responde 200 e entrega dados crus, e cada tela decide como contar.
 */
function issueMessage(issue: QuoteIssue, quote: Quote | undefined, draft: BookingDraft): string {
  const decoration = draft.kind === 'DECORATION';
  const oneDay = draft.startDate === draft.endDate;

  if (issue.code === 'DATE_UNAVAILABLE') {
    const dates = issue.dates.map((date) => formatDateRange(date, date)).join(', ');

    // Na decoração ninguém "reserva o dia": o que tira a data é bloqueio ou prazo (T32).
    if (decoration) {
      return `O dia ${dates} não está mais disponível para a decoração. Volte ao passo da data e escolha outro.`;
    }

    return issue.dates.length === 1
      ? `O dia ${dates} acabou de ser reservado. Volte ao passo da data e escolha outro.`
      : `Estes dias acabaram de ser reservados: ${dates}. Volte ao passo da data e escolha outro período.`;
  }

  // Uma decoração por pedido, uma vez: faltar estoque é ela ter saído para outra festa.
  const name = itemName(quote, issue.itemId);
  const when = decoration || oneDay ? 'nessa data' : 'nessas datas';

  return decoration
    ? `“${name}” não está mais livre ${when}. Volte à decoração e escolha outra.`
    : `“${name}” não está mais livre ${when}. Volte à decoração e escolha outra, ou siga sem decoração.`;
}

const FULFILLMENT_TEXTS: Record<FulfillmentMethod, string> = {
  PICKUP: 'Você retira os itens. O local e horário para retirada são combinados com a gente.',
  DELIVERY:
    'A gente leva a decoração até o seu endereço. A taxa de entrega é combinada posteriormente com a gente e não entra no total.',
};

export function ReviewStep({
  draft,
  dispatch,
  venue,
  item,
  quote,
  isLoading,
  notice,
  fulfillmentError,
  onEditAddress,
}: ReviewStepProps) {
  const hasDates = draft.startDate !== null && draft.endDate !== null;
  /** Só a decoração (T32): sem diária, sem convidados, sem regras da casa. */
  const decoration = draft.kind === 'DECORATION';
  const delivery = decoration && draft.fulfillment === 'DELIVERY';

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
          {issueMessage(issue, quote, draft)}
        </p>
      ))}

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>{decoration ? 'A decoração' : 'A festa'}</h3>

        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>{decoration ? 'Dia da festa' : 'Datas'}</dt>
            <dd>{hasDates ? formatDateRange(draft.startDate!, draft.endDate!) : '—'}</dd>
          </div>
          {decoration ? null : (
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

      {decoration ? (
        <FulfillmentChoice
          value={draft.fulfillment}
          onChange={(fulfillment) => dispatch({ type: 'setFulfillment', fulfillment })}
          error={fulfillmentError}
          onEditAddress={onEditAddress}
        />
      ) : null}

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
              {quote.lines.map((line) => {
                // A mesma foto e o mesmo preço avulso do catálogo, só da decoração do pedido.
                const photo = item?.id === line.itemId ? item.imageUrl : null;
                const promo =
                  !decoration && item?.id === line.itemId && line.unitPriceCents < item.priceCents;

                return (
                  <li key={line.itemId} className={[styles.line, styles.itemLine].join(' ')}>
                    <span className={styles.itemName}>
                      {/*
                        `alt=""`: o nome da decoração vem logo ao lado, e repeti-lo
                        na foto faria o leitor de tela dizer tudo duas vezes (§18.1).
                      */}
                      <span className={styles.thumb}>
                        {photo ? (
                          <img src={photo} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <ImageIcon size={20} />
                        )}
                      </span>
                      <span className={styles.lineName}>
                        {line.name}
                        {promo ? <span className={styles.rule}>preço com a chácara</span> : null}
                      </span>
                    </span>
                    <span className={styles.lineValue}>
                      <Money cents={line.totalCents} />
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.hint}>Sem decoração neste pedido. Você aluga só a chácara.</p>
          )}

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

          {delivery ? (
            <p className={styles.hint}>A taxa de entrega é combinada com a chácara.</p>
          ) : null}
        </section>
      ) : null}

      <section className={styles.card}>
        <Textarea
          label="Alguma observação?"
          help={
            decoration
              ? 'Conte o que ajuda a separar a decoração: o melhor horário para a retirada ou a entrega, alguma cor que precisa combinar.'
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
              O pedido fica <strong>aguardando confirmação</strong> e em breve entraremos em contato
              com você.
            </li>
            <li>
              Dá para cancelar pelo site até {venue.freeCancelUntilDays} dias antes da festa. Depois
              disso, é só falar com a gente.
            </li>
          </ul>
        ) : (
          <ul className={styles.rules}>
            <li>
              O pedido fica <strong>aguardando confirmação</strong> e em breve entraremos em contato
              com você.
            </li>
            <li>
              Dá para cancelar pelo site até {venue.freeCancelUntilDays} dias antes do início.
              Depois disso, é só falar com a gente.
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

/**
 * Retirada ou entrega (§9.12).
 *
 * Sem escolha pronta: as duas saídas têm consequência para a pessoa (ir até a
 * chácara, ou receber e combinar a taxa), e marcar uma por ela seria decidir no
 * lugar dela. A entrega mostra para onde a decoração vai, que é o endereço do
 * perfil, e deixa cadastrar ou trocar ali mesmo.
 */
function FulfillmentChoice({
  value,
  onChange,
  error,
  onEditAddress,
}: {
  value: FulfillmentMethod | null;
  onChange: (fulfillment: FulfillmentMethod) => void;
  error: string | undefined;
  onEditAddress: () => void;
}) {
  const { status, user } = useAuth();
  const errorId = useId();
  const options: FulfillmentMethod[] = ['PICKUP', 'DELIVERY'];

  return (
    <section className={styles.card}>
      <fieldset className={styles.fieldset} aria-describedby={error ? errorId : undefined}>
        <legend className={styles.cardTitle}>Como a decoração chega à festa?</legend>

        {error ? (
          <p className={styles.problem} id={errorId} role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.options}>
          {options.map((option) => (
            <label
              key={option}
              className={[styles.option, value === option ? styles.optionChecked : null]
                .filter(Boolean)
                .join(' ')}
            >
              <input
                className={styles.input}
                type="radio"
                name="fulfillment"
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
              />
              <span className={styles.optionTitle}>{FULFILLMENT_LABELS[option]}</span>
              <span className={styles.optionText}>{FULFILLMENT_TEXTS[option]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {value === 'DELIVERY' ? (
        status === 'authenticated' && user ? (
          user.address ? (
            <div className={styles.address}>
              <p className={styles.addressText}>
                <span className={styles.addressLabel}>Entrega em</span>
                {formatAddress(user.address)}
              </p>
              <Button onClick={onEditAddress}>Alterar endereço</Button>
            </div>
          ) : (
            // O cadastro em si fica no fim da página, no lugar do botão de enviar.
            <p className={styles.hint}>
              Falta o endereço de entrega. Você cadastra antes de enviar, e ele fica salvo no seu
              perfil.
            </p>
          )
        ) : (
          <p className={styles.hint}>Depois de entrar na sua conta, você informa o endereço.</p>
        )
      ) : null}
    </section>
  );
}
