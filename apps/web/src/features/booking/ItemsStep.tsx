import { useEffect, useMemo, useState } from 'react';
import type { CatalogItem, Combo } from '@chacara/shared';
import { EmptyState } from '@/components/EmptyState';
import { Money } from '@/components/Money';
import { QuantityStepper } from '@/components/QuantityStepper';
import { Skeleton } from '@/components/Skeleton';
import { ImageIcon } from '@/components/icons';
import { useCategories, useCombos, useItems, useThemes } from '@/api/storefront';
import { formErrorMessage } from '@/lib/form';
import type { BookingDraft, DraftAction } from './draft';
import { quantityOf } from './draft';
import styles from './ItemsStep.module.css';

/**
 * Passo 2: itens do pegue e monte (§13.2).
 *
 * Filtro por **estilo** primeiro, depois por categoria: é a ordem em que a pessoa
 * decide ("quero uma festa boho" vem antes de "quero um painel"), e é a ordem que
 * a §13.2 pede.
 *
 * Nada aqui soma dinheiro para valer. O rodapé mostra uma estimativa marcada como
 * tal, e o total oficial sai do `POST /pricing/quote` no passo de revisão (§13.2).
 */

type Tab = 'itens' | 'combos';

export type ItemsStepProps = {
  draft: BookingDraft;
  dispatch: (action: DraftAction) => void;
  /**
   * Recusa do envio que só tem conserto aqui (§13.2).
   *
   * É o caminho do `STOCK_INSUFFICIENT`: o item acabou entre o orçamento e o
   * envio, e a pessoa volta para este passo para ajustar a quantidade.
   */
  notice?: string;
};

/** Quantas unidades do item ainda cabem, dado o que já está no rascunho. */
function comboProgress(combo: Combo, draft: BookingDraft) {
  const lines = combo.items.map((line) => ({
    ...line,
    chosen: quantityOf(draft, line.itemId),
  }));

  return {
    lines,
    complete: lines.every((line) => line.chosen >= line.quantity),
  };
}

export function ItemsStep({ draft, dispatch, notice }: ItemsStepProps) {
  const [tab, setTab] = useState<Tab>('itens');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const themes = useThemes();
  const categories = useCategories();
  const items = useItems({
    ...(draft.themeId ? { themeId: draft.themeId } : {}),
    ...(categoryId ? { categoryId } : {}),
  });
  const combos = useCombos(draft.themeId ? { themeId: draft.themeId } : {});

  /*
   * Item que saiu do catálogo sai do rascunho.
   *
   * Sem isso, um item desativado entre a escolha e o envio faria a API recusar
   * com "um dos itens saiu do catálogo" (T19) e a pessoa não teria como saber
   * qual era. Só roda na lista sem filtro, que é a única que vê o catálogo todo.
   */
  const allItems = useItems();

  useEffect(() => {
    if (!allItems.data || draft.items.length === 0) return;

    const available = new Set(allItems.data.map((item) => item.id));
    const gone = draft.items
      .filter((item) => !available.has(item.itemId))
      .map((item) => item.itemId);

    if (gone.length > 0) dispatch({ type: 'removeItems', itemIds: gone });
  }, [allItems.data, draft.items, dispatch]);

  const chosenCount = draft.items.reduce((total, item) => total + item.quantity, 0);

  const visibleCategories = useMemo(() => {
    if (!categories.data) return [];

    // Só categoria que tem item no estilo escolhido: aba vazia é clique perdido.
    const present = new Set(items.data?.map((item) => item.category.id));
    return categories.data.filter((category) => present.has(category.id));
  }, [categories.data, items.data]);

  return (
    <div className={styles.step}>
      {notice ? (
        <p className={styles.problem} role="alert">
          {notice}
        </p>
      ) : null}

      <section>
        <h2 className={styles.title}>Escolha o estilo da festa</h2>
        <p className={styles.hint}>
          O estilo organiza os itens e os combos. Dá para misturar: o filtro é só para você
          encontrar.
        </p>

        <ul className={styles.themes}>
          <li>
            <button
              type="button"
              className={[styles.themeChip, draft.themeId === null ? styles.themeChipActive : null]
                .filter(Boolean)
                .join(' ')}
              onClick={() => dispatch({ type: 'setTheme', themeId: null })}
              aria-pressed={draft.themeId === null}
            >
              Todos
            </button>
          </li>

          {themes.data?.map((theme) => (
            <li key={theme.id}>
              <button
                type="button"
                className={[
                  styles.themeChip,
                  draft.themeId === theme.id ? styles.themeChipActive : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  dispatch({ type: 'setTheme', themeId: theme.id });
                  // Categoria do estilo anterior pode não existir no novo.
                  setCategoryId(null);
                }}
                aria-pressed={draft.themeId === theme.id}
              >
                <span className={styles.palette} aria-hidden="true">
                  {theme.palette.slice(0, 3).map((color) => (
                    <span
                      key={color.hex}
                      className={styles.paletteDot}
                      style={{ background: color.hex }}
                    />
                  ))}
                </span>
                {theme.name}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className={styles.tabs} role="tablist" aria-label="Itens ou combos">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'itens'}
          className={[styles.tab, tab === 'itens' ? styles.tabActive : null]
            .filter(Boolean)
            .join(' ')}
          onClick={() => setTab('itens')}
        >
          Itens{chosenCount > 0 ? ` (${chosenCount})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'combos'}
          className={[styles.tab, tab === 'combos' ? styles.tabActive : null]
            .filter(Boolean)
            .join(' ')}
          onClick={() => setTab('combos')}
        >
          Combos
        </button>
      </div>

      {tab === 'itens' ? (
        <section aria-label="Itens disponíveis">
          {visibleCategories.length > 0 ? (
            <ul className={styles.categories}>
              <li>
                <button
                  type="button"
                  className={[
                    styles.categoryChip,
                    categoryId === null ? styles.categoryChipActive : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setCategoryId(null)}
                  aria-pressed={categoryId === null}
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
                      categoryId === category.id ? styles.categoryChipActive : null,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setCategoryId(category.id)}
                    aria-pressed={categoryId === category.id}
                  >
                    {category.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {items.isPending ? <Skeleton rows={4} /> : null}

          {items.isError ? <p role="alert">{formErrorMessage(items.error)}</p> : null}

          {items.data?.length === 0 ? (
            <EmptyState
              title="Nenhum item neste filtro"
              description="Tente outro estilo ou veja todos os itens. Você também pode seguir sem itens e alugar só a chácara."
            />
          ) : null}

          {items.data && items.data.length > 0 ? (
            <ul className={styles.grid}>
              {items.data.map((item) => (
                <ItemCard key={item.id} item={item} draft={draft} dispatch={dispatch} />
              ))}
            </ul>
          ) : null}
        </section>
      ) : (
        <section aria-label="Combos disponíveis">
          {combos.isPending ? <Skeleton rows={3} /> : null}

          {combos.data?.length === 0 ? (
            <EmptyState
              title="Nenhum combo neste estilo"
              description="Combo é um conjunto de itens com desconto. Tente outro estilo ou monte o pedido item por item."
            />
          ) : null}

          {combos.data && combos.data.length > 0 ? (
            <ul className={styles.grid}>
              {combos.data.map((combo) => (
                <ComboCard key={combo.id} combo={combo} draft={draft} dispatch={dispatch} />
              ))}
            </ul>
          ) : null}
        </section>
      )}
    </div>
  );
}

function ItemCard({
  item,
  draft,
  dispatch,
}: {
  item: CatalogItem;
  draft: BookingDraft;
  dispatch: (action: DraftAction) => void;
}) {
  const chosen = quantityOf(draft, item.id);
  /*
   * O estoque do catálogo é o do item, não o livre nas datas escolhidas. Quem
   * sabe o disponível por dia é o orçamento (§9.3), e ele responde no passo de
   * revisão com `STOCK_INSUFFICIENT`. Aqui o teto é o estoque total, e esgotado
   * significa estoque zero.
   */
  const soldOut = item.stock === 0;

  return (
    <li
      className={[
        styles.card,
        chosen > 0 ? styles.cardChosen : null,
        soldOut ? styles.cardUnavailable : null,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.photo}>
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} loading="lazy" decoding="async" />
        ) : (
          <ImageIcon size={32} />
        )}
      </div>

      <p className={styles.name}>{item.name}</p>
      <span className={styles.category}>{item.category.name}</span>

      {item.description ? <p className={styles.notes}>{item.description}</p> : null}

      {item.assemblyNotes ? (
        <p className={styles.notes}>
          <strong>Como montar:</strong> {item.assemblyNotes}
        </p>
      ) : null}

      <div className={styles.cardFooter}>
        <span className={styles.price}>
          <Money cents={item.priceCents} />
        </span>

        {soldOut ? (
          <p className={styles.reason}>Esgotado</p>
        ) : (
          <QuantityStepper
            value={chosen}
            max={item.stock}
            label={item.name}
            onChange={(quantity) => dispatch({ type: 'setQuantity', itemId: item.id, quantity })}
          />
        )}
      </div>
    </li>
  );
}

function ComboCard({
  combo,
  draft,
  dispatch,
}: {
  combo: Combo;
  draft: BookingDraft;
  dispatch: (action: DraftAction) => void;
}) {
  const { lines, complete } = comboProgress(combo, draft);

  /** Põe no rascunho o que falta para o combo fechar, sem tirar nada. */
  function completeCombo() {
    for (const line of lines) {
      if (line.chosen < line.quantity) {
        dispatch({ type: 'setQuantity', itemId: line.itemId, quantity: line.quantity });
      }
    }
  }

  return (
    <li
      className={[styles.comboCard, complete ? styles.comboComplete : null]
        .filter(Boolean)
        .join(' ')}
    >
      <p className={styles.name}>{combo.name}</p>

      {combo.description ? <p className={styles.notes}>{combo.description}</p> : null}

      <ul className={styles.comboItems}>
        {lines.map((line) => (
          <li
            key={line.itemId}
            className={line.chosen >= line.quantity ? undefined : styles.comboItemMissing}
          >
            {line.chosen >= line.quantity ? '✓' : '○'} {line.quantity}× {line.name}
          </li>
        ))}
      </ul>

      <p className={styles.comboMoney}>
        <span>
          Itens <Money cents={combo.itemsTotalCents} />
        </span>
        <span className={styles.saving}>
          economia <Money cents={combo.discountCents} />
        </span>
      </p>

      {/* A §13.2 pede a linha de desconto quando o combo fecha. */}
      {complete ? (
        <p className={styles.comboStatus} role="status">
          Combo completo. O desconto entra no total.
        </p>
      ) : (
        <button type="button" className={styles.categoryChip} onClick={completeCombo}>
          Completar o combo
        </button>
      )}
    </li>
  );
}
