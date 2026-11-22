import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/**
 * deploy/ and .github/workflows/deploy.yml: the files the box and the deploy run.
 *
 * Structure is read with node:fs (like the i18n parity spec). Behaviour tests run
 * the workflow's shell steps and the runtime-fetch script in bash, with the
 * outside world (aws, curl, git, nginx, systemctl, install) stubbed on PATH, the
 * way Fleet_server's tests/test_workflows.py does. They skip when bash or python3
 * is absent.
 */

const ROOT = process.cwd();
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf-8');

const VHOST_PATH = 'deploy/nginx/fleet.foxugly.com';
const FETCH_PATH = 'deploy/fetch-frontend-runtime-from-ssm.sh';
const UNIT_PATH = 'deploy/systemd/fleet-app-frontend-runtime-fetch.service';
const DEPLOY_PATH = '.github/workflows/deploy.yml';
const CI_PATH = '.github/workflows/ci.yml';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const SLOW = 60_000;

type Json = Record<string, any>;
const loadYaml = (path: string): Json => load(read(path)) as Json;
const deployJob = (): Json => loadYaml(DEPLOY_PATH)['jobs']['deploy'];
function step(id: string): Json {
  const found = (deployJob()['steps'] as Json[]).find((s) => s['id'] === id);
  if (!found) throw new Error(`no step with id ${id}`);
  return found;
}

// ---------------------------------------------------------------------------
// nginx vhost
// ---------------------------------------------------------------------------

/** Top-level `location ... { }` blocks of the TLS server, by brace matching. */
function locations(conf: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /^\s*location\s+([^{]+)\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(conf))) {
    let depth = 1;
    let i = re.lastIndex;
    while (depth > 0 && i < conf.length) {
      if (conf[i] === '{') depth++;
      if (conf[i] === '}') depth--;
      i++;
    }
    out.set(m[1].trim(), conf.slice(re.lastIndex, i - 1));
  }
  return out;
}

/** Server-level text of the 443 server: its body minus the location blocks. */
function serverLevel(conf: string): string {
  const start = conf.indexOf('listen 443');
  let body = conf.slice(start);
  for (const block of locations(conf).values()) body = body.replace(block, '');
  return body;
}

const SECURITY_HEADERS = [
  'add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;',
  'add_header X-Content-Type-Options    "nosniff" always;',
  'add_header X-Frame-Options           "DENY" always;',
  'add_header Referrer-Policy           "strict-origin-when-cross-origin" always;',
  'add_header Permissions-Policy        "geolocation=(), microphone=(), camera=()" always;',
];

describe('nginx vhost fleet.foxugly.com', () => {
  const conf = read(VHOST_PATH);
  const locs = locations(conf);
  const index = locs.get('= /index.html') ?? '';
  const csp = /add_header Content-Security-Policy "([^"]*)" always;/.exec(index)?.[1] ?? '';

  it('serves the bundle from /srv/fleet/Fleet_frontend (D1)', () => {
    expect(conf).toContain('root /srv/fleet/Fleet_frontend/dist/fleet-frontend/browser;');
    expect(conf).not.toMatch(/django|\/var\/www/);
  });

  it('answers fleet.foxugly.com over the shared wildcard cert, port 80 redirects', () => {
    expect(conf.match(/server_name fleet\.foxugly\.com;/g)?.length).toBe(2);
    expect(conf).toContain('listen 443 ssl http2;');
    expect(conf).toContain('return 301 https://$host$request_uri;');
    expect(conf).toContain('ssl_certificate     /etc/letsencrypt/live/foxugly.com/fullchain.pem;');
    expect(conf).toContain('ssl_certificate_key /etc/letsencrypt/live/foxugly.com/privkey.pem;');
  });

  it('enforces the nonce CSP on index.html, API + Sentry ingest only, no eval', () => {
    expect(csp).toContain("script-src 'self' 'nonce-$request_id';");
    expect(csp).toContain("connect-src 'self' https://fleet-api.foxugly.com https://*.ingest.de.sentry.io;");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/wss:|cloudflare|turnstile/i);
    expect(csp.endsWith('$fleet_csp_report')).toBe(true);
    expect(conf).not.toContain('Content-Security-Policy-Report-Only');
  });

  it('gives the anti-FOUC script the nonce, matching the built attribute form', () => {
    expect(index).toContain(`sub_filter '<script data-theme-init="">' '<script nonce="$request_id">';`);
  });

  it('injects window.__FLEET__ and the version before </head>', () => {
    expect(index).toContain(
      `sub_filter '</head>' '<script nonce="$request_id">` +
        'window.__FLEET__={apiBaseUrl:"$fleet_api_base",sentry:{dsn:"$fleet_sentry_dsn",' +
        'environment:"$fleet_sentry_env",release:"$fleet_sentry_release"}};' +
        `window.__FLEET_VERSION="$fleet_version";</script></head>';`,
    );
    // Each pattern is replaced once: two different patterns, two substitutions.
    expect(index).toContain('sub_filter_once on;');
  });

  it('defaults every $fleet_* variable, then includes the runtime snippets', () => {
    const server = serverLevel(conf);
    for (const v of ['api_base', 'sentry_dsn', 'sentry_release', 'csp_report', 'version']) {
      expect(server).toMatch(new RegExp(`set \\$fleet_${v}\\s+"";`));
    }
    expect(server).toMatch(/set \$fleet_sentry_env\s+"production";/);
    expect(server).toContain('include /etc/nginx/snippets/fleet-frontend-runtime*.conf;');
    expect(server.indexOf('include /etc/nginx/snippets')).toBeGreaterThan(server.indexOf('set $fleet_version'));
  });

  it('repeats the 5 security headers in every block that sets a header', () => {
    const blocks = [['server', serverLevel(conf)] as const, ...locs.entries()];
    let withHeaders = 0;
    for (const [name, body] of blocks) {
      if (!body.includes('add_header')) continue;
      withHeaders++;
      for (const header of SECURITY_HEADERS) expect(body, `${name}: ${header}`).toContain(header);
    }
    expect(withHeaders).toBeGreaterThanOrEqual(4);
  });

  it('never caches index.html, revalidates i18n, caches hashed assets forever', () => {
    expect(index).toContain('add_header Cache-Control             "no-store, no-cache, must-revalidate" always;');
    const i18n = locs.get('~* ^/i18n/.+\\.json$') ?? '';
    expect(i18n).toContain('add_header Cache-Control "no-cache" always;');
    const assets = [...locs.entries()].find(([k]) => k.includes('js|css'))?.[1] ?? '';
    // No `always`: a 404 for a missing chunk must not be cached immutable for a year.
    expect(assets).toContain('add_header Cache-Control "public, max-age=31536000, immutable";');
    expect(assets).not.toMatch(/immutable" always|expires/);
    expect(locs.get('/')).toContain('try_files $uri /index.html;');
  });
});

// ---------------------------------------------------------------------------
// runtime fetch: script and unit
// ---------------------------------------------------------------------------

describe('runtime fetch script and unit', () => {
  const script = read(FETCH_PATH);
  const unit = read(UNIT_PATH);

  it('reads /fleet-frontend/prod and writes the fleet-frontend runtime snippet', () => {
    expect(script.startsWith('#!/usr/bin/env bash\n')).toBe(true);
    expect(script).toContain('set -euo pipefail');
    expect(script).toContain('SSM_PREFIX="${FLEET_FRONTEND_SSM_PREFIX:-/fleet-frontend/prod}"');
    expect(script).toContain('/etc/nginx/snippets/fleet-frontend-runtime.conf');
    for (const v of ['api_base', 'sentry_dsn', 'sentry_env', 'sentry_release', 'csp_report']) {
      expect(script).toContain(`set $fleet_${v}`);
    }
    expect(script).not.toMatch(/facilitation|turnstile|django/i);
  });

  it('refuses the characters that would escape the nginx or JS string', () => {
    const guard = /FORBIDDEN = re\.compile\(r'(.*)'\)/.exec(script)?.[1] ?? '';
    for (const ch of ['"', '\\\\', '$', ';', "\\'", '\\r', '\\n', '<', '>']) expect(guard).toContain(ch);
  });

  it('checks nginx -t before the reload and writes only on change', () => {
    expect(script).toContain('cmp -s "$TMP_FILE" "$OUT_FILE"');
    expect(script.indexOf('nginx -t')).toBeLessThan(script.indexOf('systemctl reload nginx'));
  });

  it('is a hardened root oneshot that runs the script from /usr/local/sbin', () => {
    for (const line of [
      'Type=oneshot',
      'RemainAfterExit=yes',
      'User=root',
      'UMask=0027',
      'Environment=AWS_SHARED_CREDENTIALS_FILE=/dev/null',
      'Environment=AWS_CONFIG_FILE=/dev/null',
      'Environment=AWS_REGION=eu-west-1',
      'PrivateTmp=yes',
      'ProtectSystem=full',
      'ReadWritePaths=/etc/nginx/snippets',
      'ProtectHome=yes',
      'ProtectKernelTunables=yes',
      'ProtectControlGroups=yes',
      'NoNewPrivileges=yes',
      'RestrictSUIDSGID=yes',
      'ExecStart=/usr/local/sbin/fleet-app-frontend-runtime-fetch.sh',
      'WantedBy=multi-user.target',
    ]) {
      expect(unit.split('\n')).toContain(line);
    }
    expect(unit).not.toContain('ProtectSystem=strict');
  });

  it('keeps the deploy files LF on Windows checkouts', () => {
    const attrs = read('.gitattributes');
    expect(attrs).toMatch(/^\*\.sh\s+text eol=lf$/m);
    expect(attrs).toMatch(/^\*\.service\s+text eol=lf$/m);
    expect(attrs).toMatch(/^deploy\/nginx\/\*\s+text eol=lf$/m);
  });
});

// ---------------------------------------------------------------------------
// workflows: structure
// ---------------------------------------------------------------------------

describe('deploy.yml and ci.yml structure', () => {
  it('deploys on a push to main or by hand, never on a pull request', () => {
    const wf = loadYaml(DEPLOY_PATH);
    expect(wf['on']['push']).toEqual({ branches: ['main'] });
    expect('workflow_dispatch' in wf['on']).toBe(true);
    expect('pull_request' in wf['on']).toBe(false);
    expect(wf['permissions']).toEqual({});
  });

  it('runs every step under bash with pipefail', () => {
    expect(loadYaml(DEPLOY_PATH)['defaults']).toEqual({ run: { shell: 'bash' } });
    for (const s of deployJob()['steps'] as Json[]) expect(s['shell'], s['name']).toBeUndefined();
  });

  it('reuses ci.yml, then deploys main to the production environment over OIDC', () => {
    const jobs = loadYaml(DEPLOY_PATH)['jobs'];
    expect(jobs['ci']).toEqual({ uses: './.github/workflows/ci.yml', permissions: { contents: 'read' } });
    const job = jobs['deploy'];
    expect(job['needs']).toBe('ci');
    expect(job['if']).toBe("github.ref == 'refs/heads/main'");
    expect(job['environment']).toBe('production');
    expect(job['permissions']).toEqual({ 'id-token': 'write', contents: 'read' });
    expect(job['concurrency']).toEqual({ group: 'deploy-fleet-frontend', 'cancel-in-progress': false });
  });

  it.each([DEPLOY_PATH, CI_PATH])('%s pins every action to a full SHA', (path) => {
    const uses = [...read(path).matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses.filter((u) => !u.startsWith('./'))) {
      expect(ref).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/);
    }
  });

  it('ci.yml is reusable and still runs on pull requests, without a push trigger', () => {
    const wf = loadYaml(CI_PATH);
    expect('workflow_call' in wf['on']).toBe(true);
    expect('pull_request' in wf['on']).toBe(true);
    expect('push' in wf['on']).toBe(false);
    expect(Object.keys(wf['jobs'])).toContain('test');
    expect(wf['concurrency']['cancel-in-progress']).toBe("${{ github.event_name == 'pull_request' }}");
  });

  it('conditions every step after the head guard on it', () => {
    const steps = deployJob()['steps'] as Json[];
    const at = steps.findIndex((s) => s['id'] === 'head');
    expect(at).toBeGreaterThan(-1);
    expect(steps.length).toBeGreaterThan(at + 1);
    for (const s of steps.slice(at + 1)) expect(s['if'], s['name']).toBe("steps.head.outputs.current == 'true'");
  });

  it('takes GitHub values through env, never ${{ }} inside a run script', () => {
    for (const s of deployJob()['steps'] as Json[]) {
      if (s['run']) expect(s['run'], s['name']).not.toContain('${{');
    }
    expect(step('ssm')['env']['INSTANCE_ID']).toBe('${{ secrets.EC2_INSTANCE_ID }}');
    expect(step('wait')['env']['CMD_ID']).toBe('${{ steps.ssm.outputs.cmd_id }}');
  });

  it('assumes the environment role in eu-west-1', () => {
    const oidc = (deployJob()['steps'] as Json[]).find((s) => String(s['uses']).includes('configure-aws-credentials'));
    expect(oidc?.['with']['role-to-assume']).toBe('${{ secrets.AWS_DEPLOY_ROLE_ARN }}');
    expect(oidc?.['with']['aws-region']).toBe('eu-west-1');
  });

  it('waits longer than the SSM execution timeout', () => {
    const run = step('wait')['run'] as string;
    const tries = Number(/seq 1 (\d+)/.exec(run)?.[1]);
    const pause = Number(/sleep (\d+)/.exec(run)?.[1]);
    const timeout = Number(/"executionTimeout": \["(\d+)"\]/.exec(step('ssm')['run'])?.[1]);
    expect(timeout).toBeGreaterThan(0);
    expect(tries * pause).toBeGreaterThanOrEqual(timeout + 60);
  });
});

// ---------------------------------------------------------------------------
// behaviour: shell steps in bash, outside world stubbed
// ---------------------------------------------------------------------------

function findBash(): string | null {
  const candidates =
    process.platform === 'win32'
      ? [process.env['FLEET_TEST_BASH'], 'C:/Program Files/Git/bin/bash.exe', 'C:/Program Files/Git/usr/bin/bash.exe']
      : [process.env['FLEET_TEST_BASH'], 'bash'];
  for (const c of candidates) {
    if (!c) continue;
    if (process.platform === 'win32' && !existsSync(c)) continue;
    if (spawnSync(c, ['-c', 'echo ok'], { encoding: 'utf-8' }).stdout?.trim() === 'ok') return c;
  }
  return null;
}

const BASH = findBash();
const bashRun = (script: string, args: string[] = [], env: NodeJS.ProcessEnv = process.env) =>
  spawnSync(BASH as string, ['--noprofile', '--norc', '-c', script, '_', ...args], { encoding: 'utf-8', env });
const HAS_PYTHON = BASH !== null && bashRun('python3 -c "print(1)"').stdout?.trim() === '1';
const withBash = BASH ? it : it.skip;
const withPython = HAS_PYTHON ? it : it.skip;
// publish-bundle.sh needs rsync (absent from Git Bash; present on the ubuntu runner and the box).
const HAS_RSYNC = BASH !== null && bashRun('command -v rsync').status === 0;
const withRsync = HAS_RSYNC ? it : it.skip;

/** POSIX form of a native path, for bash (cygpath under Git Bash). */
function posix(p: string): string {
  return bashRun('if command -v cygpath >/dev/null 2>&1; then cygpath -u "$1"; else printf "%s" "$1"; fi', [
    p,
  ]).stdout.trim();
}

function stub(dir: string, name: string, body: string): void {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`, 'utf-8');
  chmodSync(path, 0o755);
}

interface Sandbox {
  tmp: string;
  stubs: string;
  runner: string;
}

function sandbox(): Sandbox {
  const tmp = mkdtempSync(join(tmpdir(), 'fleet-deploy-'));
  const stubs = join(tmp, 'stubs');
  const runner = join(tmp, 'runner');
  mkdirSync(runner);
  stub(stubs, 'sleep', ':');
  return { tmp, stubs, runner };
}

/** Bash flags GitHub uses for a run step: `shell: bash` = pipefail, none = `bash -e`. */
function githubFlags(): string[] {
  const wf = loadYaml(DEPLOY_PATH);
  return wf['defaults']?.['run']?.['shell'] === 'bash' ? ['--noprofile', '--norc', '-eo', 'pipefail'] : ['-e'];
}

function runStep(
  sb: Sandbox,
  stepId: string,
  env: Record<string, string> = {},
  opts: { run?: string; flags?: string[]; cwd?: string } = {},
): { code: number; out: string; outputs: Record<string, string> } {
  const script = join(sb.tmp, `${stepId}.sh`);
  writeFileSync(script, opts.run ?? (step(stepId)['run'] as string), 'utf-8');
  const ghOut = join(sb.tmp, 'github_output');
  const ghEnv = join(sb.tmp, 'github_env');
  writeFileSync(ghOut, '');
  writeFileSync(ghEnv, '');
  const res = spawnSync(
    BASH as string,
    [
      '--noprofile',
      '--norc',
      '-c',
      'PATH="$1:$PATH"; shift; exec bash "$@"',
      '_',
      posix(sb.stubs),
      ...(opts.flags ?? githubFlags()),
      posix(script),
    ],
    {
      encoding: 'utf-8',
      cwd: opts.cwd ?? sb.tmp,
      env: {
        ...process.env,
        GITHUB_SHA: SHA,
        GITHUB_REPOSITORY: 'Foxugly/Fleet_frontend',
        GITHUB_OUTPUT: posix(ghOut),
        GITHUB_ENV: posix(ghEnv),
        RUNNER_TEMP: posix(sb.runner),
        ...env,
      },
    },
  );
  const outputs = Object.fromEntries(
    readFileSync(ghOut, 'utf-8')
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
  return { code: res.status ?? -1, out: `${res.stdout}${res.stderr}`, outputs };
}

describe('deploy.yml behaviour: head guard', () => {
  withBash.each([
    [SHA, 'true'],
    ['f'.repeat(40), 'false'],
  ])(
    'head %s -> current=%s',
    (head, current) => {
      const sb = sandbox();
      stub(
        sb.stubs,
        'git',
        '[ "$1 $3" = "ls-remote refs/heads/main" ] || exit 9\n' +
          '[ "$2" = "https://github.com/Foxugly/Fleet_frontend.git" ] || exit 8\n' +
          `printf "%s\\trefs/heads/main\\n" "${head}"`,
      );
      const res = runStep(sb, 'head');
      expect(res.code, res.out).toBe(0);
      expect(res.outputs['current']).toBe(current);
    },
    SLOW,
  );

  withBash(
    'fails red when GitHub cannot be read',
    () => {
      const sb = sandbox();
      stub(sb.stubs, 'git', 'exit 128');
      const res = runStep(sb, 'head');
      expect(res.code).not.toBe(0);
      expect(res.outputs['current']).toBeUndefined();
    },
    SLOW,
  );

  withBash.each([['-e'], ['github']])(
    'fails red on an empty answer (shell %s)',
    (flags) => {
      const sb = sandbox();
      stub(sb.stubs, 'git', 'exit 0');
      const res = runStep(sb, 'head', {}, { flags: flags === 'github' ? undefined : [flags] });
      expect(res.code).not.toBe(0);
      expect(res.outputs['current']).toBeUndefined();
    },
    SLOW,
  );
});

describe('deploy.yml behaviour: bundle and upload', () => {
  function fakeDist(sb: Sandbox, index: string): string {
    const cwd = join(sb.tmp, 'repo');
    const browser = join(cwd, 'dist', 'fleet-frontend', 'browser');
    mkdirSync(join(browser, 'i18n'), { recursive: true });
    writeFileSync(join(browser, 'index.html'), index);
    writeFileSync(join(browser, 'main-ABC.js'), 'x');
    writeFileSync(join(browser, 'i18n', 'fr.json'), '{}');
    stub(sb.stubs, 'git', `[ "$*" = "rev-parse HEAD" ] && echo ${SHA}`);
    return cwd;
  }
  const GOOD_INDEX = '<html><head><script data-theme-init="">x</script></head><body></body></html>';

  withBash(
    'tars dist/fleet-frontend/browser at its root',
    () => {
      const sb = sandbox();
      const cwd = fakeDist(sb, GOOD_INDEX);
      const res = runStep(sb, 'bundle', {}, { cwd });
      expect(res.code, res.out).toBe(0);
      const genv = readFileSync(join(sb.tmp, 'github_env'), 'utf-8');
      const bundle = /^BUNDLE=(.*)$/m.exec(genv)?.[1] ?? '';
      expect(bundle).toBe(`${posix(sb.runner)}/fleet-frontend-${SHA}.tar.gz`);
      const names = bashRun('tar -tzf "$1"', [bundle]).stdout.split('\n');
      expect(names).toEqual(expect.arrayContaining(['./index.html', './main-ABC.js', './i18n/fr.json']));
      expect(names.some((n) => n.includes('dist/'))).toBe(false);
    },
    SLOW,
  );

  withBash(
    'refuses a build whose theme script nginx could not nonce',
    () => {
      const sb = sandbox();
      const cwd = fakeDist(sb, '<html><head><script>x</script></head></html>');
      expect(runStep(sb, 'bundle', {}, { cwd }).code).not.toBe(0);
    },
    SLOW,
  );

  withBash(
    'refuses a checkout that is not the pushed SHA',
    () => {
      const sb = sandbox();
      const cwd = fakeDist(sb, GOOD_INDEX);
      expect(runStep(sb, 'bundle', { GITHUB_SHA: 'f'.repeat(40) }, { cwd }).code).not.toBe(0);
    },
    SLOW,
  );

  withBash(
    'uploads to builds/fleet-frontend/<sha>.tar.gz',
    () => {
      const sb = sandbox();
      const log = join(sb.tmp, 'aws.log');
      stub(sb.stubs, 'aws', `printf "%s\\n" "$@" > "${posix(log)}"`);
      const res = runStep(sb, 'upload', { BUNDLE: '/x/fleet-frontend.tar.gz', MSYS2_ARG_CONV_EXCL: '*' });
      expect(res.code, res.out).toBe(0);
      const args = readFileSync(log, 'utf-8').split('\n');
      expect(args.slice(0, 2)).toEqual(['s3', 'cp']);
      expect(args).toContain(`s3://foxugly-deploy/builds/fleet-frontend/${SHA}.tar.gz`);
      expect(args).toContain('/x/fleet-frontend.tar.gz');
    },
    SLOW,
  );
});

describe('deploy.yml behaviour: SSM command list', () => {
  function ssm(sha = SHA): { code: number; out: string; cmdId?: string; params: Json | null; awsArgs: string[] } {
    const sb = sandbox();
    const capture = join(sb.tmp, 'params.json');
    const log = join(sb.tmp, 'aws.log');
    stub(
      sb.stubs,
      'aws',
      `printf "%s\\n" "$@" > "${posix(log)}"\n` +
        `for a in "$@"; do case "$a" in file://*) cp "\${a#file://}" "${posix(capture)}";; esac; done\necho cmd-0001`,
    );
    // MSYS2_ARG_CONV_EXCL: Git Bash would rewrite `M=/var/lib/...` into Windows paths.
    const res = runStep(sb, 'ssm', { GITHUB_SHA: sha, INSTANCE_ID: 'i-test', MSYS2_ARG_CONV_EXCL: '*' });
    return {
      code: res.code,
      out: res.out,
      cmdId: res.outputs['cmd_id'],
      params: existsSync(capture) ? (JSON.parse(readFileSync(capture, 'utf-8')) as Json) : null,
      awsArgs: existsSync(log) ? readFileSync(log, 'utf-8').split('\n') : [],
    };
  }

  withPython(
    'starts with set -eu and the dash-safe root environment',
    () => {
      const r = ssm();
      expect(r.code, r.out).toBe(0);
      expect(r.cmdId).toBe('cmd-0001');
      const cmds = r.params?.['commands'] as string[];
      expect(cmds[0]).toBe('set -eu');
      expect(cmds[1]).toBe('export HOME=/root AWS_SHARED_CREDENTIALS_FILE=/dev/null AWS_CONFIG_FILE=/dev/null');
      expect(cmds).toContain(`SHA=${SHA}`);
      expect(cmds).toContain(`trap 'rm -rf "$T" "$S"' EXIT`);
      expect(r.params?.['executionTimeout']).toEqual(['600']);
      expect(r.awsArgs[r.awsArgs.indexOf('--timeout-seconds') + 1]).toBe('120');
    },
    SLOW,
  );

  withPython(
    'runs the deploy in order',
    () => {
      const script = (ssm().params?.['commands'] as string[]).join('\n');
      const expected = [
        'M=/var/lib/fleet-deploy/Fleet_frontend.git',
        'A=/srv/fleet/Fleet_frontend',
        'install -d -m 700 -o root -g root /var/lib/fleet-deploy',
        '[ -d "$M" ] || git init --quiet --bare "$M"',
        'git --git-dir="$M" fetch --quiet --depth=1 https://github.com/Foxugly/Fleet_frontend.git "$SHA"',
        'git --git-dir="$M" cat-file -e "$SHA^{commit}"',
        'git --git-dir="$M" show "$SHA:deploy/fetch-frontend-runtime-from-ssm.sh" > "$T/runtime-fetch.sh"',
        'install -m 0755 -o root -g root "$T/runtime-fetch.sh" /usr/local/sbin/fleet-app-frontend-runtime-fetch.sh',
        'git --git-dir="$M" show "$SHA:deploy/systemd/fleet-app-frontend-runtime-fetch.service" >',
        '/etc/systemd/system/fleet-app-frontend-runtime-fetch.service',
        'systemctl daemon-reload',
        'systemctl enable --quiet fleet-app-frontend-runtime-fetch',
        'install -d -m 755 -o root -g root /srv/fleet',
        'install -d -m 2750 -o fleet -g www-data "$A"',
        'aws s3 cp --only-show-errors "s3://foxugly-deploy/builds/fleet-frontend/$SHA.tar.gz" "$T/bundle.tar.gz"',
        'tar --no-same-owner --no-overwrite-dir -xzf - -C /srv/fleet/Fleet_frontend/dist/.bundle-new',
        'git --git-dir="$M" show "$SHA:deploy/publish-bundle.sh" > "$S"',
        'chmod 0644 "$S"',
        'sudo -u fleet sh "$S" /srv/fleet/Fleet_frontend/dist "$SHA"',
        'chown -R -h root "$A"',
        'chgrp -R -h www-data "$A"',
        'chmod -R g-w,o-rwx "$A"',
        'find "$A" -type d -exec chmod 2750 {} +',
        'find "$A" -type f -exec chmod 640 {} +',
        'chown -R -h fleet "$A"',
        'cp -a "$VHOST" "$VHOST.deploybak"',
        'git --git-dir="$M" show "$SHA:deploy/nginx/fleet.foxugly.com" > "$T/vhost"',
        'install -m 0644 -o root -g root "$T/vhost" "$VHOST"',
        'ln -sfn ../sites-available/fleet.foxugly.com /etc/nginx/sites-enabled/fleet.foxugly.com',
        `printf '%s\\n' 'set $fleet_version "${SHA.slice(0, 7)} (`,
        '/etc/nginx/snippets/fleet-frontend-runtime-version.conf',
        'if ! nginx -t; then',
        'systemctl restart fleet-app-frontend-runtime-fetch',
        'nginx -t && systemctl reload nginx',
        'rm -rf "$T"',
      ];
      let pos = -1;
      for (const fragment of expected) {
        const next = script.indexOf(fragment, pos + 1);
        expect(next, `missing or out of order: ${fragment}`).toBeGreaterThan(pos);
        pos = next;
      }
    },
    SLOW,
  );

  withPython(
    'never mentions django and runs nothing fleet can write as root',
    () => {
      const cmds = ssm().params?.['commands'] as string[];
      for (const cmd of cmds) {
        expect(cmd).not.toContain('django');
        // Root never executes, sources or installs a file from the app tree.
        expect(cmd).not.toMatch(/(^|[;&|]\s*)(bash|sh|\.)\s+"?(\$A|\/srv\/fleet)/);
        if (/^install -m/.test(cmd)) expect(cmd).toMatch(/^install -m 0\d{3} -o root -g root "\$T\//);
        // Everything fleet runs is a fixed string: no root-side variable reaches it.
        // Its only inputs: the bundle on stdin, the publish script (root-owned copy
        // of the mirror blob) and the validated SHA.
        if (cmd.startsWith('sudo -u fleet')) {
          const rest = cmd
            .replace(/< "\$T\/bundle\.tar\.gz"$/, '')
            .replace(/^sudo -u fleet sh "\$S" \S+ "\$SHA"$/, '');
          expect(rest).not.toContain('"$');
        }
      }
      // Blobs root installs come from the mirror only.
      expect(cmds.filter((c) => c.includes(' show "$SHA:')).every((c) => c.startsWith('git --git-dir="$M" show'))).toBe(
        true,
      );
    },
    SLOW,
  );

  withPython(
    'parses as POSIX sh',
    () => {
      const sb = sandbox();
      const box = join(sb.tmp, 'box.sh');
      writeFileSync(box, (ssm().params?.['commands'] as string[]).join('\n') + '\n');
      const res = bashRun('bash --posix -n "$1"', [posix(box)]);
      expect(res.status, res.stderr).toBe(0);
    },
    SLOW,
  );

  withPython.each([['abc'], [SHA.toUpperCase()], [`${SHA}; reboot`], ['']])(
    'refuses a malformed SHA %j',
    (bad) => {
      const r = ssm(bad);
      expect(r.code).not.toBe(0);
      expect(r.params).toBeNull();
    },
    SLOW,
  );

  /** One box line run under `bash --posix -eu`, nginx/systemctl stubbed. */
  function boxLine(line: string, nginxRc: number, vhostDir: string, sb: Sandbox) {
    stub(sb.stubs, 'nginx', `echo "nginx $*" >> "${posix(join(sb.tmp, 'calls'))}"; exit ${nginxRc}`);
    stub(sb.stubs, 'systemctl', `echo "systemctl $*" >> "${posix(join(sb.tmp, 'calls'))}"`);
    const box = join(sb.tmp, 'line.sh');
    writeFileSync(box, `set -eu\nVHOST="${posix(join(vhostDir, 'fleet.foxugly.com'))}"\n${line}\necho after\n`);
    const res = bashRun('PATH="$1:$PATH"; exec bash --posix "$2"', [posix(sb.stubs), posix(box)]);
    const calls = existsSync(join(sb.tmp, 'calls')) ? readFileSync(join(sb.tmp, 'calls'), 'utf-8') : '';
    return { code: res.status, out: res.stdout, calls };
  }

  withPython.each([
    [0, 0],
    [1, 1],
  ])(
    'the explicit reload stops the script when nginx -t fails (rc %i -> exit %i)',
    (rc, code) => {
      const sb = sandbox();
      const line = (ssm().params?.['commands'] as string[]).find((c) => c.startsWith('nginx -t && systemctl reload'));
      const res = boxLine(line as string, rc, sb.tmp, sb);
      expect(res.code).toBe(code);
      expect(res.out.includes('after')).toBe(code === 0);
      expect(res.calls.includes('systemctl reload nginx')).toBe(code === 0);
    },
    SLOW,
  );

  withPython(
    'a vhost nginx rejects is rolled back to the previous one',
    () => {
      const sb = sandbox();
      const line = (ssm().params?.['commands'] as string[]).find((c) => c.startsWith('if ! nginx -t; then'));
      writeFileSync(join(sb.tmp, 'fleet.foxugly.com'), 'new');
      writeFileSync(join(sb.tmp, 'fleet.foxugly.com.deploybak'), 'old');
      const res = boxLine(line as string, 1, sb.tmp, sb);
      expect(res.code).toBe(1);
      expect(readFileSync(join(sb.tmp, 'fleet.foxugly.com'), 'utf-8')).toBe('old');
      expect(res.calls).not.toContain('reload');
    },
    SLOW,
  );
});

describe('deploy.yml behaviour: wait and smoke', () => {
  function flakyAws(sb: Sandbox, failures: number, status: string): string {
    const count = join(sb.tmp, 'calls');
    stub(
      sb.stubs,
      'aws',
      `c="${posix(count)}"\n` +
        'case "$*" in *"--query Status"*)\n' +
        '  n=$(( $(cat "$c" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$c"\n' +
        `  if [ "$n" -le ${failures} ]; then echo "AccessDenied #$n" >&2; exit 254; fi\n` +
        `  echo ${status} ;;\n` +
        '*) echo output ;; esac',
    );
    return count;
  }
  const waitEnv = { INSTANCE_ID: 'i-test', CMD_ID: 'cmd-1' };

  withBash.each([
    ['Success', 0],
    ['Failed', 1],
    ['TimedOut', 1],
  ])(
    'wait follows the invocation status %s',
    (status, code) => {
      const sb = sandbox();
      flakyAws(sb, 0, status as string);
      expect(runStep(sb, 'wait', waitEnv).code).toBe(code);
    },
    SLOW,
  );

  withBash(
    'wait fails after 5 consecutive API errors',
    () => {
      const sb = sandbox();
      const count = flakyAws(sb, 99, 'Success');
      const res = runStep(sb, 'wait', waitEnv);
      expect(res.code).toBe(1);
      expect(readFileSync(count, 'utf-8').trim()).toBe('5');
      expect(res.out).toContain('AccessDenied #5');
    },
    SLOW,
  );

  withBash(
    'wait tolerates 4 transient API errors',
    () => {
      const sb = sandbox();
      flakyAws(sb, 4, 'Success');
      const res = runStep(sb, 'wait', waitEnv);
      expect(res.code, res.out).toBe(0);
    },
    SLOW,
  );

  const SERVED =
    '<html><head><script nonce="r1">t()</script>' +
    '<script nonce="r1">window.__FLEET__={apiBaseUrl:"https://fleet-api.foxugly.com",sentry:{dsn:"",environment:"production",release:""}};' +
    `window.__FLEET_VERSION="${SHA.slice(0, 7)} (2026-11-22)";</script></head></html>`;

  function curlStub(sb: Sandbox, html: string, failFirst = 0): string {
    const count = join(sb.tmp, 'curls');
    const page = join(sb.tmp, 'page.html');
    writeFileSync(page, html);
    stub(
      sb.stubs,
      'curl',
      `c="${posix(count)}"\n` +
        'n=$(( $(cat "$c" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$c"\n' +
        'case "$*" in *"--max-time 10"*https://fleet.foxugly.com/*) ;; *) exit 9 ;; esac\n' +
        `if [ "$n" -le ${failFirst} ]; then printf 000; exit 7; fi\n` +
        'out=""; prev=""\n' +
        'for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done\n' +
        `cp "${posix(page)}" "$out"; printf 200`,
    );
    return count;
  }

  withBash(
    'smoke passes on the injected, nonced page of this version',
    () => {
      const sb = sandbox();
      curlStub(sb, SERVED);
      const res = runStep(sb, 'smoke');
      expect(res.code, res.out).toBe(0);
    },
    SLOW,
  );

  withBash.each([
    ['no runtime config', SERVED.replace('window.__FLEET__=', 'window.__X__=')],
    ['an empty API base', SERVED.replace('https://fleet-api.foxugly.com', '')],
    ['an un-nonced theme script', SERVED.replace('<script nonce="r1">t()', '<script data-theme-init="">t()')],
    ['another version', SERVED.replace(SHA.slice(0, 7), 'fffffff')],
  ])(
    'smoke fails on %s, after 3 tries',
    (_name, html) => {
      const sb = sandbox();
      const count = curlStub(sb, html as string);
      expect(runStep(sb, 'smoke').code).not.toBe(0);
      expect(readFileSync(count, 'utf-8').trim()).toBe('3');
    },
    SLOW,
  );

  withBash.each([
    [3, 1],
    [2, 0],
  ])(
    'smoke survives curl errors (%i failures -> exit %i)',
    (failFirst, code) => {
      const sb = sandbox();
      curlStub(sb, SERVED, failFirst as number);
      const res = runStep(sb, 'smoke');
      expect(res.code, res.out).toBe(code);
      expect(res.out).toContain('HTTP 000');
      expect(res.out).not.toContain('000000');
    },
    SLOW,
  );
});

// ---------------------------------------------------------------------------
// behaviour: the runtime fetch script
// ---------------------------------------------------------------------------

describe('runtime fetch script behaviour', () => {
  const DSN = 'https://0123abcd@o42.ingest.de.sentry.io/4711';

  function fetchRun(
    params: Record<string, string>,
    opts: { existing?: string; nginxRc?: number } = {},
  ): { code: number; out: string; snippet: string | null; calls: string } {
    const sb = sandbox();
    const ssmJson = join(sb.tmp, 'ssm.json');
    const outFile = join(sb.tmp, 'snippets', 'fleet-frontend-runtime.conf');
    const calls = join(sb.tmp, 'calls');
    mkdirSync(join(sb.tmp, 'snippets'));
    if (opts.existing !== undefined) writeFileSync(outFile, opts.existing);
    writeFileSync(
      ssmJson,
      JSON.stringify({
        Parameters: Object.entries(params).map(([k, v]) => ({ Name: `/fleet-frontend/prod/${k}`, Value: v })),
      }),
    );
    stub(
      sb.stubs,
      'aws',
      `echo "aws $*" >> "${posix(calls)}"\n` +
        '[ "$1 $2" = "ssm get-parameters-by-path" ] || exit 9\n' +
        `cat "${posix(ssmJson)}"`,
    );
    stub(sb.stubs, 'nginx', `echo "nginx $*" >> "${posix(calls)}"; exit ${opts.nginxRc ?? 0}`);
    stub(sb.stubs, 'systemctl', `echo "systemctl $*" >> "${posix(calls)}"`);
    // install -m MODE -o root -g root SRC DST: copy only (no root on the test host).
    stub(sb.stubs, 'install', 'eval "src=\\${$(($# - 1))}"; cp "$src" "${!#}"');
    const res = bashRun('PATH="$1:$PATH"; exec bash "$2"', [posix(sb.stubs), posix(join(ROOT, FETCH_PATH))], {
      ...process.env,
      FLEET_FRONTEND_RUNTIME_FILE: posix(outFile),
      // Git Bash would turn the SSM prefix argument into a Windows path for python.
      MSYS2_ARG_CONV_EXCL: '/fleet-frontend',
    });
    return {
      code: res.status ?? -1,
      out: `${res.stdout}${res.stderr}`,
      snippet: existsSync(outFile) ? readFileSync(outFile, 'utf-8') : null,
      calls: existsSync(calls) ? readFileSync(calls, 'utf-8') : '',
    };
  }

  const GOOD = {
    API_BASE_URL: 'https://fleet-api.foxugly.com',
    SENTRY_DSN: DSN,
    SENTRY_ENV: 'production',
    SENTRY_RELEASE: 'fleet-frontend@1.0',
  };

  withPython(
    'writes the set lines and the CSP report-uri from the DSN, then checks and reloads',
    () => {
      const r = fetchRun(GOOD);
      expect(r.code, r.out).toBe(0);
      expect(r.snippet).toContain('set $fleet_api_base       "https://fleet-api.foxugly.com";');
      expect(r.snippet).toContain(`set $fleet_sentry_dsn     "${DSN}";`);
      expect(r.snippet).toContain('set $fleet_sentry_env     "production";');
      expect(r.snippet).toContain('set $fleet_sentry_release "fleet-frontend@1.0";');
      expect(r.snippet).toContain(
        'set $fleet_csp_report     "; report-uri https://o42.ingest.de.sentry.io/api/4711/security/?sentry_key=0123abcd";',
      );
      expect(r.calls).toContain('aws ssm get-parameters-by-path --path /fleet-frontend/prod --recursive');
      expect(r.calls.indexOf('nginx -t')).toBeLessThan(r.calls.indexOf('systemctl reload nginx'));
    },
    SLOW,
  );

  withPython(
    'Sentry stays off without a DSN: no report-uri',
    () => {
      const r = fetchRun({ API_BASE_URL: 'https://fleet-api.foxugly.com' });
      expect(r.code, r.out).toBe(0);
      expect(r.snippet).toContain('set $fleet_sentry_dsn     "";');
      expect(r.snippet).toContain('set $fleet_csp_report     "";');
    },
    SLOW,
  );

  withPython.each([['"'], ['\\'], ['$'], [';'], ["'"], ['\n'], ['\r'], ['<'], ['>']])(
    'refuses a value containing %j and writes nothing',
    (ch) => {
      const r = fetchRun({ ...GOOD, SENTRY_RELEASE: `v1${ch}x` });
      expect(r.code).not.toBe(0);
      expect(r.snippet).toBeNull();
      expect(r.out).toContain('SENTRY_RELEASE');
      expect(r.calls).not.toContain('reload');
    },
    SLOW,
  );

  withPython.each([[''], ['http://fleet-api.foxugly.com'], ['/'], ['https://fleet-api.foxugly.com/x']])(
    'refuses API_BASE_URL %j (the SPA needs an absolute https origin)',
    (url) => {
      const r = fetchRun({ ...GOOD, API_BASE_URL: url as string });
      expect(r.code).not.toBe(0);
      expect(r.snippet).toBeNull();
    },
    SLOW,
  );

  withPython(
    'refuses a DSN that is not a de.sentry.io ingest DSN',
    () => {
      for (const dsn of [
        'https://evil.example/1',
        'https://0123abcd@evil.sentry.io/1',
        'https://0123abcd@o42.ingest.us.sentry.io/4711', // the CSP connect-src allows only the de ingest
      ]) {
        const r = fetchRun({ ...GOOD, SENTRY_DSN: dsn });
        expect(r.code, dsn).not.toBe(0);
        expect(r.snippet, dsn).toBeNull();
      }
    },
    SLOW,
  );

  withPython(
    'leaves an unchanged snippet alone: no nginx -t, no reload',
    () => {
      const first = fetchRun(GOOD);
      const again = fetchRun(GOOD, { existing: first.snippet as string });
      expect(again.code, again.out).toBe(0);
      expect(again.calls).not.toContain('nginx');
      expect(again.calls).not.toContain('systemctl');
    },
    SLOW,
  );

  withPython(
    'puts the previous snippet back when nginx -t fails',
    () => {
      const r = fetchRun(GOOD, { existing: 'set $fleet_api_base "old";\n', nginxRc: 1 });
      expect(r.code).not.toBe(0);
      expect(r.snippet).toBe('set $fleet_api_base "old";\n');
      expect(r.calls).not.toContain('reload');
    },
    SLOW,
  );

  withPython(
    'removes a first snippet nginx -t rejects',
    () => {
      const r = fetchRun(GOOD, { nginxRc: 1 });
      expect(r.code).not.toBe(0);
      expect(r.snippet).toBeNull();
    },
    SLOW,
  );
});

// ---------------------------------------------------------------------------
// behaviour: publish-bundle.sh (run by fleet on the box)
// ---------------------------------------------------------------------------

describe('publish-bundle.sh behaviour', () => {
  const PUBLISH = 'deploy/publish-bundle.sh';
  const sha = (c: string): string => c.repeat(40);

  /** A generation: index.html referencing main-<g>.js, styles-<g>.css; main loads a lazy chunk. */
  function generation(g: string): Record<string, string> {
    return {
      'index.html':
        `<html><head><link rel="stylesheet" href="styles-${g}.css"></head>` +
        `<body><script src="main-${g}.js" type="module"></script></body></html>`,
      [`main-${g}.js`]: `import("./chunk-${g}.js")`,
      [`styles-${g}.css`]: 'x',
      [`chunk-${g}.js`]: 'x',
      'i18n/fr.json': `{"g":"${g}"}`,
      'favicon.ico': 'x',
    };
  }

  interface Env {
    sb: Sandbox;
    dist: string;
    violations: string;
  }

  /**
   * rsync, cp, mv, rm and rmdir are wrapped: each runs the real command, then
   * checks that the served index.html references only files present in the
   * docroot, logging any violation. Every intermediate state is checked.
   */
  function setup(): Env {
    const sb = sandbox();
    const dist = join(sb.tmp, 'dist');
    mkdirSync(dist);
    const violations = join(sb.tmp, 'violations');
    const doc = `${posix(dist)}/fleet-frontend/browser`;
    for (const cmd of ['rsync', 'cp', 'mv', 'rm', 'rmdir']) {
      const real = bashRun(`command -v ${cmd}`).stdout.trim();
      if (!real) throw new Error(`${cmd} not found`);
      stub(
        sb.stubs,
        cmd,
        `"${real}" "$@"; rc=$?\n` +
          `if [ -f "${doc}/index.html" ]; then\n` +
          `  for ref in $(grep -o '\\(src\\|href\\)="[^"]*"' "${doc}/index.html" | sed 's/^[a-z]*="//; s/"$//'); do\n` +
          `    [ -e "${doc}/$ref" ] || echo "after ${cmd} $*: index.html references missing $ref" >> "${posix(violations)}"\n` +
          '  done\n' +
          'fi\n' +
          'exit $rc',
      );
    }
    return { sb, dist, violations };
  }

  function publish(env: Env, g: string | null, release: string) {
    if (g !== null) {
      for (const [name, body] of Object.entries(generation(g))) {
        const path = join(env.dist, '.bundle-new', name);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, body);
      }
    }
    return bashRun('PATH="$1:$PATH"; exec sh "$2" "$3" "$4"', [
      posix(env.sb.stubs),
      posix(join(ROOT, PUBLISH)),
      posix(env.dist),
      release,
    ]);
  }

  const docPath = (env: Env, name: string): string => join(env.dist, 'fleet-frontend', 'browser', name);
  const served = (env: Env, name: string): boolean => existsSync(docPath(env, name));
  const release = (env: Env, gen: string): string =>
    existsSync(join(env.dist, gen, '.release')) ? readFileSync(join(env.dist, gen, '.release'), 'utf-8').trim() : '';

  withRsync(
    'never serves an index.html referencing a missing file; keeps one generation back; prunes older ones',
    () => {
      const env = setup();
      for (const g of ['a', 'b', 'c']) {
        const res = publish(env, g, sha(g));
        expect(res.status, res.stdout + res.stderr).toBe(0);
        expect(readFileSync(docPath(env, 'index.html'), 'utf-8')).toContain(`main-${g}.js`);
        expect(served(env, `chunk-${g}.js`)).toBe(true);
        expect(served(env, 'index.html.new')).toBe(false);
        expect(served(env, '.release')).toBe(false);
        if (g === 'b') {
          // The previous generation's files survive one deploy.
          for (const f of ['main-a.js', 'styles-a.css', 'chunk-a.js']) expect(served(env, f), f).toBe(true);
        }
      }
      // Two generations back: gone. The previous one (b) is still served.
      for (const f of ['main-a.js', 'styles-a.css', 'chunk-a.js']) expect(served(env, f), f).toBe(false);
      for (const f of ['main-b.js', 'styles-b.css', 'chunk-b.js']) expect(served(env, f), f).toBe(true);
      // Non-hashed files carry the current generation.
      expect(readFileSync(docPath(env, 'i18n/fr.json'), 'utf-8')).toContain('"c"');
      expect(release(env, '.bundle-current')).toBe(sha('c'));
      expect(release(env, '.bundle-prev')).toBe(sha('b'));
      // The wrappers never saw a broken index.html (sanity of the checker below).
      expect(existsSync(env.violations) ? readFileSync(env.violations, 'utf-8') : '').toBe('');
    },
    SLOW,
  );

  withRsync(
    'the checker itself flags an index.html that references a missing file',
    () => {
      const env = setup();
      mkdirSync(docPath(env, ''), { recursive: true });
      writeFileSync(docPath(env, 'index.html'), '<script src="main-x.js"></script>');
      bashRun('PATH="$1:$PATH"; rm -f "$2/nothing"', [posix(env.sb.stubs), posix(env.dist)]);
      expect(readFileSync(env.violations, 'utf-8')).toContain('references missing main-x.js');
    },
    SLOW,
  );

  withRsync(
    'regression reference: the first version (one rsync --delete) dropped the previous chunks',
    () => {
      const env = setup();
      expect(publish(env, 'a', sha('a')).status).toBe(0);
      for (const [name, body] of Object.entries(generation('b'))) {
        const path = join(env.dist, 'gen-b', name);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, body);
      }
      bashRun('cd "$1" && rsync -rlt --delete gen-b/ fleet-frontend/browser/', [posix(env.dist)]);
      // An open tab of generation a now 404s on its lazy chunk; publish-bundle.sh keeps it (test above).
      expect(served(env, 'chunk-a.js')).toBe(false);
    },
    SLOW,
  );

  withRsync(
    'a retry of the same SHA does not rotate: the previous generation is kept',
    () => {
      const env = setup();
      expect(publish(env, 'a', sha('a')).status).toBe(0);
      expect(publish(env, 'b', sha('b')).status).toBe(0);
      const retry = publish(env, 'b', sha('b'));
      expect(retry.status, retry.stdout + retry.stderr).toBe(0);
      expect(retry.stdout).toContain('already current');
      expect(release(env, '.bundle-prev')).toBe(sha('a'));
      expect(served(env, 'chunk-a.js')).toBe(true);
      expect(existsSync(join(env.dist, '.bundle-new'))).toBe(false);
    },
    SLOW,
  );

  withRsync(
    'a crash between the two renames keeps the previous generation on retry',
    () => {
      const env = setup();
      expect(publish(env, 'a', sha('a')).status).toBe(0);
      // Crash right after `mv .bundle-current .bundle-prev`: no .bundle-current.
      bashRun('cd "$1" && mv .bundle-current .bundle-prev', [posix(env.dist)]);
      const res = publish(env, 'b', sha('b'));
      expect(res.status, res.stdout + res.stderr).toBe(0);
      expect(release(env, '.bundle-prev')).toBe(sha('a'));
      expect(release(env, '.bundle-current')).toBe(sha('b'));
      expect(served(env, 'chunk-a.js')).toBe(true);
    },
    SLOW,
  );

  withRsync(
    'removes leftovers of no generation, nested dirs and a stale index.html.new included',
    () => {
      const env = setup();
      expect(publish(env, 'a', sha('a')).status).toBe(0);
      mkdirSync(docPath(env, 'old/deep'), { recursive: true });
      writeFileSync(docPath(env, 'old/deep/x.js'), 'x');
      writeFileSync(docPath(env, 'index.html.new'), 'stale');
      expect(publish(env, 'b', sha('b')).status).toBe(0);
      expect(served(env, 'old')).toBe(false);
      expect(served(env, 'index.html.new')).toBe(false);
      expect(served(env, 'i18n/fr.json')).toBe(true);
    },
    SLOW,
  );

  withRsync.each([['abc'], ['A'.repeat(40)], [`${'a'.repeat(40)};x`]])(
    'refuses a malformed SHA %j and touches nothing',
    (bad) => {
      const env = setup();
      const res = publish(env, 'a', bad as string);
      expect(res.status).not.toBe(0);
      expect(existsSync(join(env.dist, '.bundle-current'))).toBe(false);
    },
    SLOW,
  );

  withRsync(
    'refuses a new bundle without index.html and leaves the docroot as it was',
    () => {
      const env = setup();
      expect(publish(env, 'a', sha('a')).status).toBe(0);
      mkdirSync(join(env.dist, '.bundle-new'));
      writeFileSync(join(env.dist, '.bundle-new', 'main-b.js'), 'x');
      const res = publish(env, null, sha('b'));
      expect(res.status).not.toBe(0);
      expect(release(env, '.bundle-current')).toBe(sha('a'));
      expect(readFileSync(docPath(env, 'index.html'), 'utf-8')).toContain('main-a.js');
    },
    SLOW,
  );
});
