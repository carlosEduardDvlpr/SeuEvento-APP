import type { Booking } from '@chacara/shared';
import { todayInSaoPaulo } from '@chacara/shared';
import { type KeyboardEvent, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMyBookings } from '@/api/bookings';
import { EmptyState } from '@/components/EmptyState';
import { Money } from '@/components/Money';
import { Skeleton } from '@/components/Skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { formErrorMessage } from '@/lib/form';
import { describeGuests, describeItems, formatDateRange, formatTimeUntil } from '@/lib/format';
import { groupBookings } from './groupBookings';
import { ProfileTab } from './ProfileTab';
import styles from './MyBookingsPage.module.css';

/**
 * Minhas reservas (§13.3), com a aba "Meu perfil" (novembro de 2026).
 *
 * A área do cliente tem duas abas: as reservas, como sempre, e o perfil, com os
 * dados de contato, o endereço de entrega da decoração (§9.12), a senha e a
 * remoção da conta (§10.8). Ficam na mesma página, e não em rotas separadas,
 * porque são a mesma casa do cliente no site; a aba aberta vai na URL
 * (`?aba=perfil`), para o link direto e o voltar do navegador funcionarem.
 *
 * As abas seguem o padrão da WAI-ARIA: as setas do teclado andam entre elas, e
 * só a aba escolhida entra na ordem do Tab.
 *
 * A lista é agrupada em próximas, passadas e canceladas. Sem paginação, porque
 * um cliente tem poucas reservas e paginar criaria estado de página numa tela
 * que se lê de uma vez.
 */

type Tab = 'reservas' | 'perfil';

const TABS: { id: Tab; label: string }[] = [
  { id: 'reservas', label: 'Minhas reservas' },
  { id: 'perfil', label: 'Meu perfil' },
];

/** Para onde cada tecla leva, a partir da aba atual. As setas dão a volta. */
const TAB_KEYS: Partial<Record<string, (current: number, last: number) => number>> = {
  ArrowRight: (current, last) => (current === last ? 0 : current + 1),
  ArrowLeft: (current, last) => (current === 0 ? last : current - 1),
  Home: () => 0,
  End: (_current, last) => last,
};

function BookingCard({ booking }: { booking: Booking }) {
  return (
    <li className={styles.card}>
      <Link className={styles.cardLink} to={`/reservas/${booking.id}`}>
        <span className={styles.cardHead}>
          <StatusBadge status={booking.status} />
          <span className={styles.total}>
            <Money cents={booking.totalCents} />
          </span>
        </span>

        <span className={styles.dates}>{formatDateRange(booking.startDate, booking.endDate)}</span>

        <span className={styles.meta}>
          {describeGuests(booking.kind, booking.guestCount)} · {describeItems(booking.items.length)}
        </span>

        {/*
          §13.3: pedido pendente mostra quando as datas deixam de ficar seguras.
          É a informação que decide se a pessoa espera ou liga para a chácara. Na
          decoração o que fica seguro são os itens, não a data (T32).
        */}
        {booking.status === 'PENDING' && booking.holdExpiresAt ? (
          <span className={styles.hold}>
            {booking.kind === 'DECORATION' ? 'Itens separados' : 'Datas seguras'}{' '}
            {formatTimeUntil(booking.holdExpiresAt)}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function Group({ title, bookings }: { title: string; bookings: Booking[] }) {
  if (bookings.length === 0) return null;

  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>{title}</h2>
      <ul className={styles.list}>
        {bookings.map((booking) => (
          <BookingCard key={booking.id} booking={booking} />
        ))}
      </ul>
    </section>
  );
}

/** A aba "Minhas reservas": a lista da §13.3. */
function BookingsTab() {
  const bookings = useMyBookings();

  if (bookings.isPending) return <Skeleton rows={5} />;

  if (bookings.isError) {
    return <p role="alert">{formErrorMessage(bookings.error) ?? 'Tente de novo em instantes.'}</p>;
  }

  /*
   * "Hoje" é o dia na chácara, não no relógio de quem olha: quem abre a página de
   * outro fuso veria a festa de hoje já no passado.
   */
  const groups = groupBookings(bookings.data ?? [], todayInSaoPaulo());
  const total = (bookings.data ?? []).length;

  if (total === 0) {
    return (
      <EmptyState
        title="Você ainda não tem reservas"
        description="Quando enviar um pedido, ele aparece aqui com o andamento e os valores."
        action={
          <Link className={styles.action} to="/reservar">
            Montar um pedido
          </Link>
        }
      />
    );
  }

  return (
    <>
      <Group title="Próximas" bookings={groups.upcoming} />
      <Group title="Já aconteceram" bookings={groups.past} />
      <Group title="Canceladas" bookings={groups.cancelled} />
    </>
  );
}

export function MyBookingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get('aba') === 'perfil' ? 'perfil' : 'reservas';

  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  /*
   * `replace` de propósito: trocar de aba não é ir para outra página, e cada
   * clique empilhado no histórico faria o voltar do navegador passear entre as
   * duas abas antes de sair daqui.
   */
  function select(next: Tab) {
    const params = new URLSearchParams(searchParams);
    if (next === 'perfil') params.set('aba', 'perfil');
    else params.delete('aba');
    setSearchParams(params, { replace: true });
  }

  /* Setas andam entre as abas, Home e End vão às pontas, e o foco vai junto (WAI-ARIA). */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const move = TAB_KEYS[event.key];
    if (!move) return;

    const current = TABS.findIndex((option) => option.id === tab);
    const next = TABS[move(current, TABS.length - 1)];
    if (!next) return;

    event.preventDefault();
    select(next.id);
    tabRefs.current[next.id]?.focus();
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Minhas reservas</h1>

      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Sua área no site"
        onKeyDown={handleKeyDown}
      >
        {TABS.map((option) => {
          const selected = option.id === tab;

          return (
            <button
              key={option.id}
              ref={(node) => {
                tabRefs.current[option.id] = node;
              }}
              type="button"
              role="tab"
              id={`aba-${option.id}`}
              aria-selected={selected}
              aria-controls={`painel-${option.id}`}
              tabIndex={selected ? 0 : -1}
              className={[styles.tab, selected ? styles.tabActive : null].filter(Boolean).join(' ')}
              onClick={() => select(option.id)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {/*
        Os dois painéis ficam na página, e o da aba fechada só se esconde: o que
        a pessoa digitou no perfil continua lá quando ela volta das reservas.
      */}
      <div
        className={styles.panel}
        role="tabpanel"
        id="painel-reservas"
        aria-labelledby="aba-reservas"
        tabIndex={0}
        hidden={tab !== 'reservas'}
      >
        <BookingsTab />
      </div>

      <div
        className={styles.panel}
        role="tabpanel"
        id="painel-perfil"
        aria-labelledby="aba-perfil"
        tabIndex={0}
        hidden={tab !== 'perfil'}
      >
        <ProfileTab />
      </div>
    </div>
  );
}
