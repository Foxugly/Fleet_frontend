import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TagModule } from '@openng/optimus-ui/tag';

/** The « nouveau » marker shown next to items newer than the previous visit. */
@Component({
  selector: 'app-new-tag',
  imports: [TranslocoPipe, TagModule],
  template: `<p-tag class="tag-new" severity="info" [value]="'site.new' | transloco" />`,
})
export class NewTagComponent {}
