import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TagModule } from '@openng/optimus-ui/tag';

import { HealthData } from '../../../shared/fleet/source-data';

export const TLS_WARN_DAYS = 14;

@Component({
  selector: 'app-health-section',
  imports: [TranslocoPipe, TagModule],
  styleUrl: './section.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @let d = data();
    <dl class="facts">
      <div>
        <dt class="muted">{{ 'site.health.status' | transloco }}</dt>
        <dd>{{ d.status ?? '—' }}</dd>
      </div>
      <div>
        <dt class="muted">{{ 'site.health.latency' | transloco }}</dt>
        <dd>{{ d.latency_ms === null ? '—' : d.latency_ms + ' ms' }}</dd>
      </div>
      <div>
        <dt class="muted">{{ 'site.health.tls' | transloco }}</dt>
        <dd>
          @if (d.tls_days_left === null) {
            —
          } @else {
            {{ 'site.health.tls_days' | transloco: { n: d.tls_days_left } }}
            @if (d.tls_days_left < warnDays) {
              <p-tag
                class="tls-warn"
                severity="danger"
                [value]="'site.health.tls_soon' | transloco"
              />
            }
          }
        </dd>
      </div>
    </dl>
    @if (d.error) {
      <p class="muted">{{ d.error }}</p>
    }
  `,
})
export class HealthSectionComponent {
  readonly data = input.required<HealthData>();
  protected readonly warnDays = TLS_WARN_DAYS;
}
