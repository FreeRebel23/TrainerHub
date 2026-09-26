import { Home, BookOpen, Users, BarChart3, Settings, MoreHorizontal, Moon, Sun } from "lucide-react";
import { cx } from "./ui.jsx";

// Hauptbereiche. "Mehr" (mobil) bzw. "Einstellungen" (Desktop) bündelt Stammdaten,
// Datenaustausch und App-Einstellungen.
export const TABS = [
  { key: "home",     label: "Start",        short: "Start",    icon: Home },
  { key: "training", label: "Trainingsbuch", short: "Training", icon: BookOpen },
  { key: "teams",    label: "Teams",        short: "Teams",    icon: Users },
  { key: "stats",    label: "Auswertung",   short: "Auswertung", icon: BarChart3 },
];

const VIEW_TAB = {
  home: "home",
  training: "training", calendar_day: "training", session_detail: "training", new_session: "training",
  plan_edit: "training", plan_detail: "training",
  teams: "teams", team_detail: "teams", season_list: "teams", new_season: "teams",
  season_detail: "teams", jahrgang_upgrade: "teams",
  stats: "stats",
  settings: "settings",
};
export const tabOf = view => VIEW_TAB[view] ?? "home";

export function AppShell({ view, go, theme, focus, club, children }) {
  const active = tabOf(view);
  const goTab = key => go(key, {}, { root: true });
  const current = key => (active === key ? "page" : undefined);

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Hauptnavigation">
        <div className="sidebar__brand">
          <span className="brand-mark" aria-hidden="true">TH</span>
          <span>TrainerHub<span className="sidebar__club">{club}</span></span>
        </div>
        <nav className="sidebar__nav">
          {TABS.map(t => (
            <button key={t.key} type="button" className="nav-item" aria-current={current(t.key)} onClick={() => goTab(t.key)}>
              <t.icon size={18} aria-hidden="true" />{t.label}
            </button>
          ))}
        </nav>
        <div className="sidebar__foot">
          <button type="button" className="nav-item" aria-current={current("settings")} onClick={() => goTab("settings")}>
            <Settings size={18} aria-hidden="true" />Einstellungen
          </button>
          <button type="button" className="nav-item" onClick={theme.toggle}>
            {theme.theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            {theme.theme === "dark" ? "Helles Design" : "Dunkles Design"}
          </button>
        </div>
      </aside>

      <main className={cx("main", focus && "main--focus")}>{children}</main>

      {!focus && (
        <nav className="tabbar" aria-label="Hauptnavigation">
          {TABS.map(t => (
            <button key={t.key} type="button" className="tabbar__item" aria-current={current(t.key)} onClick={() => goTab(t.key)}>
              <t.icon size={22} aria-hidden="true" />{t.short}
            </button>
          ))}
          <button type="button" className="tabbar__item" aria-current={current("settings")} onClick={() => goTab("settings")}>
            <MoreHorizontal size={22} aria-hidden="true" />Mehr
          </button>
        </nav>
      )}
    </div>
  );
}
