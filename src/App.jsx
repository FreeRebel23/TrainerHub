import { useAppData } from "./sync/useSyncedData.js";
import { recordSession, removeSession } from "./lib/training.js";
import { useNav } from "./lib/nav.js";
import { useTheme } from "./lib/theme.js";
import { usePwaUpdate } from "./usePwaUpdate.js";
import { AppShell } from "./components/AppShell.jsx";
import { Button } from "./components/ui.jsx";
import { ConfirmProvider } from "./components/confirm.jsx";
import { HomeView } from "./views/Home.jsx";
import { TrainingBookView } from "./views/TrainingBook.jsx";
import { CalendarDayView } from "./views/CalendarDay.jsx";
import { NewSessionView } from "./views/NewSession.jsx";
import { SessionDetailView } from "./views/SessionDetail.jsx";
import { TeamsView, TeamDetailView } from "./views/Teams.jsx";
import { SeasonListView, NewSeasonView, SeasonDetailView, JahrgangUpgradeView } from "./views/Seasons.jsx";
import { StatsView } from "./views/Stats.jsx";
import { SettingsView } from "./views/Settings.jsx";
import { PlanEditView } from "./views/PlanEdit.jsx";
import { PlanDetailView } from "./views/PlanDetail.jsx";
import { LoginView, MigrationView } from "./views/Account.jsx";
import { SyncNotice } from "./components/SyncStatus.jsx";

// Fokus-Ansichten blenden die mobile Tab-Leiste aus (Daumenbereich gehört der Aktion)
const FOCUS_VIEWS = new Set(["new_session", "plan_edit", "new_season", "jahrgang_upgrade"]);
const KEEP_STATE  = new Set(["new_session", "training"]);

export default function App() {
  const { data, update, sync } = useAppData();
  const { nav, go, back, finishFlow } = useNav();
  const theme = useTheme();
  const pwa   = usePwaUpdate();

  const v = nav.view;
  const p = nav.params ?? {};

  function saveSession(sess) {
    const sessWithAuthor = { ...sess, erfasstVon: data.settings?.trainerName ?? "" };
    update(d => recordSession(d, sessWithAuthor));
    // Assistent aus dem Verlauf nehmen: Zurück führt danach dorthin, wo das Erfassen begann
    finishFlow(p.steps ?? 1, "session_detail", { sessionId: sess.id });
  }

  function deleteSession(id) {
    update(d => removeSession(d, id));
    back("training");
  }

  const common = { data, update, go };
  let page;
  switch (v) {
    case "training":       page = <TrainingBookView {...common} params={p} />; break;
    case "calendar_day":   page = <CalendarDayView {...common} date={p.date} back={() => back("training", { mode: "calendar" })} />; break;
    case "new_session":    page = <NewSessionView {...common} params={p} onSave={saveSession} back={() => back("training")} />; break;
    case "session_detail": page = <SessionDetailView {...common} sessionId={p.sessionId} editing={!!p.edit}
                             back={() => back(p.edit ? "session_detail" : "training", p.edit ? { sessionId: p.sessionId } : {})} onDelete={deleteSession} />; break;
    case "plan_edit":      page = <PlanEditView {...common} params={p} finishFlow={finishFlow} back={() => back(p.planId ? "plan_detail" : "training", p.planId ? { planId: p.planId } : {})} />; break;
    case "plan_detail":    page = <PlanDetailView {...common} planId={p.planId} back={() => back("training")} />; break;
    case "teams":          page = <TeamsView {...common} sync={sync} />; break;
    case "team_detail":    page = <TeamDetailView {...common} teamId={p.teamId} back={() => back("teams")} />; break;
    case "season_list":    page = <SeasonListView {...common} teamId={p.teamId} back={() => back("team_detail", { teamId: p.teamId })} />; break;
    case "new_season":     page = <NewSeasonView {...common} teamId={p.teamId} back={() => back("season_list", { teamId: p.teamId })} />; break;
    case "season_detail":  page = <SeasonDetailView {...common} seasonId={p.seasonId} back={() => back("season_list", { teamId: p.teamId })} />; break;
    case "jahrgang_upgrade": page = <JahrgangUpgradeView {...common} seasonId={p.seasonId} back={() => back("season_detail", { seasonId: p.seasonId, teamId: p.teamId })} />; break;
    case "stats":          page = <StatsView data={data} />; break;
    case "settings":       page = <SettingsView data={data} update={update} pwa={pwa} theme={theme} sync={sync} />; break;
    default:               page = <HomeView {...common} />;
  }

  // Servermodus: Anmeldung bzw. Erstübernahme vor der eigentlichen App
  if (sync.mode === "login" || (sync.mode === "ready" && sync.reloginOpen)) return <ConfirmProvider><LoginView sync={sync} /></ConfirmProvider>;
  if (sync.mode === "migrate") return <ConfirmProvider><MigrationView sync={sync} /></ConfirmProvider>;

  return (
    <ConfirmProvider>
    <AppShell view={v} go={go} theme={theme} club={clubLabel(data, sync.meta.sectionId)} focus={FOCUS_VIEWS.has(v) || (v === "session_detail" && !!p.edit)}>
      <SyncNotice sync={sync} go={go} />
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
    </ConfirmProvider>
  );
}

// Verein/Abteilung aus dem Konto; ohne Server die bisherige Bezeichnung
function clubLabel(data, sectionId) {
  const section = (data.sections ?? []).find(x => x.id === sectionId);
  const org = section && (data.organizations ?? []).find(o => o.id === section.organizationId);
  return org ? [org.name, section.name].join(" ") : "TV Bretten Basketball";
}
