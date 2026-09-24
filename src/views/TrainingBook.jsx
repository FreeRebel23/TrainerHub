import { useMemo, useState } from "react";
import { Plus, List, CalendarDays, ChevronLeft, ChevronRight, Search, BookOpen } from "lucide-react";
import {
  todayISO, addDays, relativeDay, MONTHS_DE, WEEKDAYS, buildMonthGrid,
  getHoliday, getSchoolHoliday, parseISO,
} from "../lib/dates.js";
import { byId, countPresent, openPlans, allGamedays } from "../lib/data.js";
import {
  Button, PageIntro, Section, Row, Meta, DateBlock, EmptyState, ChoiceChips, Segmented, IconButton, cx,
} from "../components/ui.jsx";

// Das Trainingsbuch: alle Einheiten einer Mannschaft als Liste oder im Kalender.
export function TrainingBookView({ data, go, params }) {
  const mode = params?.mode === "calendar" ? "calendar" : "list";
  const setMode = m => go("training", { ...params, mode: m }, { replace: true });

  return (
    <div className={cx("page", mode === "calendar" && "page--wide")}>
      <PageIntro title="Trainingsbuch"
        actions={<Button variant="primary" size="sm" icon={Plus} onClick={() => go("new_session")}>Erfassen</Button>} />
      <div className="page-body">
        <Segmented label="Ansicht" value={mode} onChange={setMode} options={[
          { value: "list", label: "Liste", icon: List },
          { value: "calendar", label: "Kalender", icon: CalendarDays },
        ]} />
        {mode === "list" ? <BookList data={data} go={go} /> : <BookCalendar data={data} go={go} params={params} />}
      </div>
    </div>
  );
}

function monthLabel(iso) {
  const d = parseISO(iso);
  return `${MONTHS_DE[d.getMonth()]} ${d.getFullYear()}`;
}

function BookList({ data, go }) {
  const today = todayISO();
  const teams = data.teams ?? [];
  const [teamId, setTeamId] = useState("all");
  const [query, setQuery]   = useState("");
  const [allPlans, setAllPlans] = useState(false);
  const type  = id => byId(data.trainingTypes, id);
  const team  = id => byId(data.teams, id);
  const venue = id => byId(data.venues, id);
  const multiTeam = teams.length > 1;
  const inTeam = x => teamId === "all" || x.teamId === teamId;

  const q = query.trim().toLowerCase();
  const matches = s => !q || [
    type(s.trainingTypeId)?.name, s.note, venue(s.venueId)?.name, team(s.teamId)?.name,
    ...(s.checklist ?? []).map(d => d.text),
  ].some(t => (t ?? "").toLowerCase().includes(q));

  const sessions = useMemo(() => [...(data.sessions ?? [])]
    .filter(inTeam).filter(matches)
    .sort((a, b) => b.date.localeCompare(a.date)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [data.sessions, teamId, q]);

  const plans = [...openPlans(data)]
    .filter(inTeam)
    .filter(p => p.date >= addDays(today, -14))
    .sort((a, b) => a.date.localeCompare(b.date));
  const shownPlans = allPlans ? plans : plans.slice(0, 4);

  const groups = [];
  sessions.forEach(s => {
    const key = s.date.slice(0, 7);
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.items.push(s); else groups.push({ key, label: monthLabel(s.date), items: [s] });
  });

  return (
    <>
      <div className="section">
        <div className="search">
          <Search size={18} className="search__icon" aria-hidden="true" />
          <label htmlFor="book-search" className="sr-only">Trainings durchsuchen</label>
          <input id="book-search" className="input search__input" type="search" value={query}
            onChange={e => setQuery(e.target.value)} placeholder="Suchen: Notiz, Übung, Halle …" enterKeyHint="search" />
        </div>
        {multiTeam && (
          <ChoiceChips label="Team filtern" scroll value={teamId} onChange={setTeamId}
            options={[{ value: "all", label: "Alle Teams" }, ...teams.map(t => ({ value: t.id, label: t.name }))]} />
        )}
      </div>

      {!q && plans.length > 0 && (
        <Section title="Geplant" hint={`${plans.length}`}>
          <div className="list">
            {shownPlans.map(p => {
              const overdue = p.date < today;
              const canRecord = p.date <= today;
              return (
                <Row key={p.id}
                  lead={<DateBlock iso={p.date} today={today} />}
                  title={type(p.trainingTypeId)?.name ?? "Training"}
                  meta={<>
                    <Meta items={[relativeDay(p.date, today), multiTeam && team(p.teamId)?.name, `${p.durationMinutes} min`, venue(p.venueId)?.name]} />
                    {overdue && <> <span className="tag tone-warning">nicht erfasst</span></>}
                    {getHoliday(p.date) && <> <span className="tag tone-danger">Feiertag</span></>}
                  </>}
                  trail={canRecord ? <span className="btn btn--sm btn--secondary" aria-hidden="true">Erfassen</span> : null}
                  chevron={!canRecord}
                  onClick={() => canRecord ? go("new_session", { plan: p }) : go("calendar_day", { date: p.date })} />
              );
            })}
          </div>
          {plans.length > 4 && (
            <button type="button" className="btn btn--accent-ghost btn--sm self-start"
              onClick={() => setAllPlans(v => !v)}>
              {allPlans ? "Weniger anzeigen" : `Alle ${plans.length} geplanten anzeigen`}
            </button>
          )}
        </Section>
      )}

      {groups.length === 0 ? (
        q ? <EmptyState icon={Search} title="Keine Treffer" text={`Kein Training passt zu „${query.trim()}“.`} />
          : <EmptyState icon={BookOpen} title="Noch keine Trainings"
              text="Hier entsteht die Trainingshistorie deiner Mannschaft."
              action={<Button variant="primary" icon={Plus} onClick={() => go("new_session")}>Training erfassen</Button>} />
      ) : groups.map(g => (
        <Section key={g.key} title={g.label} hint={`${g.items.length} ${g.items.length === 1 ? "Training" : "Trainings"}`}>
          <div className="list">
            {g.items.map(s => {
              const drills = s.checklist ?? [];
              return (
                <Row key={s.id}
                  lead={<DateBlock iso={s.date} today={today} />}
                  title={type(s.trainingTypeId)?.name ?? "Training"}
                  meta={<>
                    <Meta items={[multiTeam && team(s.teamId)?.name, `${countPresent(s)}/${(s.attendance ?? []).length} dabei`, `${s.durationMinutes} min`, venue(s.venueId)?.name]} />
                  </>}
                  excerpt={s.note || (drills.length ? drills.map(d => d.text).join(" · ") : null)}
                  chevron onClick={() => go("session_detail", { sessionId: s.id })} />
              );
            })}
          </div>
        </Section>
      ))}
    </>
  );
}

function BookCalendar({ data, go, params }) {
  const now = new Date();
  const [ym, setYm] = useState(() => params?.ym ?? { y: now.getFullYear(), m: now.getMonth() });
  const { y: year, m: month } = ym;
  const today = todayISO();
  const grid  = buildMonthGrid(year, month);
  const ymStr = `${year}-${String(month + 1).padStart(2, "0")}`;

  const recorded = new Set((data.sessions ?? []).map(s => s.date));
  const planned  = new Set(openPlans(data).map(p => p.date));
  const games    = new Set(allGamedays(data).map(g => g.date));

  function shift(delta) {
    const d = new Date(year, month + delta, 1);
    const next = { y: d.getFullYear(), m: d.getMonth() };
    setYm(next);
    go("training", { ...params, mode: "calendar", ym: next }, { replace: true });
  }
  const isCurrent = year === now.getFullYear() && month === now.getMonth();

  return (
    <div className="section">
      <div className="cal-head">
        <IconButton icon={ChevronLeft} label="Voriger Monat" onClick={() => shift(-1)} />
        <h2 className="cal-head__title" aria-live="polite">{MONTHS_DE[month]} {year}</h2>
        <div className="cal-head__nav">
          {!isCurrent && <button type="button" className="btn btn--ghost btn--sm" onClick={() => shift(now.getMonth() - month + 12 * (now.getFullYear() - year))}>Heute</button>}
          <IconButton icon={ChevronRight} label="Nächster Monat" onClick={() => shift(1)} />
        </div>
      </div>

      <div className="cal">
        {WEEKDAYS.map(d => <div key={d} className="cal__wd">{d}</div>)}
        {grid.map(iso => {
          const inMonth = iso.startsWith(ymStr);
          const dow     = (parseISO(iso).getDay() + 6) % 7;
          const holiday = getHoliday(iso);
          const vacation = getSchoolHoliday(iso);
          const labels = [
            parseISO(iso).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }),
            recorded.has(iso) && "Training erfasst", planned.has(iso) && "Training geplant",
            games.has(iso) && "Spieltag", holiday, vacation && vacation.name,
          ].filter(Boolean).join(", ");
          return (
            <button key={iso} type="button" aria-label={labels}
              className={cx("cal__day",
                !inMonth && "cal__day--out",
                dow >= 5 && "cal__day--weekend",
                holiday && "cal__day--holiday",
                vacation && inMonth && "cal__day--vacation",
                iso === today && "cal__day--today")}
              aria-current={iso === today ? "date" : undefined}
              onClick={() => go("calendar_day", { date: iso })}>
              <span className="cal__num">{parseISO(iso).getDate()}</span>
              <span className="cal__marks" aria-hidden="true">
                {inMonth && recorded.has(iso) && <span className="cal__mark cal__mark--rec" />}
                {inMonth && planned.has(iso) && <span className="cal__mark cal__mark--plan" />}
                {inMonth && games.has(iso) && <span className="cal__mark cal__mark--game" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="cal-legend" aria-hidden="true">
        <span><span className="cal__mark cal__mark--rec" />Erfasst</span>
        <span><span className="cal__mark cal__mark--plan" />Geplant</span>
        <span><span className="cal__mark cal__mark--game" />Spieltag</span>
        <span><span className="swatch" />Schulferien</span>
        <span className="text-danger">Feiertag (rote Zahl)</span>
      </div>
    </div>
  );
}
