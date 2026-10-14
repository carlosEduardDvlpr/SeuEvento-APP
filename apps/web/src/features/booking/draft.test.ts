import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_DRAFT,
  type BookingDraft,
  clearDraft,
  draftReducer,
  hasDates,
  isStepOneComplete,
  loadDraft,
  quantityOf,
  saveDraft,
} from './draft';

const STORAGE_KEY = 'chacara:booking-draft';

const FILLED: BookingDraft = {
  startDate: '2026-12-05',
  endDate: '2026-12-06',
  eventType: 'BABY_SHOWER',
  guestCount: 60,
  themeId: 't1',
  items: [{ itemId: 'i1', quantity: 2 }],
  customerNotes: 'Chegamos na sexta para montar.',
};

describe('draftReducer', () => {
  it('guarda o intervalo escolhido', () => {
    const next = draftReducer(EMPTY_DRAFT, {
      type: 'setRange',
      startDate: '2026-12-05',
      endDate: '2026-12-06',
    });

    expect(next.startDate).toBe('2026-12-05');
    expect(next.endDate).toBe('2026-12-06');
  });

  it('acrescenta o item que ainda não estava no pedido', () => {
    const next = draftReducer(EMPTY_DRAFT, { type: 'setQuantity', itemId: 'i1', quantity: 3 });

    expect(next.items).toEqual([{ itemId: 'i1', quantity: 3 }]);
  });

  it('troca a quantidade do item já escolhido, sem duplicar a linha', () => {
    const once = draftReducer(EMPTY_DRAFT, { type: 'setQuantity', itemId: 'i1', quantity: 1 });
    const twice = draftReducer(once, { type: 'setQuantity', itemId: 'i1', quantity: 4 });

    expect(twice.items).toEqual([{ itemId: 'i1', quantity: 4 }]);
  });

  /*
   * O contrato do orçamento exige no mínimo 1 por linha. Uma linha zerada viraria
   * VALIDATION_ERROR num pedido que a pessoa só quis esvaziar.
   */
  it('remove a linha quando a quantidade chega a zero', () => {
    const next = draftReducer(FILLED, { type: 'setQuantity', itemId: 'i1', quantity: 0 });

    expect(next.items).toEqual([]);
  });

  it('remove a linha também com quantidade negativa', () => {
    const next = draftReducer(FILLED, { type: 'setQuantity', itemId: 'i1', quantity: -2 });

    expect(next.items).toEqual([]);
  });

  it('tira do pedido os itens que saíram do catálogo e mantém o resto', () => {
    const draft: BookingDraft = {
      ...FILLED,
      items: [
        { itemId: 'i1', quantity: 1 },
        { itemId: 'i2', quantity: 2 },
        { itemId: 'i3', quantity: 3 },
      ],
    };

    const next = draftReducer(draft, { type: 'removeItems', itemIds: ['i1', 'i3'] });

    expect(next.items).toEqual([{ itemId: 'i2', quantity: 2 }]);
  });

  it('não mexe nos itens quando a lista de removidos está vazia', () => {
    const next = draftReducer(FILLED, { type: 'removeItems', itemIds: [] });

    expect(next.items).toEqual(FILLED.items);
  });

  it('zera tudo no reset', () => {
    expect(draftReducer(FILLED, { type: 'reset' })).toEqual(EMPTY_DRAFT);
  });

  it('aceita convidados nulo, para o campo poder ficar vazio enquanto digita', () => {
    const next = draftReducer(FILLED, { type: 'setGuestCount', guestCount: null });

    expect(next.guestCount).toBeNull();
  });

  it('aceita estilo nulo, que é o filtro "todos"', () => {
    const next = draftReducer(FILLED, { type: 'setTheme', themeId: null });

    expect(next.themeId).toBeNull();
  });
});

describe('quantityOf', () => {
  it('devolve a quantidade do item escolhido', () => {
    expect(quantityOf(FILLED, 'i1')).toBe(2);
  });

  it('devolve zero para item fora do pedido', () => {
    expect(quantityOf(FILLED, 'nao-existe')).toBe(0);
  });
});

describe('hasDates e isStepOneComplete', () => {
  it('só tem datas com as duas pontas preenchidas', () => {
    expect(hasDates(EMPTY_DRAFT)).toBe(false);
    expect(hasDates({ ...EMPTY_DRAFT, startDate: '2026-12-05' })).toBe(false);
    expect(hasDates(FILLED)).toBe(true);
  });

  it('exige datas, tipo de evento e convidados para liberar o passo seguinte', () => {
    expect(isStepOneComplete(FILLED)).toBe(true);
    expect(isStepOneComplete({ ...FILLED, eventType: null })).toBe(false);
    expect(isStepOneComplete({ ...FILLED, guestCount: null })).toBe(false);
    expect(isStepOneComplete({ ...FILLED, startDate: null })).toBe(false);
  });
});

describe('loadDraft', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('devolve o rascunho vazio quando nada foi guardado', () => {
    expect(loadDraft()).toEqual(EMPTY_DRAFT);
  });

  it('recupera o que foi salvo, igualzinho', () => {
    saveDraft(FILLED);

    expect(loadDraft()).toEqual(FILLED);
  });

  it('esquece o rascunho depois do clear', () => {
    saveDraft(FILLED);
    clearDraft();

    expect(loadDraft()).toEqual(EMPTY_DRAFT);
  });

  /*
   * O conteúdo guardado pode ser de uma versão anterior do formato ou ter sido
   * editado à mão. Campo estranho volta ao padrão: o pior caso é a pessoa
   * reescolher, não a tela quebrar.
   */
  it('descarta JSON corrompido em vez de estourar', () => {
    window.sessionStorage.setItem(STORAGE_KEY, '{isso não é json');

    expect(loadDraft()).toEqual(EMPTY_DRAFT);
  });

  it('ignora campo com o tipo errado e mantém os que servem', () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        startDate: '2026-12-05',
        endDate: 7,
        guestCount: 'muitas',
        themeId: { id: 't1' },
        customerNotes: null,
      }),
    );

    expect(loadDraft()).toEqual({
      ...EMPTY_DRAFT,
      startDate: '2026-12-05',
    });
  });

  it('descarta as linhas de item malformadas e preserva as válidas', () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        items: [
          { itemId: 'i1', quantity: 2 },
          { itemId: 'i2' },
          { quantity: 3 },
          null,
          'i3',
          { itemId: 'i4', quantity: '5' },
        ],
      }),
    );

    expect(loadDraft().items).toEqual([{ itemId: 'i1', quantity: 2 }]);
  });

  it('aceita itens em formato não-lista voltando para lista vazia', () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ items: { i1: 2 } }));

    expect(loadDraft().items).toEqual([]);
  });
});
