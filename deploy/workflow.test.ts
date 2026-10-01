import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-372 — this repository deploys the dashboard, and only the dashboard.
 *
 * The box runs one api container and one web container, and holds a commit for
 * each. A release here must replace the web container and leave the api exactly
 * as it is: same image, same commit, no migrations. One wrong argument in the
 * SSM command is all it takes to do otherwise, and the thing it would break —
 * production — is not somewhere to find that out.
 *
 * Outside `app/` on purpose: every file under `app/` must stay byte-identical to
 * growza's `web/` copy until GRW-373 deletes it, and this workflow exists only
 * here. Same reason as the Dockerfile, .npmrc and ci.yml.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(path.join(root, '.github/workflows/deploy.yml'), 'utf8');
const dockerfile = readFileSync(path.join(root, 'Dockerfile'), 'utf8');

/*
 * The workflow without its comments. "This never runs a migration" is a claim
 * about the steps, and the comments above them talk about migrations and about
 * the checkout they deliberately do not move — so a plain search of the file
 * would find the explanation and call it the thing it explains.
 */
const steps = workflow
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

describe('deploy.yml — the dashboard only', () => {
  it('AC-01 — tells the box to keep the api commit it is already serving', () => {
    expect(workflow).toMatch(/remote-deploy\.sh --api keep --web \\\(\$sha\)/);
  });

  it('never moves /opt/growza/app — that checkout is growza at the live api commit', () => {
    expect(steps).not.toMatch(/git checkout/);
    expect(steps).not.toMatch(/git fetch/);
  });

  it('asks for no migration and no api image', () => {
    expect(steps).not.toMatch(/migrate/);
    expect(steps).not.toMatch(/growza-api/);
  });

  it('builds growza-web from this repo own Dockerfile, for the box arm64', () => {
    expect(workflow).toMatch(/growza-web:\$\{\{ needs\.gate\.outputs\.sha \}\}/);
    expect(workflow).toMatch(/platforms: linux\/arm64/);
  });

  it('passes the package token as the build secret the Dockerfile mounts', () => {
    const id = /--mount=type=secret,id=(\w+)/.exec(dockerfile)?.[1];
    expect(id).toBe('npm_token');
    expect(workflow).toMatch(new RegExp(`${id}=\\$\\{\\{ secrets\\.GITHUB_TOKEN \\}\\}`));
  });

  it('AC-02 — stops on a missing image before the box is touched', () => {
    const check = workflow.indexOf('describe-images --repository-name growza-web');
    const ssm = workflow.indexOf('aws ssm send-command');
    expect(check).toBeGreaterThan(-1);
    expect(check, 'the ECR check comes before anything is sent to the box').toBeLessThan(ssm);
  });

  it('proves both halves afterwards: the dashboard answers and the untouched api is still ready', () => {
    expect(workflow).toMatch(/\$PROD_HOSTNAME\/login/);
    expect(workflow).toMatch(/\$PROD_HOSTNAME\/api\/v1\/ready/);
  });

  it('keeps the three guards that stand in for branch protection', () => {
    // CI must have succeeded on a push to main…
    expect(workflow).toMatch(/workflow_run\.conclusion == 'success'/);
    expect(workflow).toMatch(/workflow_run\.head_branch == 'main'/);
    // …a manual run is refused off main…
    expect(workflow).toMatch(/Deploys run from main only/);
    // …and a manual build of the tip is refused unless CI passed on that commit.
    expect(workflow).toMatch(/CI has not passed on a push/);
  });

  it('waits for its own deploys but not for the api own', () => {
    expect(workflow).toMatch(/group: prod-deploy-web/);
  });
});
