import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN } from '../support/env.js';
import { SCREEN_CLIENT, seedScreens } from '../support/screens-data.js';

/**
 * Captura de todas as telas em 375 px, para a revisão responsiva (T30).
 *
 * **Não afirma nada sobre estética.** O que ela faz é abrir cada rota do mapa da
 * §12.1 na largura de um celular, fotografar e **medir transbordo horizontal**.
 * A medida é o que transforma "olhar quarenta imagens" numa lista curta: se o
 * documento fica mais largo que a janela, existe algo empurrando a página para o
 * lado, e isso é defeito, não gosto. As fotos servem para julgar o resto —
 * densidade, texto cortado, hierarquia — que nenhuma medida resolve.
 *
 * A única asserção do arquivo é no fim: nenhuma tela deve transbordar. Assim a
 * ferramenta também serve de rede quando alguém mexer em layout.
 */

const VIEWPORT_WIDTH = 375;
const OUT_DIR = path.join(process.cwd(), '.artifacts', 'telas');

type Finding = { screen: string; scrollWidth: number; culprits: string[] };

const findings: Finding[] = [];

async function capture(
  page: Page,
  name: string,
  /**
   * Diálogo é fotografado só pela janela visível.
   *
   * `fullPage` com um `<dialog>` aberto produz artefato: o navegador costura a
   * foto rolando a página, e o conteúdo do diálogo — que tem rolagem própria e
   * fica fixo na janela — aparece sobreposto a si mesmo. Dá a impressão de um
   * defeito de layout que não existe.
   */
  { fullPage = true }: { fullPage?: boolean } = {},
): Promise<void> {
  // Fontes e imagens precisam ter assentado, senão a foto pega meio layout.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);

  const measured = await page.evaluate((limit) => {
    /*
     * Elemento largo **dentro** de um contêiner de rolagem não é defeito: é o
     * caso da tabela do painel, que rola de propósito. Sem este filtro o
     * relatório aponta a tabela em toda tela e esconde a causa de verdade.
     */
    function insideScroller(element: Element): boolean {
      let parent = element.parentElement;

      while (parent && parent !== document.body) {
        if (getComputedStyle(parent).overflowX !== 'visible') return true;
        parent = parent.parentElement;
      }

      return false;
    }

    const found: string[] = [];

    // `Array.from` porque o `lib` deste pacote não traz o iterador de NodeList.
    for (const element of Array.from(document.querySelectorAll('body *'))) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.right <= limit + 1) continue;
      if (insideScroller(element)) continue;

      const classes = typeof element.className === 'string' ? element.className.split(' ')[0] : '';

      found.push(
        `${element.tagName.toLowerCase()}.${classes} w=${Math.round(box.width)} right=${Math.round(box.right)}`,
      );
    }

    return {
      scrollWidth: document.documentElement.scrollWidth,
      // Os primeiros da árvore são os contêineres; a causa costuma estar neles.
      culprits: found.slice(0, 6),
    };
  }, VIEWPORT_WIDTH);

  /*
   * A comparação é com a largura **fixa** da janela, não com `window.innerWidth`.
   * Com `isMobile`, o Chromium estica o viewport de layout para acomodar o que
   * transborda, então `innerWidth` cresce junto com `scrollWidth` e a condição
   * nunca dispararia — foi assim que uma versão desta ferramenta deu "nenhuma
   * tela transbordou" com quatro telas transbordando.
   */
  if (measured.scrollWidth > VIEWPORT_WIDTH) {
    findings.push({
      screen: name,
      scrollWidth: measured.scrollWidth,
      culprits:
        measured.culprits.length > 0
          ? measured.culprits
          : ['(nada fora de contêiner de rolagem: suspeite de elemento posicionado escapando)'],
    });
  }

  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage });
}

/** Atalho para as capturas de diálogo, que são sempre pela janela. */
function captureDialog(page: Page, name: string): Promise<void> {
  return capture(page, name, { fullPage: false });
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: 'Reservas' })).toBeVisible();
}

/** Abre o primeiro botão de criação da tela, que é onde vive o formulário. */
async function openCreateDialog(page: Page, name: string): Promise<void> {
  const trigger = page.getByRole('button', { name: /^(Nov[oa]|Adicionar)\b/ }).first();

  if ((await trigger.count()) === 0 || !(await trigger.isEnabled())) return;

  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await captureDialog(page, name);
  await page.keyboard.press('Escape');
}

test('fotografa todas as telas em 375 px', async ({ page, browser }) => {
  await mkdir(OUT_DIR, { recursive: true });

  const seeded = await seedScreens();

  // -----------------------------------------------------------------
  // Público, sem sessão
  // -----------------------------------------------------------------
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await capture(page, '01-landing');

  await page.goto('/reservar');
  await expect(page.getByRole('heading', { name: 'Quando é a festa?' })).toBeVisible();
  await capture(page, '02-wizard-datas');

  // Avança o wizard para fotografar os passos de itens e de revisão.
  await page.locator('[data-day] button:not([disabled])').first().click();
  await page
    .getByRole('group', { name: 'Que festa é?' })
    .getByText('Chá de bebê', { exact: true })
    .click();
  await page.getByLabel('Número de convidados').fill('60');
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByRole('heading', { name: 'Escolha o estilo da festa' })).toBeVisible();
  await capture(page, '03-wizard-itens');

  await page.getByRole('button', { name: 'Aumentar Painel de nuvens' }).click();
  await page.getByRole('button', { name: 'Aumentar Arco de balões pastel' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByRole('heading', { name: 'Confira seu pedido' })).toBeVisible();
  await capture(page, '04-wizard-revisao');

  for (const [name, route, marker] of [
    ['05-entrar', '/entrar', 'Entrar'],
    ['06-cadastro', '/cadastro', 'Criar conta'],
    ['07-esqueci-senha', '/esqueci-senha', 'Esqueci minha senha'],
    ['08-redefinir-senha', '/redefinir-senha?token=exemplo-de-token', 'Escolha uma senha nova'],
    ['09-verificar-email', '/verificar-email', 'Link incompleto'],
    ['10-termos', '/termos', 'Termos de uso'],
    ['11-privacidade', '/privacidade', 'Política de privacidade'],
    ['12-nao-encontrada', '/pagina-que-nao-existe', 'Não encontramos esta página'],
  ] as const) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1, name: marker })).toBeVisible();
    await capture(page, name);
  }

  // -----------------------------------------------------------------
  // Cliente
  // -----------------------------------------------------------------
  await signIn(page, SCREEN_CLIENT.email, SCREEN_CLIENT.password);

  await page.goto('/minhas-reservas');
  await expect(page.getByRole('heading', { level: 1, name: 'Minhas reservas' })).toBeVisible();
  await capture(page, '13-minhas-reservas');

  await page.goto(`/reservas/${seeded.confirmedBookingId}`);
  await expect(page.getByText('Confirmada').first()).toBeVisible();
  await capture(page, '14-reserva-confirmada');

  await page.goto(`/reservas/${seeded.pendingBookingId}`);
  await expect(page.getByText('Aguardando confirmação').first()).toBeVisible();
  await capture(page, '15-reserva-pendente');

  const cancelTrigger = page.getByRole('button', { name: /Cancelar/ }).first();
  if (await cancelTrigger.count()) {
    await cancelTrigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await captureDialog(page, '16-reserva-cancelar-dialogo');
    await page.keyboard.press('Escape');
  }

  // -----------------------------------------------------------------
  // Painel, em sessão separada
  // -----------------------------------------------------------------
  const adminContext = await browser.newContext({
    viewport: { width: VIEWPORT_WIDTH, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });

  const adminPage = await adminContext.newPage();

  try {
    await signIn(adminPage, ADMIN.email, ADMIN.password);

    await adminPage.goto('/admin');
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible();
    await capture(adminPage, '17-admin-visao-geral');

    // A gaveta de navegação é o controle mais usado do painel no celular.
    await adminPage.getByRole('button', { name: 'Menu' }).click();
    await expect(adminPage.getByRole('link', { name: 'Configurações' })).toBeVisible();
    await capture(adminPage, '18-admin-menu-aberto');
    await adminPage.keyboard.press('Escape');

    await adminPage.goto('/admin/calendario');
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible();
    await capture(adminPage, '19-admin-calendario');

    await adminPage.locator('td button').first().click();
    await expect(adminPage.getByRole('dialog')).toBeVisible();
    await captureDialog(adminPage, '20-admin-calendario-dia');
    await adminPage.keyboard.press('Escape');

    await adminPage.goto('/admin/reservas');
    await expect(adminPage.getByRole('heading', { level: 1, name: 'Reservas' })).toBeVisible();
    await capture(adminPage, '21-admin-reservas');

    await adminPage.goto(`/admin/reservas/${seeded.confirmedBookingId}`);
    // `exact` porque a mesma tela tem "O que o cliente escreveu".
    await expect(adminPage.getByRole('heading', { name: 'Cliente', exact: true })).toBeVisible();
    await capture(adminPage, '22-admin-reserva-detalhe');

    const statusAction = adminPage.getByRole('button', { name: /^(Confirmar|Marcar)/ }).first();
    if (await statusAction.count()) {
      await statusAction.click();
      await expect(adminPage.getByRole('dialog')).toBeVisible();
      await captureDialog(adminPage, '23-admin-reserva-dialogo');
      await adminPage.keyboard.press('Escape');
    }

    await adminPage.goto('/admin/reservas/nova');
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible();
    await capture(adminPage, '24-admin-reserva-nova');

    for (const [index, [name, route]] of (
      [
        ['itens', '/admin/itens'],
        ['categorias', '/admin/categorias'],
        ['combos', '/admin/combos'],
        ['temas', '/admin/temas'],
        ['precos', '/admin/precos'],
        ['galeria', '/admin/galeria'],
        ['clientes', '/admin/clientes'],
      ] as const
    ).entries()) {
      const listOrder = String(25 + index * 2).padStart(2, '0');
      const dialogOrder = String(26 + index * 2).padStart(2, '0');

      await adminPage.goto(route);
      await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible();
      await capture(adminPage, `${listOrder}-admin-${name}`);

      await openCreateDialog(adminPage, `${dialogOrder}-admin-${name}-dialogo`);
    }

    await adminPage.goto(`/admin/clientes/${seeded.clientId}`);
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible();
    await capture(adminPage, '39-admin-cliente-detalhe');

    await adminPage.goto('/admin/configuracoes');
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible();
    await capture(adminPage, '40-admin-configuracoes');
  } finally {
    await adminContext.close();
  }

  // -----------------------------------------------------------------
  // Relatório
  // -----------------------------------------------------------------
  const report = findings
    .map((finding) =>
      [
        `${finding.screen}: scrollWidth=${finding.scrollWidth} (limite ${VIEWPORT_WIDTH})`,
        ...finding.culprits.map((culprit) => `    ${culprit}`),
      ].join('\n'),
    )
    .join('\n\n');

  await writeFile(
    path.join(OUT_DIR, 'transbordo.txt'),
    report || 'Nenhuma tela transbordou.\n',
    'utf8',
  );

  if (findings.length > 0) {
    console.log(`\n=== transbordo horizontal em ${findings.length} tela(s) ===\n${report}\n`);
  }

  // A rede: tela que empurra a página para o lado é defeito, não gosto.
  expect(findings.map((finding) => finding.screen)).toEqual([]);
});
