import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { permissionChecks, type AdminMe } from '../components/AdminMeContext';

/**
 * Admin portal audit, batch D (2026-10-09) — one shared `/me`, and every screen offering only what the API allows.
 *
 * `permissionChecks` runs for real; the screens are source-reading, like the other client-component tests here,
 * because this suite has no DOM.
 */

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const me = (permissions: string[], roleName = 'Support'): AdminMe => ({
  admin: { id: 'u1', name: 'Asha', phone: null, roleName },
  permissions,
});

describe('permissionChecks', () => {
  it('answers from the permissions /me returned', () => {
    const { can } = permissionChecks(me(['admin.role.view']));
    expect(can('admin.role.view')).toBe(true);
    expect(can('admin.role.manage')).toBe(false);
  });

  it('offers nothing while /me is unknown — the safe direction', () => {
    const { can, holdsAll } = permissionChecks(null);
    expect(can('admin.dashboard.view')).toBe(false);
    expect(holdsAll([])).toBe(false);
  });

  it('holdsAll is the server’s "beyond your reach" question', () => {
    const { holdsAll } = permissionChecks(me(['admin.user.view', 'admin.user.manage']));
    expect(holdsAll(['admin.user.view'])).toBe(true);
    expect(holdsAll(['admin.user.view', 'admin.plan.manage'])).toBe(false);
    expect(holdsAll([])).toBe(true); // a role with no permissions is within anyone's reach
  });
});

describe('/me is read once', () => {
  it('by the provider SessionGate mounts around the shell', () => {
    expect(read('components/SessionGate.tsx')).toMatch(/<AdminMeProvider>\s*<AdminShell>\{children\}<\/AdminShell>\s*<\/AdminMeProvider>/);
    expect(read('components/AdminMeContext.tsx')).toMatch(/adminFetch<AdminMe>\('\/me'\)/);
  });

  it('and not again by the shell or the pages that used to', () => {
    for (const p of ['components/AdminShell.tsx', 'businesses/page.tsx', 'businesses/[id]/page.tsx', 'subscriptions/[id]/page.tsx']) {
      expect(read(p), p).not.toMatch(/adminFetch<[^>]*>\('\/me'/);
      expect(read(p), p).toMatch(/useAdminMe\(\)/);
    }
  });
});

describe('Roles', () => {
  const page = read('roles/page.tsx');
  it('hides New role, Edit and Delete without admin.role.manage', () => {
    expect(page).toMatch(/const canManage = can\('admin\.role\.manage'\);/);
    expect(page).toMatch(/\{canManage \? \(\s*<PrimaryButton[\s\S]*?New role/);
    expect(page).toMatch(/: !canManage \? null : lockedReason\(role\)/);
  });
  it('says why your own role and a stronger role cannot be changed', () => {
    expect(page).toMatch(/role\.name === me\.admin\.roleName\s*\?\s*'This is your own role/);
    expect(page).toMatch(/!holdsAll\(role\.permissions\)\s*\?\s*'Has permissions you do not hold/);
  });
  it('does not offer Delete on a role somebody holds', () => {
    expect(page).toMatch(/role\.holders > 0 \? \(\s*<span[^>]*>\s*In use/);
  });
  it('the editor cannot grant a permission you do not hold', () => {
    expect(read('roles/RoleEditor.tsx')).toMatch(/disabled=\{saving \|\| !can\(option\.key\)\}/);
  });
});

describe('Users', () => {
  const page = read('users/page.tsx');
  it('hides every change without admin.user.manage', () => {
    expect(page).toMatch(/const canManage = can\('admin\.user\.manage'\);/);
    expect(page).toMatch(/\{canManage \? \(\s*<PrimaryButton onClick=\{\(\) => setAddOpen\(true\)\}>Add administrator/);
    expect(page).toMatch(/\{locked \|\| !canManage \? \(/);
    expect(page).toMatch(/\{!canManage \? null : locked \? \(/);
  });
  it('offers only roles within reach, and locks rows on a role beyond it', () => {
    expect(page).toMatch(/const rolesInReach = data\.roles\.filter\(\(role\) => holdsAll\(role\.permissions\)\);/);
    expect(page).toMatch(/\{rolesInReach\.map\(\(role\) => \(/);
    expect(page).toMatch(/<AddAdminModal open=\{addOpen\} roles=\{rolesInReach\}/);
    expect(page).toMatch(/!roleInReach\(user\.roleId\)\s*\?\s*'Has permissions you do not hold\.'/);
  });
});

describe('Plans', () => {
  it('no Create plan without admin.plan.manage, and the card says View plan', () => {
    const page = read('plans/page.tsx');
    expect(page).toMatch(/\{canManage \? \(\s*<div[^>]*>\s*<PrimaryButton onClick=\{\(\) => router\.push\('\/admin\/plans\/new'\)\}/);
    expect(page).toMatch(/\{canManage \? 'Edit plan' : 'View plan'\}/);
  });
  it('the plan form is read-only for a viewer — one fieldset, nothing missed', () => {
    const form = read('components/PlanForm.tsx');
    expect(form).toMatch(/<fieldset disabled=\{!canManage\}/);
    // …and looks it: the buttons inside style themselves from a prop the fieldset does not pass down.
    expect(form).toMatch(/<fieldset disabled=\{!canManage\} className="admin-view-only"/);
    expect(read('admin.css')).toMatch(/\.admin-view-only button:disabled \{\s*opacity: 0\.5 !important;/);
    expect(form).toMatch(/View only — changing plans needs Manage plans\./);
  });
  it('/admin/plans/new typed directly says why instead of offering a form that will be refused', () => {
    expect(read('plans/new/page.tsx')).toMatch(/if \(!canManage\) \{[\s\S]*?Creating a plan needs Manage plans/);
  });
});

describe('Subscriptions list', () => {
  it('re-enrol / reactivate / resume need admin.subscription.manage', () => {
    const page = read('subscriptions/page.tsx');
    expect(page).toMatch(/const canManage = useAdminMe\(\)\.can\('admin\.subscription\.manage'\);/);
    expect(page).toMatch(/\{canManage && reenrolActionLabel\(s\.status\) \? \(/);
  });
});

describe('Dashboard quick actions', () => {
  it('each declares the permission it needs, and only those held are shown', async () => {
    const { QUICK_ACTIONS } = await import('../dashboard-config');
    expect(Object.fromEntries(QUICK_ACTIONS.map((a) => [a.label, a.permission]))).toEqual({
      'Add business': 'admin.business.create',
      'Invite admin': 'admin.user.manage',
      'Create plan': 'admin.plan.manage',
      'View usage': 'admin.usage.view',
      'Audit log': 'admin.audit.view',
    });
    const page = read('page.tsx');
    expect(page).toMatch(/const quickActions = QUICK_ACTIONS\.filter\(\(action\) => can\(action\.permission\)\);/);
    expect(page).toMatch(/\{quickActions\.length > 0 \? \(/);
  });
});

describe('Business detail', () => {
  it('Recent activity is asked for and shown only with admin.audit.view', () => {
    const page = read('businesses/[id]/page.tsx');
    expect(page).toMatch(/const canAudit = useAdminMe\(\)\.can\('admin\.audit\.view'\);/);
    expect(page).toMatch(/if \(!canAudit\) return;/);
    expect(page).toMatch(/\{canAudit \? \(\s*<Card>\s*<SectionTitle\s*title="Recent activity"/);
  });
  it('the Billing tab asks for payments only with admin.payment.view', () => {
    const tab = read('components/BillingTab.tsx');
    expect(tab).toMatch(/const canSeePayments = useAdminMe\(\)\.can\('admin\.payment\.view'\);/);
    expect(tab).toMatch(/canSeePayments\s*\?\s*adminFetch<\{ rows: PaymentRow\[\] \}>\(`\/payments/);
    expect(tab).toMatch(/\{canSeePayments \? \(\s*<Card>\s*<SectionTitle title=\{`Payments/);
  });
  it('Add business needs plan.view too — its form loads /plans', () => {
    expect(read('businesses/page.tsx')).toMatch(/const canCreate = can\('admin\.business\.create'\) && can\('admin\.plan\.view'\);/);
  });
});
