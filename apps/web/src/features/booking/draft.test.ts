import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_DRAFT,
  type BookingDraft,
  type VenueLimits,
  agendaItemId,
  clearDraft,
  draftReducer,
  guestCountError,
  hasDates,
  isStepComplete,
  loadDraft,
  rangeLengthError,
  reachableStep,
  requestItems,
  saveDraft,
} from './draft';
import { stepsFor } from './steps';

const STORAGE_KEY = 'chacara:booking-draft';

const LIMITS: VenueLimits = { minDays: 1, maxDays: 3, maxGuests: 120 };

const FILLED: BookingDraft = {
  kind: 'VENUE',
  kindLocked: false,
  startDate: '2026-12-05',
  endDate: '2026-12-06',
  guestCount: 60,
  itemId: 'i1',
  fulfillment: null,
  customerNotes: 'Chegamos na sexta para montar.',
};

const DECORATION: BookingDraft = {
  ...FILLED,
  kind: 'DECORATION',
  endDate: FILLED.startDate,
  guestCount: null,
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

  /* Uma decoração por pedido: escolher outra troca, não soma. */
  it('troca a decoração em vez de somar', () => {
    const once = draftReducer(EMPTY_DRAFT, { type: 'setItem', itemId: 'i1' });
    const twice = draftReducer(once, { type: 'setItem', itemId: 'i2' });

    expect(twice.itemId).toBe('i2');
  });

  it('tira a decoração com nulo', () => {
    expect(draftReducer(FILLED, { type: 'setItem', itemId: null }).itemId).toBeNull();
  });

  it('guarda a retirada ou a entrega', () => {
    const next = draftReducer(DECORATION, { type: 'setFulfillment', fulfillment: 'DELIVERY' });

    expect(next.fulfillment).toBe('DELIVERY');
  });

  it('aceita convidados nulo, para o campo poder ficar vazio enquanto digita', () => {
    const next = draftReducer(FILLED, { type: 'setGuestCount', guestCount: null });

    expect(next.guestCount).toBeNull();
  });

  it('zera tudo no reset, com a mesma referência do pedido vazio', () => {
    expect(draftReducer(FILLED, { type: 'reset' })).toBe(EMPTY_DRAFT);
  });

  it('trocar para decoração encolhe o intervalo para o primeiro dia e mantém o resto', () => {
    const next = draftReducer(FILLED, { type: 'setKind', kind: 'DECORATION' });

    expect(next).toMatchObject({
      kind: 'DECORATION',
      startDate: '2026-12-05',
      endDate: '2026-12-05',
      guestCount: 60,
      itemId: 'i1',
    });
  });

  it('voltar para a chácara mantém o dia escolhido', () => {
    const decoration = draftReducer(FILLED, { type: 'setKind', kind: 'DECORATION' });
    const venue = draftReducer(decoration, { type: 'setKind', kind: 'VENUE' });

    expect(venue).toMatchObject({ kind: 'VENUE', startDate: '2026-12-05', endDate: '2026-12-05' });
  });
});

describe('requestItems e agendaItemId', () => {
  it('manda a decoração uma vez, ou nada', () => {
    expect(requestItems(FILLED)).toEqual([{ itemId: 'i1', quantity: 1 }]);
    expect(requestItems({ ...FILLED, itemId: null })).toEqual([]);
  });

  /*
   * Na chácara a decoração é opcional, e o calendário mostra os dias da chácara.
   * Na decoração, ela é o pedido, e o calendário mostra os dias dela.
   */
  it('só o pedido de decoração pede a agenda da decoração escolhida', () => {
    expect(agendaItemId(DECORATION)).toBe('i1');
    expect(agendaItemId(FILLED)).toBeNull();
    expect(agendaItemId({ ...DECORATION, itemId: null })).toBeNull();
  });
});

describe('rangeLengthError', () => {
  it('aceita o período dentro dos limites da chácara', () => {
    expect(rangeLengthError(FILLED, LIMITS)).toBeNull();
  });

  it('recusa o período maior que o máximo', () => {
    expect(rangeLengthError({ ...FILLED, endDate: '2026-12-09' }, LIMITS)).toBe(
      'A chácara aceita no máximo 3 dias seguidos.',
    );
  });

  it('recusa o período menor que o mínimo', () => {
    expect(rangeLengthError({ ...FILLED, endDate: '2026-12-05' }, { ...LIMITS, minDays: 2 })).toBe(
      'A reserva é de no mínimo 2 dias seguidos.',
    );
  });

  it('não confere tamanho na decoração, que é sempre um dia', () => {
    expect(rangeLengthError({ ...DECORATION, endDate: '2026-12-09' }, LIMITS)).toBeNull();
  });
});

describe('guestCountError', () => {
  it('pede o número quando está vazio', () => {
    expect(guestCountError(null, 120)).toBe('Informe quantas pessoas são esperadas.');
  });

  it('recusa zero, negativo e número quebrado', () => {
    expect(guestCountError(0, 120)).toBe('Informe pelo menos um convidado.');
    expect(guestCountError(-3, 120)).toBe('Informe pelo menos um convidado.');
    expect(guestCountError(10.5, 120)).toBe('Informe um número inteiro de convidados.');
  });

  /* O teto é o `maxGuests` das configurações: a API recusaria acima dele. */
  it('trava no máximo de convidados da chácara', () => {
    expect(guestCountError(120, 120)).toBeNull();
    expect(guestCountError(121, 120)).toBe(
      'São mais pessoas do que a chácara recebe. O máximo é 120.',
    );
  });
});

describe('isStepComplete', () => {
  it('a data precisa das duas pontas e do tamanho certo', () => {
    expect(hasDates(EMPTY_DRAFT)).toBe(false);
    expect(isStepComplete(FILLED, 'data', LIMITS)).toBe(true);
    expect(isStepComplete({ ...FILLED, endDate: null }, 'data', LIMITS)).toBe(false);
    expect(isStepComplete({ ...FILLED, endDate: '2026-12-09' }, 'data', LIMITS)).toBe(false);
  });

  it('os convidados só contam na chácara', () => {
    expect(isStepComplete(FILLED, 'convidados', LIMITS)).toBe(true);
    expect(isStepComplete({ ...FILLED, guestCount: 500 }, 'convidados', LIMITS)).toBe(false);
    expect(isStepComplete(DECORATION, 'convidados', LIMITS)).toBe(true);
  });

  it('a decoração é opcional na chácara e obrigatória na decoração', () => {
    expect(isStepComplete({ ...FILLED, itemId: null }, 'decoracao', LIMITS)).toBe(true);
    expect(isStepComplete(DECORATION, 'decoracao', LIMITS)).toBe(true);
    expect(isStepComplete({ ...DECORATION, itemId: null }, 'decoracao', LIMITS)).toBe(false);
  });
});

describe('reachableStep', () => {
  const venueSteps = stepsFor('VENUE', false);

  it('abre o passo pedido quando os anteriores estão respondidos', () => {
    expect(reachableStep(FILLED, venueSteps, 'revisao', LIMITS)).toBe('revisao');
  });

  /* Link para a revisão com o pedido pela metade cai no que falta responder. */
  it('cai no primeiro passo que falta', () => {
    expect(reachableStep(EMPTY_DRAFT, venueSteps, 'revisao', LIMITS)).toBe('data');
    expect(reachableStep({ ...FILLED, guestCount: null }, venueSteps, 'revisao', LIMITS)).toBe(
      'convidados',
    );
  });

  it('não empurra para a frente quem pediu um passo anterior', () => {
    expect(reachableStep(EMPTY_DRAFT, venueSteps, 'tipo', LIMITS)).toBe('tipo');
  });

  it('na decoração, a revisão espera a decoração escolhida', () => {
    const steps = stepsFor('DECORATION', true);

    expect(reachableStep({ ...DECORATION, itemId: null }, steps, 'revisao', LIMITS)).toBe(
      'decoracao',
    );
  });
});

describe('loadDraft', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  /* `null`, e não um rascunho vazio: é como o wizard sabe que não há pedido a retomar. */
  it('não devolve pedido quando nada foi guardado', () => {
    expect(loadDraft()).toBeNull();
  });

  it('recupera o que foi salvo, igualzinho', () => {
    saveDraft({ ...DECORATION, kindLocked: true, fulfillment: 'DELIVERY' });

    expect(loadDraft()).toEqual({ ...DECORATION, kindLocked: true, fulfillment: 'DELIVERY' });
  });

  it('esquece o rascunho depois do clear', () => {
    saveDraft(FILLED);
    clearDraft();

    expect(loadDraft()).toBeNull();
  });

  /*
   * O conteúdo guardado pode ser de uma versão anterior do formato ou ter sido
   * editado à mão. Campo estranho volta ao padrão: o pior caso é a pessoa
   * reescolher, não a tela quebrar.
   */
  it('descarta JSON corrompido em vez de estourar', () => {
    window.sessionStorage.setItem(STORAGE_KEY, '{isso não é json');

    expect(loadDraft()).toBeNull();
  });

  it('descarta o que nem objeto é', () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify('texto'));

    expect(loadDraft()).toBeNull();
  });

  it('ignora campo com o tipo errado e mantém os que servem', () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        startDate: '2026-12-05',
        endDate: 7,
        guestCount: 'muitas',
        itemId: { id: 'i1' },
        fulfillment: 'TELETRANSPORTE',
        customerNotes: null,
      }),
    );

    expect(loadDraft()).toEqual({ ...EMPTY_DRAFT, startDate: '2026-12-05' });
  });

  it('rascunho de antes da T32, sem tipo, volta como chácara', () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ startDate: '2026-12-05', endDate: '2026-12-06', guestCount: 60 }),
    );

    expect(loadDraft()?.kind).toBe('VENUE');
  });

  /* A chácara sempre pergunta o tipo: só a decoração vinda da landing pula. */
  it('só trava o tipo na decoração', () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ kind: 'VENUE', kindLocked: true }));

    expect(loadDraft()?.kindLocked).toBe(false);
  });

  /*
   * Rascunho de antes da decoração única guardava uma lista de itens. Fica a
   * primeira linha que serve, e o estilo, que saiu do site, fica para trás.
   */
  it('traz a primeira decoração da lista dos rascunhos antigos', () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        themeId: 't1',
        items: [
          null,
          { quantity: 2 },
          { itemId: 'i2', quantity: 2 },
          { itemId: 'i3', quantity: 1 },
        ],
      }),
    );

    expect(loadDraft()).toEqual({ ...EMPTY_DRAFT, itemId: 'i2' });
  });

  it('lista antiga fora do formato volta sem decoração', () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ items: { i1: 2 } }));

    expect(loadDraft()?.itemId).toBeNull();
  });
});
