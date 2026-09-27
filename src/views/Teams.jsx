import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { uid, getActiveSeason } from "../lib/data.js";
import { roster } from "../lib/workspace.js";
import { savePrefs } from "../lib/prefs.js";
import { Button, PageIntro, Row, Meta, EmptyState, Field } from "../components/ui.jsx";

// Alle Teams, die ich sehen darf. Antippen öffnet den Team Workspace (Kader, Training, Saison).
export function TeamsView({ data, update, go, sync }) {
  // Mit Server legen nur Abteilungsleitung/Vereins-Admin Teams an (serverseitig erzwungen)
  const canAdd = sync?.mode !== "ready" || sync.canCreateTeams;
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName]       = useState("");
  const teams = data.teams ?? [];

  function addTeam() {
    if (!name.trim()) return;
    update(d => ({ ...d, teams: [...(d.teams ?? []), { id: uid(), name: name.trim(), playerIds: [] }] }));
    setName(""); setShowAdd(false);
  }

  return (
    <div className="page">
      <PageIntro title="Teams"
        actions={canAdd && !showAdd && <Button size="sm" icon={Plus} onClick={() => setShowAdd(true)}>Team</Button>} />
      <div className="page-body">
        {showAdd && (
          <form className="card form expand" onSubmit={e => { e.preventDefault(); addTeam(); }}>
            <Field label="Name des Teams" htmlFor="team-name">
              <input id="team-name" className="input" value={name} onChange={e => setName(e.target.value)} autoFocus
                placeholder="z. B. U14w" autoComplete="off" />
            </Field>
            <div className="btn-row">
              <Button variant="ghost" onClick={() => { setShowAdd(false); setName(""); }}>Abbrechen</Button>
              <Button variant="primary" type="submit" disabled={!name.trim()}>Anlegen</Button>
            </div>
          </form>
        )}

        {teams.length === 0 && !showAdd ? (
          canAdd ? (
            <EmptyState icon={Users} title="Noch kein Team"
              text="Lege dein erstes Team an und füge Spieler:innen hinzu."
              action={<Button variant="primary" icon={Plus} onClick={() => setShowAdd(true)}>Team anlegen</Button>} />
          ) : (
            <EmptyState icon={Users} title="Noch kein Team zugeordnet"
              text="Teams legt die Abteilungsleitung an und ordnet dich als Trainer:in zu." />
          )
        ) : (
          <div className="list">
            {teams.map(t => {
              const sessionCount = (data.sessions ?? []).filter(s => s.teamId === t.id).length;
              const season = getActiveSeason(t.id, data.seasons);
              const players = roster(t.id, season, data, { statuses: ["active", "paused"] }).map(r => r.player);
              const injured = players.filter(p => p.injured).length;
              return (
                <Row key={t.id}
                  title={t.name}
                  meta={<>
                    <Meta items={[`${players.length} Spieler:innen`, `${sessionCount} Trainings`, season?.name]} />
                    {injured > 0 && <> <span className="tag tone-danger">{injured} verletzt</span></>}
                  </>}
                  chevron onClick={() => { savePrefs({ teamId: t.id }); go("home", { teamId: t.id }, { root: true }); }} />
              );
            })}
          </div>
        )}
        {!canAdd && teams.length > 0 && (
          <p className="field__hint">Weitere Teams legt die Abteilungsleitung an und ordnet dich zu.</p>
        )}
      </div>
    </div>
  );
}
