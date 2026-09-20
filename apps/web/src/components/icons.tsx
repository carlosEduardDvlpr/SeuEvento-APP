import type { SVGProps } from 'react';

/**
 * Ícones próprios (§14.5): SVG inline, traço de 1.75 px em grade de 24 px, cor
 * herdada por `currentColor`. Sem biblioteca de ícones.
 *
 * Ícone é decorativo por padrão (`aria-hidden`), porque o texto ao lado já diz o
 * que ele significa. Quando não houver texto, quem usa passa `aria-label` e
 * `role="img"`.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 24, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={props['aria-label'] ? undefined : true}
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Aguardando confirmação. */
export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5l3.5 2" />
    </Icon>
  );
}

/** Confirmada. */
export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </Icon>
  );
}

/** Cancelada. */
export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

/** Concluída. */
export function FlagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 21V4" />
      <path d="M6 4.5h10l-1.5 4 1.5 4H6" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3.5v4M16 3.5v4" />
    </Icon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 6M18 19.5c0-2.2-.8-3.9-2-5" />
    </Icon>
  );
}

/** Marca: o arco, forma-assinatura do projeto (§14.6). */
export function ArchMarkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 20V11a7 7 0 0 1 14 0v9" />
      <path d="M3.5 20h17" />
    </Icon>
  );
}
