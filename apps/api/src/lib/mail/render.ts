/**
 * Renderização de e-mail (§17).
 *
 * Sem motor de template: funções TypeScript montando string. Estrutura em tabela
 * de coluna única de 560 px com CSS inline, porque cliente de e-mail ignora
 * folha externa, `flex`, `grid` e custom property.
 *
 * As cores repetem os valores da §14.2 em vez de usar `var(--...)` pelo mesmo
 * motivo: não há como resolver variável de CSS no Outlook.
 */

const COLOR = {
  paper: '#FCFCF9',
  sage: '#E4ECDF',
  forest: '#1F4A38',
  ipe: '#F2B71F',
  ink: '#1D2A24',
  inkSoft: '#5F6B63',
  line: '#DDE3DA',
} as const;

/** Fonte da web não carrega em e-mail (§17): Georgia nos títulos, sistema no corpo. */
const FONT_HEADING = "Georgia, 'Times New Roman', serif";
const FONT_BODY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export type EmailAction = { label: string; url: string };

export type EmailContent = {
  /** Frase de prévia na caixa de entrada. Complementa o assunto, não o repete. */
  preheader: string;
  heading: string;
  paragraphs: readonly string[];
  action?: EmailAction;
  /** Linha final discreta, do tipo "se não foi você, ignore". */
  note?: string;
};

export type Email = {
  subject: string;
  html: string;
  text: string;
};

/**
 * Escapa o que vai para o HTML.
 *
 * O conteúdo carrega dado de usuário (nome, e-mail), e um nome com `<` quebraria
 * a estrutura do e-mail — ou pior, injetaria marcação na caixa de entrada de
 * outra pessoa.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHtml(content: EmailContent): string {
  const paragraphs = content.paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${COLOR.ink};">${escapeHtml(text)}</p>`,
    )
    .join('');

  const action = content.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
              <tr>
                <td style="border-radius:6px;background:${COLOR.ipe};">
                  <a href="${escapeHtml(content.action.url)}" style="display:inline-block;padding:14px 28px;font-family:${FONT_BODY};font-size:16px;font-weight:bold;color:${COLOR.ink};text-decoration:none;">${escapeHtml(content.action.label)}</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${COLOR.inkSoft};">Se o botão não funcionar, copie e cole este endereço no navegador:<br /><span style="word-break:break-all;">${escapeHtml(content.action.url)}</span></p>`
    : '';

  const note = content.note
    ? `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid ${COLOR.line};font-size:14px;line-height:1.55;color:${COLOR.inkSoft};">${escapeHtml(content.note)}</p>`
    : '';

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(content.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLOR.sage};font-family:${FONT_BODY};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLOR.sage};">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:560px;max-width:100%;background:${COLOR.paper};border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:20px 32px;background:${COLOR.forest};">
                <span style="font-family:${FONT_HEADING};font-size:18px;color:${COLOR.paper};">Chácara</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-family:${FONT_HEADING};font-size:24px;line-height:1.2;font-weight:normal;color:${COLOR.forest};">${escapeHtml(content.heading)}</h1>
                ${paragraphs}
                ${action}
                ${note}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Versão em texto puro, obrigatória (§17).
 *
 * Não é um HTML "destaguiado": é escrita a partir do mesmo conteúdo, então nunca
 * carrega marcação sobrando.
 */
function renderText(content: EmailContent): string {
  const blocks: string[] = [content.heading, ...content.paragraphs];

  if (content.action) {
    blocks.push(`${content.action.label}: ${content.action.url}`);
  }
  if (content.note) {
    blocks.push(content.note);
  }

  // Linha em branco entre blocos: em texto puro é a única separação que existe.
  return `${blocks.join('\n\n')}\n`;
}

export function renderEmail(subject: string, content: EmailContent): Email {
  return { subject, html: renderHtml(content), text: renderText(content) };
}
