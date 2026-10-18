import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useDeleteMe } from '@/api/me';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { useAuth } from '@/features/auth/AuthProvider';
import { formErrorMessage } from '@/lib/form';
import styles from './DeleteAccountSection.module.css';

/**
 * Remoção da conta pelo próprio cliente (§10.8).
 *
 * Fica no fim de "Minhas reservas" por decisão de hierarquia: é uma ação que
 * precisa ser **encontrável**, não oferecida. Esconder atrás de contato por
 * e-mail transformaria um direito em obstáculo; pôr no cabeçalho, ao lado das
 * reservas, seria convidar ao clique errado.
 *
 * O texto diz o que sai e o que fica antes de qualquer botão, porque é isso que
 * a pessoa precisa para decidir — e porque a §10.8 mantém as reservas, o que
 * surpreenderia quem esperasse apagar tudo.
 *
 * **O botão não é desabilitado por reserva em andamento**, e isso foge do padrão
 * de `canCancel` e `allowedTransitions`, em que o servidor diz de antemão se a
 * ação existe. A diferença é o custo: aqueles dois saem de dados que a resposta
 * já carrega, enquanto um `canDelete` no perfil exigiria uma contagem de reservas
 * em **toda renovação de sessão** (§10.4) — o caminho mais quente da API — para
 * servir a uma tela que quase ninguém abre. Aqui a recusa chega na tentativa, com
 * a mensagem que diz o que fazer.
 */
export function DeleteAccountSection() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const deleteMe = useDeleteMe();

  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    try {
      await deleteMe.mutateAsync();

      /*
       * A API já derrubou as sessões e limpou o cookie; `signOut` zera o que
       * está em memória no SPA. O destino é o login com o aviso: é a única tela
       * que ainda faz sentido para quem não tem mais conta.
       */
      await signOut();
      navigate('/entrar?conta-removida=1', { replace: true });
    } catch {
      // A recusa aparece no diálogo, pelo `deleteMe.error`.
    }
  }

  return (
    <section className={styles.section} aria-labelledby="titulo-conta">
      <h2 className={styles.title} id="titulo-conta">
        Sua conta
      </h2>

      <p className={styles.lead}>
        Você pode apagar sua conta quando quiser. Seu nome, e-mail e telefone saem do sistema, e as
        sessões abertas em qualquer aparelho se encerram.
      </p>

      <p className={styles.lead}>
        O registro das reservas continua guardado, sem ligação com você, porque a chácara precisa
        dele por obrigação fiscal. Para entender o resto, veja a{' '}
        <Link to="/privacidade">Política de privacidade</Link>.
      </p>

      <div className={styles.actions}>
        <Button variant="danger" onClick={() => setConfirming(true)}>
          Apagar minha conta
        </Button>
      </div>

      <Dialog
        open={confirming}
        title="Apagar minha conta"
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Voltar
            </Button>
            <Button
              variant="danger"
              loading={deleteMe.isPending}
              loadingLabel="Apagando…"
              onClick={() => void handleDelete()}
            >
              Apagar minha conta
            </Button>
          </>
        }
      >
        {/*
          A recusa por reserva em andamento chega aqui, e a mensagem da API já
          diz o que fazer. Repetir a regra na tela criaria uma segunda versão
          dela, que divergiria na primeira mudança (§2.2).
        */}
        {formErrorMessage(deleteMe.error) ? (
          <p className={styles.problem} role="alert">
            {formErrorMessage(deleteMe.error)}
          </p>
        ) : null}

        <p className={styles.confirmText}>
          Esta ação não tem volta. Você sai do site e precisará criar uma conta nova para enviar
          outro pedido.
        </p>
      </Dialog>
    </section>
  );
}
