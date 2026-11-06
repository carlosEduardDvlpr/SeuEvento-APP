import { Link } from 'react-router';

import { LegalPage, LegalSection, legalStyles as styles } from './LegalPage';

export function PrivacyPage() {
  return (
    <LegalPage
      title="Política de Privacidade"
      lead="Conheça como cuidamos das suas informações e protegemos sua privacidade."
      sibling={{ to: '/termos', label: 'Termos de uso' }}
    >
      {(venue) => (
        <>
          <LegalSection title="Quem somos">
            <p>
              A {venue.name} é responsável pelo tratamento das informações pessoais fornecidas neste
              site.
              {venue.address ? ` Nosso endereço é ${venue.address}.` : ''}
              {venue.whatsapp
                ? ` Se precisar falar conosco, entre em contato pelo WhatsApp ${venue.whatsapp}.`
                : ''}
            </p>
          </LegalSection>

          <LegalSection title="Quais informações coletamos?">
            <p>
              Para oferecer nossos serviços, realizar reservas e manter contato com você, podemos
              coletar as seguintes informações:
            </p>

            <ul className={styles.list}>
              <li>
                <strong>Dados pessoais:</strong> nome, e-mail e telefone informados no cadastro.
              </li>

              <li>
                <strong>Endereço:</strong> CEP, rua, número, complemento, bairro, cidade e estado,
                quando você optar pela entrega da decoração.
              </li>

              <li>
                <strong>Informações da reserva:</strong> data do evento, quantidade de convidados,
                decoração escolhida, modalidade de entrega ou retirada, valores e observações
                informadas durante o pedido.
              </li>

              <li>
                <strong>Acesso com Google:</strong> caso escolha entrar utilizando sua conta Google,
                recebemos seu nome, e-mail e identificador da conta para realizar seu acesso.
              </li>

              <li>
                <strong>Dados de navegação:</strong> algumas informações, como data, horário e
                endereço IP, são registradas para manter a segurança do site e identificar possíveis
                problemas.
              </li>
            </ul>

            <p>Não solicitamos CPF ou data de nascimento para realizar seu cadastro.</p>
          </LegalSection>

          <LegalSection title="Como utilizamos suas informações?">
            <p>
              Utilizamos seus dados exclusivamente para atender às necessidades relacionadas aos
              nossos serviços, como:
            </p>

            <ul className={styles.list}>
              <li>Criar e administrar sua conta.</li>
              <li>Receber, organizar e acompanhar suas reservas.</li>
              <li>Entrar em contato sobre pedidos, pagamentos e eventos.</li>
              <li>Organizar a entrega ou retirada dos itens de decoração.</li>
              <li>Enviar atualizações sobre o andamento da sua reserva.</li>
              <li>Manter os registros necessários para cumprir obrigações legais.</li>
            </ul>

            <p>
              Seus dados não são vendidos ou alugados a terceiros, nem utilizados para criar perfis
              de consumo ou enviar publicidade.
            </p>
          </LegalSection>

          <LegalSection title="Como utilizamos seus dados de acordo com a LGPD?">
            <p>
              O tratamento das suas informações acontece de acordo com a Lei Geral de Proteção de
              Dados (LGPD).
            </p>

            <p>
              Utilizamos seus dados principalmente para realizar os serviços contratados,
              administrar suas reservas e cumprir obrigações legais. Quando necessário, também
              poderemos solicitar seu consentimento para outras finalidades.
            </p>
          </LegalSection>

          <LegalSection title="Compartilhamento de informações">
            <p>
              Para manter o site funcionando e oferecer nossos serviços, algumas informações podem
              ser compartilhadas com empresas responsáveis pela hospedagem do site, armazenamento de
              dados e envio de e-mails.
            </p>

            <p>
              Também utilizamos serviços do Google, como o login com a conta Google e o mapa
              disponível na página inicial. Esses serviços possuem suas próprias políticas de
              privacidade.
            </p>

            <p>
              Ao informar seu CEP, o site consulta o ViaCEP para preencher automaticamente
              informações como rua, bairro e cidade. Nessa consulta, somente o CEP é enviado.
            </p>

            <p>
              As informações das suas reservas são acessíveis a você e à administração da{' '}
              {venue.name}. No calendário público, mostramos apenas as datas ocupadas, sem divulgar
              informações pessoais de quem realizou a reserva.
            </p>

            <p>
              Alguns dos serviços utilizados podem armazenar informações em servidores localizados
              fora do Brasil.
            </p>
          </LegalSection>

          <LegalSection title="Cookies e armazenamento no navegador">
            <p>
              Utilizamos um cookie necessário para manter você conectado à sua conta enquanto
              utiliza o site. Ele é removido quando você encerra sua sessão.
            </p>

            <p>
              Durante a montagem de uma reserva, algumas escolhas podem ficar temporariamente salvas
              no seu navegador para que você não perca o pedido caso precise entrar na sua conta.
              Essas informações permanecem no seu dispositivo e são apagadas ao fechar a aba.
            </p>

            <p>
              O mapa disponível na seção "Como chegar" utiliza o Google Maps. Ao carregar esse
              recurso, seu navegador pode se conectar ao Google, que poderá coletar informações de
              acesso conforme sua própria política de privacidade.
            </p>

            <p>
              Não utilizamos ferramentas próprias de rastreamento publicitário ou medição de
              audiência.
            </p>
          </LegalSection>

          <LegalSection title="Por quanto tempo guardamos seus dados?">
            <p>As informações do seu cadastro são mantidas enquanto sua conta estiver ativa.</p>

            <p>
              Os registros das reservas podem ser armazenados pelo período necessário para cumprir
              obrigações legais e fiscais, mesmo após a exclusão da sua conta.
            </p>

            <p>
              Quando você solicita a exclusão da conta, seus dados pessoais de cadastro são
              removidos. Entretanto, algumas informações vinculadas às reservas, como o endereço
              utilizado para uma entrega, poderão permanecer armazenadas junto ao histórico do
              pedido.
            </p>
          </LegalSection>

          <LegalSection title="Quais são seus direitos?">
            <p>
              A LGPD garante a você o direito de consultar, corrigir e solicitar a exclusão dos seus
              dados pessoais, quando permitido pela legislação, além de obter informações sobre como
              eles são utilizados.
            </p>

            <p>Você pode exercer esses direitos diretamente pelo site:</p>

            <ul className={styles.list}>
              <li>
                <strong>Consultar suas informações:</strong> acesse{' '}
                <Link to="/minhas-reservas">Minhas reservas</Link> e consulte seus pedidos e dados
                cadastrados.
              </li>

              <li>
                <strong>Atualizar seus dados:</strong> acesse a aba "Meu perfil" para alterar seu
                nome, telefone e endereço.
              </li>

              <li>
                <strong>Excluir sua conta:</strong> a opção está disponível no final da aba "Meu
                perfil". A exclusão remove seus dados de cadastro e encerra suas sessões abertas. Os
                registros que precisem ser mantidos por obrigações legais poderão permanecer
                armazenados. Caso exista uma reserva em andamento, a exclusão ficará indisponível
                até que o evento seja realizado.
              </li>

              <li>
                <strong>Outras solicitações:</strong>{' '}
                {venue.whatsapp
                  ? `entre em contato pelo WhatsApp ${venue.whatsapp}.`
                  : 'entre em contato pelos canais de atendimento informados no site.'}
              </li>
            </ul>
          </LegalSection>

          <LegalSection title="Como protegemos seus dados?">
            <p>
              Adotamos medidas de segurança para proteger suas informações contra acessos não
              autorizados, alterações ou utilização indevida.
            </p>

            <p>
              Sua conexão com o site é protegida, e informações confidenciais, como senhas, são
              armazenadas de forma segura, sem que possam ser consultadas diretamente pela
              administração.
            </p>

            <p>
              Apesar dos cuidados adotados, nenhum ambiente digital está completamente livre de
              riscos.
            </p>
          </LegalSection>

          <LegalSection title="Menores de idade">
            <p>
              Nosso site é destinado a pessoas maiores de 18 anos. As reservas devem ser realizadas
              por pessoas legalmente responsáveis pela contratação dos serviços.
            </p>
          </LegalSection>

          <LegalSection title="Alterações nesta política">
            <p>
              Esta Política de Privacidade poderá ser atualizada sempre que houver mudanças nos
              nossos serviços ou na forma como tratamos suas informações.
            </p>

            <p>
              Recomendamos consultar esta página periodicamente para acompanhar eventuais
              atualizações.
            </p>
          </LegalSection>
        </>
      )}
    </LegalPage>
  );
}
