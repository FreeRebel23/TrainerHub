import { useState } from "react";
import { Plus, Trash2, CalendarRange, ArrowRightLeft, CheckCircle2, AlertTriangle, Check } from "lucide-react";
import { PHASES } from "../lib/constants.js";
import { byId, uid, getTeamPlayers, getSeasonSessions } from "../lib/data.js";
import { todayISO, fmtDate, getHoliday, getSchoolHoliday, parseISO } from "../lib/dates.js";
import {
  Button, IconButton, PageHeader, Section, Row, Meta, EmptyState, Field, ChoiceChips, Segmented, Notice, cx,
} from "../components/ui.jsx";

function PhaseStatus({ phase }) {
  const ph = PHASES[phase] ?? PHASES.offseason;
  return <span className={cx("status", `tone-${ph.tone}`)}><span className="dot" />{ph.label}</span>;
}

export function SeasonListView({ data, teamId, go, back }) {
  const team    = byId(data.teams, teamId);
  const seasons = [...(data.seasons ?? []).filter(s => s.teamId === teamId)]
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <div className="page">
      <PageHeader title={`${team?.name ?? "Team"} · Saisons`} back={back}
        actions={seasons.length > 0 && <IconButton icon={Plus} label="Neue Saison" variant="accent" onClick={() => go("new_season", { teamId })} />} />
      <div className="page-body">
        {seasons.length === 0 ? (
          <EmptyState icon={CalendarRange} title="Noch keine Saison"
            text="Eine Saison bündelt Trainingszeitraum, Phase und Spieltage."
            action={<Button variant="primary" icon={Plus} onClick={() => go("new_season", { teamId })}>Saison anlegen</Button>} />
        ) : (
          <div className="list">
            {seasons.map(s => (
              <Row key={s.id}
                title={s.name}
                meta={<>
                  <PhaseStatus phase={s.phase} />
                  <span className="row__meta block">
                    <Meta items={[`${fmtDate(s.startDate)} – ${fmtDate(s.endDate)}`, `${getSeasonSessions(s, data.sessions).length} Trainings`, `${(s.gamedays ?? []).length} Spieltage`]} />
                  </span>
                </>}
                chevron onClick={() => go("season_detail", { seasonId: s.id, teamId })} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function NewSeasonView({ update, teamId, back }) {
  const yr = new Date().getFullYear();
  const [name,  setName]  = useState("Saison " + yr + "/" + String(yr + 1).slice(2));
  const [start, setStart] = useState(yr + "-09-01");
  const [end,   setEnd]   = useState((yr + 1) + "-06-30");
  const [phase, setPhase] = useState("vorbereitung");
  const rangeInvalid = start && end && end < start;
  const valid = name.trim() && start && end && !rangeInvalid;

  function save() {
    if (!valid) return;
    const season = { id: uid(), teamId, name: name.trim(), startDate: start, endDate: end, phase, gamedays: [] };
    update(d => ({ ...d, seasons: [...(d.seasons ?? []), season] }));
    back();
  }

  return (
    <div className="page">
      <PageHeader title="Neue Saison" back={back} />
      <form onSubmit={e => { e.preventDefault(); save(); }}>
        <div className="page-body form">
          <Field label="Name" htmlFor="se-name">
            <input id="se-name" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="z. B. Saison 2026/27" />
          </Field>
          <div className="field-grid">
            <Field label="Beginn" htmlFor="se-start">
              <input id="se-start" className="input" type="date" value={start} onChange={e => setStart(e.target.value)} />
            </Field>
            <Field label="Ende" htmlFor="se-end" error={rangeInvalid ? "Liegt vor dem Beginn." : null}>
              <input id="se-end" className="input" type="date" value={end} aria-invalid={rangeInvalid} onChange={e => setEnd(e.target.value)} />
            </Field>
          </div>
          <Field label="Startphase">
            <ChoiceChips label="Startphase" value={phase} onChange={setPhase}
              options={Object.entries(PHASES).filter(([k]) => k !== "abgeschlossen").map(([k, p]) => ({ value: k, label: p.label }))} />
          </Field>
        </div>
        <div className="action-bar">
          <Button variant="primary" size="lg" type="submit" disabled={!valid}>Saison anlegen</Button>
        </div>
      </form>
    </div>
  );
}

export function SeasonDetailView({ data, update, seasonId, go, back }) {
  const season = (data.seasons ?? []).find(s => s.id === seasonId);
  const [showAddGame, setShowAddGame] = useState(false);
  const [gd, setGd] = useState({ date: todayISO(), opponent: "", isHome: true, result: "" });

  if (!season) {
    return (
      <div className="page">
        <PageHeader title="Saison" back={back} />
        <div className="page-body"><EmptyState icon={CalendarRange} title="Saison nicht gefunden" /></div>
      </div>
    );
  }

  const team     = byId(data.teams, season.teamId);
  const sessions = getSeasonSessions(season, data.sessions);
  const gamedays = [...(season.gamedays ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const today    = todayISO();

  function changePhase(newPhase) {
    update(d => ({
      ...d,
      seasons: d.seasons.map(s => s.id !== seasonId ? s : { ...s, phase: newPhase }),
    }));
  }

  function addGameday() {
    if (!gd.date) return;
    const entry = { id: uid(), ...gd, opponent: gd.opponent.trim() };
    update(d => ({
      ...d,
      seasons: d.seasons.map(s => s.id !== seasonId ? s : {
        ...s, gamedays: [...(s.gamedays ?? []), entry],
      }),
    }));
    setGd({ date: todayISO(), opponent: "", isHome: true, result: "" });
    setShowAddGame(false);
  }

  function delGameday(g) {
    if (!window.confirm(`Spieltag ${fmtDate(g.date)}${g.opponent ? " gegen " + g.opponent : ""} löschen?`)) return;
    update(d => ({
      ...d,
      seasons: d.seasons.map(s => s.id !== seasonId ? s : {
        ...s, gamedays: (s.gamedays ?? []).filter(x => x.id !== g.id),
      }),
    }));
  }

  return (
    <div className="page">
      <PageHeader title={season.name} back={back} />
      <div className="page-body">
        <div className="detail-head">
          <p className="detail-head__eyebrow"><Meta items={[team?.name, `${fmtDate(season.startDate)} – ${fmtDate(season.endDate)}`]} /></p>
          <h2 className="detail-head__title">{season.name}</h2>
          <PhaseStatus phase={season.phase} />
        </div>

        <div className="facts">
          <div><p className="fact__value">{sessions.length}</p><p className="fact__label">Trainings</p></div>
          <div><p className="fact__value">{gamedays.length}</p><p className="fact__label">Spieltage</p></div>
          <div><p className="fact__value">{getTeamPlayers(season.teamId, data).length}</p><p className="fact__label">Spieler:innen</p></div>
        </div>

        {season.phase !== "abgeschlossen" && (
          <Section title="Phase">
            <ChoiceChips label="Phase" value={season.phase} onChange={changePhase}
              options={Object.entries(PHASES).map(([k, p]) => ({ value: k, label: p.label }))} />
          </Section>
        )}

        <Section title="Spieltage" hint={`${gamedays.length}`}>
          {gamedays.length === 0 && !showAddGame && <p className="text-3">Noch keine Spieltage eingetragen.</p>}
          {gamedays.length > 0 && (
            <div className="list">
              {gamedays.map(g => {
                const hol  = getHoliday(g.date);
                const schH = getSchoolHoliday(g.date);
                const d = parseISO(g.date);
                return (
                  <div key={g.id} className={cx("row", g.date < today && "text-2")}>
                    <span className={cx("date-block", g.date === today && "date-block--today")}>
                      <span className="date-block__day">{d.getDate()}</span>
                      <span className="date-block__wd">{d.toLocaleDateString("de-DE", { month: "short" })}</span>
                    </span>
                    <span className="row__main">
                      <span className="row__title">{g.isHome ? "gegen" : "bei"} {g.opponent || "Gegner offen"}</span>
                      <span className="row__meta">
                        <Meta items={[g.isHome ? "Heim" : "Auswärts", g.result && `Ergebnis ${g.result}`, hol, schH && "Schulferien"]} />
                      </span>
                    </span>
                    <IconButton icon={Trash2} size={18} label="Spieltag löschen" onClick={() => delGameday(g)} />
                  </div>
                );
              })}
            </div>
          )}

          {showAddGame ? (
            <form className="card form expand" onSubmit={e => { e.preventDefault(); addGameday(); }}>
              <div className="field-grid">
                <Field label="Datum" htmlFor="gd-date">
                  <input id="gd-date" className="input" type="date" value={gd.date} onChange={e => setGd(g => ({ ...g, date: e.target.value }))} />
                </Field>
                <Field label="Spielort">
                  <Segmented label="Spielort" block value={gd.isHome} onChange={v => setGd(g => ({ ...g, isHome: v }))}
                    options={[{ value: true, label: "Heim" }, { value: false, label: "Auswärts" }]} />
                </Field>
              </div>
              <Field label="Gegner" htmlFor="gd-opp" hint="optional">
                <input id="gd-opp" className="input" value={gd.opponent} autoComplete="off" onChange={e => setGd(g => ({ ...g, opponent: e.target.value }))} />
              </Field>
              <Field label="Ergebnis" htmlFor="gd-res" hint="optional, z. B. 72:65">
                <input id="gd-res" className="input" value={gd.result} inputMode="numeric" autoComplete="off" onChange={e => setGd(g => ({ ...g, result: e.target.value }))} />
              </Field>
              <div className="btn-row">
                <Button variant="ghost" onClick={() => setShowAddGame(false)}>Abbrechen</Button>
                <Button variant="primary" type="submit" disabled={!gd.date}>Speichern</Button>
              </div>
            </form>
          ) : (
            <Button icon={Plus} onClick={() => setShowAddGame(true)} className="self-start">Spieltag hinzufügen</Button>
          )}
        </Section>

        {season.phase !== "abgeschlossen" && (
          <Section title="Saisonabschluss">
            <div className="list">
              <Row lead={<ArrowRightLeft size={20} aria-hidden="true" />}
                title="Jahrgangswechsel"
                meta="Spieler:innen in ein anderes Team übernehmen und Saison abschließen"
                chevron onClick={() => go("jahrgang_upgrade", { seasonId, teamId: season.teamId })} />
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

export function JahrgangUpgradeView({ data, update, seasonId, go, back }) {
  const season     = (data.seasons ?? []).find(s => s.id === seasonId);
  const srcTeam    = season ? byId(data.teams, season.teamId) : null;
  const srcPlayers = srcTeam ? getTeamPlayers(srcTeam.id, data) : [];
  const others     = (data.teams ?? []).filter(t => t.id !== srcTeam?.id);
  const [sel, setSel]      = useState({});
  const [targetId, setTgt] = useState(others[0]?.id ?? "");
  const [done, setDone]    = useState(false);

  if (!season || !srcTeam) return null;

  const toggle = pid => setSel(s => ({ ...s, [pid]: !s[pid] }));
  const cnt = Object.values(sel).filter(Boolean).length;

  function execute() {
    const ids = Object.entries(sel).filter(([, v]) => v).map(([k]) => k);
    if (!ids.length || !targetId) return;
    update(d => {
      const tgt = d.teams.find(t => t.id === targetId);
      if (!tgt) return d;
      const existing = new Set(tgt.playerIds ?? []);
      const toAdd    = ids.filter(id => !existing.has(id));
      return {
        ...d,
        teams:   d.teams.map(t => t.id !== targetId ? t : {
          ...t, playerIds: [...(t.playerIds ?? []), ...toAdd],
        }),
        seasons: d.seasons.map(s => s.id !== seasonId ? s : { ...s, phase: "abgeschlossen" }),
      };
    });
    setDone(true);
  }

  if (done) {
    const tgtName = byId(data.teams, targetId)?.name ?? "Zielteam";
    return (
      <div className="page">
        <PageHeader title="Jahrgangswechsel" />
        <div className="page-body">
          <EmptyState icon={CheckCircle2} title="Übertragen"
            text={`${cnt} Spieler:in${cnt !== 1 ? "nen" : ""} nach ${tgtName} übernommen. Die Saison ist abgeschlossen.`}
            action={<Button variant="primary" onClick={() => go("teams", {}, { root: true })}>Zu den Teams</Button>} />
        </div>
      </div>
    );
  }

  const disabled = cnt === 0 || !targetId || others.length === 0;

  return (
    <div className="page">
      <PageHeader title="Jahrgangswechsel" back={back} />
      <div className="page-body">
        <p className="text-2">
          Spieler:innen aus <strong>{srcTeam.name}</strong> in ein anderes Team übernehmen. Sie bleiben
          zusätzlich in {srcTeam.name}, bis du sie dort entfernst. Die Saison wird danach abgeschlossen.
        </p>

        {others.length > 0 ? (
          <Field label="Zielteam">
            <ChoiceChips label="Zielteam" value={targetId} onChange={setTgt}
              options={others.map(t => ({ value: t.id, label: t.name, meta: t.playerIds?.length ?? 0 }))} />
          </Field>
        ) : (
          <Notice tone="warning" icon={AlertTriangle}>Kein weiteres Team vorhanden. Lege zuerst unter Teams ein Zielteam an.</Notice>
        )}

        <Section title="Spieler:innen" hint={`${cnt} ausgewählt`}>
          <div className="list">
            {srcPlayers.map(p => {
              const on = !!sel[p.id];
              return (
                <button key={p.id} type="button" className="row" aria-pressed={on} onClick={() => toggle(p.id)}>
                  <span className={cx("check", on && "check--on")} aria-hidden="true">{on && <Check size={14} strokeWidth={3} />}</span>
                  <span className="row__main">
                    <span className="row__title">{p.name}</span>
                    <span className="row__meta"><Meta items={[p.birthYear ? `Jg. ${p.birthYear}` : "Jahrgang offen", p.injured && "verletzt"]} /></span>
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      </div>
      <div className="action-bar">
        <Button variant="primary" size="lg" disabled={disabled} onClick={execute}>
          {cnt > 0 ? `${cnt} übernehmen und abschließen` : "Spieler:innen auswählen"}
        </Button>
      </div>
    </div>
  );
}
