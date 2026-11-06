import { WhatsAppIcon } from '@/components/icons';
import { whatsappUrl } from '@/lib/whatsapp';
import styles from './CustomDecorationRequest.module.css';

/**
 * "Não achou o que queria?" (§13.1, item 5.1, e §13.2; novembro de 2026).
 *
 * Fecha a lista de decorações, na landing e no passo da decoração do pedido, a
 * pedido do dono: quem não encontrou a decoração no catálogo precisa saber que
 * dá para pedir direto. O link abre o WhatsApp da chácara com a mensagem pronta
 * (§13.1), para a conversa não começar com um "oi" solto.
 *
 * Sem WhatsApp cadastrado, o aviso não aparece: sem o canal, ele seria um
 * convite sem porta.
 */
export type CustomDecorationRequestProps = {
  whatsapp: string | null;
  /** O que já vai escrito na conversa. */
  message: string;
  className?: string;
};

export function CustomDecorationRequest({
  whatsapp,
  message,
  className,
}: CustomDecorationRequestProps) {
  if (!whatsapp) return null;

  return (
    <div className={className ? `${styles.note} ${className}` : styles.note}>
      <div className={styles.texts}>
        <h3 className={styles.title}>Não achou o que queria?</h3>
        <p className={styles.text}>Entre em contato e peça direto pelo WhatsApp.</p>
      </div>

      {/* O ícone é decorativo: o nome da ação é o texto do link. */}
      <a
        className={styles.action}
        href={whatsappUrl(whatsapp, message)}
        target="_blank"
        rel="noreferrer"
      >
        <WhatsAppIcon size={20} />
        Pedir pelo WhatsApp
      </a>
    </div>
  );
}
