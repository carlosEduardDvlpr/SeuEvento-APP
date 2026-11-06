import { Link } from 'react-router';

import { LegalPage, LegalSection, legalStyles as styles } from './LegalPage';

export function TermsPage() {
  return (
    <LegalPage
      title="Termos de Uso"
      lead="Confira as condições para reservar nossa chácara e aproveitar nossos serviços de decoração."
      sibling={{ to: '/privacidade', label: 'Política de privacidade' }}
    >
      {(venue) => (
        <>
          <LegalSection title="Sobre nossas reservas">
            <p>
              Este site permite que você consulte a disponibilidade, escolha os serviços desejados e
              envie uma solicitação de reserva para a {venue.name}.
            </p>

            <p>
              Você pode reservar a chácara, contratar a decoração no formato pegue e monte ou
              combinar os dois serviços em um mesmo pedido.
            </p>

            <p>
              Enviar uma solicitação não significa que a reserva já está confirmada. Todas as
              solicitações passam pela análise e confirmação da administração.
            </p>

            {venue.address ? (
              <p>
                <strong>Endereço:</strong> {venue.address}.
              </p>
            ) : null}
          </LegalSection>

          <LegalSection title="Como funciona a confirmação?">
            <ul className={styles.list}>
              <li>
                Escolha a data, a quantidade de convidados e os serviços desejados. Antes de enviar,
                você poderá conferir o valor apresentado para sua solicitação.
              </li>

              <li>
                Após o envio, seu pedido ficará com o status
                <strong> aguardando confirmação</strong>. As datas escolhidas ficarão
                temporariamente reservadas por até {venue.holdHours} horas, enquanto aguardam a
                resposta da administração.
              </li>

              <li>
                Caso não haja confirmação dentro desse prazo, a solicitação será encerrada
                automaticamente e as datas voltarão a ficar disponíveis.
              </li>

              <li>
                A reserva será considerada confirmada somente após a aprovação da administração da
                chácara. Você receberá atualizações por e-mail sobre as mudanças no status do
                pedido.
              </li>
            </ul>
          </LegalSection>

          <LegalSection title="Horários e condições de reserva">
            <p>
              Para organizar melhor os eventos e garantir a disponibilidade do espaço, são aplicadas
              as seguintes condições:
            </p>

            <ul className={styles.list}>
              <li>
                <strong>Entrada:</strong> a partir das {venue.checkInTime}.
              </li>

              <li>
                <strong>Saída:</strong> até as {venue.checkOutTime}.
              </li>

              <li>
                <strong>Capacidade:</strong> até {venue.maxGuests} convidados.
              </li>

              <li>
                <strong>Duração:</strong>{' '}
                {venue.minDays === venue.maxDays
                  ? `${venue.maxDays} ${venue.maxDays === 1 ? 'dia' : 'dias'}.`
                  : `de ${venue.minDays} a ${venue.maxDays} dias consecutivos.`}
              </li>

              <li>
                <strong>Antecedência:</strong>{' '}
                {venue.minLeadDays === 0
                  ? 'é possível solicitar uma reserva para o mesmo dia, desde que exista disponibilidade.'
                  : `a reserva deve ser solicitada com pelo menos ${venue.minLeadDays} ${venue.minLeadDays === 1 ? 'dia' : 'dias'} de antecedência.`}
              </li>
            </ul>
          </LegalSection>

          <LegalSection title="Valores e pagamentos">
            <p>
              O site permite consultar os valores dos serviços e enviar sua solicitação de reserva,
              mas não realiza cobranças nem processa pagamentos.
            </p>

            <p>
              Após a confirmação, as condições de pagamento, incluindo valores, formas e prazos,
              serão combinadas diretamente com a administração da {venue.name}.
            </p>

            <p>O envio de uma solicitação pelo site não gera cobrança ou pagamento automático.</p>
          </LegalSection>

          <LegalSection title="Aluguel de decoração — Pegue e Monte">
            <p>
              Nosso serviço de decoração funciona no formato
              <strong> pegue e monte</strong>. Isso significa que você recebe os itens escolhidos,
              realiza a montagem por conta própria e devolve os itens ao final do período combinado.
            </p>

            <p>Você pode contratar a decoração de duas maneiras:</p>

            <ul className={styles.list}>
              <li>
                <strong>Junto com a chácara:</strong> a decoração escolhida estará disponível no
                próprio espaço, conforme a modalidade e o valor apresentados na solicitação.
              </li>

              <li>
                <strong>Somente decoração:</strong> você poderá retirar os itens diretamente na
                chácara ou solicitar a entrega no endereço informado.
              </li>
            </ul>

            <p>
              Quando houver entrega, a taxa correspondente será combinada diretamente com a
              administração e não estará incluída no valor apresentado pelo site.
            </p>

            <p>
              A disponibilidade dos itens é verificada considerando todas as datas da sua reserva.
              Caso algum item já esteja reservado para outro evento no mesmo período, ele não estará
              disponível para seleção.
            </p>
          </LegalSection>

          <LegalSection title="Cancelamentos">
            <p>
              <strong>Solicitações ainda não confirmadas:</strong> você pode cancelar seu pedido
              diretamente pelo site, sem custo.
            </p>

            <p>
              <strong>Reservas confirmadas:</strong>{' '}
              {venue.freeCancelUntilDays === 0
                ? 'para solicitar o cancelamento, entre em contato diretamente com a administração da chácara.'
                : `você poderá solicitar o cancelamento pelo site até ${venue.freeCancelUntilDays} ${venue.freeCancelUntilDays === 1 ? 'dia' : 'dias'} antes do início da reserva. Após esse prazo, será necessário entrar em contato diretamente com a administração${venue.whatsapp ? ` pelo WhatsApp ${venue.whatsapp}` : ''}.`}
            </p>

            <p>
              Caso a administração precise recusar ou cancelar uma solicitação, você será informado
              por e-mail sobre a decisão e o motivo.
            </p>

            <p>
              Eventuais condições de reembolso e demais direitos do consumidor serão observados
              conforme a legislação aplicável.
            </p>
          </LegalSection>

          {venue.houseRules ? (
            <LegalSection title="Regras da chácara">
              <p>
                Para proporcionar uma boa experiência a todos e preservar o espaço, pedimos que as
                regras da chácara sejam respeitadas durante todo o período da reserva.
              </p>

              <p className={styles.houseRules}>{venue.houseRules}</p>
            </LegalSection>
          ) : null}

          <LegalSection title="Cadastro e utilização da conta">
            <p>
              Para realizar uma solicitação de reserva, é necessário possuir uma conta no site, com
              endereço de e-mail confirmado e telefone válido para contato.
            </p>

            <p>
              Ao utilizar nossos serviços, você se compromete a fornecer informações verdadeiras e
              manter seus dados atualizados, além de proteger sua senha de acesso.
            </p>

            <p>
              Você pode consultar suas reservas, atualizar seus dados e solicitar a exclusão da sua
              conta pela área <Link to="/minhas-reservas">Minhas reservas</Link>.
            </p>

            <p>
              Para entender como suas informações são utilizadas e protegidas, consulte nossa{' '}
              <Link to="/privacidade">Política de Privacidade</Link>.
            </p>
          </LegalSection>

          <LegalSection title="Alterações nas condições">
            <p>
              Os horários, limites, prazos e demais condições apresentados nesta página refletem as
              configurações atuais dos serviços da chácara e poderão ser atualizados quando
              necessário.
            </p>

            <p>
              As reservas já confirmadas deverão respeitar as condições acordadas no momento da
              confirmação, observados os direitos previstos na legislação.
            </p>
          </LegalSection>

          <LegalSection title="Precisa de ajuda?">
            <p>
              Se tiver dúvidas sobre uma reserva, os serviços ou as condições de utilização, entre
              em contato com nossa equipe.
            </p>

            {venue.whatsapp ? (
              <p>
                <strong>WhatsApp:</strong> {venue.whatsapp}
              </p>
            ) : null}
          </LegalSection>
        </>
      )}
    </LegalPage>
  );
}
