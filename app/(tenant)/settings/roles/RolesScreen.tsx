'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type PendingInvite, type ProviderOverviewRow, type RoleBody, type RoleLevel, type RolePageKey, type RoleTemplate, type RoleWorksLike, type RolesPayload, type ShopRole, type TeamMember } from '../../lib/api';
import { RolesTeam } from './RolesTeam';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useWritable } from '../../components/SessionProvider';

/**
 * Jira GRW-72 — the roles a shop's team can hold, and the grid that says what each one can open.
 *
 * One screen, two states: the list, and one role open for editing. The grid is a row per page with three choices (None, See,
 * Change), one choice each, so "Change" always includes "See" without the owner having to tick both. Nothing here reads a role
 * to limit anyone yet (GRW-74); the screen says so, in plain words, until it does.
 */
const PAGES: readonly RolePageKey[] = ['bookings', 'clients', 'services', 'offers', 'staff', 'attendance', 'reports', 'settings'];
const LEVELS: readonly RoleLevel[] = ['none', 'view', 'manage'];
const WORKS_LIKE: ReadonlyArray<RoleWorksLike | 'none'> = ['none', 'manager', 'receptionist', 'staff'];

interface Draft {
  id: string | null;
  name: string;
  worksLike: RoleWorksLike | null;
  scheduleScoped: boolean;
  grants: Record<RolePageKey, RoleLevel>;
  builtIn: boolean;
}

const blankGrid = (): Record<RolePageKey, RoleLevel> => Object.fromEntries(PAGES.map((p) => [p, 'none'])) as Record<RolePageKey, RoleLevel>;

const fromTemplate = (tpl: RoleTemplate): Pick<Draft, 'worksLike' | 'scheduleScoped' | 'grants'> => ({
  worksLike: tpl.works_like,
  scheduleScoped: tpl.schedule_scoped ?? false,
  grants: { ...blankGrid(), ...tpl.grants },
});

export interface RolesTeamData {
  /** The team could not be read: say so, rather than draw an empty team as fact. */
  failed: boolean;
  members: TeamMember[];
  invites: PendingInvite[];
  providers: ProviderOverviewRow[];
  branches: Array<{ id: string; name: string }>;
}

export function RolesScreen({ initial, team }: { initial: RolesPayload; team: RolesTeamData }) {
  const t = useTranslations('settingsRoles');
  const writable = useWritable();
  const locale = useLocale();
  const [data, setData] = useState<RolesPayload>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ShopRole | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const topRef = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  // The tapped button is gone when the card swaps; put the reader back at the top of what replaced it.
  useEffect(() => {
    if (opened.current) topRef.current?.focus();
    opened.current = true;
  }, [!!draft]);

  // The business's own word for each page (its labels: Orders and Stock for a shop) in English; Hindi has its own table, as the rest of the app does.
  const pageLabel = (key: RolePageKey): string =>
    locale === 'hi' ? t(`pages.${key}`) : (data.pages.find((p) => p.key === key)?.label ?? t(`pages.${key}`));

  const reload = async () => setData(await api.roles());

  const open = (role: ShopRole) => {
    setError(null);
    setNameError(null);
    setDraft({ id: role.id, name: role.name, worksLike: role.worksLike, scheduleScoped: role.scheduleScoped, grants: { ...blankGrid(), ...role.permissions }, builtIn: role.isBuiltin });
  };
  const startNew = () => {
    setError(null);
    setNameError(null);
    setDraft({ id: null, name: '', worksLike: null, scheduleScoped: false, grants: blankGrid(), builtIn: false });
  };
  const close = () => {
    setDraft(null);
    setError(null);
    setNameError(null);
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setNameError(t('errors.nameNeeded'));
      return;
    }
    setBusy(true);
    setError(null);
    setNameError(null);
    const body: RoleBody = { name: draft.name.trim(), scheduleScoped: draft.scheduleScoped, worksLike: draft.worksLike, permissions: draft.grants };
    try {
      if (draft.id) await api.updateRole(draft.id, body);
      else await api.createRole(body);
      await reload().catch(() => undefined);
      close();
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) {
        if (e.field === 'name') setNameError(e.message);
        else setError(e.message);
      } else setError(t('errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setRemoveError(null);
    try {
      await api.deleteRole(removing.id);
      await reload().catch(() => undefined);
      setRemoving(null);
      close();
    } catch (e) {
      const body = (e instanceof ApiError ? e.body : null) as { holders?: string[]; memberCount?: number } | null;
      if (e instanceof ApiError && e.code === 'role_in_use' && body?.holders) {
        // The names come beside the sentence, so the owner is told WHO to move, not just that somebody holds it.
        const total = body.memberCount ?? body.holders.length;
        setRemoveError(t('removeBlocked', { names: body.holders.join(', '), more: Math.max(0, total - body.holders.length) }));
      } else setRemoveError(e instanceof ApiError && e.status < 500 ? e.message : t('errors.removeFailed'));
    } finally {
      setBusy(false);
    }
  };

  const editor = draft ? (
      <>
        <div className="card roles-card">
          <div className="card-head">{draft.id ? draft.name || t('title') : t('newRole')}</div>
          <div className="card-body">
            {!draft.id && data.templates.length > 0 && (
              <div className="roles-field">
                <label className="field-label" htmlFor="role-template">
                  {t('startFrom')}
                </label>
                <select
                  id="role-template"
                  defaultValue=""
                  disabled={busy}
                  onChange={(e) => {
                    const tpl = data.templates.find((x) => x.name === e.target.value);
                    setDraft((d) => (d ? { ...d, ...(tpl ? { ...fromTemplate(tpl) } : { worksLike: null, scheduleScoped: false, grants: blankGrid() }) } : d));
                  }}
                >
                  <option value="">{t('blank')}</option>
                  {data.templates.map((tpl) => (
                    <option key={tpl.name} value={tpl.name}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="roles-field">
              <label className="field-label" htmlFor="role-name">
                {t('name')}
              </label>
              <input
                id="role-name"
                className={nameError ? 'field-invalid' : undefined}
                type="text"
                value={draft.name}
                maxLength={60}
                placeholder={t('namePlaceholder')}
                disabled={busy}
                aria-invalid={nameError ? true : undefined}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              {nameError && (
                <div role="alert" className="field-error">
                  {nameError}
                </div>
              )}
            </div>

            <div className="roles-field">
              <label className="field-label" htmlFor="role-works-like">
                {t('worksLike')}
              </label>
              <select
                id="role-works-like"
                value={draft.worksLike ?? 'none'}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, worksLike: e.target.value === 'none' ? null : (e.target.value as RoleWorksLike) })}
              >
                {WORKS_LIKE.map((w) => (
                  <option key={w} value={w}>
                    {t(`worksLikeOptions.${w}`)}
                  </option>
                ))}
              </select>
              <p className="field-hint">{t('worksLikeHint')}</p>
            </div>

            <label className="roles-check">
              <input type="checkbox" checked={draft.scheduleScoped} disabled={busy} onChange={(e) => setDraft({ ...draft, scheduleScoped: e.target.checked })} />
              <span>
                {t('ownSchedule')}
                <span className="field-hint roles-check-hint">{t('ownScheduleHint')}</span>
              </span>
            </label>

            <fieldset className="roles-grid">
              <legend className="field-label">{t('pagesTitle')}</legend>
              {PAGES.map((page) => (
                <div key={page} className="roles-row" role="radiogroup" aria-label={pageLabel(page)}>
                  <span className="roles-row-name">{pageLabel(page)}</span>
                  <span className="roles-levels">
                    {LEVELS.map((level) => (
                      <label key={level} className={`roles-level ${draft.grants[page] === level ? 'is-on' : ''}`}>
                        <input
                          type="radio"
                          name={`role-page-${page}`}
                          value={level}
                          checked={draft.grants[page] === level}
                          disabled={busy}
                          onChange={() => setDraft({ ...draft, grants: { ...draft.grants, [page]: level } })}
                        />
                        <span>{t(`levels.${level}`)}</span>
                      </label>
                    ))}
                  </span>
                </div>
              ))}
            </fieldset>

            {error && (
              <div role="alert" className="field-error">
                {error}
              </div>
            )}

            <div className="roles-actions">
              <button type="button" className="btn" disabled={busy || !writable} onClick={save}>
                {busy ? t('saving') : t('save')}
              </button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={close}>
                {t('back')}
              </button>
              {draft.id && (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy || !writable}
                  onClick={() => {
                    setRemoveError(null);
                    setRemoving(data.roles.find((r) => r.id === draft.id) ?? null);
                  }}
                >
                  {t('remove')}
                </button>
              )}
            </div>
          </div>
        </div>
        {removing && (
          <ConfirmDialog
            title={t('removeTitle', { name: removing.name })}
            body={t('removeBody')}
            confirmLabel={t('removeConfirm')}
            tone="danger"
            busy={busy}
            error={removeError}
            onConfirm={remove}
            onCancel={() => setRemoving(null)}
          />
        )}
      </>
  ) : null;

  return (
    <>
    <div ref={topRef} tabIndex={-1} className="roles-top" />
    {editor}
    {!draft && (
    <div className="card roles-card">
      <div className="card-head">{t('title')}</div>
      <div className="card-body">
        <p className="field-hint roles-intro">{t('intro')}</p>
        <p className="field-hint roles-intro">{t('todayNote')}</p>
        {data.roles.length === 0 ? (
          <p className="roles-empty">{t('empty')}</p>
        ) : (
          <ul className="roles-list">
            {data.roles.map((role) => (
              <li key={role.id}>
                <button type="button" className="roles-item" onClick={() => open(role)}>
                  <span className="roles-item-name">{role.name}</span>
                  <span className="roles-item-sub">
                    {t('people', { count: role.memberCount })}
                    {role.scheduleScoped ? ` · ${t('ownDays')}` : ''}
                  </span>
                  {role.isBuiltin && <span className="roles-badge">{t('builtIn')}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="roles-actions">
          <button type="button" className="btn" disabled={!writable} onClick={startNew}>
            {t('newRole')}
          </button>
        </div>
      </div>
    </div>
    )}
    {/* Mounted for as long as the screen is, hidden while a role is open: unmounting it re-seeded its lists from the page's first load. */}
    <div hidden={!!draft}>
      <RolesTeam roles={data.roles} initialMembers={team.members} initialInvites={team.invites} providers={team.providers} branches={team.branches} loadFailed={team.failed} onChanged={() => reload().catch(() => undefined)} />
    </div>
    </>
  );
}
