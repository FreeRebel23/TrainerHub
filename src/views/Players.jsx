import { useState } from "react";
import { Search, UserPlus, Users, Eye, Pencil } from "lucide-react";
import { todayISO } from "../lib/dates.js";
import { byId } from "../lib/data.js";
import { knownTags } from "../lib/training.js";
import {
  ROSTER_STATUS, activeSeason, isHistorical, roster, addToRoster, createPlayer, removeFromRoster, updateRosterEntry, updatePlayer,
  playerObservations, observationThemes, playerAttendance, observationSource, updateObservation, removeObservation,
} from "../lib/workspace.js";
import { Button, PageHeader, Section, Row, Meta, EmptyState, Field, ChoiceChips, Notice, cx } from "../components/ui.jsx";
import { Sheet } from "../components/sheet.jsx";
import { useConfirm } from "../components/confirm.jsx";
import { ObservationList, ObservationDetail, useObservationCapture } from "../components/observation.jsx";

function useSeason(data, teamId, seasonId, today) {
  const active = activeSeason(teamId, data, today);
  const season = (seasonId && byId(data.seasons, seasonId)) || active;
  return { season, active, readOnly: !!season && (season.id !== active?.id || isHistorical(season, today)) };
}

const StatusTag = ({ status }) => status && status !== "active"
  ? <span className={cx("tag", `tone-${ROSTER_STATUS[status]?.tone ?? "muted"}`)}>{ROSTER_STATUS[status]?.label ?? status}</span> : null;

// ─── Kader einer Saison ───
export function RosterView({ data, update, go, params, back }) {
  const today = todayISO();
  const teamId = params.teamId;
  const team = byId(data.teams, teamId);
  const { season, readOnly } = useSeason(data, teamId, params.seasonId, today);
  const [query, setQuery] = useState("");
  const [showLeft, setShowLeft] = useState(false);
  const [adding, setAdding] = useState(false);
  if (!team) return <div className="page"><PageHeader title="Kader" back={back} /><div className="page-body"><EmptyState icon={Users} title="Team nicht gefunden" /></div></div>;

  const rows = roster(teamId, season, data);
  const current = rows.filter(r => (r.entry?.status ?? "active") !== "left");
  const left = rows.filter(r => r.entry?.status === "left");
  const q = query.trim().toLocaleLowerCase("de");
  const match = r => !q || r.player.name.toLocaleLowerCase("de").includes(q) || (r.entry?.jerseyNumber ?? "") === q;
  const obsCount = pid => playerObservations(pid, data, { teamId, season }).length;
  const open = pid => go("player", { playerId: pid, teamId, ...(params.seasonId ? { seasonId: params.seasonId } : {}) });

  const playerRow = ({ player: p, entry }) => (
    <Row key={p.id} title={p.name}
      meta={<>
        <Meta items={[entry?.jerseyNumber && `#${entry.jerseyNumber}`, entry?.position, p.birthYear && `Jg. ${p.birthYear}`,
          obsCount(p.id) > 0 && `${obsCount(p.id)} Beobachtungen`]} />
        {" "}<StatusTag status={entry?.status} />{p.injured && <> <span className="tag tone-danger">verletzt</span></>}
      </>}
      chevron onClick={() => open(p.id)} />
  );

  return (
    <div className="page">
      <PageHeader title="Kader" back={back} />
      <div className="page-body">
        <p className="ws-season"><Meta items={[team.name, season?.name ?? "ohne Saison", `${current.length} Spieler:innen`]} /></p>
        {readOnly && <Notice tone="info">Abgeschlossene Saison – der damalige Kader bleibt so erhalten.</Notice>}
        {current.length > 8 && (
          <div className="search">
            <Search size={18} className="search__icon" aria-hidden="true" />
            <label htmlFor="roster-search" className="sr-only">Im Kader suchen</label>
            <input id="roster-search" className="input search__input" type="search" value={query} autoComplete="off"
              onChange={e => setQuery(e.target.value)} placeholder="Name oder Nummer" enterKeyHint="search" />
          </div>
        )}
        {current.length === 0 ? (
          <EmptyState icon={Users} title="Noch niemand im Kader"
            text={readOnly ? "Für diese Saison ist kein Kader hinterlegt." : "Füge die Spieler:innen dieser Saison hinzu."} />
        ) : (
          <div className="list">{current.filter(match).map(playerRow)}</div>
        )}
        {left.length > 0 && (
          <Section>
            <button type="button" className="link-btn self-start" onClick={() => setShowLeft(v => !v)} aria-expanded={showLeft}>
              {showLeft ? "Ehemalige ausblenden" : `Nicht mehr im Kader (${left.length})`}
            </button>
            {showLeft && <div className="list">{left.filter(match).map(playerRow)}</div>}
          </Section>
        )}
      </div>
      {!readOnly && (
        <div className="action-bar">
          <Button size="lg" icon={UserPlus} onClick={() => setAdding(true)}>Spieler:in hinzufügen</Button>
        </div>
      )}
      {adding && <AddPlayerSheet data={data} update={update} teamId={teamId} season={season} onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddPlayerSheet({ data, update, teamId, season, onClose }) {
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const yearInvalid = year !== "" && !/^(19|20)\d{2}$/.test(year);
  const inRoster = new Set(roster(teamId, season, data, { statuses: ["active", "paused"] }).map(r => r.player.id));
  // Personen aus eigenen Teams/früheren Saisons (der Server liefert nur, was sichtbar sein darf)
  const known = (data.players ?? []).filter(p => !inRoster.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, "de"));
  function addNew() {
    if (!name.trim() || yearInvalid) return;
    update(d => createPlayer(d, { teamId, season, name, birthYear: parseInt(year) || null }).data);
    onClose();
  }
  return (
    <Sheet open onClose={onClose} title="Spieler:in hinzufügen">
      <form className="form" onSubmit={e => { e.preventDefault(); addNew(); }}>
        <div className="field-grid field-grid--main">
          <Field label="Name" htmlFor="np-name">
            <input id="np-name" className="input" value={name} onChange={e => setName(e.target.value)} data-autofocus autoComplete="off"
              autoCapitalize="words" placeholder="Vor- und Nachname" />
          </Field>
          <Field label="Jahrgang" htmlFor="np-year" error={yearInvalid ? "z. B. 2011" : null}>
            <input id="np-year" className="input" value={year} inputMode="numeric" placeholder="optional" aria-invalid={yearInvalid}
              onChange={e => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </Field>
        </div>
        <Button variant="primary" type="submit" disabled={!name.trim() || yearInvalid}>Neu anlegen</Button>
      </form>
      {known.length > 0 && (
        <>
          <p className="section__title">Bereits bekannt</p>
          <div className="list">
            {known.map(p => (
              <Row key={p.id} title={p.name} meta={p.birthYear ? `Jg. ${p.birthYear}` : null}
                trail={<span className="btn btn--sm btn--secondary" aria-hidden="true">Aufnehmen</span>}
                aria-label={`${p.name} in den Kader aufnehmen`}
                onClick={() => { update(d => addToRoster(d, { teamId, season, playerId: p.id })); onClose(); }} />
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

// ─── Spielerprofil: Verlauf statt Bewertung ───
export function PlayerView({ data, update, go, params, back, me }) {
  const today = todayISO();
  const confirm = useConfirm();
  const player = byId(data.players, params.playerId);
  const teamId = params.teamId;
  const team = byId(data.teams, teamId);
  const { season, readOnly } = useSeason(data, teamId, params.seasonId, today);
  const [editing, setEditing] = useState(false);
  const [allSeasons, setAllSeasons] = useState(false);
  const [detail, setDetail] = useState(null);
  const obs = useObservationCapture({ update, me, tagOptions: knownTags(data) });

  if (!player) return <div className="page"><PageHeader title="Spieler:in" back={back} /><div className="page-body"><EmptyState icon={Users} title="Nicht gefunden" /></div></div>;

  const entry = roster(teamId, season, data).find(r => r.player.id === player.id)?.entry ?? null;
  const items = playerObservations(player.id, data, { season: allSeasons ? null : season });
  const older = allSeasons ? 0 : playerObservations(player.id, data).length - items.length;
  const themes = observationThemes(items);
  const att = playerAttendance(player.id, teamId, season, data);
  const canObserve = !readOnly && (entry?.status ?? "active") !== "left";
  const src = o => observationSource(o, data);
  const canEdit = o => !me?.id || !o.createdBy || o.createdBy === me.id;

  async function deleteObs(o) {
    if (!(await confirm({ title: "Beobachtung löschen?", text: o.text, danger: true, confirmLabel: "Löschen" }))) return;
    update(d => removeObservation(d, o.id));
    setDetail(null);
  }

  return (
    <div className="page">
      <PageHeader title={player.name} back={back}
        actions={!readOnly && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>Angaben</Button>} />
      <div className="page-body">
        <div className="detail-head">
          <p className="detail-head__eyebrow"><Meta items={[team?.name, season?.name]} /></p>
          <p className="detail-head__meta">
            <Meta items={[entry?.jerseyNumber && `#${entry.jerseyNumber}`, entry?.position, player.birthYear && `Jg. ${player.birthYear}`]} />
            {" "}<StatusTag status={entry?.status} />{player.injured && <> <span className="tag tone-danger">verletzt</span></>}
          </p>
        </div>

        <div className="facts">
          <div><p className="fact__value">{att.listed ? <>{att.present}<span className="fact__of"> / {att.listed}</span></> : "–"}</p><p className="fact__label">Trainings dabei</p></div>
          <div><p className="fact__value">{items.length}</p><p className="fact__label">Beobachtungen</p></div>
        </div>

        {themes.length > 0 && (
          <Section title="Wiederkehrende Themen" hint="aus Beobachtungen">
            <span className="obs__tags">{themes.map(t => <span key={t.tag} className="tag">{t.tag} · {t.count}×</span>)}</span>
          </Section>
        )}

        <Section title="Beobachtungen" hint={allSeasons ? "alle Saisons" : season?.name}>
          <ObservationList items={items} today={today} onOpen={setDetail}
            sourceOf={o => src(o)?.label} emptyText="Noch keine Beobachtungen zu dieser Person." />
          {older > 0 && (
            <button type="button" className="link-btn self-start" onClick={() => setAllSeasons(true)}>Frühere Saisons ({older})</button>
          )}
        </Section>
      </div>
      {canObserve && (
        <div className="action-bar">
          <Button variant="primary" size="lg" icon={Eye} onClick={() => obs.open({ teamId, date: today, player })}>Beobachtung</Button>
        </div>
      )}
      {obs.sheet}
      {detail && (
        <ObservationDetail observation={detail} onClose={() => setDetail(null)} canEdit={canEdit(detail)}
          sourceLabel={src(detail)?.label} onOpenSource={src(detail)?.view ? () => go(src(detail).view, src(detail).params) : null}
          onSave={text => update(d => updateObservation(d, detail.id, { text }))} onDelete={() => deleteObs(detail)} />
      )}
      {editing && <PlayerEditSheet update={update} player={player} entry={entry} teamId={teamId} season={season} onClose={() => setEditing(false)} />}
    </div>
  );
}

function PlayerEditSheet({ update, player, entry, teamId, season, onClose }) {
  const [name, setName] = useState(player.name);
  const [year, setYear] = useState(player.birthYear ? String(player.birthYear) : "");
  const [injured, setInjured] = useState(!!player.injured);
  const [nr, setNr] = useState(entry?.jerseyNumber ?? "");
  const [pos, setPos] = useState(entry?.position ?? "");
  const [status, setStatus] = useState(entry?.status ?? "active");
  const seasonRoster = !!season;   // ohne Saison: bisherige Teamliste, keine Saisonangaben
  const yearInvalid = year !== "" && !/^(19|20)\d{2}$/.test(year);

  function save() {
    if (!name.trim() || yearInvalid) return;
    update(d => {
      let next = updatePlayer(d, player.id, { name: name.trim(), birthYear: parseInt(year) || null, injured });
      if (seasonRoster) {
        if (status === "left") return removeFromRoster(next, { teamId, season, playerId: player.id });
        next = addToRoster(next, { teamId, season, playerId: player.id });   // legt ggf. den Saisonkader an
        const e = (next.rosterEntries ?? []).find(x => x.seasonId === season.id && x.playerId === player.id);
        return e ? updateRosterEntry(next, e.id, { jerseyNumber: nr.trim(), position: pos.trim(), status }) : next;
      }
      return next;
    });
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title="Angaben"
      footer={<Button variant="primary" size="lg" disabled={!name.trim() || yearInvalid} onClick={save}>Speichern</Button>}>
      <div className="form">
        <div className="field-grid field-grid--main">
          <Field label="Name" htmlFor="pe-name"><input id="pe-name" className="input" value={name} onChange={e => setName(e.target.value)} autoComplete="off" /></Field>
          <Field label="Jahrgang" htmlFor="pe-year" error={yearInvalid ? "z. B. 2011" : null}>
            <input id="pe-year" className="input" value={year} inputMode="numeric" aria-invalid={yearInvalid} onChange={e => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </Field>
        </div>
        {seasonRoster && (
          <>
            <div className="field-grid">
              <Field label="Trikotnummer" htmlFor="pe-nr" aside="optional"><input id="pe-nr" className="input" value={nr} inputMode="numeric" onChange={e => setNr(e.target.value.slice(0, 3))} /></Field>
              <Field label="Position / Rolle" htmlFor="pe-pos" aside="optional"><input id="pe-pos" className="input" value={pos} onChange={e => setPos(e.target.value)} autoComplete="off" /></Field>
            </div>
            <Field label={`Status in ${season.name}`}>
              <ChoiceChips label="Status" value={status} onChange={setStatus}
                options={Object.entries(ROSTER_STATUS).map(([k, v]) => ({ value: k, label: v.label }))} />
            </Field>
            {status === "left" && <p className="field__hint">Die Person bleibt mit allen Beobachtungen und Anwesenheiten erhalten.</p>}
          </>
        )}
        <Field label="Verletzt">
          <ChoiceChips label="Verletzt" value={injured} onChange={setInjured} options={[{ value: false, label: "fit" }, { value: true, label: "verletzt" }]} />
        </Field>
      </div>
    </Sheet>
  );
}
