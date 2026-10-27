import { describe, expect, it } from 'vitest';
import { SEEDED_THEME_SLUGS } from './themes.js';

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
