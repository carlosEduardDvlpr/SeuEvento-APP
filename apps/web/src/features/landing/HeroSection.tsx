import type { GalleryImage, PublicVenue } from '@chacara/shared';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useAvailability } from '@/api/storefront';
import { PhotoFrame } from '@/components/PhotoFrame';
import { addDays, todayInSaoPaulo } from '@chacara/shared';
import { capitalizeFirst, formatWeekdayAndDay } from '@/lib/format';
import styles from './HeroSection.module.css';

/**
 * Hero com verificação de datas (§13.1, item 1).
 *
 * A promessa da seção é "chegar às datas em um gesto": em vez de um botão genérico
 * para o calendário, as próximas datas livres aparecem aqui, e clicar numa delas
 * abre o wizard **já com a data escolhida**.
 *
 * Se a agenda estiver cheia nos próximos dois meses, nenhuma data aparece e o
 * botão para o calendário continua ali. Inventar data livre seria pior que não
 * mostrar nenhuma.
 */

/** Quantas datas livres cabem no hero sem virar lista. */
const SUGGESTIONS = 4;

/** Janela consultada: dois meses cobrem a antecedência típica de uma festa. */
const WINDOW_DAYS = 60;

export type HeroSectionProps = {
  venue: PublicVenue;
  /** Primeira imagem de destaque, quando o dono já subiu uma (§14.9). */
  hero: GalleryImage | undefined;
};

export function HeroSection({ venue, hero }: HeroSectionProps) {
  const today = todayInSaoPaulo();

  const range = useMemo(() => ({ from: today, to: addDays(today, WINDOW_DAYS) }), [today]);

  const availability = useAvailability(range);

  const freeDays = useMemo(
    () =>
      (availability.data?.days ?? []).filter((day) => day.status === 'free').slice(0, SUGGESTIONS),
    [availability.data],
  );

  return (
    <section className={styles.hero}>
      <div className={styles.text}>
        <h1 className={styles.title}>Sua festa no nosso quintal</h1>

        <p className={styles.lead}>
          Alugue a chácara por dia e monte a decoração você mesmo, escolhendo os itens do estilo que
          combina com a sua festa.
        </p>

        <div className={styles.datePicker}>
          <h2 className={styles.datePickerTitle}>Quando é a festa?</h2>

          {availability.isPending ? (
            <p className={styles.datesNote}>Consultando a agenda…</p>
          ) : null}

          {freeDays.length > 0 ? (
            <>
              <ul className={styles.dates}>
                {freeDays.map((day) => (
                  <li key={day.date}>
                    {/*
                      A data viaja na URL, e o wizard a aplica ao rascunho: é o que
                      a §13.1 pede com "leva ao wizard já preenchido".
                    */}
                    <Link className={styles.date} to={`/reservar?data=${day.date}`}>
                      {capitalizeFirst(formatWeekdayAndDay(day.date))}
                    </Link>
                  </li>
                ))}
              </ul>

              <Link className={styles.allDates} to="/reservar">
                Ver todas as datas livres
              </Link>
            </>
          ) : null}

          {availability.isSuccess && freeDays.length === 0 ? (
            <>
              <p className={styles.datesNote}>
                Os próximos dois meses estão cheios. Olhe mais à frente no calendário.
              </p>
              <Link className={styles.allDates} to="/reservar">
                Abrir o calendário
              </Link>
            </>
          ) : null}
        </div>

        <p className={styles.note}>
          Ao enviar o pedido, as datas ficam seguras por até {venue.holdHours} horas enquanto a
          chácara confirma. Nada é cobrado nesse momento.
        </p>
      </div>

      {/*
        Com foto do dono, ela entra na moldura-assinatura. Sem foto, a moldura
        vira bloco de cor: a §14.9 proíbe banco de imagens genérico.
      */}
      {hero ? (
        <PhotoFrame className={styles.image} src={hero.url} alt={hero.alt} />
      ) : (
        <PhotoFrame className={styles.image} />
      )}
    </section>
  );
}
