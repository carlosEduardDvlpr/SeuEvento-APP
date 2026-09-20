import { Link } from 'react-router';
import styles from './SimplePage.module.css';

/**
 * Página das rotas da §12.1 que já existem no mapa mas ainda não foram
 * construídas.
 *
 * Existe para o cabeçalho não levar a um 404: a pessoa entende que a parte está
 * a caminho e tem um caminho de volta.
 */
export function UnderConstructionPage({ title }: { title: string }) {
  return (
    <section className={styles.page}>
      <h1>{title}</h1>
      <p>Esta parte do site ainda está sendo construída.</p>
      <Link to="/">Voltar para a página inicial</Link>
    </section>
  );
}
