import type { PublicVenue } from '@chacara/shared';
import landing from './landing.module.css';
import styles from './FaqSection.module.css';

/**
 * Perguntas frequentes (§13.1, item 8).
 *
 * Cada resposta sai de `VenueSettings`, não de texto fixo: horário, capacidade,
 * duração, prazo do pedido e prazo de cancelamento vêm dos mesmos números que o
 * sistema usa para aceitar ou recusar uma reserva. Assim a FAQ não pode mentir —
 * mudar a configuração no painel muda a resposta aqui.
 *
 * As perguntas que a §13.1 lista e que dependem de **política não registrada** —
 * animais, som, decoração própria — aparecem apontando para as regras da casa
 * quando o dono as escreveu, e ficam de fora quando não. A §16.6 é clara: não
 * inventamos política da chácara.
 *
 * `<details>` nativo em vez de acordeão próprio: abre e fecha com teclado, é
 * encontrável pelo Ctrl+F do navegador e não custa JavaScript nenhum (§18.1).
 */

export type FaqSectionProps = {
  venue: PublicVenue;
};

type Question = { question: string; answer: string };

function buildQuestions(venue: PublicVenue): Question[] {
  const questions: Question[] = [
    {
      question: 'Qual é o horário?',
      answer: `A entrada é a partir das ${venue.checkInTime} e a saída até as ${venue.checkOutTime}. O espaço é seu durante todo esse período.`,
    },
    {
      question: 'Quantas pessoas cabem?',
      answer: `Até ${venue.maxGuests} convidados. O número que você informar no pedido ajuda a chácara a se preparar.`,
    },
    {
      question: 'Posso alugar mais de um dia?',
      answer:
        venue.minDays === venue.maxDays
          ? `A reserva é de ${venue.maxDays} ${venue.maxDays === 1 ? 'dia' : 'dias'}.`
          : `Sim: de ${venue.minDays} a ${venue.maxDays} dias seguidos. Cada dia tem o seu valor, e o total aparece antes de você enviar o pedido.`,
    },
    {
      question: 'Com quanta antecedência preciso reservar?',
      answer:
        venue.minLeadDays === 0
          ? 'Dá para reservar até para hoje, se a data estiver livre.'
          : `Pelo menos ${venue.minLeadDays} ${venue.minLeadDays === 1 ? 'dia' : 'dias'} antes da festa. Datas mais próximas não aparecem no calendário.`,
    },
    {
      question: 'O que está incluso?',
      answer:
        'O uso da chácara pelo período reservado. Os itens de decoração são à parte, escolhidos por você no pedido — é o pegue e monte.',
    },
    {
      question: 'Como funciona o pagamento?',
      answer:
        'Nada é cobrado pelo site. Você envia o pedido, a chácara confirma e o pagamento é combinado direto com ela.',
    },
    {
      question: 'Quanto tempo a data fica reservada para mim?',
      answer: `Ao enviar o pedido, as datas ficam seguras por até ${venue.holdHours} horas enquanto a chácara responde. Passado esse prazo, elas voltam para o calendário.`,
    },
    {
      question: 'Consigo cancelar?',
      answer:
        venue.freeCancelUntilDays === 0
          ? 'Pedido ainda não confirmado você cancela pelo site a qualquer momento. Depois de confirmado, fale com a chácara.'
          : `Pedido ainda não confirmado você cancela a qualquer momento. Reserva já confirmada, pelo site até ${venue.freeCancelUntilDays} dias antes do início; depois disso, é só falar com a chácara.`,
    },
    {
      question: 'Posso levar decoração própria?',
      answer: venue.houseRules
        ? 'Sim, e você também pode alugar os itens do pegue e monte. Confira as regras da casa, logo abaixo, antes de montar.'
        : 'Sim, e você também pode alugar os itens do pegue e monte. Combine os detalhes com a chácara.',
    },
  ];

  return questions;
}

export function FaqSection({ venue }: FaqSectionProps) {
  const questions = buildQuestions(venue);

  return (
    <section className={landing.section} aria-labelledby="titulo-faq">
      <div className={landing.inner}>
        <div className={landing.heading}>
          <h2 className={landing.title} id="titulo-faq">
            Perguntas frequentes
          </h2>
        </div>

        <ul className={[landing.body, styles.list].join(' ')}>
          {questions.map(({ question, answer }) => (
            <li key={question}>
              <details className={styles.item}>
                <summary className={styles.question}>{question}</summary>
                <p className={styles.answer}>{answer}</p>
              </details>
            </li>
          ))}
        </ul>

        {/* As regras da casa são texto do dono, mostradas como ele escreveu. */}
        {venue.houseRules ? (
          <div className={styles.rules}>
            <h3 className={styles.rulesTitle}>Regras da casa</h3>
            <p className={styles.rulesText}>{venue.houseRules}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
