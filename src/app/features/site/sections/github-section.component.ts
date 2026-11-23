import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TagModule } from '@openng/optimus-ui/tag';

import { AgePipe } from '../../../shared/fleet/age.pipe';
import { GithubData } from '../../../shared/fleet/source-data';
import { isNewer, newestFirst, safeUrl } from '../site-helpers';
import { NewTagComponent } from './new-tag';

type Sev = 'danger' | 'warn' | 'info' | 'secondary';
const severity = (s: string | null): Sev =>
  s === 'critical' || s === 'high'
    ? 'danger'
    : s === 'medium' || s === 'moderate'
      ? 'warn'
      : s === 'low'
        ? 'info'
        : 'secondary';

@Component({
  selector: 'app-github-section',
  imports: [NgTemplateOutlet, TranslocoPipe, TagModule, AgePipe, NewTagComponent],
  styleUrl: './section.scss',
  templateUrl: './github-section.component.html',
})
export class GithubSectionComponent {
  readonly data = input.required<GithubData>();
  readonly since = input<Date | null>(null);

  protected readonly prs = computed(() => newestFirst(this.data().prs, (p) => p.created_at));
  protected readonly issues = computed(() => newestFirst(this.data().issues, (i) => i.created_at));
  protected readonly alerts = computed(() =>
    newestFirst(this.data().dependabot_alerts, (a) => a.created_at),
  );
  protected readonly link = safeUrl;
  protected readonly sev = severity;
  protected isNew(iso: string | null): boolean {
    return isNewer(iso, this.since());
  }
}
