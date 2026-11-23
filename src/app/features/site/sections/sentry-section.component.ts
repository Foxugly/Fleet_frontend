import { Component, computed, input, ChangeDetectionStrategy } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TagModule } from '@openng/optimus-ui/tag';

import { AgePipe } from '../../../shared/fleet/age.pipe';
import { SentryData } from '../../../shared/fleet/source-data';
import { isNewer, newestFirst, safeUrl } from '../site-helpers';
import { NewTagComponent } from './new-tag';

@Component({
  selector: 'app-sentry-section',
  imports: [TranslocoPipe, TagModule, AgePipe, NewTagComponent],
  styleUrl: './section.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @let d = data();
    <dl class="facts block">
      <div>
        <dt class="muted">{{ 'site.sentry.unresolved' | transloco }}</dt>
        <dd>{{ d.unresolved }}</dd>
      </div>
      <div>
        <dt class="muted">{{ 'site.sentry.new_24h' | transloco }}</dt>
        <dd>{{ d.new_24h }}</dd>
      </div>
    </dl>
    @if (issues().length === 0) {
      <p class="muted">{{ 'site.sentry.none' | transloco }}</p>
    } @else {
      <ul class="rows">
        @for (i of issues(); track $index) {
          <li class="issue-row">
            @if (link(i.url); as href) {
              <a class="row-title" [href]="href" target="_blank" rel="noopener noreferrer">{{
                i.title ?? '—'
              }}</a>
            } @else {
              <span class="row-title">{{ i.title ?? '—' }}</span>
            }
            @if (isNew(i.first_seen)) {
              <app-new-tag />
            }
            @if (i.level) {
              <p-tag
                [severity]="i.level === 'fatal' || i.level === 'error' ? 'danger' : 'warn'"
                [value]="i.level"
              />
            }
            @if (i.culprit) {
              <span class="muted">{{ i.culprit }}</span>
            }
            <span class="muted">{{ 'site.sentry.events' | transloco: { n: i.count } }}</span>
            <span class="muted">{{ i.last_seen | age }}</span>
          </li>
        }
      </ul>
    }
  `,
})
export class SentrySectionComponent {
  readonly data = input.required<SentryData>();
  readonly since = input<Date | null>(null);
  protected readonly issues = computed(() => newestFirst(this.data().issues, (i) => i.last_seen));
  protected readonly link = safeUrl;
  protected isNew(iso: string | null): boolean {
    return isNewer(iso, this.since());
  }
}
