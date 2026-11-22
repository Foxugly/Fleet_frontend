import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CSP readiness', () => {
  it('index.html marks the inline theme script with data-theme-init (nginx adds the nonce)', () => {
    const html = readFileSync('src/index.html', 'utf8');
    expect(html).toMatch(/<script data-theme-init>/);
  });

  it('production build does not inline critical CSS (its onload handler breaks a strict CSP)', () => {
    const cfg = JSON.parse(readFileSync('angular.json', 'utf8'));
    const prod = cfg.projects['fleet-frontend'].architect.build.configurations.production;
    expect(prod.optimization.styles.inlineCritical).toBe(false);
  });
});
