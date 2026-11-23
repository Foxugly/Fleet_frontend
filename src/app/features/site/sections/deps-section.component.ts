import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TagModule } from '@openng/optimus-ui/tag';

import { DepsData } from '../../../shared/fleet/source-data';

@Component({
  selector: 'app-deps-section',
  imports: [TranslocoPipe, TagModule],
  styleUrl: './section.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @let d = data();
    <dl class="facts block">
      <div>
        <dt class="muted">{{ 'site.deps.ecosystem' | transloco }}</dt>
        <dd>{{ d.ecosystem }}</dd>
      </div>
      <div>
        <dt class="muted">{{ 'site.deps.checked' | transloco }}</dt>
        <dd>{{ d.checked }}</dd>
      </div>
    </dl>
    @if (d.outdated.length === 0) {
      <p class="muted">{{ 'site.deps.up_to_date' | transloco }}</p>
    } @else {
      <table class="deps-table">
        <thead>
          <tr>
            <th scope="col">{{ 'site.deps.name' | transloco }}</th>
            <th scope="col">{{ 'site.deps.version' | transloco }}</th>
            <th scope="col">{{ 'site.deps.kind' | transloco }}</th>
          </tr>
        </thead>
        <tbody>
          @for (o of d.outdated; track o.name) {
            <tr>
              <td>{{ o.name }}</td>
              <td>{{ o.current }} → {{ o.latest ?? '?' }}</td>
              <td>
                <p-tag
                  [class]="'kind-' + o.kind"
                  [severity]="
                    o.kind === 'major' ? 'warn' : o.kind === 'unknown' ? 'secondary' : 'info'
                  "
                  [value]="o.kind"
                />
              </td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class DepsSectionComponent {
  readonly data = input.required<DepsData>();
}
