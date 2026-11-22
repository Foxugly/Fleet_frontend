import { AppOut } from '../../api';

/** Test helper: one inventory app as the API returns it. */
export function appOut(slug = 'poker', extra: Partial<AppOut> = {}): AppOut {
  return {
    slug,
    repos: ['Foxugly/Poker_server', 'Foxugly/Poker_frontend'],
    vhosts: ['poker.foxugly.com'],
    health_path: '/health/',
    sentry_projects: ['poker-backend'],
    python_locks: ['Foxugly/Poker_server:requirements.txt'],
    npm_locks: ['Foxugly/Poker_frontend:package-lock.json'],
    deployed: true,
    actions_allowed: false,
    archived: false,
    archived_at: null,
    created_at: '2026-11-22T10:00:00Z',
    updated_at: '2026-11-22T10:00:00Z',
    ...extra,
  };
}

export const isApps = (r: { url: string; method: string }) => r.url.endsWith('/api/v1/apps/') && r.method === 'GET';
export const isApp = (slug: string, method = 'GET') => (r: { url: string; method: string }) =>
  r.url.endsWith(`/api/v1/apps/${slug}/`) && r.method === method;
