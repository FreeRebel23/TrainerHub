import { useAppData } from "./sync/useSyncedData.js";
import { recordSession, removeSession } from "./lib/training.js";
import { linkObservations } from "./lib/workspace.js";
import { currentTeamId, savePrefs } from "./lib/prefs.js";
import { useNav } from "./lib/nav.js";
import { useTheme } from "./lib/theme.js";
import { usePwaUpdate } from "./usePwaUpdate.js";
import { AppShell } from "./components/AppShell.jsx";
import { Button } from "./components/ui.jsx";
import { ConfirmProvider } from "./components/confirm.jsx";
import { WorkspaceView } from "./views/Workspace.jsx";
import { RosterView, PlayerView } from "./views/Players.jsx";
import { TrainingBookView } from "./views/TrainingBook.jsx";
import { CalendarDayView } from "./views/CalendarDay.jsx";
import { NewSessionView } from "./views/NewSession.jsx";
import { SessionDetailView } from "./views/SessionDetail.jsx";
import { TeamsView } from "./views/Teams.jsx";
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

  // Wer bin ich? (Beobachtungen: createdBy nur im Servermodus, Name immer)
  const me = { id: sync.meta?.user?.id ?? null, name: data.settings?.trainerName || sync.meta?.user?.name || "" };
  // Eigene Teams (coach) für Teamwechsel und Vorauswahl; ohne Server alle Teams
  const myTeamIds = sync.mode === "ready" ? (sync.meta?.permissions?.coach ?? []) : (data.teams ?? []).map(t => t.id);
  const teamId = currentTeamId(data.teams, { requested: p.teamId, mine: myTeamIds });
  if (p.teamId && p.teamId === teamId) savePrefs({ teamId });

  function saveSession(sess, { observationIds = [] } = {}) {
    const sessWithAuthor = { ...sess, erfasstVon: data.settings?.trainerName ?? "" };
    // Während des Trainings erfasste Beobachtungen beim Abschluss mit dem Training verknüpfen
    update(d => linkObservations(recordSession(d, sessWithAuthor), observationIds, sess.id));
    // Assistent aus dem Verlauf nehmen: Zurück führt danach dorthin, wo das Erfassen begann
    finishFlow(p.steps ?? 1, "session_detail", { sessionId: sess.id });
  }

  function deleteSession(id) {
    update(d => removeSession(d, id));
    back("training");
  }

  const common = { data, update, go, me };
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
    case "team_detail":
    case "roster":         page = <RosterView {...common} params={{ ...p, teamId: p.teamId ?? teamId }} back={() => back("home", { teamId: p.teamId ?? teamId })} />; break;
    case "player":         page = <PlayerView {...common} params={{ ...p, teamId: p.teamId ?? teamId }} back={() => back("roster", { teamId: p.teamId ?? teamId })} />; break;
    case "season_list":    page = <SeasonListView {...common} teamId={p.teamId} back={() => back("home", { teamId: p.teamId })} />; break;
    case "new_season":     page = <NewSeasonView {...common} teamId={p.teamId} back={() => back("season_list", { teamId: p.teamId })} />; break;
    case "season_detail":  page = <SeasonDetailView {...common} seasonId={p.seasonId} back={() => back("season_list", { teamId: p.teamId })} />; break;
    case "jahrgang_upgrade": page = <JahrgangUpgradeView {...common} seasonId={p.seasonId} back={() => back("season_detail", { seasonId: p.seasonId, teamId: p.teamId })} />; break;
    case "stats":          page = <StatsView data={data} params={p} />; break;
    case "settings":       page = <SettingsView data={data} update={update} pwa={pwa} theme={theme} sync={sync} />; break;
    default:               page = <WorkspaceView {...common} params={p} teamId={teamId} myTeamIds={myTeamIds} />;
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
