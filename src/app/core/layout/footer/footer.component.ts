import { Component, ChangeDetectionStrategy } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

const BUILD_VERSION = '0.1.0';

/** Runtime version injected via SSM (window.__FLEET_VERSION), else build-time. */
function resolveVersion(): string {
  const injected = typeof window !== 'undefined' ? window.__FLEET_VERSION : undefined;
  return injected || BUILD_VERSION;
}

/**
 * Fleet-standard footer (STANDARD-frontend-layout.md §Footer): brand · tagline ·
 * spacer · «Version {x}» · © year Foxugly (logo → foxugly.com) · rights (no public pages, so no Privacy link),
 * `·` separators, full-width surface, dark-mode aware.
 */
@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './footer.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './footer.component.scss',
})
export class FooterComponent {
  readonly version = resolveVersion();
  readonly year = new Date().getFullYear();
}
