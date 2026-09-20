import { Link } from 'react-router';
import styles from './SimplePage.module.css';

export function NotFoundPage() {
  return (
    <section className={styles.page}>
      <h1>Não encontramos esta página</h1>
      <p>O endereço pode ter mudado de lugar.</p>
      <Link to="/">Voltar para a página inicial</Link>
    </section>
  );
}
