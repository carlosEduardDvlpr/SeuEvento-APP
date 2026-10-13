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

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5V20" />
      <path d="M14.5 6.5 17.5 9.5" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 7h15M9.5 7V4.5h5V7" />
      <path d="M6.5 7l.9 12a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
    </Icon>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Icon>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </Icon>
  );
}

/** Imagem ausente: placeholder de item, estilo e galeria sem foto (§14.9). */
export function ImageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M4 17l4.5-4.5 3.5 3.5 2.5-2.5L20 17" />
    </Icon>
  );
}

export function PaletteIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 1.9-1 1.5-2-.5-1.3.4-2.5 1.8-2.5h2.2a3 3 0 0 0 3-3A8.5 8.5 0 0 0 12 3.5Z" />
      <circle cx="8.5" cy="10.5" r="1.1" />
      <circle cx="12" cy="8" r="1.1" />
      <circle cx="15.5" cy="10.5" r="1.1" />
    </Icon>
  );
}

export function TagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12.5 3.5H20v7.5l-8.8 8.8a2 2 0 0 1-2.9 0l-4.6-4.6a2 2 0 0 1 0-2.9Z" />
      <circle cx="16.5" cy="7.5" r="1.3" />
    </Icon>
  );
}

export function MoneyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </Icon>
  );
}

export function BoxIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 20.5 8v8L12 20.5 3.5 16V8Z" />
      <path d="M3.5 8 12 12.5 20.5 8M12 12.5v8" />
    </Icon>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Icon>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
    </Icon>
  );
}
