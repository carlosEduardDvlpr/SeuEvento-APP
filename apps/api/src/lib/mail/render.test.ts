import { describe, expect, it } from 'vitest';
import { escapeHtml, renderEmail } from './render.js';
import { verifyEmailTemplate } from './templates.js';

const CONTENT = {
  preheader: 'Falta um clique.',
  heading: 'Confirme seu e-mail',
  paragraphs: ['Primeiro parágrafo.', 'Segundo parágrafo.'],
  action: {
    label: 'Confirmar meu e-mail',
    url: 'https://exemplo.com/verificar-email?token=abc123',
  },
  note: 'Se não foi você, ignore.',
} as const;

describe('escapeHtml', () => {
  it('neutraliza marcação', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapa aspas e ampersand', () => {
    expect(escapeHtml(`Ana & "Bia" d'Ávila`)).toBe('Ana &amp; &quot;Bia&quot; d&#39;Ávila');
  });
});

describe('renderEmail', () => {
  const email = renderEmail('Confirme seu e-mail para acessar sua conta', CONTENT);

  it('monta coluna única de 560 px com CSS inline (§17)', () => {
    expect(email.html).toContain('width="560"');
    expect(email.html).toContain('style=');
    // Folha externa e custom property não funcionam em cliente de e-mail.
    expect(email.html).not.toContain('<link');
    expect(email.html).not.toContain('var(--');
  });

  it('inclui o preheader escondido', () => {
    expect(email.html).toContain('Falta um clique.');
    expect(email.html).toContain('max-height:0');
  });

  it('põe o link no botão e também em texto, como alternativa', () => {
    const occurrences = email.html.split(CONTENT.action.url).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('usa Georgia no título, porque fonte da web não carrega em e-mail', () => {
    expect(email.html).toContain('Georgia');
  });

  describe('versão em texto puro', () => {
    it('existe e carrega o link', () => {
      expect(email.text).toContain(CONTENT.action.url);
      expect(email.text).toContain('Confirme seu e-mail');
    });

    it('não tem marcação nenhuma', () => {
      expect(email.text).not.toMatch(/<[a-z/]/i);
      expect(email.text).not.toContain('&amp;');
      expect(email.text).not.toContain('style=');
    });

    it('separa os parágrafos com linha em branco', () => {
      expect(email.text).toContain('Primeiro parágrafo.\n\nSegundo parágrafo.');
    });
  });

  it('escapa o conteúdo antes de montar o HTML', () => {
    const malicious = renderEmail('Assunto', {
      preheader: 'p',
      heading: 'Olá',
      paragraphs: ['Olá, <img src=x onerror=alert(1)>'],
    });

    expect(malicious.html).not.toContain('<img');
    expect(malicious.html).toContain('&lt;img');
  });

  it('funciona sem ação e sem nota', () => {
    const simple = renderEmail('Assunto', {
      preheader: 'p',
      heading: 'Título',
      paragraphs: ['Só texto.'],
    });

    expect(simple.html).toContain('Só texto.');
    expect(simple.text.trim()).toBe('Título\n\nSó texto.');
  });
});

describe('verifyEmailTemplate', () => {
  const email = verifyEmailTemplate({
    name: 'Ana Beatriz',
    verifyUrl: 'https://exemplo.com/verificar-email?token=abc',
  });

  it('tem assunto específico e sem caixa-alta (§17)', () => {
    expect(email.subject).toBe('Confirme seu e-mail para acessar sua conta');
    expect(email.subject).not.toBe(email.subject.toUpperCase());
  });

  it('cumprimenta sem presumir gênero', () => {
    expect(email.text).toContain('Olá, Ana Beatriz');
    expect(email.text).not.toMatch(/bem-vind[oa]/i);
  });

  it('avisa a validade de 24 horas (§10.2)', () => {
    expect(email.text).toContain('24 horas');
  });

  it('diz o que fazer se não foi a pessoa', () => {
    expect(email.text).toMatch(/ignore/i);
  });
});
