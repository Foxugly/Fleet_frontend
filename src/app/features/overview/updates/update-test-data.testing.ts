import { ProgressEnum, UpdateGroup } from '../../../api';

/** Test helper: a minor python group across two sites, overridable field by field. */
export function group(over: Partial<UpdateGroup> = {}): UpdateGroup {
  const g: UpdateGroup = {
    ecosystem: 'python',
    package: 'django',
    latest: '6.1.2',
    kind: 'minor',
    members: [
      { site: 'billing', repo: 'Foxugly/billing_server', lock: 'Foxugly/billing_server:requirements.txt', current: '6.0.1' },
      { site: 'poker', repo: 'Foxugly/Poker_server', lock: 'Foxugly/Poker_server:requirements.txt', current: '5.2' },
    ],
    security: null,
    branch: 'deps/django-6.1.2',
    prs: [],
    progress: ProgressEnum.None,
    blocked: null,
    ...over,
  };
  // Like the API: the branch follows the package and target unless a test overrides it.
  return 'branch' in over ? g : { ...g, branch: `deps/${g.package}-${g.latest ?? 'security'}` };
}
