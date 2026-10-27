import { Link } from 'react-router';
import { LegalPage, LegalSection, legalStyles as styles } from './LegalPage';

/**
 * Política de privacidade (§10.8).
 *
 * Descreve o tratamento que o sistema **de fato** faz. Cada afirmação aqui
 * corresponde a algo verificável no código, e é isso que diferencia esta página
 * de um texto genérico copiado:
 *
 * - os dados listados são os campos que existem em `User` e `Booking` (§8);
 * - o cookie descrito é o único que o site grava (§10.1, `refresh_token`);
 * - o endereço IP aparece porque o log da API registra a origem da requisição e
 *   o limite de requisições usa o IP como chave (§10.7);
 * - o rascunho no navegador existe porque o wizard guarda o pedido em
 *   `sessionStorage` (§12.4);
 * - a remoção descrita é a que o `DELETE /me` executa.
 *
 * Não há medição de audiência nem rastreador de publicidade no site, então a
 * página diz isso em vez de abrir uma exceção que não existe.
 */
export function PrivacyPage() {
  return (
    <LegalPage
      title="Política de privacidade"
      lead="Que dados este site coleta, para que servem e como você manda neles."
      sibling={{ to: '/termos', label: 'Termos de uso' }}
    >
      {(venue) => (
        <>
          <LegalSection title="Quem trata seus dados">
            <p>
              A {venue.name} é responsável pelos dados coletados neste site.
              {venue.address ? ` Endereço: ${venue.address}.` : ''}
              {venue.whatsapp ? ` Contato: WhatsApp ${venue.whatsapp}.` : ''}
            </p>
          </LegalSection>

          <LegalSection title="O que coletamos">
            <ul className={styles.list}>
              <li>
                <strong>Cadastro:</strong> nome, e-mail e telefone. Nada além disso — nem CPF, nem
                endereço, nem data de nascimento.
              </li>
              <li>
                <strong>Senha:</strong> guardada apenas como código embaralhado, do qual não é
                possível voltar à senha original. Nem a chácara consegue ver a sua.
              </li>
              <li>
                <strong>Reserva:</strong> datas, número de convidados, itens escolhidos, valores e o
                que você escrever no campo de observações.
              </li>
              <li>
                <strong>Login com o Google:</strong> se você entrar por aí, recebemos do Google o
                seu identificador, nome e e-mail. Nenhum outro dado da sua conta Google.
              </li>
              <li>
                <strong>Registros técnicos:</strong> data, hora, endereço e endereço IP das
                requisições, no log do servidor. Servem para investigar erro e para o limite de
                requisições que protege o site de abuso.
              </li>
            </ul>
          </LegalSection>

          <LegalSection title="Para que usamos">
            <ul className={styles.list}>
              <li>Criar sua conta e confirmar que o e-mail é seu.</li>
              <li>Receber seu pedido, calcular o valor e registrar a reserva.</li>
              <li>
                Permitir que a chácara fale com você sobre a reserva — é por isso que o telefone é
                obrigatório para reservar.
              </li>
              <li>Avisar por e-mail a cada mudança no andamento do pedido.</li>
              <li>Manter o histórico de reservas por obrigação fiscal.</li>
            </ul>
            <p>
              Não usamos seus dados para publicidade, não traçamos perfil de consumo e não vendemos
              nem alugamos sua informação para ninguém.
            </p>
          </LegalSection>

          <LegalSection title="Por que podemos tratar">
            <p>
              Cadastro e reserva são tratados para <strong>executar o contrato</strong> entre você e
              a chácara. O histórico das reservas fica guardado por <strong>obrigação legal</strong>
              . O aceite destes termos no cadastro registra o seu <strong>consentimento</strong>{' '}
              para o que não se encaixa nos dois primeiros casos.
            </p>
          </LegalSection>

          <LegalSection title="Cookies e dados no seu navegador">
            <p>
              O site grava <strong>um</strong> cookie: o da sua sessão, que mantém você conectado
              sem precisar digitar a senha a cada página. Ele não pode ser lido por JavaScript, só é
              enviado para as rotas de autenticação e desaparece quando você sai. Não há cookie de
              publicidade nem de medição de audiência, porque o site não usa nenhuma dessas
              ferramentas.
            </p>
            <p>
              Enquanto você monta um pedido, o rascunho fica guardado na memória da aba do seu
              navegador, para você não perder o que escolheu se precisar entrar na conta no meio do
              caminho. Esse rascunho não sai do seu aparelho e se apaga ao fechar a aba.
            </p>
            <p>
              O mapa da seção “Como chegar”, na página inicial, é do Google Maps. Ele só carrega
              quando você chega perto dele na página, e aí o seu navegador se conecta ao Google, que
              pode registrar o acesso e gravar cookies próprios, conforme a política de privacidade
              do Google.
            </p>
          </LegalSection>

          <LegalSection title="Com quem compartilhamos">
            <p>
              Só com quem é necessário para o site funcionar: o serviço que entrega os e-mails, a
              hospedagem do site e do banco de dados e, se você escolher entrar com o Google, o
              próprio Google. O mapa do Google na página inicial também conecta o seu navegador ao
              Google. Esses serviços podem manter servidores fora do Brasil.
            </p>
            <p>
              Fora disso, seus dados de reserva aparecem apenas para você e para a administração da
              chácara. As datas ocupadas que o calendário público mostra não trazem nome, e-mail nem
              qualquer detalhe de quem reservou.
            </p>
          </LegalSection>

          <LegalSection title="Por quanto tempo guardamos">
            <p>
              Os dados da sua conta ficam enquanto a conta existir. O registro das reservas fica
              pelo prazo da obrigação fiscal, mesmo depois de você apagar a conta — mas sem ligação
              com a sua identidade.
            </p>
          </LegalSection>

          <LegalSection title="Seus direitos">
            <p>
              A Lei Geral de Proteção de Dados garante que você possa confirmar o tratamento,
              acessar, corrigir, pedir anonimização ou remoção, saber com quem compartilhamos e
              revogar o consentimento.
            </p>
            <ul className={styles.list}>
              <li>
                <strong>Ver e corrigir:</strong> seus dados e suas reservas estão em{' '}
                <Link to="/minhas-reservas">Minhas reservas</Link>. Nome e telefone você edita por
                lá.
              </li>
              <li>
                <strong>Apagar a conta:</strong> também em “Minhas reservas”, no fim da página. Seu
                nome, e-mail e telefone saem do sistema na hora, as sessões abertas caem em todos os
                aparelhos e o registro das reservas permanece sem ligação com você. Enquanto houver
                reserva em andamento a remoção fica bloqueada, porque a chácara precisa poder falar
                com você até a festa acontecer.
              </li>
              <li>
                <strong>Qualquer outro pedido:</strong>{' '}
                {venue.whatsapp
                  ? `fale com a chácara pelo WhatsApp ${venue.whatsapp}.`
                  : 'fale com a chácara pelo canal de contato informado no site.'}
              </li>
            </ul>
          </LegalSection>

          <LegalSection title="Segurança">
            <p>
              A conexão com o site é cifrada. Senhas e códigos de confirmação são guardados
              embaralhados, nunca em texto legível, e os links de confirmação e de nova senha têm
              prazo e valem uma única vez. Nenhuma medida elimina todo risco, mas estas são as que
              estão aplicadas.
            </p>
          </LegalSection>

          <LegalSection title="Menores de idade">
            <p>
              O site não é destinado a menores de 18 anos. A reserva deve ser feita por quem pode
              responder por ela.
            </p>
          </LegalSection>

          <LegalSection title="Mudanças nesta política">
            <p>
              Se o tratamento mudar, esta página muda com ele. Vale a versão publicada aqui no
              momento em que você usa o site.
            </p>
          </LegalSection>
        </>
      )}
    </LegalPage>
  );
}
