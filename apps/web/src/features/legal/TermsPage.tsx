import { Link } from 'react-router';
import { LegalPage, LegalSection, legalStyles as styles } from './LegalPage';

/**
 * Termos de uso (§10.8).
 *
 * Descreve o que o sistema realmente faz, e nada além. Cada prazo, limite e
 * horário vem de `VenueSettings`, então o texto acompanha a configuração do
 * painel em vez de virar promessa parada no tempo.
 *
 * O que **não** está aqui é tão deliberado quanto o que está: nada sobre multa,
 * caução, responsabilidade por dano ou foro. A §16.6 proíbe inventar política da
 * chácara, e essas condições não existem em lugar nenhum do sistema — escrevê-las
 * seria criar obrigação que o dono nunca definiu.
 */
export function TermsPage() {
  return (
    <LegalPage
      title="Termos de uso"
      lead="As condições para reservar a chácara e usar a decoração pegue e monte por este site."
      sibling={{ to: '/privacidade', label: 'Política de privacidade' }}
    >
      {(venue) => (
        <>
          <LegalSection title="O que este site faz">
            <p>
              Este site é o canal de reservas da {venue.name}. Por aqui você vê as datas livres,
              monta o pedido com a chácara, a decoração do pegue e monte ou as duas, e envia para a
              chácara confirmar. Quem decide sobre cada pedido é a chácara.
            </p>
            {venue.address ? <p>A chácara fica em {venue.address}.</p> : null}
          </LegalSection>

          <LegalSection title="Como a reserva funciona">
            <ul className={styles.list}>
              <li>
                Você escolhe o que reservar, a data, quantas pessoas espera (na chácara) e a
                decoração, uma por pedido. O valor total aparece antes do envio e é calculado pela
                chácara, não pelo seu navegador.
              </li>
              <li>
                Ao enviar, o pedido entra como <strong>aguardando confirmação</strong> e as datas
                ficam seguras por até {venue.holdHours} horas. Se a chácara não responder nesse
                prazo, o pedido se encerra sozinho e as datas voltam para o calendário.
              </li>
              <li>
                A reserva só existe de verdade quando a chácara confirma. Você recebe um e-mail em
                cada mudança.
              </li>
            </ul>
          </LegalSection>

          <LegalSection title="Prazos, limites e horários">
            <ul className={styles.list}>
              <li>
                Entrada a partir das {venue.checkInTime}, saída até as {venue.checkOutTime}.
              </li>
              <li>Até {venue.maxGuests} convidados.</li>
              <li>
                {venue.minDays === venue.maxDays
                  ? `Reserva de ${venue.maxDays} ${venue.maxDays === 1 ? 'dia' : 'dias'}.`
                  : `De ${venue.minDays} a ${venue.maxDays} dias seguidos.`}
              </li>
              <li>
                {venue.minLeadDays === 0
                  ? 'Dá para reservar até para o mesmo dia, se a data estiver livre.'
                  : `Pelo menos ${venue.minLeadDays} ${venue.minLeadDays === 1 ? 'dia' : 'dias'} de antecedência.`}
              </li>
            </ul>
          </LegalSection>

          <LegalSection title="Pagamento">
            <p>
              O site não cobra nada e não processa pagamento. Enviar o pedido não gera cobrança. O
              valor, a forma e o prazo são combinados direto com a chácara depois da confirmação.
            </p>
          </LegalSection>

          <LegalSection title="Pegue e monte">
            <p>
              A decoração é alugada por reserva, não por dia, e o serviço é{' '}
              <strong>pegue e monte</strong>: você monta a decoração e devolve os itens ao final. A
              montagem é sempre por sua conta.
            </p>
            <p>
              Com a chácara, a decoração já está no espaço e sai pelo preço com a chácara. Só a
              decoração, você retira os itens na chácara ou escolhe a entrega no seu endereço. A
              taxa de entrega é combinada com a chácara e não entra no total do site.
            </p>
            <p>
              A disponibilidade da decoração é conferida para todos os dias da sua reserva no
              momento do envio. A que já saiu para outra festa nessas datas não entra no pedido.
            </p>
          </LegalSection>

          <LegalSection title="Cancelamento">
            <p>
              Pedido que ainda não foi confirmado você cancela pelo site a qualquer momento, sem
              custo.
            </p>
            <p>
              {venue.freeCancelUntilDays === 0
                ? 'Reserva já confirmada é cancelada falando com a chácara.'
                : `Reserva já confirmada você cancela pelo site até ${venue.freeCancelUntilDays} dias antes do início. Passado esse prazo, fale com a chácara${venue.whatsapp ? ` pelo WhatsApp ${venue.whatsapp}` : ''} — quem decide é ela.`}
            </p>
            <p>
              A chácara também pode recusar ou cancelar um pedido. Nesse caso você recebe o motivo
              por e-mail.
            </p>
          </LegalSection>

          {/*
            Só aparece quando o dono escreveu as regras no painel. Sem elas, a
            seção não existe — inventar regra de uso da chácara é o tipo de
            invenção que a §16.6 proíbe.
          */}
          {venue.houseRules ? (
            <LegalSection title="Regras da casa">
              <p className={styles.houseRules}>{venue.houseRules}</p>
            </LegalSection>
          ) : null}

          <LegalSection title="Sua conta">
            <p>
              Para enviar um pedido você precisa de uma conta com e-mail confirmado e telefone,
              porque é por eles que a chácara fala com você sobre a reserva. Informe dados
              verdadeiros e mantenha sua senha em segredo.
            </p>
            <p>
              Você pode apagar sua conta quando quiser, em “Minhas reservas”. O que acontece com
              seus dados está na <Link to="/privacidade">Política de privacidade</Link>.
            </p>
          </LegalSection>

          <LegalSection title="Mudanças nestas condições">
            <p>
              Prazos, limites e horários desta página refletem a configuração atual da chácara e
              podem mudar. Reserva já confirmada vale pelas condições do momento da confirmação.
            </p>
          </LegalSection>

          <LegalSection title="Falar com a chácara">
            <p>
              {venue.whatsapp
                ? `Dúvida sobre uma reserva ou sobre estas condições: chame no WhatsApp ${venue.whatsapp}.`
                : 'Dúvida sobre uma reserva ou sobre estas condições: fale com a chácara pelo canal de contato informado no site.'}
            </p>
          </LegalSection>
        </>
      )}
    </LegalPage>
  );
}
