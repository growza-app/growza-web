/** Desktop-only placeholder shown in the content pane when nothing under Settings is selected yet — see SettingsShell. Invisible on mobile (the hub route shows the nav pane instead). */
export default function SettingsHubPage() {
  return <div className="settings-empty-state">Pick a section from the list to get started.</div>;
}
