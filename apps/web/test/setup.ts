import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * A limpeza automática do Testing Library depende do `afterEach` global, que não
 * existe com `globals: false`. Sem isto, o DOM de um teste continua montado no
 * seguinte e as consultas passam a encontrar elemento da execução anterior.
 */
afterEach(cleanup);
