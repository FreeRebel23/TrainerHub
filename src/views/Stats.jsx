import { useState } from "react";
import { Printer, FileSpreadsheet, BarChart3, Tags } from "lucide-react";
import { byId, computeRanking, getActiveSeason } from "../lib/data.js";
import { printStats, exportRankingXLSX, exportTrainingLogXLSX } from "../lib/io.js";
import { PHASES } from "../lib/constants.js";
import { MONTHS_DE } from "../lib/dates.js";
import { seasonOverview } from "../lib/training.js";
import { Button, PageIntro, Section, EmptyState, ChoiceChips, Field, Segmented, cx } from "../components/ui.jsx";

const nf = n => n.toLocaleString("de-DE");

// Saisonübersicht: Was haben wir wie häufig trainiert? Nur, was die Daten hergeben.
function ContentOverview({ sessions }) {
  const o = seasonOverview(sessions);
  const maxTag = Math.max(1, ...o.tags.map(t => t.count));
  const maxMonth = Math.max(1, ...o.months.map(m => m.count));
  const tagged = o.count - o.untagged;

  return (<>
    <Section title="Themen" hint={tagged ? `${tagged} von ${o.count} Einheiten mit Thema` : undefined}>
      {o.tags.length === 0 ? (
        <EmptyState icon={Tags} title="Noch keine Themen"
          text="Ordne beim Planen oder Erfassen Themen zu – dann siehst du hier, was ihr wie oft trainiert habt." />
      ) : (<>
        <div className="list">
          {o.tags.map(t => (
            <div key={t.tag} className="hbar">
              <span className="hbar__label">{t.tag}</span>
              <span className="hbar__value">{t.count} {t.count === 1 ? "Einheit" : "Einheiten"} · {nf(t.minutes)} min</span>
              <span className="hbar__track" aria-hidden="true"><span className="hbar__fill" style={{ width: `${t.count / maxTag * 100}%` }} /></span>
            </div>
          ))}
        </div>
        <p className="field__hint">
          Minuten = Dauer der Einheiten mit diesem Thema. Eine Einheit mit mehreren Themen zählt bei jedem.
          {o.untagged > 0 && ` ${o.untagged} ${o.untagged === 1 ? "Einheit hat" : "Einheiten haben"} kein Thema.`}
        </p>
      </>)}
    </Section>

    {o.focus.length > 0 && (
      <Section title="Häufigste Schwerpunkte">
        <div className="list">
          {o.focus.map(f => (
            <div key={f.text} className="row">
              <span className="row__main"><span className="row__title">{f.text}</span></span>
              <span className="row__trail num">{f.count}×</span>
            </div>
          ))}
        </div>
      </Section>
    )}

    {o.months.length > 1 && (
      <Section title="Einheiten je Monat">
        <div className="list" role="img" aria-label={o.months.map(m => `${MONTHS_DE[+m.month.slice(5) - 1]}: ${m.count}`).join(", ")}>
          <div className="months" aria-hidden="true">
            {o.months.map(m => (
              <div key={m.month} className="months__col">
                <span className="months__n">{m.count}</span>
                <span className="months__bar" style={{ height: `${m.count / maxMonth * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="months-labels" aria-hidden="true">
            {o.months.map(m => <span key={m.month} className="months__label">{MONTHS_DE[+m.month.slice(5) - 1].slice(0, 3)}</span>)}
          </div>
        </div>
      </Section>
    )}

    {o.drills.planned > 0 && (
      <p className="field__hint">Übungen: {nf(o.drills.done)} von {nf(o.drills.planned)} vorgesehenen wurden durchgeführt.</p>
    )}
  </>);
}

// Auswertung: Trainingsinhalte (Saisonübersicht) und Trainingsbeteiligung je Team.
export function StatsView({ data }) {
  const teams = data.teams ?? [];
  const [tid, setTid]       = useState(teams[0]?.id ?? "");
  const [tab, setTab]       = useState("content");
  const [filter, setFilter] = useState("all");   // Trainingsart
  // Standard: laufende Saison des Teams, sonst Gesamt
  const [sfilt, setSfilt]   = useState(() => getActiveSeason(teams[0]?.id, data.seasons)?.id ?? "all");
  const team = byId(teams, tid);
  const teamSeasons = [...(data.seasons ?? []).filter(s => s.teamId === tid)]
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const selSeason = teamSeasons.find(s => s.id === sfilt) ?? null;
  const allSess = selSeason
    ? (data.sessions ?? []).filter(s => s.teamId === tid && s.date >= selSeason.startDate && s.date <= selSeason.endDate)
    : (data.sessions ?? []).filter(s => s.teamId === tid);
  const sessions = filter === "all" ? allSess : allSess.filter(s => s.trainingTypeId === filter);
  const ranking  = computeRanking(data, tid, sessions);
  const maxPts   = Math.max(1, ...ranking.map(r => r.pts));

  const typeTotals = (data.trainingTypes ?? [])
    .map(t => ({ t, n: allSess.filter(s => s.trainingTypeId === t.id).length }))
    .filter(x => x.n > 0);

  function pickTeam(id) { setTid(id); setSfilt(getActiveSeason(id, data.seasons)?.id ?? "all"); setFilter("all"); }

  const totalMin = allSess.reduce((s, x) => s + x.durationMinutes, 0);
  const avgAtt   = allSess.length
    ? Math.round(allSess.reduce((s, x) => {
        const n = (x.attendance ?? []).length;
        return s + (n ? (x.attendance.filter(a => ["present", "injured_present"].includes(a.status)).length / n) : 0);
      }, 0) / allSess.length * 100)
    : 0;

  return (
    <div className="page">
      <PageIntro title="Auswertung" actions={allSess.length > 0 && (tab === "content" ? (
        <Button size="sm" variant="ghost" icon={FileSpreadsheet} aria-label="Trainingsbuch als Excel exportieren"
          onClick={() => exportTrainingLogXLSX(data, tid)}>Excel</Button>
      ) : <>
        <Button size="sm" variant="ghost" icon={Printer} aria-label="Drucken oder als PDF sichern"
          onClick={() => printStats(team?.name ?? "Team", allSess, ranking, selSeason)}>Drucken</Button>
        <Button size="sm" variant="ghost" icon={FileSpreadsheet} aria-label="Als Excel exportieren"
          onClick={() => exportRankingXLSX(team?.name ?? "Team", allSess, ranking, selSeason?.name)}>Excel</Button>
      </>)} />
      <div className="page-body">
        <Segmented label="Auswertung" value={tab} onChange={setTab} options={[
          { value: "content", label: "Inhalte" }, { value: "attendance", label: "Beteiligung" },
        ]} />
        {(teams.length > 1 || teamSeasons.length > 0) && (
          <div className="form">
            {teams.length > 1 && (
              <ChoiceChips label="Team" scroll value={tid} onChange={pickTeam}
                options={teams.map(t => ({ value: t.id, label: t.name }))} />
            )}
            {teamSeasons.length > 0 && (
              <Field label="Saison">
                <ChoiceChips label="Saison" scroll value={sfilt} onChange={setSfilt}
                  options={[{ value: "all", label: "Gesamt" }, ...teamSeasons.map(s => ({ value: s.id, label: s.name, meta: s.phase !== "abgeschlossen" ? PHASES[s.phase]?.label : null }))]} />
              </Field>
            )}
          </div>
        )}

        {allSess.length === 0 ? (
          <EmptyState icon={BarChart3} title="Noch keine Daten"
            text={`Sobald für ${team?.name ?? "dieses Team"} Trainings erfasst sind, siehst du hier, was ihr trainiert habt und wer dabei war.`} />
        ) : (
          <>
            <div className="facts">
              <div><p className="fact__value">{allSess.length}</p><p className="fact__label">Trainings</p></div>
              <div><p className="fact__value">{Math.round(totalMin / 60)}</p><p className="fact__label">Stunden</p></div>
              <div><p className="fact__value">{avgAtt} %</p><p className="fact__label">Ø Anwesenheit</p></div>
            </div>

            {tab === "content" ? <ContentOverview sessions={allSess} /> : <>
            {typeTotals.length > 1 && (
              <Section title="Trainingsart">
                <ChoiceChips label="Nach Trainingsart filtern" scroll value={filter} onChange={setFilter}
                  options={[{ value: "all", label: "Alle", meta: allSess.length },
                    ...typeTotals.map(({ t, n }) => ({ value: t.id, label: t.name, meta: n }))]} />
              </Section>
            )}

            <Section title="Trainingsbeteiligung" hint="Punkte = Faktor × Anwesenheit">
              {ranking.length === 0 ? <p className="text-3">Keine Spieler:innen im Kader.</p> : (
                <ol className="list list-reset">
                  {ranking.map((r, i) => (
                    <li key={r.player.id} className="row">
                      <span className={cx("rank", i < 3 && r.pts > 0 && "rank--top")}>{i + 1}</span>
                      <span className="row__main">
                        <span className="row__title">{r.player.name}</span>
                        <span className="row__meta">
                          {r.cnt} von {sessions.length} · {r.pct} %
                          {r.commits > 0 && <span className="text-tone tone-warning"> · {r.commits}× verletzt dabei</span>}
                        </span>
                        <span className="bar" aria-hidden="true"><span className="bar__fill" style={{ width: `${(r.pts / maxPts) * 100}%` }} /></span>
                      </span>
                      <span className="points">
                        <span className="points__value block">{String(r.pts).replace(".", ",")}</span>
                        <span className="points__label">Punkte</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
            </>}
          </>
        )}
      </div>
    </div>
  );
}
