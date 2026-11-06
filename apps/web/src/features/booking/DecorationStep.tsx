import { useId, useMemo, useState } from 'react';
import type { CatalogItem, ItemsAvailability } from '@chacara/shared';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Money } from '@/components/Money';
import { Skeleton } from '@/components/Skeleton';
import { CheckIcon, ImageIcon } from '@/components/icons';
import { useAvailability, useCategories, useItems } from '@/api/storefront';
import { formErrorMessage } from '@/lib/form';
import { formatDateLong, formatDateRange } from '@/lib/format';
import { CustomDecorationRequest } from './CustomDecorationRequest';
import type { BookingDraft, DraftAction } from './draft';
import styles from './DecorationStep.module.css';

/**
 * Passo da decoração (§13.2, novembro de 2026).
 *
 * Cada item do catálogo é uma decoração completa, e o pedido leva **uma**: a
 * escolha é um grupo de rádio, e escolher outra troca a anterior. Na chácara a
 * decoração é opcional ("Sem decoração" é uma das opções) e sai pelo preço com a
 * chácara; na decoração sozinha, ela é o pedido.
 *
 * A data já está escolhida quando a pessoa chega aqui, então a tela sabe o que
 * está livre: a decoração que já saiu para outra festa nessa data aparece, mas
 * sem poder ser escolhida, com o motivo escrito (§13.2).
 *
 * Os preços aqui são os de tabela, para a pessoa comparar. O total oficial sai
 * do `POST /pricing/quote` na revisão (§13.2).
 */

export type DecorationStepProps = {
  draft: BookingDraft;
  dispatch: (action: DraftAction) => void;
  /** Estoque livre de cada decoração nas datas do pedido. Vem do wizard, que confere a escolha. */
  stock: { data: ItemsAvailability | undefined; isPending: boolean; isError: boolean };
  /**
   * Recusa do envio que só tem conserto aqui (§13.2).
   *
   * É o caminho do `STOCK_INSUFFICIENT`: a decoração saiu para outra festa entre
   * o orçamento e o envio, e a pessoa volta para escolher outra.
   */
  notice?: string;
  /** Falta escolher a decoração, ou a escolhida não está livre nessa data. */
  error?: string;
  /** WhatsApp da chácara, para o "Não achou o que queria?" no fim da lista. */
  whatsapp: string | null;
};

/**
 * A mensagem do "Não achou o que queria?": com a data, a dona já sabe para
 * quando é a decoração que a pessoa vai pedir.
 */
function requestMessage(draft: BookingDraft): string {
  if (!draft.startDate || !draft.endDate) {
    return 'Olá! Estou montando um pedido no site e não encontrei a decoração que eu queria. Vocês podem me ajudar?';
  }

  return `Olá! Estou montando um pedido para ${formatDateRange(draft.startDate, draft.endDate)} e não encontrei a decoração que eu queria. Vocês podem me ajudar?`;
}

/**
 * Dias do pedido em que a decoração não sai (T32).
 *
 * A dona pode fechar o pegue e monte num dia sem fechar a chácara. Nesse dia o
 * servidor recusa qualquer decoração (estoque zero), e mostrar o catálogo inteiro
 * como "em uso" esconderia o motivo de verdade.
 */
function useDecorationClosedDays(draft: BookingDraft): string[] {
  const range =
    draft.startDate && draft.endDate ? { from: draft.startDate, to: draft.endDate } : null;

  const agenda = useAvailability(range, 'DECORATION');

  return (agenda.data?.days ?? []).filter((day) => day.status === 'blocked').map((day) => day.date);
}

export function DecorationStep({
  draft,
  dispatch,
  stock,
  notice,
  error,
  whatsapp,
}: DecorationStepProps) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const closedDays = useDecorationClosedDays(draft);
  const categories = useCategories();
  const items = useItems();

  /** Chácara: a decoração é opcional e sai pelo preço com a chácara. */
  const venue = draft.kind === 'VENUE';
  const oneDay = draft.startDate === draft.endDate;

  const freeStock = useMemo(
    () => new Map((stock.data?.items ?? []).map((line) => [line.itemId, line.freeStock])),
    [stock.data],
  );

  /*
   * Decoração sem estoque nenhum nunca está livre, e oferecê-la seria ruído. A
   * escolhida fica na lista mesmo assim: a pessoa precisa ver por que ela não
   * serve.
   */
  const offered = useMemo(
    () => (items.data ?? []).filter((item) => item.stock > 0 || item.id === draft.itemId),
    [items.data, draft.itemId],
  );

  // Só categoria que tem decoração: filtro vazio é clique perdido.
  const visibleCategories = useMemo(() => {
    const present = new Set(offered.map((item) => item.category.id));
    return (categories.data ?? []).filter((category) => present.has(category.id));
  }, [categories.data, offered]);

  // A categoria escolhida pode sumir quando o catálogo muda: aí o filtro volta a "Todas".
  const activeCategory = visibleCategories.some((category) => category.id === categoryId)
    ? categoryId
    : null;

  const shown = activeCategory
    ? offered.filter((item) => item.category.id === activeCategory)
    : offered;

  /** Por que a decoração não pode ser escolhida, ou `null` quando pode. */
  function unavailableReason(item: CatalogItem): string | null {
    // Sem a agenda (carregando ou com erro), quem confere é a revisão.
    if (!stock.data) return null;
    if ((freeStock.get(item.id) ?? 0) > 0) return null;

    return oneDay ? 'Em uso nessa data' : 'Em uso nessas datas';
  }

  const problems = (
    <>
      {notice ? (
        <p className={styles.problem} role="alert">
          {notice}
        </p>
      ) : null}

      {error ? (
        <p className={styles.problem} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );

  if (closedDays.length > 0) {
    const days = closedDays.map(formatDateLong).join(', ');

    return (
      <div className={styles.step}>
        {problems}

        <section className={styles.intro}>
          <h2 className={styles.title}>A decoração não sai nessas datas</h2>
          <p className={styles.hint}>
            {closedDays.length === 1 ? `No dia ${days}` : `Nos dias ${days}`} o pegue e monte está
            fechado.{' '}
            {venue
              ? 'Dá para seguir só com a chácara, sem decoração, ou voltar e escolher outras datas.'
              : 'Volte e escolha outro dia para a festa.'}
          </p>
        </section>

        {/* Decoração escolhida antes de o dia fechar travaria o pedido na revisão. */}
        {venue && draft.itemId ? (
          <div>
            <Button onClick={() => dispatch({ type: 'setItem', itemId: null })}>
              Tirar a decoração do pedido
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.step}>
      {problems}

      <section className={styles.intro}>
        <h2 className={styles.title}>{venue ? 'Quer uma decoração?' : 'Escolha a decoração'}</h2>
      </section>

      {visibleCategories.length > 1 ? (
        <ul className={styles.categories} aria-label="Categorias">
          <li>
            <button
              type="button"
              className={[
                styles.categoryChip,
                activeCategory === null ? styles.categoryChipActive : null,
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setCategoryId(null)}
              aria-pressed={activeCategory === null}
            >
              Todas
            </button>
          </li>
          {visibleCategories.map((category) => (
            <li key={category.id}>
              <button
                type="button"
                className={[
                  styles.categoryChip,
                  activeCategory === category.id ? styles.categoryChipActive : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setCategoryId(category.id)}
                aria-pressed={activeCategory === category.id}
              >
                {category.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {items.isPending || stock.isPending ? <Skeleton rows={4} /> : null}

      {items.isError ? (
        <p className={styles.problem} role="alert">
          {formErrorMessage(items.error) ?? 'Não conseguimos carregar as decorações.'}
        </p>
      ) : null}

      {stock.isError ? (
        <p className={styles.hint} role="status">
          Não conseguimos conferir agora quais decorações estão livres nessa data. A revisão confere
          de novo antes do envio.
        </p>
      ) : null}

      {items.data && !stock.isPending ? (
        <fieldset className={styles.choices}>
          <legend className="sr-only">
            {venue ? 'Decoração da festa, opcional' : 'Decoração da festa'}
          </legend>

          {shown.length === 0 && !venue ? (
            <EmptyState
              title="Nenhuma decoração para escolher"
              description="O catálogo está sem decoração disponível no momento. Fale com a gente pelo WhatsApp."
            />
          ) : (
            <ul className={styles.grid}>
              {/* Na chácara, ficar sem decoração é uma escolha como as outras. */}
              {venue ? (
                <NoDecorationOption
                  checked={draft.itemId === null}
                  onChoose={() => dispatch({ type: 'setItem', itemId: null })}
                />
              ) : null}

              {shown.map((item) => (
                <DecorationOption
                  key={item.id}
                  item={item}
                  venue={venue}
                  checked={draft.itemId === item.id}
                  unavailable={unavailableReason(item)}
                  onChoose={() => dispatch({ type: 'setItem', itemId: item.id })}
                />
              ))}
            </ul>
          )}
        </fieldset>
      ) : null}

      {/* No fim da lista, depois de a pessoa ter visto o que há (pedido do dono). */}
      {items.data && !stock.isPending ? (
        <CustomDecorationRequest whatsapp={whatsapp} message={requestMessage(draft)} />
      ) : null}
    </div>
  );
}

function NoDecorationOption({ checked, onChoose }: { checked: boolean; onChoose: () => void }) {
  const nameId = useId();

  return (
    <li>
      <label
        className={[styles.card, styles.cardNone, checked ? styles.cardChosen : null]
          .filter(Boolean)
          .join(' ')}
      >
        <input
          className={styles.input}
          type="radio"
          name="decoracao"
          value=""
          checked={checked}
          onChange={onChoose}
          aria-labelledby={nameId}
        />
        <span className={styles.name} id={nameId}>
          Sem decoração
        </span>
        <span className={styles.notes}>Só a chácara, sem a decoração do pegue e monte.</span>
        {checked ? <ChosenMark /> : null}
      </label>
    </li>
  );
}

function DecorationOption({
  item,
  venue,
  checked,
  unavailable,
  onChoose,
}: {
  item: CatalogItem;
  venue: boolean;
  checked: boolean;
  unavailable: string | null;
  onChoose: () => void;
}) {
  const nameId = useId();
  const detailsId = useId();
  // Igual ao avulso é "sem promoção": riscar o mesmo preço não diria nada.
  const promo = venue && item.venuePriceCents < item.priceCents;

  return (
    <li>
      <label
        className={[
          styles.card,
          checked ? styles.cardChosen : null,
          unavailable ? styles.cardUnavailable : null,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <input
          className={styles.input}
          type="radio"
          name="decoracao"
          value={item.id}
          checked={checked}
          disabled={unavailable !== null}
          onChange={onChoose}
          aria-labelledby={nameId}
          aria-describedby={detailsId}
        />

        <span className={styles.photo}>
          {/* `alt` vazio: o nome vem logo abaixo, e o leitor de tela não repete. */}
          {item.imageUrl ? (
            <img src={item.imageUrl} alt="" loading="lazy" decoding="async" />
          ) : (
            <ImageIcon size={32} />
          )}
        </span>

        <span className={styles.name} id={nameId}>
          {item.name}
        </span>
        <span className={styles.category}>{item.category.name}</span>

        {item.description ? <span className={styles.notes}>{item.description}</span> : null}

        {item.assemblyNotes ? (
          <span className={styles.notes}>
            <strong>Como montar:</strong> {item.assemblyNotes}
          </span>
        ) : null}

        <span className={styles.cardFooter} id={detailsId}>
          {promo ? (
            <span className={styles.prices}>
              <s className={styles.regularPrice}>
                <span className="sr-only">Avulsa, </span>
                <Money cents={item.priceCents} />
              </s>
              <strong className={styles.price}>
                <Money cents={item.venuePriceCents} />
              </strong>
              <span className={styles.priceNote}>com a chácara</span>
            </span>
          ) : (
            <strong className={styles.price}>
              <Money cents={venue ? item.venuePriceCents : item.priceCents} />
            </strong>
          )}

          {unavailable ? <span className={styles.reason}>{unavailable}</span> : null}
        </span>

        {checked ? <ChosenMark /> : null}
      </label>
    </li>
  );
}

/** "Escolhida", com o ícone: a escolha nunca é marcada só pela cor da borda (§14.2). */
function ChosenMark() {
  return (
    <span className={styles.chosen}>
      <CheckIcon size={18} />
      Escolhida
    </span>
  );
}
