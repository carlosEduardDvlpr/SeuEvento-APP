import type { Combo } from '@chacara/shared';
import { Link } from 'react-router';
import { Money } from '@/components/Money';
import { PhotoFrame } from '@/components/PhotoFrame';
import landing from './landing.module.css';
import { revealOnScroll } from './reveal';
import styles from './CombosSection.module.css';

/**
 * Combos (§13.1, item 6).
 *
 * Mostra os mais vantajosos, **com quanto o cliente economiza**. A economia vem
 * calculada pela API (§9.6): somar aqui abriria a chance de a landing prometer um
 * desconto diferente do que o orçamento aplica.
 */

/** Quantos cabem na seção sem virar catálogo. O catálogo é o wizard. */
const HIGHLIGHTS = 3;

export type CombosSectionProps = {
  combos: Combo[];
};

export function CombosSection({ combos }: CombosSectionProps) {
  // Maior economia primeiro: é o que justifica a seção existir.
  const highlights = [...combos]
    .sort((a, b) => b.discountCents - a.discountCents)
    .slice(0, HIGHLIGHTS);

  if (highlights.length === 0) return null;

  return (
    <section
      className={[landing.section, landing.sectionAlt].join(' ')}
      aria-labelledby="titulo-combos"
    >
      <div className={landing.inner}>
        <div className={landing.heading} ref={revealOnScroll}>
          <h2 className={landing.title} id="titulo-combos">
            Combos que saem mais barato
          </h2>
          <p className={landing.lead}>
            Conjuntos prontos com desconto. O desconto entra sozinho no total quando os itens estão
            no pedido.
          </p>
        </div>

        <ul className={[landing.body, styles.grid].join(' ')}>
          {highlights.map((combo) => (
            <li key={combo.id} className={styles.card} ref={revealOnScroll}>
              <PhotoFrame
                className={styles.photo}
                variant="tall"
                src={combo.imageUrl}
                alt={combo.imageUrl ? `Itens do combo ${combo.name} montados` : ''}
              />

              <div className={styles.content}>
                <p className={styles.saving}>
                  você economiza <Money cents={combo.discountCents} />
                </p>

                <h3 className={styles.name}>{combo.name}</h3>

                {combo.description ? <p className={styles.text}>{combo.description}</p> : null}

                <ul className={styles.items}>
                  {combo.items.map((line) => (
                    <li key={line.itemId}>
                      {line.quantity}× {line.name}
                    </li>
                  ))}
                </ul>

                <div className={styles.offer}>
                  <span className={styles.offerLabel}>Combo completo</span>
                  <p className={styles.money}>
                    <span className={styles.from}>
                      <Money cents={combo.itemsTotalCents} />
                    </span>
                    <strong className={styles.price}>
                      <Money cents={combo.priceCents} />
                    </strong>
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <p className={landing.body} ref={revealOnScroll}>
          <Link className={landing.secondaryAction} to="/reservar?step=itens">
            Ver todos os combos
          </Link>
        </p>
      </div>
    </section>
  );
}
