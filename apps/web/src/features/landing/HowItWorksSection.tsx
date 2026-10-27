import { HexMarkIcon } from '@/components/icons';
import landing from './landing.module.css';
import { revealOnScroll } from './reveal';
import styles from './HowItWorksSection.module.css';

/**
 * Pegue e monte, como funciona (§13.1, item 4).
 *
 * Aqui a numeração é legítima, e a §13.1 diz por quê: é uma sequência real, não
 * uma lista de qualidades. Passos curtos, na ordem em que acontecem; o texto é o
 * do dono.
 *
 * É a faixa de ameixa da página: a pausa escura entre o espaço e a vitrine, com
 * cada número dentro do hexágono dourado do logo e um fio ligando um passo ao
 * seguinte.
 */

const STEPS = [
  {
    title: 'Escolha os itens',
    text: 'Monte o pedido da decoração pelo site.',
  },
  {
    title: 'Monte do seu jeito',
    text: 'A decoração fica como você imaginou.',
  },
  {
    title: 'Devolva no fim',
    text: 'Ao desocupar, os itens devem ser reentregues.',
  },
];

export function HowItWorksSection() {
  return (
    <section
      className={[landing.section, landing.sectionDark].join(' ')}
      aria-labelledby="titulo-pegue-e-monte"
    >
      <div className={landing.inner}>
        <div className={landing.heading} ref={revealOnScroll}>
          <h2 className={landing.title} id="titulo-pegue-e-monte">
            Pegue e monte: como funciona
          </h2>
        </div>

        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li key={step.title} className={styles.step} ref={revealOnScroll}>
              {/*
                O número é decorativo: a ordem já está no `<ol>`, e repeti-la para
                o leitor de tela seria "um, um, escolha os itens".
              */}
              <span className={styles.number} aria-hidden="true">
                <HexMarkIcon size={64} strokeWidth={0.75} />
                <span className={styles.numeral}>{index + 1}</span>
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
