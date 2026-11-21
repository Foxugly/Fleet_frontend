import type { User } from '../../api';

export type { User };

/** Outcome of the password step: which second-factor page comes next. */
export type LoginStep = { kind: 'verify'; mfaToken: string } | { kind: 'setup'; mfaToken: string };

/** TOTP enrolment payload (`mfa/setup/`), camelCased. `qrSvg` is a `data:` URI. */
export interface MfaSetup {
  otpauthUri: string;
  secret: string;
  qrSvg: string;
}
