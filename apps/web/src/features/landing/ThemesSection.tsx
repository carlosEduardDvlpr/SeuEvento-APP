import type { Theme } from '@chacara/shared';
import { Link } from 'react-router';
import { ArchFrame } from '@/components/ArchFrame';
import landing from './landing.module.css';
import styles from './ThemesSection.module.css';

/**
 * Estilos de festa (§13.1, item 5 e §15).
 *
 * Cartões de arco com a paleta e uma foto de kit montado. Clicar leva ao wizard
 * **com o filtro do estilo aplicado**, que é o que a §13.1 pede.
 *
 * Sem foto de capa, o arco usa a primeira cor da paleta como bloco de cor
 * (§14.9): é a cor do próprio estilo, não um enfeite escolhido por nós.
 */

export type ThemesSectionProps = {
  themes: Theme[];
};

export function ThemesSection({ themes }: ThemesSectionProps) {
  if (themes.length === 0) return null;

  return (
    <section className={landing.section} aria-labelledby="titulo-estilos">
      <div className={landing.inner}>
        <div className={landing.heading}>
          <h2 className={landing.title} id="titulo-estilos">
            Escolha um estilo
          </h2>
          <p className={landing.lead}>
            Cada estilo reúne os itens que combinam entre si. Dá para misturar: o estilo é só um
            jeito de encontrar.
          </p>
        </div>

        <ul className={[landing.body, styles.grid].join(' ')}>
          {themes.map((theme) => (
            <li key={theme.id} className={styles.card}>
              <Link className={styles.link} to={`/reservar?estilo=${theme.id}`}>
                <ArchFrame
                  variant="tall"
                  src={theme.coverImageUrl}
                  alt={theme.coverImageUrl ? `Decoração no estilo ${theme.name}` : ''}
                  {...(theme.palette[0] ? { fillColor: theme.palette[0].hex } : {})}
                />

                <h3 className={styles.name}>{theme.name}</h3>
                {theme.tagline ? <p className={styles.tagline}>{theme.tagline}</p> : null}

                {/*
                  A paleta é dado do estilo (§14.3), não decoração: o nome de cada
                  cor vem como texto para quem não distingue as amostras.
                */}
                <ul className={styles.palette}>
                  {theme.palette.map((color) => (
                    <li key={color.hex} className={styles.swatch} style={{ background: color.hex }}>
                      <span className="sr-only">
                        {color.name} ({color.hex})
                      </span>
                    </li>
                  ))}
                </ul>

                <span className={styles.cta}>Ver itens deste estilo</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
