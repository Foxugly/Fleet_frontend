import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';

import { AppOut, AppsService } from '../../api';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { AppFields, FIELD_ORDER, FieldError, FieldKey, ListField, emptyApp, validateApp } from './inventory-model';
import { StepUp } from './step-up';
import { TotpDialogComponent } from './totp-dialog.component';

interface ListFieldDef {
  key: ListField;
  hint: string;
}

/**
 * Create (`/apps/new`) or edit (`/apps/:slug/edit`) one inventory app. The cheap
 * rules of the server run client-side first; « Enregistrer » then asks the TOTP
 * code and sends the write. A refused code or a network failure keeps the dialog
 * open and the form untouched; a 400 closes it and puts each message under its field.
 */
@Component({
  selector: 'app-app-form',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    AutoCompleteModule,
    ButtonModule,
    CheckboxModule,
    InputTextModule,
    MessageModule,
    SkeletonModule,
    EmptyStateComponent,
    PageHeaderComponent,
    TotpDialogComponent,
  ],
  templateUrl: './app-form.component.html',
  styleUrl: './app-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppFormComponent {
  private readonly api = inject(AppsService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly i18n = inject(TranslocoService);
  private readonly fb = inject(FormBuilder);

  /** The slug being edited, or null on /apps/new. */
  protected readonly editSlug: string | null = inject(ActivatedRoute).snapshot.paramMap.get('slug');
  protected readonly loaded = signal(this.editSlug === null);
  protected readonly notFound = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly stepUp = new StepUp();

  protected readonly form = this.fb.nonNullable.group({
    slug: [''],
    repos: [[] as string[]],
    vhosts: [[] as string[]],
    health_path: ['/health/'],
    sentry_projects: [[] as string[]],
    python_locks: [[] as string[]],
    npm_locks: [[] as string[]],
    deployed: [true],
    actions_allowed: [false],
  });

  protected readonly listFields: ListFieldDef[] = [
    { key: 'repos', hint: 'apps.form.repos_hint' },
    { key: 'vhosts', hint: 'apps.form.vhosts_hint' },
    { key: 'sentry_projects', hint: 'apps.form.sentry_hint' },
    { key: 'python_locks', hint: 'apps.form.locks_hint' },
    { key: 'npm_locks', hint: 'apps.form.locks_hint' },
  ];

  private readonly value = signal<AppFields>(emptyApp());
  /** Fields the user changed: their client errors show as they type. */
  private readonly edited = signal<ReadonlySet<FieldKey>>(new Set());
  /** Set by « Enregistrer »: every client error shows. */
  private readonly submitted = signal(false);
  /** Server 400 messages by field (shown verbatim, by interpolation). */
  protected readonly serverErrors = signal<Record<string, string[]>>({});

  private readonly clientErrors = computed(() => validateApp(this.value()));
  protected readonly visibleErrors = computed(() => {
    const all = this.clientErrors();
    const out: Partial<Record<FieldKey, FieldError[]>> = {};
    for (const key of FIELD_ORDER) {
      if (all[key] && (this.submitted() || this.edited().has(key))) out[key] = all[key];
    }
    return out;
  });
  /** Server messages not tied to a form field (e.g. `detail`). */
  protected readonly otherServerErrors = computed(() =>
    Object.entries(this.serverErrors())
      .filter(([k]) => !(FIELD_ORDER as readonly string[]).includes(k))
      .flatMap(([, v]) => v),
  );
  protected readonly showSummary = computed(
    () => (this.submitted() && Object.keys(this.clientErrors()).length > 0) || Object.keys(this.serverErrors()).length > 0,
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    for (const key of FIELD_ORDER) {
      (this.form.controls[key] as AbstractControl).valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
        this.value.set(this.current());
        this.edited.update((s) => new Set(s).add(key));
        this.serverErrors.update((errors) => {
          if (!(key in errors)) return errors;
          const { [key]: _gone, ...rest } = errors;
          return rest;
        });
      });
    }
    if (this.editSlug !== null) this.load(this.editSlug);
  }

  protected errorsOf(key: FieldKey): FieldError[] {
    return this.visibleErrors()[key] ?? [];
  }

  protected serverErrorsOf(key: FieldKey): string[] {
    return this.serverErrors()[key] ?? [];
  }

  protected invalid(key: FieldKey): boolean {
    return this.errorsOf(key).length > 0 || this.serverErrorsOf(key).length > 0;
  }

  /** Ids of the hint and of every error shown under a field (for `aria-describedby`). */
  protected describedBy(key: FieldKey): string {
    const n = this.errorsOf(key).length + this.serverErrorsOf(key).length;
    return [`app-form-${key}-hint`, ...Array.from({ length: n }, (_, i) => `app-form-${key}-error-${i}`)].join(' ');
  }

  /** PrimeNG pass-through to the autocomplete's inner input (it has no describedby input of its own). */
  protected listInputPt(key: FieldKey): Record<string, unknown> {
    return { input: { 'aria-describedby': this.describedBy(key), 'aria-invalid': this.invalid(key) ? 'true' : undefined } };
  }

  protected save(): void {
    this.submitted.set(true);
    this.serverErrors.set({});
    const fields = this.current();
    if (Object.keys(validateApp(fields)).length) return;
    const slug = this.editSlug;
    const { slug: _slug, ...rest } = fields;
    this.stepUp.start({
      subject: this.i18n.translate(slug === null ? 'apps.totp.subject_create' : 'apps.totp.subject_save', { slug: fields.slug }),
      send: (code) =>
        slug === null
          ? this.api.appsCreate({ appCreate: { ...fields, totp_code: code } })
          : this.api.appsUpdate({ slug, appUpdate: { ...rest, totp_code: code } }),
      done: (app: AppOut) => {
        this.messages.add({
          severity: 'success',
          summary: this.i18n.translate(slug === null ? 'apps.toast.created' : 'apps.toast.updated', { slug: app.slug }),
          life: 4000,
        });
        void this.router.navigateByUrl('/apps');
      },
      fields: (errors) => this.serverErrors.set(errors),
    });
  }

  private current(): AppFields {
    const v = this.form.getRawValue();
    const list = (values: string[]) => values.map((s) => s.trim()).filter((s) => s !== '');
    return {
      ...v,
      slug: v.slug.trim(),
      health_path: v.health_path.trim(),
      repos: list(v.repos),
      vhosts: list(v.vhosts),
      sentry_projects: list(v.sentry_projects),
      python_locks: list(v.python_locks),
      npm_locks: list(v.npm_locks),
    };
  }

  private load(slug: string): void {
    this.api.appsRetrieve({ slug }).subscribe({
      next: (app) => {
        const fields: AppFields = {
          slug: app.slug,
          repos: [...app.repos],
          vhosts: [...app.vhosts],
          health_path: app.health_path,
          sentry_projects: [...app.sentry_projects],
          python_locks: [...app.python_locks],
          npm_locks: [...app.npm_locks],
          deployed: app.deployed,
          actions_allowed: app.actions_allowed,
        };
        this.form.setValue(fields, { emitEvent: false });
        this.value.set(this.current());
        this.loaded.set(true);
      },
      error: (err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 404) this.notFound.set(true);
        else this.loadFailed.set(true);
      },
    });
  }
}
