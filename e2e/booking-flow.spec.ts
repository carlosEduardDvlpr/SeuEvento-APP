import { expect, test, type Page } from '@playwright/test';
import { ADMIN, CUSTOMER, ITEMS_TOTAL_CENTS, ORDERED_ITEMS, WEB_URL } from './support/env.js';
import { waitForMailLink } from './support/mail-log.js';

/**
 * O caminho feliz da §19, ponta a ponta: landing → datas e itens → cadastro com
 * confirmação de e-mail → pedido enviado → admin confirma → cliente vê
 * "Confirmada".
 *
 * **O que só este teste prova:** que as peças estão ligadas. Navegador, SPA,
 * proxy, Fastify, Prisma, Postgres e as constraints de verdade, atravessados por
 * uma pessoa clicando. Regra de negócio não se verifica aqui — os testes de
 * integração e de unidade fazem isso melhor, falhando na linha certa. Quando
 * este quebra, o que ele diz é "alguma junta soltou".
 *
 * Um só caso, e é de propósito: E2E é o teste mais caro e mais frágil da
 * pirâmide. Partir o caminho em vários casos exigiria repetir o começo em cada
 * um, ou guardar estado entre eles — e aí seria um caso só, com aparência de
 * vários.
 */

/** Rótulo do dinheiro como a interface mostra, para comparar texto com texto. */
function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Abre o wizard pela primeira data livre sugerida no hero.
 *
 * É o caminho que a §13.1 promete ("chegar às datas em um gesto") e o que a
 * landing existe para fazer. Também evita navegar o calendário mês a mês para
 * achar um dia livre, que é a parte frágil de testar calendário.
 */
async function startFromHeroDate(page: Page): Promise<string> {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sua festa no nosso quintal');

  /*
   * Seletor pelo `href`, não pelo texto: o rótulo é um dia da semana abreviado
   * pelo `Intl`, e casar texto aqui já pegou "Termos de uso" no rodapé por
   * engano. O endereço é o que define o que estes links são.
   */
  const firstFreeDate = page.locator('a[href^="/reservar?data="]').first();
  await expect(firstFreeDate).toBeVisible();

  await firstFreeDate.click();

  await expect(page).toHaveURL(/\/reservar\?data=\d{4}-\d{2}-\d{2}/);

  // A data escolhida volta como texto para as asserções seguintes.
  const chosen = new URL(page.url()).searchParams.get('data');
  expect(chosen).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  return chosen as string;
}

test('cliente monta o pedido, confirma o e-mail e o admin aprova a reserva', async ({
  page,
  browser,
}) => {
  // ----------------------------------------------------------------------
  // 1. Landing e passo 1: datas, tipo de festa e convidados
  // ----------------------------------------------------------------------
  const chosenDate = await startFromHeroDate(page);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Montar meu pedido');

  /*
   * O calendário precisa chegar já com a data do link aplicada. A §13.1 pede o
   * wizard "já preenchido", e é aqui que se vê se o parâmetro foi aplicado na
   * inicialização do rascunho e não num efeito depois do primeiro desenho.
   *
   * A asserção é no `aria-label` porque é ali que o `react-day-picker` diz que o
   * dia está escolhido ("…de outubro de 2026, selecionado"). É também o que um
   * leitor de tela recebe — melhor de verificar que o `aria-selected` da célula.
   */
  const dayButton = page.locator(`[data-day="${chosenDate}"] button`);
  await expect(dayButton).toHaveAttribute('aria-label', /selecionado/);

  /*
   * O clique é no cartão, não no `<input>`: o radio é 1×1 px e fica embaixo do
   * rótulo (§14.11 — o alvo de toque é o cartão inteiro), então `check()` no
   * input espera para sempre por um elemento que não recebe o ponteiro. Clicar
   * onde a pessoa clica e conferir o estado depois é o que o teste deve fazer.
   */
  await page
    .getByRole('group', { name: 'Que festa é?' })
    .getByText('Chá de bebê', { exact: true })
    .click();

  await expect(page.getByRole('radio', { name: 'Chá de bebê' })).toBeChecked();

  await page.getByLabel('Número de convidados').fill('40');

  await page.getByRole('button', { name: 'Continuar' }).click();

  // ----------------------------------------------------------------------
  // 2. Passo 2: itens do pegue e monte
  // ----------------------------------------------------------------------
  await expect(page.getByRole('heading', { name: 'Escolha o estilo da festa' })).toBeVisible();

  for (const item of ORDERED_ITEMS) {
    await page.getByRole('button', { name: `Aumentar ${item.name}` }).click();
    await expect(page.getByRole('spinbutton', { name: `Quantidade de ${item.name}` })).toHaveValue(
      '1',
    );
  }

  // O rodapé soma só os itens; a diária entra no total na revisão (§13.2).
  await expect(page.getByText(`Itens escolhidos (${ORDERED_ITEMS.length})`)).toBeVisible();

  await page.getByRole('button', { name: 'Continuar' }).click();

  // ----------------------------------------------------------------------
  // 3. Passo 3: revisão com o orçamento do servidor
  // ----------------------------------------------------------------------
  await expect(page.getByRole('heading', { name: /Confira seu pedido/i })).toBeVisible();

  /*
   * Quem não entrou ainda para aqui. O rascunho está guardado, e é isso que o
   * desvio por cadastro vai testar: nada do que foi escolhido pode se perder.
   */
  await expect(page.getByRole('heading', { name: 'Falta só entrar' })).toBeVisible();

  /*
   * Quem soma é o servidor (§9.7), e o valor dá para afirmar porque o catálogo
   * de demonstração é versionado: 180,00 + 240,00. Se este número bate, o
   * caminho inteiro — carrinho, proxy, `POST /pricing/quote`, catálogo no
   * Postgres — está ligado.
   */
  const valores = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Valores' }) });

  await expect(valores.getByText('Itens do pegue e monte')).toBeVisible();
  await expect(valores.getByText(brl(ITEMS_TOTAL_CENTS))).toBeVisible();

  /*
   * O total é capturado como **texto**, não convertido para número: ele é
   * comparado com o da tela de confirmação, e comparar texto com texto não
   * depende de acertar o espaço estreito que o `Intl` põe depois do "R$".
   */
  const totalValue = valores
    .locator('p')
    .filter({ hasText: /^Total/ })
    .locator('strong');

  await expect(totalValue).toBeVisible();
  const totalText = ((await totalValue.textContent()) ?? '').trim();

  // A diária entra no total, então ele é necessariamente maior que os itens.
  expect(totalText).not.toBe(brl(ITEMS_TOTAL_CENTS));

  // ----------------------------------------------------------------------
  // 4. Cadastro e confirmação de e-mail
  // ----------------------------------------------------------------------
  await page.getByRole('link', { name: 'Criar uma conta' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Criar conta' })).toBeVisible();

  await page.getByLabel('Nome').fill(CUSTOMER.name);
  await page.getByLabel('E-mail').fill(CUSTOMER.email);
  await page.getByLabel('WhatsApp').fill(CUSTOMER.phone);
  await page.getByLabel('Senha').fill(CUSTOMER.password);
  await page.getByRole('checkbox').check();

  await page.getByRole('button', { name: 'Criar conta' }).click();

  // §10.2: a tela não diz se o e-mail já tinha conta, só que o link foi enviado.
  await expect(page.getByRole('heading', { level: 1, name: 'Confira seu e-mail' })).toBeVisible();

  /*
   * O link vem do log da API (`MAIL_TRANSPORT=log`), porque o token só existe em
   * hash no banco (§10.2) e não há caixa de entrada aqui. É o único passo deste
   * teste que não é um clique — e abrir o endereço é exatamente o que a pessoa
   * faria no e-mail.
   */
  const verifyLink = await waitForMailLink(
    new RegExp(`${WEB_URL}/verificar-email\\?token=[A-Za-z0-9_-]+`),
  );

  await page.goto(verifyLink);

  // Confirmar já abre a sessão (§10.2, passo 5) e leva para a landing.
  await expect(page).toHaveURL(`${WEB_URL}/`);
  await expect(page.getByRole('link', { name: 'Reservas' })).toBeVisible();

  // ----------------------------------------------------------------------
  // 5. Volta ao pedido e envia
  // ----------------------------------------------------------------------
  await page.goto('/reservar?step=revisao');

  // O rascunho sobreviveu ao desvio: é a promessa feita na tela do cadastro.
  await expect(page.getByRole('heading', { name: /Confira seu pedido/i })).toBeVisible();
  for (const item of ORDERED_ITEMS) {
    await expect(page.getByText(item.name).first()).toBeVisible();
  }

  await page.getByRole('button', { name: 'Solicitar reserva' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Pedido enviado' })).toBeVisible();
  await expect(page.getByText('Aguardando confirmação')).toBeVisible();

  // O valor gravado na reserva é o mesmo que a pessoa viu antes de enviar: é a
  // promessa do `expectedTotalCents` da §9.7.
  await expect(page.getByText(totalText, { exact: true })).toBeVisible();

  // ----------------------------------------------------------------------
  // 6. O admin confirma, em outra sessão
  // ----------------------------------------------------------------------
  /*
   * Contexto separado em vez de sair e entrar de novo: o cookie de refresh é
   * `httpOnly` e por sessão (§10.1), e misturar as duas no mesmo navegador
   * testaria o logout, não a confirmação. Além disso, no fim o teste volta à aba
   * do cliente para ver a mudança chegar.
   */
  const adminContext = await browser.newContext({
    baseURL: WEB_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  const adminPage = await adminContext.newPage();

  try {
    await adminPage.goto('/entrar');
    await adminPage.getByLabel('E-mail').fill(ADMIN.email);
    await adminPage.getByLabel('Senha').fill(ADMIN.password);
    await adminPage.getByRole('button', { name: 'Entrar' }).click();

    /*
     * Espera a sessão existir antes de ir ao painel. Sem isto, o `goto` corria
     * com o `POST /auth/login`: a navegação acontecia antes de o cookie de
     * refresh chegar, o `RequireRole` não via sessão e devolvia para `/entrar` —
     * uma falha que parecia credencial errada e não era.
     */
    await expect(adminPage).toHaveURL(`${WEB_URL}/`);
    await expect(adminPage.getByRole('link', { name: 'Reservas' })).toBeVisible();

    await adminPage.goto('/admin/reservas');
    await expect(adminPage.getByRole('heading', { level: 1, name: 'Reservas' })).toBeVisible();

    await adminPage.getByLabel('Buscar cliente').fill(CUSTOMER.email);
    await expect(adminPage.getByText('1 reserva')).toBeVisible();

    await adminPage.getByRole('link').filter({ hasText: CUSTOMER.name }).click();

    // O `h1` do detalhe é o período; o que identifica a reserva certa é a linha
    // com o tipo de festa e o número de convidados que o cliente informou.
    await expect(adminPage.getByText('Chá de bebê para 40 pessoas')).toBeVisible();
    // `first()` porque o valor aparece no cabeçalho e no quadro de valores: são
    // dois lugares legítimos, e qualquer um deles serve de prova aqui.
    await expect(adminPage.getByText(totalText, { exact: true }).first()).toBeVisible();

    // Quais decisões existem é o servidor que diz, por `allowedTransitions`.
    await adminPage.getByRole('button', { name: 'Confirmar reserva' }).click();

    /*
     * A ação passa por um diálogo de confirmação (§13.4), e o botão de dentro
     * tem o mesmo rótulo do de fora. O clique é feito **dentro** do diálogo de
     * propósito: assim o teste não pode passar clicando duas vezes no botão da
     * página e achando que confirmou.
     */
    const confirmDialog = adminPage.getByRole('dialog', { name: 'Confirmar reserva' });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Confirmar reserva' }).click();

    await expect(adminPage.getByText('Confirmada').first()).toBeVisible();
  } finally {
    await adminContext.close();
  }

  // ----------------------------------------------------------------------
  // 7. O cliente vê a reserva confirmada
  // ----------------------------------------------------------------------
  await page.goto('/minhas-reservas');

  await expect(page.getByRole('heading', { level: 1, name: 'Minhas reservas' })).toBeVisible();
  await expect(page.getByText('Confirmada').first()).toBeVisible();
});
