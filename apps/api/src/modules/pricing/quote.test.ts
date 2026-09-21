import { describe, expect, it } from 'vitest';
import { eachDay } from '../../lib/dates.js';
import {
  type CartLine,
  type ComboDef,
  type PriceRuleDef,
  applyCombos,
  computeQuote,
  resolveDailyPrice,
} from './quote.js';

/**
 * Os dez casos obrigatórios da §19 estão marcados no nome de cada teste.
 *
 * Dezembro de 2026 serve de calendário: 04 é sexta, 05 é sábado, 06 é domingo e
 * 07 é segunda.
 */
const BASE_DAILY = 150_000;

function rule(overrides: Partial<PriceRuleDef> & { id: string }): PriceRuleDef {
  return {
    name: `Regra ${overrides.id}`,
    dayOfWeek: null,
    startDate: null,
    endDate: null,
    priceCents: BASE_DAILY,
    priority: 0,
    ...overrides,
  };
}

const SATURDAY = rule({
  id: 'r-sabado',
  name: 'Sábado',
  dayOfWeek: 6,
  priceCents: 220_000,
  priority: 10,
});

const SUNDAY = rule({
  id: 'r-domingo',
  name: 'Domingo',
  dayOfWeek: 0,
  priceCents: 200_000,
  priority: 10,
});

function line(overrides: Partial<CartLine> & { itemId: string }): CartLine {
  return {
    name: `Item ${overrides.itemId}`,
    quantity: 1,
    unitPriceCents: 10_000,
    ...overrides,
  };
}

describe('resolveDailyPrice (§9.4)', () => {
  // Caso 1 da §19.
  it('cobra a diária base no dia útil e a regra no fim de semana', () => {
    const rules = [SATURDAY, SUNDAY];

    expect(resolveDailyPrice('2026-12-07', rules, BASE_DAILY)).toEqual({
      date: '2026-12-07',
      priceCents: 150_000,
      ruleName: null,
    });
    expect(resolveDailyPrice('2026-12-05', rules, BASE_DAILY)).toEqual({
      date: '2026-12-05',
      priceCents: 220_000,
      ruleName: 'Sábado',
    });
    expect(resolveDailyPrice('2026-12-06', rules, BASE_DAILY)).toEqual({
      date: '2026-12-06',
      priceCents: 200_000,
      ruleName: 'Domingo',
    });
  });

  // Caso 2 da §19.
  it('deixa a regra de período com prioridade maior vencer a de fim de semana', () => {
    const newYear = rule({
      id: 'r-reveillon',
      name: 'Réveillon',
      startDate: '2026-12-28',
      endDate: '2027-01-02',
      priceCents: 450_000,
      priority: 50,
    });

    // 02/01/2027 é sábado, então as duas regras concorrem de verdade. Sem esta
    // primeira asserção, o teste passaria mesmo se a de sábado nem se aplicasse.
    expect(resolveDailyPrice('2027-01-02', [SATURDAY], BASE_DAILY).ruleName).toBe('Sábado');

    expect(resolveDailyPrice('2027-01-02', [SATURDAY, newYear], BASE_DAILY)).toMatchObject({
      priceCents: 450_000,
      ruleName: 'Réveillon',
    });
  });

  it('respeita as bordas do período, que são inclusivas', () => {
    const holiday = rule({
      id: 'r-feriado',
      name: 'Feriado',
      startDate: '2026-12-24',
      endDate: '2026-12-26',
      priceCents: 300_000,
      priority: 20,
    });
    const rules = [holiday];

    expect(resolveDailyPrice('2026-12-23', rules, BASE_DAILY).ruleName).toBeNull();
    expect(resolveDailyPrice('2026-12-24', rules, BASE_DAILY).ruleName).toBe('Feriado');
    expect(resolveDailyPrice('2026-12-26', rules, BASE_DAILY).ruleName).toBe('Feriado');
    expect(resolveDailyPrice('2026-12-27', rules, BASE_DAILY).ruleName).toBeNull();
  });

  it('aceita período com uma ponta aberta', () => {
    const fromDecember = rule({
      id: 'r-alta',
      name: 'Alta temporada',
      startDate: '2026-12-01',
      endDate: null,
      priceCents: 260_000,
      priority: 5,
    });

    expect(resolveDailyPrice('2026-11-30', [fromDecember], BASE_DAILY).ruleName).toBeNull();
    expect(resolveDailyPrice('2027-06-01', [fromDecember], BASE_DAILY).ruleName).toBe(
      'Alta temporada',
    );
  });

  // Caso 3 da §19.
  describe('empate de prioridade', () => {
    it('vence a regra mais específica, que é a que tem período', () => {
      const generic = rule({
        id: 'a-generica',
        name: 'Sábado',
        dayOfWeek: 6,
        priceCents: 220_000,
        priority: 10,
      });
      const specific = rule({
        id: 'z-especifica',
        name: 'Sábado de dezembro',
        dayOfWeek: 6,
        startDate: '2026-12-01',
        endDate: '2026-12-31',
        priceCents: 280_000,
        priority: 10,
      });

      // A genérica vem antes por id, então só a especificidade explica o resultado.
      expect(resolveDailyPrice('2026-12-05', [generic, specific], BASE_DAILY)).toMatchObject({
        priceCents: 280_000,
        ruleName: 'Sábado de dezembro',
      });
    });

    it('vence o menor id quando a especificidade também empata', () => {
      const first = rule({ id: 'aaa', name: 'Primeira', priceCents: 111_000, priority: 10 });
      const second = rule({ id: 'bbb', name: 'Segunda', priceCents: 222_000, priority: 10 });

      // A ordem de entrada não pode mudar o preço.
      expect(resolveDailyPrice('2026-12-07', [first, second], BASE_DAILY).ruleName).toBe(
        'Primeira',
      );
      expect(resolveDailyPrice('2026-12-07', [second, first], BASE_DAILY).ruleName).toBe(
        'Primeira',
      );
    });
  });

  // Caso 4 da §19.
  it('usa a diária base quando nenhuma regra se aplica', () => {
    expect(resolveDailyPrice('2026-12-07', [SATURDAY, SUNDAY], BASE_DAILY)).toEqual({
      date: '2026-12-07',
      priceCents: BASE_DAILY,
      ruleName: null,
    });
    expect(resolveDailyPrice('2026-12-07', [], BASE_DAILY).priceCents).toBe(BASE_DAILY);
  });

  it('não altera a lista de regras que recebeu', () => {
    const rules = [SUNDAY, SATURDAY];
    const order = rules.map((item) => item.id);

    resolveDailyPrice('2026-12-05', rules, BASE_DAILY);

    expect(rules.map((item) => item.id)).toEqual(order);
  });
});

describe('applyCombos (§9.6)', () => {
  const PANEL = line({ itemId: 'painel', name: 'Painel de nuvens', unitPriceCents: 18_000 });
  const ARCH = line({ itemId: 'arco', name: 'Arco de balões', unitPriceCents: 24_000 });
  const TABLE = line({ itemId: 'mesa', name: 'Mesa de madeira', unitPriceCents: 12_000 });

  // Caso 5 da §19.
  it('aplica um combo PERCENT uma vez', () => {
    const combo: ComboDef = {
      id: 'c-nuvens',
      name: 'Céu de chá',
      discountType: 'PERCENT',
      discountValue: 15,
      items: [
        { itemId: 'painel', quantity: 1 },
        { itemId: 'arco', quantity: 1 },
      ],
    };

    const result = applyCombos([PANEL, ARCH], [combo]);

    // 18000 + 24000 = 42000; 15% = 6300.
    expect(result.discountTotalCents).toBe(6_300);
    expect(result.applied).toEqual([
      { comboId: 'c-nuvens', name: 'Céu de chá', times: 1, discountCents: 6_300 },
    ]);
  });

  it('arredonda a fração de centavo do desconto percentual', () => {
    const combo: ComboDef = {
      id: 'c-impar',
      name: 'Combo ímpar',
      discountType: 'PERCENT',
      discountValue: 50,
      items: [{ itemId: 'item', quantity: 1 }],
    };

    // 333 centavos, 50% = 166,5 → arredonda para 167 (§7.2).
    const result = applyCombos([line({ itemId: 'item', unitPriceCents: 333 })], [combo]);

    expect(result.discountTotalCents).toBe(167);
  });

  // Caso 6 da §19.
  it('não gera desconto quando o preço fechado é maior que a soma dos itens', () => {
    const combo: ComboDef = {
      id: 'c-caro',
      name: 'Combo caro',
      discountType: 'FIXED_PRICE',
      discountValue: 100_000,
      items: [
        { itemId: 'painel', quantity: 1 },
        { itemId: 'mesa', quantity: 1 },
      ],
    };

    // Soma dos itens é 30000, o preço fechado é 100000: desconto zero, nunca negativo.
    const result = applyCombos([PANEL, TABLE], [combo]);

    expect(result.discountTotalCents).toBe(0);
    expect(result.applied).toEqual([]);
  });

  it('calcula o desconto de FIXED_PRICE como a diferença até o preço fechado', () => {
    const combo: ComboDef = {
      id: 'c-boho',
      name: 'Mesa do bolo boho',
      discountType: 'FIXED_PRICE',
      discountValue: 25_000,
      items: [
        { itemId: 'painel', quantity: 1 },
        { itemId: 'mesa', quantity: 1 },
      ],
    };

    // 18000 + 12000 = 30000; paga 25000, então desconta 5000.
    expect(applyCombos([PANEL, TABLE], [combo]).discountTotalCents).toBe(5_000);
  });

  // Caso 7 da §19.
  it('aplica o mesmo combo duas vezes quando a quantidade permite', () => {
    const combo: ComboDef = {
      id: 'c-kit',
      name: 'Kit de mesa',
      discountType: 'PERCENT',
      discountValue: 10,
      items: [
        { itemId: 'mesa', quantity: 1 },
        { itemId: 'arco', quantity: 1 },
      ],
    };

    const result = applyCombos(
      [
        { ...TABLE, quantity: 2 },
        { ...ARCH, quantity: 2 },
      ],
      [combo],
    );

    // Cada aplicação desconta 10% de 36000 = 3600.
    expect(result.applied).toEqual([
      { comboId: 'c-kit', name: 'Kit de mesa', times: 2, discountCents: 7_200 },
    ]);
    expect(result.discountTotalCents).toBe(7_200);
  });

  it('para de aplicar quando o saldo do item acaba', () => {
    const combo: ComboDef = {
      id: 'c-kit',
      name: 'Kit de mesa',
      discountType: 'PERCENT',
      discountValue: 10,
      items: [
        { itemId: 'mesa', quantity: 1 },
        { itemId: 'arco', quantity: 1 },
      ],
    };

    // Três mesas, mas só dois arcos: o combo cabe duas vezes.
    const result = applyCombos(
      [
        { ...TABLE, quantity: 3 },
        { ...ARCH, quantity: 2 },
      ],
      [combo],
    );

    expect(result.applied[0]?.times).toBe(2);
  });

  // Caso 8 da §19.
  describe('dois combos disputando o mesmo item', () => {
    const shared = line({ itemId: 'painel', unitPriceCents: 100_000 });
    const cheap = line({ itemId: 'mesa', unitPriceCents: 10_000 });
    const extra = line({ itemId: 'luzes', unitPriceCents: 6_000 });

    const bigSaving: ComboDef = {
      id: 'b-grande',
      name: 'Economia grande',
      discountType: 'PERCENT',
      discountValue: 20,
      items: [
        { itemId: 'painel', quantity: 1 },
        { itemId: 'mesa', quantity: 1 },
      ],
    };

    const smallSaving: ComboDef = {
      id: 'a-pequena',
      name: 'Economia pequena',
      discountType: 'PERCENT',
      discountValue: 10,
      items: [
        { itemId: 'painel', quantity: 1 },
        { itemId: 'luzes', quantity: 1 },
      ],
    };

    it('aplica o de maior economia, e o outro fica de fora sem saldo', () => {
      const result = applyCombos([shared, cheap, extra], [smallSaving, bigSaving]);

      // 20% de 110000 = 22000 contra 10% de 106000 = 10600.
      expect(result.applied).toEqual([
        { comboId: 'b-grande', name: 'Economia grande', times: 1, discountCents: 22_000 },
      ]);
      expect(result.discountTotalCents).toBe(22_000);
    });

    it('aplica o segundo quando sobra saldo do item disputado', () => {
      const result = applyCombos(
        [{ ...shared, quantity: 2 }, cheap, extra],
        [smallSaving, bigSaving],
      );

      expect(result.applied.map((entry) => entry.comboId).sort()).toEqual([
        'a-pequena',
        'b-grande',
      ]);
      expect(result.discountTotalCents).toBe(32_600);
    });

    it('desempata pelo menor id quando a economia é igual', () => {
      const first: ComboDef = {
        id: 'aaa',
        name: 'Primeiro',
        discountType: 'PERCENT',
        discountValue: 10,
        items: [{ itemId: 'painel', quantity: 1 }],
      };
      const second: ComboDef = { ...first, id: 'bbb', name: 'Segundo' };

      // A ordem de entrada não pode mudar quem ganha.
      expect(applyCombos([shared], [second, first]).applied[0]?.comboId).toBe('aaa');
      expect(applyCombos([shared], [first, second]).applied[0]?.comboId).toBe('aaa');
    });

    /*
     * A escolha gulosa não é ótima, e a §9.6 aceita isso no MVP. Este teste fixa o
     * comportamento para a troca por busca exaustiva, se um dia acontecer, ser uma
     * decisão consciente e não um efeito colateral.
     */
    it('pode perder da combinação ideal, como a §9.6 admite', () => {
      const scarce = line({ itemId: 'raro', unitPriceCents: 100_000 });
      const commonA = line({ itemId: 'comum-a', unitPriceCents: 1_000 });
      const commonB = line({ itemId: 'comum-b', unitPriceCents: 1_000 });

      const greedyPick: ComboDef = {
        id: 'a-gulosa',
        name: 'Escolha gulosa',
        discountType: 'PERCENT',
        discountValue: 30,
        items: [
          { itemId: 'raro', quantity: 1 },
          { itemId: 'comum-a', quantity: 1 },
        ],
      };
      const pairThatWouldBeBetter: ComboDef = {
        id: 'b-alternativa',
        name: 'Alternativa',
        discountType: 'PERCENT',
        discountValue: 29,
        items: [
          { itemId: 'raro', quantity: 1 },
          { itemId: 'comum-b', quantity: 1 },
        ],
      };

      const result = applyCombos([scarce, commonA, commonB], [greedyPick, pairThatWouldBeBetter]);

      // Escolhe a de 30% e o item raro acaba; a outra não entra.
      expect(result.applied).toHaveLength(1);
      expect(result.applied[0]?.comboId).toBe('a-gulosa');
    });
  });

  // Caso 9 da §19.
  it('não aplica o combo quando falta quantidade de um item', () => {
    const combo: ComboDef = {
      id: 'c-trio',
      name: 'Trio',
      discountType: 'PERCENT',
      discountValue: 20,
      items: [
        { itemId: 'painel', quantity: 1 },
        { itemId: 'arco', quantity: 2 },
      ],
    };

    // Só um arco, e o combo pede dois.
    const result = applyCombos([PANEL, ARCH], [combo]);

    expect(result.applied).toEqual([]);
    expect(result.discountTotalCents).toBe(0);
  });

  it('não aplica o combo quando um item nem está no pedido', () => {
    const combo: ComboDef = {
      id: 'c-com-ausente',
      name: 'Combo com item ausente',
      discountType: 'PERCENT',
      discountValue: 20,
      items: [
        { itemId: 'painel', quantity: 1 },
        { itemId: 'nao-pedido', quantity: 1 },
      ],
    };

    expect(applyCombos([PANEL], [combo]).discountTotalCents).toBe(0);
  });

  it('devolve zero sem combos e sem itens', () => {
    expect(applyCombos([], [])).toEqual({ applied: [], discountTotalCents: 0 });
    expect(applyCombos([PANEL], [])).toEqual({ applied: [], discountTotalCents: 0 });
  });

  // Combo sem item nenhum daria desconto infinito num laço que nunca fecha.
  it('ignora combo sem itens', () => {
    const empty: ComboDef = {
      id: 'c-vazio',
      name: 'Vazio',
      discountType: 'PERCENT',
      discountValue: 50,
      items: [],
    };

    expect(applyCombos([PANEL], [empty]).discountTotalCents).toBe(0);
  });
});

describe('computeQuote (§9.5)', () => {
  const PANEL = line({ itemId: 'painel', name: 'Painel de nuvens', unitPriceCents: 18_000 });
  const ARCH = line({ itemId: 'arco', name: 'Arco de balões', unitPriceCents: 24_000 });

  it('soma diárias, itens e desconto no contrato da §11.3', () => {
    const quote = computeQuote({
      days: eachDay('2026-12-05', '2026-12-06'),
      rules: [SATURDAY, SUNDAY],
      baseDailyPriceCents: BASE_DAILY,
      lines: [{ ...PANEL, quantity: 2 }],
      combos: [],
    });

    expect(quote.days).toEqual([
      { date: '2026-12-05', priceCents: 220_000, ruleName: 'Sábado' },
      { date: '2026-12-06', priceCents: 200_000, ruleName: 'Domingo' },
    ]);
    expect(quote.dailyTotalCents).toBe(420_000);
    expect(quote.lines).toEqual([
      {
        itemId: 'painel',
        name: 'Painel de nuvens',
        quantity: 2,
        unitPriceCents: 18_000,
        totalCents: 36_000,
      },
    ]);
    expect(quote.itemsTotalCents).toBe(36_000);
    expect(quote.totalCents).toBe(456_000);
  });

  it('desconta o combo do total', () => {
    const combo: ComboDef = {
      id: 'c-nuvens',
      name: 'Céu de chá',
      discountType: 'PERCENT',
      discountValue: 15,
      items: [
        { itemId: 'painel', quantity: 1 },
        { itemId: 'arco', quantity: 1 },
      ],
    };

    const quote = computeQuote({
      days: ['2026-12-05'],
      rules: [SATURDAY],
      baseDailyPriceCents: BASE_DAILY,
      lines: [PANEL, ARCH],
      combos: [combo],
    });

    expect(quote.itemsTotalCents).toBe(42_000);
    expect(quote.discountTotalCents).toBe(6_300);
    // 220000 + 42000 - 6300
    expect(quote.totalCents).toBe(255_700);
  });

  it('cobra o item uma vez pelo período, não por dia (§9.5)', () => {
    const forOneDay = computeQuote({
      days: eachDay('2026-12-07', '2026-12-07'),
      rules: [],
      baseDailyPriceCents: BASE_DAILY,
      lines: [PANEL],
      combos: [],
    });
    const forThreeDays = computeQuote({
      days: eachDay('2026-12-07', '2026-12-09'),
      rules: [],
      baseDailyPriceCents: BASE_DAILY,
      lines: [PANEL],
      combos: [],
    });

    expect(forOneDay.itemsTotalCents).toBe(forThreeDays.itemsTotalCents);
    expect(forThreeDays.dailyTotalCents).toBe(3 * BASE_DAILY);
  });

  it('funciona sem item nenhum', () => {
    const quote = computeQuote({
      days: ['2026-12-07'],
      rules: [],
      baseDailyPriceCents: BASE_DAILY,
      lines: [],
      combos: [],
    });

    expect(quote.itemsTotalCents).toBe(0);
    expect(quote.discountTotalCents).toBe(0);
    expect(quote.totalCents).toBe(BASE_DAILY);
  });

  // Caso 10 da §19.
  it('nunca devolve total negativo', () => {
    const generous: ComboDef = {
      id: 'c-tudo',
      name: 'Tudo de graça',
      discountType: 'FIXED_PRICE',
      discountValue: 0,
      items: [{ itemId: 'painel', quantity: 1 }],
    };

    const quote = computeQuote({
      days: ['2026-12-07'],
      rules: [],
      baseDailyPriceCents: 0,
      lines: [PANEL],
      combos: [generous],
    });

    // O combo zera os itens, e a diária base é zero: total zero, não negativo.
    expect(quote.discountTotalCents).toBe(18_000);
    expect(quote.totalCents).toBe(0);
  });

  it('mantém o total consistente com as partes', () => {
    const combo: ComboDef = {
      id: 'c-kit',
      name: 'Kit',
      discountType: 'PERCENT',
      discountValue: 12,
      items: [
        { itemId: 'painel', quantity: 1 },
        { itemId: 'arco', quantity: 1 },
      ],
    };

    const quote = computeQuote({
      days: eachDay('2026-12-04', '2026-12-06'),
      rules: [SATURDAY, SUNDAY],
      baseDailyPriceCents: BASE_DAILY,
      lines: [
        { ...PANEL, quantity: 2 },
        { ...ARCH, quantity: 3 },
      ],
      combos: [combo],
    });

    expect(quote.totalCents).toBe(
      quote.dailyTotalCents + quote.itemsTotalCents - quote.discountTotalCents,
    );
    expect(Number.isInteger(quote.totalCents)).toBe(true);
  });
});
