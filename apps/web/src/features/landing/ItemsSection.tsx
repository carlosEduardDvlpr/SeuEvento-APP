import type { CatalogItem } from '@chacara/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Money } from '@/components/Money';
import { PhotoFrame } from '@/components/PhotoFrame';
import { CustomDecorationRequest } from '@/features/booking/CustomDecorationRequest';
import landing from './landing.module.css';
import { revealOnScroll } from './reveal';
import styles from './ItemsSection.module.css';

/**
 * Decoração pegue e monte: os itens do catálogo na vitrine.
 *
 * Cada item é uma decoração completa (novembro de 2026, a pedido do dono), e a
 * vitrine se organiza só por categoria. Sem item nenhum, a seção some, como as
 * outras (§16.6).
 *
 * Cada item é a foto na moldura da marca, com categoria, nome e preço embaixo,
 * sem caixa em volta: é catálogo de decoração, não lista de produtos. O cartão
 * inteiro leva ao wizard com o item já no pedido (`?item=`). O preço é o de
 * tabela, o avulso; quando a decoração sai mais barata junto com a chácara, a
 * segunda linha diz quanto. O total do pedido continua saindo do orçamento
 * (§9.7).
 *
 * No fim, o "Não achou o que queria?" leva ao WhatsApp da chácara (novembro de
 * 2026, a pedido do dono): a decoração que a pessoa procura pode não estar no
 * catálogo.
 */

/** Cartões antes do "mostrar mais": o catálogo inteiro mora no wizard. */
const PREVIEW = 8;

/** A conversa já começa dizendo de onde a pessoa veio. */
const REQUEST_MESSAGE =
  'Olá! Vi as decorações no site e não encontrei a que eu queria. Vocês podem me ajudar?';

export type ItemsSectionProps = {
  items: CatalogItem[];
  /** WhatsApp da chácara. Sem ele, o "Não achou o que queria?" não aparece. */
  whatsapp: string | null;
};

export function ItemsSection({ items, whatsapp }: ItemsSectionProps) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  /*
   * Item sem estoque não vai para a vitrine: clicar levaria a um pedido que o
   * orçamento recusa na hora. Ele continua no painel, onde a dona repõe.
   */
  const available = useMemo(() => items.filter((item) => item.stock > 0), [items]);

  // Na ordem do catálogo: a API já entrega os itens agrupados por categoria.
  const categories = useMemo(() => {
    const seen = new Map<string, CatalogItem['category']>();
    for (const item of available) {
      if (!seen.has(item.category.id)) seen.set(item.category.id, item.category);
    }
    return [...seen.values()];
  }, [available]);

  /*
   * §18.1: o botão "mostrar mais" some quando é usado, e o foco iria junto para o
   * começo da página. Ele vai para o primeiro cartão que acabou de aparecer, que
   * é onde quem navega pelo teclado quer continuar.
   */
  useEffect(() => {
    if (!expanded) return;
    listRef.current?.querySelectorAll<HTMLAnchorElement>('a')[PREVIEW]?.focus();
  }, [expanded]);

  if (available.length === 0) return null;

  const filtered = categoryId
    ? available.filter((item) => item.category.id === categoryId)
    : available;
  const visible = expanded ? filtered : filtered.slice(0, PREVIEW);
  const remaining = filtered.length - visible.length;

  function choose(next: string | null) {
    setCategoryId(next);
    // Categoria nova começa recolhida: o "mostrar mais" valia para a lista anterior.
    setExpanded(false);
  }

  return (
    <section className={landing.section} aria-labelledby="titulo-decoracao">
      <div className={landing.inner}>
        <div className={landing.heading} ref={revealOnScroll}>
          <h2 className={landing.title} id="titulo-decoracao">
            Decorações
          </h2>
        </div>

        {/* Com uma categoria só, o filtro não teria o que filtrar. */}
        {categories.length > 1 ? (
          <div
            className={[landing.body, styles.filters].join(' ')}
            role="group"
            aria-label="Filtrar por categoria"
            ref={revealOnScroll}
          >
            {[{ id: null, name: 'Todas' }, ...categories].map((option) => {
              const active = categoryId === option.id;

              return (
                <button
                  key={option.id ?? 'todas'}
                  type="button"
                  className={[styles.filter, active ? styles.filterActive : null]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={active}
                  onClick={() => choose(option.id)}
                >
                  {option.name}
                </button>
              );
            })}
          </div>
        ) : null}

        <ul className={styles.grid} ref={listRef}>
          {visible.map((item) => (
            <li key={item.id} className={styles.card} ref={revealOnScroll}>
              <Link className={styles.link} to={`/reservar?item=${item.id}`}>
                {/*
                  `alt` vazio de propósito: o nome vem logo abaixo, em texto, e
                  repeti-lo faria o leitor de tela dizer tudo duas vezes.
                */}
                <PhotoFrame className={styles.photo} src={item.imageUrl} alt="" />

                <span className={styles.category}>{item.category.name}</span>
                <h3 className={styles.name}>{item.name}</h3>

                <span className={styles.footer}>
                  <span className={styles.prices}>
                    <span className={styles.price}>
                      <Money cents={item.priceCents} />
                    </span>
                    {/* Igual ao avulso é "sem promoção": a linha só diria o mesmo preço de novo. */}
                    {item.venuePriceCents < item.priceCents ? (
                      <span className={styles.venuePrice}>
                        <Money cents={item.venuePriceCents} /> com a chácara
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.cta}>Reservar</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {remaining > 0 ? (
          <p className={styles.moreRow} ref={revealOnScroll}>
            <button
              type="button"
              className={[landing.secondaryAction, styles.more].join(' ')}
              onClick={() => setExpanded(true)}
            >
              Mostrar mais {remaining} {remaining === 1 ? 'decoração' : 'decorações'}
            </button>
          </p>
        ) : null}

        {whatsapp ? (
          <div className={styles.request} ref={revealOnScroll}>
            <CustomDecorationRequest whatsapp={whatsapp} message={REQUEST_MESSAGE} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
