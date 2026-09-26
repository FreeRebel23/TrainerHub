import { useState } from "react";
import { Plus, Users, UserPlus, X, CalendarRange, Check, Bandage } from "lucide-react";
import { byId, uid, getTeamPlayers, getActiveSeason, allGamedays } from "../lib/data.js";
import { PHASES } from "../lib/constants.js";
import { todayISO, fmtRelative } from "../lib/dates.js";
import {
  Button, IconButton, PageHeader, PageIntro, Section, Row, Meta, EmptyState, Field, cx,
} from "../components/ui.jsx";
import { useConfirm } from "../components/confirm.jsx";

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
              const injured = getTeamPlayers(t.id, data).filter(p => p.injured).length;
              const season = getActiveSeason(t.id, data.seasons);
              return (
                <Row key={t.id}
                  title={t.name}
                  meta={<>
                    <Meta items={[`${t.playerIds?.length ?? 0} Spieler:innen`, `${sessionCount} Trainings`, season?.name]} />
                    {injured > 0 && <> <span className="tag tone-danger">{injured} verletzt</span></>}
                  </>}
                  chevron onClick={() => go("team_detail", { teamId: t.id })} />
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

export function TeamDetailView({ data, update, teamId, back, go }) {
  const team = byId(data.teams, teamId);
  const [showNew,  setShowNew]  = useState(false);
  const [showPick, setShowPick] = useState(false);
  const [newName,  setNewName]  = useState("");
  const [newYear,  setNewYear]  = useState("");
  const [selPick,  setSelPick]  = useState({});
  const confirm = useConfirm();

  if (!team) {
    return (
      <div className="page">
        <PageHeader title="Team" back={back} />
        <div className="page-body"><EmptyState icon={Users} title="Team nicht gefunden" /></div>
      </div>
    );
  }

  const teamPlayers = [...getTeamPlayers(teamId, data)].sort((a, b) => a.name.localeCompare(b.name, "de"));
  const teamIds     = new Set(team.playerIds ?? []);
  const available   = (data.players ?? []).filter(p => !teamIds.has(p.id));
  const season      = getActiveSeason(teamId, data.seasons);
  const today       = todayISO();
  const nextGame    = allGamedays(data).filter(g => g.teamId === teamId && g.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  const otherTeams = pid => (data.teams ?? [])
    .filter(t => t.id !== teamId && (t.playerIds ?? []).includes(pid))
    .map(t => t.name);

  const yearInvalid = newYear !== "" && !/^(19|20)\d{2}$/.test(newYear);

  function addNewPlayer() {
    if (!newName.trim() || yearInvalid) return;
    const p = { id: uid(), name: newName.trim(), birthYear: parseInt(newYear) || null, injured: false };
    update(d => ({
      ...d,
      players: [...(d.players ?? []), p],
      teams:   d.teams.map(t => t.id !== teamId ? t : { ...t, playerIds: [...(t.playerIds ?? []), p.id] }),
    }));
    setNewName(""); setNewYear(""); setShowNew(false);
  }

  function addExisting() {
    const ids = Object.entries(selPick).filter(([, v]) => v).map(([k]) => k);
    if (!ids.length) return;
    update(d => ({
      ...d,
      teams: d.teams.map(t => t.id !== teamId ? t : {
        ...t, playerIds: [...new Set([...(t.playerIds ?? []), ...ids])],
      }),
    }));
    setSelPick({}); setShowPick(false);
  }

  async function removeFromTeam(p) {
    if (!(await confirm({ title: `${p.name} aus ${team.name} entfernen?`, confirmLabel: "Entfernen", danger: true,
      text: "Die Person und ihre bisherige Trainingshistorie bleiben erhalten." }))) return;
    update(d => ({
      ...d,
      teams: d.teams.map(t => t.id !== teamId ? t : {
        ...t, playerIds: (t.playerIds ?? []).filter(id => id !== p.id),
      }),
    }));
  }

  function toggleInjured(pid) {
    update(d => ({
      ...d,
      players: d.players.map(p => p.id !== pid ? p : { ...p, injured: !p.injured }),
    }));
  }

  const pickCount = Object.values(selPick).filter(Boolean).length;
  const ph = season ? PHASES[season.phase] ?? PHASES.offseason : null;

  return (
    <div className="page">
      <PageHeader title={team.name} back={back} />
      <div className="page-body">

        <Section title="Saison">
          <div className="list">
            <Row
              lead={<CalendarRange size={20} aria-hidden="true" />}
              title={season ? season.name : "Noch keine aktive Saison"}
              meta={season
                ? <span className={cx("status", `tone-${ph.tone}`)}><span className="dot" />{ph.label}</span>
                : "Saison anlegen, um Spieltage zu planen"}
              chevron onClick={() => go("season_list", { teamId })} />
            {nextGame && (
              <Row
                title={<>Nächstes Spiel: {nextGame.isHome ? "gegen" : "bei"} {nextGame.opponent || "offenem Gegner"}</>}
                meta={<Meta items={[fmtRelative(nextGame.date, today), nextGame.isHome ? "Heim" : "Auswärts"]} />}
                chevron onClick={() => go("season_detail", { seasonId: nextGame.seasonId, teamId })} />
            )}
          </div>
        </Section>

        <Section title="Kader" hint={`${teamPlayers.length} Spieler:innen`}>
          {teamPlayers.length === 0 && !showNew && !showPick ? (
            <EmptyState icon={Users} title="Noch niemand im Kader" text="Lege Spieler:innen an oder übernimm sie aus einem anderen Team." />
          ) : teamPlayers.length > 0 && (
            <div className="list">
              {teamPlayers.map(p => {
                const others = otherTeams(p.id);
                return (
                  <div key={p.id} className="row">
                    <span className="row__main">
                      <span className="row__title">{p.name}</span>
                      <span className="row__meta">
                        <Meta items={[p.birthYear ? `Jg. ${p.birthYear}` : "Jahrgang offen", others.length > 0 && `auch ${others.join(", ")}`]} />
                      </span>
                    </span>
                    {p.injured ? (
                      <button type="button" className="tag tag--btn tone-danger" aria-pressed="true"
                        onClick={() => toggleInjured(p.id)} aria-label={`${p.name} ist verletzt – als fit markieren`}>
                        verletzt
                      </button>
                    ) : (
                      <IconButton icon={Bandage} size={18} variant="quiet" label={`${p.name} als verletzt markieren`}
                        aria-pressed="false" onClick={() => toggleInjured(p.id)} />
                    )}
                    <IconButton icon={X} size={18} variant="quiet" label={`${p.name} aus dem Team entfernen`} onClick={() => removeFromTeam(p)} />
                  </div>
                );
              })}
            </div>
          )}

          {showNew && (
            <form className="card form expand" onSubmit={e => { e.preventDefault(); addNewPlayer(); }}>
              <div className="field-grid field-grid--main">
                <Field label="Name" htmlFor="pl-name">
                  <input id="pl-name" className="input" value={newName} onChange={e => setNewName(e.target.value)}
                    autoFocus autoComplete="off" autoCapitalize="words" placeholder="Vor- und Nachname" />
                </Field>
                <Field label="Jahrgang" htmlFor="pl-year" error={yearInvalid ? "z. B. 2011" : null}>
                  <input id="pl-year" className="input" value={newYear} onChange={e => setNewYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    inputMode="numeric" pattern="[0-9]*" placeholder="optional" aria-invalid={yearInvalid} />
                </Field>
              </div>
              <div className="btn-row">
                <Button variant="ghost" onClick={() => setShowNew(false)}>Abbrechen</Button>
                <Button variant="primary" type="submit" disabled={!newName.trim() || yearInvalid}>Hinzufügen</Button>
              </div>
            </form>
          )}

          {showPick && (
            <div className="card form expand">
              <p className="section__title">Aus anderen Teams übernehmen</p>
              {available.length === 0 ? (
                <p className="text-3">Alle erfassten Spieler:innen sind bereits in diesem Team.</p>
              ) : (
                <div className="list list--plain">
                  {available.map(p => {
                    const inTeams = otherTeams(p.id);
                    const on = !!selPick[p.id];
                    return (
                      <button key={p.id} type="button" className="row" aria-pressed={on}
                        onClick={() => setSelPick(s => ({ ...s, [p.id]: !s[p.id] }))}>
                        <span className={cx("check", on && "check--on")} aria-hidden="true">{on && <Check size={14} strokeWidth={3} />}</span>
                        <span className="row__main">
                          <span className="row__title">{p.name}</span>
                          <span className="row__meta"><Meta items={[p.birthYear ? `Jg. ${p.birthYear}` : null, inTeams.length ? inTeams.join(", ") : "kein Team"]} /></span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="btn-row">
                <Button variant="ghost" onClick={() => { setShowPick(false); setSelPick({}); }}>Abbrechen</Button>
                {available.length > 0 && (
                  <Button variant="primary" disabled={pickCount === 0} onClick={addExisting}>
                    {pickCount > 0 ? `${pickCount} übernehmen` : "Auswählen"}
                  </Button>
                )}
              </div>
            </div>
          )}

          {!showNew && !showPick && (
            <div className="btn-row">
              <Button icon={UserPlus} onClick={() => { setShowNew(true); setShowPick(false); }}>Neu anlegen</Button>
              <Button icon={Users} onClick={() => { setShowPick(true); setShowNew(false); }}>Übernehmen</Button>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
