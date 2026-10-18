import landing from './landing.module.css';
import styles from './HowItWorksSection.module.css';

/**
 * Pegue e monte, como funciona (§13.1, item 4).
 *
 * Aqui a numeração é legítima, e a §13.1 diz por quê: é uma sequência real, não
 * uma lista de qualidades. Quatro passos curtos, na ordem em que acontecem.
 */

const STEPS = [
  {
    title: 'Escolha os itens',
    text: 'Monte o pedido pelo site, filtrando pelo estilo da festa. O valor aparece antes de enviar.',
  },
  {
    title: 'Retire na chácara',
    text: 'No dia combinado, você passa e leva os itens. Cada um vem com dica de montagem.',
  },
  {
    title: 'Monte do seu jeito',
    text: 'A decoração fica como você imaginou, sem depender da agenda de ninguém.',
  },
  {
    title: 'Devolva no fim',
    text: 'Ao desocupar, os itens voltam para a chácara. Sem taxa de montagem.',
  },
];

export function HowItWorksSection() {
  return (
    <section className={landing.section} aria-labelledby="titulo-pegue-e-monte">
      <div className={landing.inner}>
        <div className={landing.heading}>
          <h2 className={landing.title} id="titulo-pegue-e-monte">
            Pegue e monte: como funciona
          </h2>
          <p className={landing.lead}>
            A decoração é sua, e o trabalho de montar também. Sai mais barato e fica do jeito que
            você quer.
          </p>
        </div>

        <ol className={[landing.body, styles.steps].join(' ')}>
          {STEPS.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.number} aria-hidden="true">
                {index + 1}
              </span>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepText}>{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
