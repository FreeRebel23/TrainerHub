import { useData } from "./lib/data.js";
import { useNav } from "./lib/nav.js";
import { useTheme } from "./lib/theme.js";
import { usePwaUpdate } from "./usePwaUpdate.js";
import { AppShell } from "./components/AppShell.jsx";
import { Button } from "./components/ui.jsx";
import { HomeView } from "./views/Home.jsx";
import { TrainingBookView } from "./views/TrainingBook.jsx";
import { CalendarDayView } from "./views/CalendarDay.jsx";
import { NewSessionView } from "./views/NewSession.jsx";
import { SessionDetailView } from "./views/SessionDetail.jsx";
import { TeamsView, TeamDetailView } from "./views/Teams.jsx";
import { SeasonListView, NewSeasonView, SeasonDetailView, JahrgangUpgradeView } from "./views/Seasons.jsx";
import { StatsView } from "./views/Stats.jsx";
import { SettingsView } from "./views/Settings.jsx";

// Fokus-Ansichten blenden die mobile Tab-Leiste aus (Daumenbereich gehört der Aktion)
const FOCUS_VIEWS = new Set(["new_session", "new_season", "jahrgang_upgrade"]);
const KEEP_STATE  = new Set(["new_session", "training"]);

export default function App() {
  const { data, update } = useData();
  const { nav, go, back, finishFlow } = useNav();
  const theme = useTheme();
  const pwa   = usePwaUpdate();

  const v = nav.view;
  const p = nav.params ?? {};

  function saveSession(sess, planId) {
    const sessWithAuthor = { ...sess, erfasstVon: data.settings?.trainerName ?? "" };
    update(d => {
      const next = { ...d, sessions: [...(d.sessions ?? []), sessWithAuthor] };
      if (planId) {
        next.plannedSessions = (d.plannedSessions ?? []).map(pl =>
          pl.id === planId ? { ...pl, recordedId: sess.id } : pl
        );
      }
      return next;
    });
    // Assistent aus dem Verlauf nehmen: Zurück führt danach dorthin, wo das Erfassen begann
    finishFlow(p.step === 2 ? 2 : 1, "session_detail", { sessionId: sess.id });
  }

  function deleteSession(id) {
    update(d => ({
      ...d,
      sessions: (d.sessions ?? []).filter(s => s.id !== id),
      plannedSessions: (d.plannedSessions ?? []).map(pl =>
        pl.recordedId === id ? { ...pl, recordedId: null } : pl
      ),
    }));
    back("training");
  }

  const common = { data, update, go };
  let page;
  switch (v) {
    case "training":       page = <TrainingBookView {...common} params={p} />; break;
    case "calendar_day":   page = <CalendarDayView {...common} date={p.date} back={() => back("training", { mode: "calendar" })} />; break;
    case "new_session":    page = <NewSessionView {...common} params={p} onSave={saveSession} back={() => back("training")} />; break;
    case "session_detail": page = <SessionDetailView {...common} sessionId={p.sessionId} back={() => back("training")} onDelete={deleteSession} />; break;
    case "teams":          page = <TeamsView {...common} />; break;
    case "team_detail":    page = <TeamDetailView {...common} teamId={p.teamId} back={() => back("teams")} />; break;
    case "season_list":    page = <SeasonListView {...common} teamId={p.teamId} back={() => back("team_detail", { teamId: p.teamId })} />; break;
    case "new_season":     page = <NewSeasonView {...common} teamId={p.teamId} back={() => back("season_list", { teamId: p.teamId })} />; break;
    case "season_detail":  page = <SeasonDetailView {...common} seasonId={p.seasonId} back={() => back("season_list", { teamId: p.teamId })} />; break;
    case "jahrgang_upgrade": page = <JahrgangUpgradeView {...common} seasonId={p.seasonId} back={() => back("season_detail", { seasonId: p.seasonId, teamId: p.teamId })} />; break;
    case "stats":          page = <StatsView data={data} />; break;
    case "settings":       page = <SettingsView data={data} update={update} pwa={pwa} theme={theme} />; break;
    default:               page = <HomeView {...common} />;
  }

  return (
    <AppShell view={v} go={go} theme={theme} focus={FOCUS_VIEWS.has(v)}>
      {/* key: Wechsel zu einem anderen Datensatz setzt lokalen Zustand zurück. Assistent-Schritte
          und Ansichtsmodi des Trainingsbuchs behalten ihn. */}
      <div key={KEEP_STATE.has(v) ? v : v + JSON.stringify(p)}>{page}</div>
      {pwa.needRefresh && (
        <div className="update-banner" role="status">
          <span>Neue Version verfügbar – deine Daten bleiben erhalten.</span>
          <Button size="sm" onClick={pwa.applyUpdate}>Aktualisieren</Button>
        </div>
      )}
    </AppShell>
  );
}
