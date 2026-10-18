import type { PublicVenue } from '@chacara/shared';
import { describe, expect, it } from 'vitest';
import { descriptionFor, documentTitle, seoForPath } from './routes';

const VENUE: PublicVenue = {
  name: 'Chácara Seu Evento',
  maxGuests: 120,
  checkInTime: '08:00',
  checkOutTime: '22:00',
  whatsapp: '11988887777',
  address: 'Estrada do Sol, 100',
  mapsUrl: 'https://maps.exemplo.com/chacara',
  houseRules: 'Som até 22h.',
  minDays: 1,
  maxDays: 3,
  minLeadDays: 2,
  freeCancelUntilDays: 7,
  holdHours: 48,
};

describe('seoForPath', () => {
  it('indexa só a landing, os termos e a privacidade', () => {
    expect(seoForPath('/').indexable).toBe(true);
    expect(seoForPath('/termos').indexable).toBe(true);
    expect(seoForPath('/privacidade').indexable).toBe(true);
  });

  /*
   * O wizard é a página que mais chama atenção da lista: ela é pública, então
   * seria indexada por padrão. Mas a URL sem o rascunho na sessão não mostra
   * nada de útil, e indexá-la gastaria rastreamento numa página que não responde
   * a busca nenhuma (§18.3, camada 4).
   */
  it.each([
    '/reservar',
    '/entrar',
    '/cadastro',
    '/verificar-email',
    '/esqueci-senha',
    '/redefinir-senha',
    '/minhas-reservas',
  ])('mantém %s fora do índice', (path) => {
    expect(seoForPath(path).indexable).toBe(false);
  });

  it('resolve rota com parâmetro pelo início do caminho', () => {
    const seo = seoForPath('/reservas/8f1c2d3e-0000-4000-8000-000000000000');

    expect(seo.title).toBe('Reserva');
    expect(seo.indexable).toBe(false);
  });

  it.each(['/admin', '/admin/reservas', '/admin/reservas/abc', '/admin/configuracoes'])(
    'mantém o painel fora do índice em %s',
    (path) => {
      const seo = seoForPath(path);

      expect(seo.title).toBe('Painel');
      expect(seo.indexable).toBe(false);
    },
  );

  /*
   * O servidor responde 200 com o `index.html` em qualquer caminho, porque é um
   * SPA. Sem o `noindex` do 404, endereço inventado entraria no índice como
   * página válida.
   */
  it('trata caminho desconhecido como 404 fora do índice', () => {
    const seo = seoForPath('/promocao-de-verao');

    expect(seo.title).toBe('Página não encontrada');
    expect(seo.indexable).toBe(false);
  });

  it('ignora a barra final', () => {
    expect(seoForPath('/termos/')).toEqual(seoForPath('/termos'));
    expect(seoForPath('/')).toEqual(seoForPath(''));
  });

  // Guarda contra rota nova entrar na §12.1 e ficar sem SEO: o 404 denuncia.
  it('conhece todas as rotas da §12.1', () => {
    const paths = [
      '/',
      '/reservar',
      '/entrar',
      '/cadastro',
      '/verificar-email',
      '/esqueci-senha',
      '/redefinir-senha',
      '/minhas-reservas',
      '/reservas/qualquer-id',
      '/termos',
      '/privacidade',
      '/admin',
      '/admin/calendario',
      '/admin/reservas',
      '/admin/itens',
      '/admin/combos',
      '/admin/temas',
      '/admin/precos',
      '/admin/galeria',
      '/admin/clientes',
      '/admin/configuracoes',
    ];

    const orphans = paths.filter((path) => seoForPath(path).title === 'Página não encontrada');

    expect(orphans).toEqual([]);
  });
});

describe('documentTitle', () => {
  it('põe o nome da chácara na frente na landing', () => {
    expect(documentTitle(seoForPath('/'), VENUE.name)).toBe(
      'Chácara Seu Evento — chácara para festas e decoração pegue e monte',
    );
  });

  it('põe o assunto na frente nas outras páginas', () => {
    expect(documentTitle(seoForPath('/minhas-reservas'), VENUE.name)).toBe(
      'Minhas reservas · Chácara Seu Evento',
    );
  });

  // Antes de a API responder não há nome; o título não pode sair com buraco.
  it('usa um nome genérico enquanto a chácara não carregou', () => {
    expect(documentTitle(seoForPath('/entrar'), null)).toBe('Entrar · Chácara');
    expect(documentTitle(seoForPath('/entrar'), '   ')).toBe('Entrar · Chácara');
  });
});

describe('descriptionFor', () => {
  it('usa nome e capacidade reais na landing', () => {
    const description = descriptionFor(seoForPath('/'), VENUE);

    expect(description).toContain('Chácara Seu Evento');
    expect(description).toContain('até 120 pessoas');
  });

  it('cai na frase do index.html quando a chácara não carregou', () => {
    const route = seoForPath('/');

    expect(descriptionFor(route, undefined)).toBe(route.description);
  });

  it('não mexe na descrição das outras páginas', () => {
    const route = seoForPath('/termos');

    expect(descriptionFor(route, VENUE)).toBe(route.description);
  });

  // Google corta a descrição por volta de 160 caracteres.
  it('mantém a descrição da landing curta', () => {
    expect(descriptionFor(seoForPath('/'), VENUE).length).toBeLessThanOrEqual(160);
  });
});
