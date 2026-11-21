import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { runtimeConfig } from './app/core/runtime-config';
import { initSentry } from './app/core/sentry';

// Before bootstrap so startup errors are reported; no-op without an injected DSN.
initSentry(runtimeConfig().sentry);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
