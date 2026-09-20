import { describe, expect, it } from 'vitest';
import { EVENT_TYPES } from './enums.js';
import { SEEDED_THEME_SLUGS, SUGGESTED_THEMES_BY_EVENT } from './themes.js';

describe('sugestão de estilo por tipo de evento', () => {
  it('cobre todos os tipos de evento', () => {
    for (const eventType of EVENT_TYPES) {
      expect(SUGGESTED_THEMES_BY_EVENT[eventType]).toBeDefined();
    }
  });

  // Slug sugerido que não existe no seed viraria um filtro vazio no passo 2 do
  // wizard, sem erro nenhum aparecer.
  it('só sugere slug que o seed cria', () => {
    for (const [eventType, slugs] of Object.entries(SUGGESTED_THEMES_BY_EVENT)) {
      for (const slug of slugs) {
        expect(SEEDED_THEME_SLUGS, `${eventType} sugere ${slug}`).toContain(slug);
      }
    }
  });

  it('não repete slug dentro do mesmo tipo de evento', () => {
    for (const slugs of Object.values(SUGGESTED_THEMES_BY_EVENT)) {
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it('deixa OTHER sem sugestão, para cair na ordem do admin', () => {
    expect(SUGGESTED_THEMES_BY_EVENT.OTHER).toEqual([]);
  });
});

describe('estilos do seed', () => {
  it('tem os 12 estilos da §15.2, sem repetição', () => {
    expect(SEEDED_THEME_SLUGS).toHaveLength(12);
    expect(new Set(SEEDED_THEME_SLUGS).size).toBe(12);
  });

  it('usa slug em kebab-case sem acento', () => {
    for (const slug of SEEDED_THEME_SLUGS) {
      expect(slug).toMatch(/^[a-z][a-z0-9-]*[a-z0-9]$/);
    }
  });
});
