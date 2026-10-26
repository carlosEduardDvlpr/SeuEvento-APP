import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * A limpeza automática do Testing Library depende do `afterEach` global, que não
 * existe com `globals: false`. Sem isto, o DOM de um teste continua montado no
 * seguinte e as consultas passam a encontrar elemento da execução anterior.
 */
afterEach(cleanup);

/**
 * `<dialog>` no jsdom: só o elemento existe, não o comportamento.
 *
 * O jsdom 30 ainda não implementa `showModal()` nem `close()`, então o
 * `components/Dialog` quebraria no teste por falta da API — não por defeito
 * próprio. No navegador é justamente esse elemento que entrega prisão de foco,
 * Escape e backdrop inerte de graça, e trocá-lo por um modal feito à mão só para
 * o teste rodar seria piorar o código em produção.
 *
 * O preenchimento é o mínimo: alterna o atributo `open` e dispara `close`, que é
 * o evento de que o componente depende. Fechar por Escape **não** é simulado de
 * propósito: implementá-lo aqui faria o teste medir este arquivo em vez do
 * componente. O que o teste verifica é a reação ao evento `close`, que é o que o
 * navegador dispara em qualquer forma de fechamento.
 */
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };

  HTMLDialogElement.prototype.close = function close(returnValue?: string) {
    this.open = false;
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.dispatchEvent(new Event('close'));
  };
}

/**
 * `window.scrollTo` no jsdom: existe, mas só avisa que não foi implementado.
 *
 * A troca de página e a de passo do wizard rolam para o topo, e sem isto cada
 * teste que navega encheria a saída de "Not implemented: window.scrollTo". Uma
 * função vazia de verdade também deixa o `vi.spyOn` conferir a chamada.
 */
if (typeof window !== 'undefined') {
  window.scrollTo = () => {};
}
