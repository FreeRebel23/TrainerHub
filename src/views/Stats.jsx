import { useState } from "react";
import { Printer, FileSpreadsheet, BarChart3 } from "lucide-react";
import { byId, computeRanking } from "../lib/data.js";
import { printStats, exportRankingXLSX } from "../lib/io.js";
import { PHASES } from "../lib/constants.js";
import { Button, PageIntro, Section, EmptyState, ChoiceChips, Field, cx } from "../components/ui.jsx";

// Auswertung: Trainingsbeteiligung je Team, filterbar nach Saison und Trainingsart.
export function StatsView({ data }) {
  const teams = data.teams ?? [];
  const [tid, setTid]       = useState(teams[0]?.id ?? "");
  const [filter, setFilter] = useState("all");   // Trainingsart
  const [sfilt, setSfilt]   = useState("all");   // Saison
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

  function pickTeam(id) { setTid(id); setSfilt("all"); setFilter("all"); }

  const totalMin = allSess.reduce((s, x) => s + x.durationMinutes, 0);
  const avgAtt   = allSess.length
    ? Math.round(allSess.reduce((s, x) => {
        const n = (x.attendance ?? []).length;
        return s + (n ? (x.attendance.filter(a => ["present", "injured_present"].includes(a.status)).length / n) : 0);
      }, 0) / allSess.length * 100)
    : 0;

  return (
    <div className="page">
      <PageIntro title="Auswertung" actions={allSess.length > 0 && <>
        <Button size="sm" variant="ghost" icon={Printer} aria-label="Drucken oder als PDF sichern"
          onClick={() => printStats(team?.name ?? "Team", allSess, ranking, selSeason)}>Drucken</Button>
        <Button size="sm" variant="ghost" icon={FileSpreadsheet} aria-label="Als Excel exportieren"
          onClick={() => exportRankingXLSX(team?.name ?? "Team", allSess, ranking, selSeason?.name)}>Excel</Button>
      </>} />
      <div className="page-body">
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
            text={`Sobald für ${team?.name ?? "dieses Team"} Trainings erfasst sind, siehst du hier die Beteiligung.`} />
        ) : (
          <>
            <div className="facts">
              <div><p className="fact__value">{allSess.length}</p><p className="fact__label">Trainings</p></div>
              <div><p className="fact__value">{Math.round(totalMin / 60)}</p><p className="fact__label">Stunden</p></div>
              <div><p className="fact__value">{avgAtt} %</p><p className="fact__label">Ø Anwesenheit</p></div>
            </div>

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
          </>
        )}
      </div>
    </div>
  );
}
