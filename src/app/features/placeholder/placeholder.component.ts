import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

/** Temporary page shared by every route until the real pages land (Tasks 5-9). */
@Component({
  selector: 'app-placeholder',
  standalone: true,
  imports: [TranslocoPipe, PageHeaderComponent],
  template: `<app-page-header [title]="titleKey | transloco" icon="pi-clock" />`,
})
export class PlaceholderComponent {
  protected readonly titleKey: string = inject(ActivatedRoute).snapshot.data['titleKey'];
}
