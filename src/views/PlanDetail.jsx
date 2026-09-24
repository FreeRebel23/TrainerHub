import { Pencil, Printer, Trash2, Copy, Play, SearchX, ClipboardList, Sun, AlertTriangle } from "lucide-react";
import { byId } from "../lib/data.js";
import { fmtDateLong, todayISO, getHoliday, getSchoolHoliday } from "../lib/dates.js";
import { content, planStatus, drillMinutes } from "../lib/training.js";
import { printPlan } from "../lib/io.js";
import { Button, IconButton, PageHeader, Section, Meta, EmptyState, Notice } from "../components/ui.jsx";
import { DrillList, TagList } from "../components/training.jsx";
import { PlanStatus } from "../components/PlanStatus.jsx";
import { useConfirm } from "../components/confirm.jsx";

// Geplantes Training: Vorbereitung ansehen, in der Halle starten, bearbeiten, duplizieren.
export function PlanDetailView({ data, update, planId, go, back }) {
  const plan = byId(data.plannedSessions, planId);
  const confirm = useConfirm();

  if (!plan) {
    return (
      <div className="page">
        <PageHeader title="Planung" back={back} />
        <div className="page-body"><EmptyState icon={SearchX} title="Planung nicht gefunden" text="Sie wurde vermutlich gelöscht." /></div>
      </div>
    );
  }

  const c = content(plan);
  const status = planStatus(plan);
  const type = byId(data.trainingTypes, plan.trainingTypeId);
  const team = byId(data.teams, plan.teamId);
  const venue = byId(data.venues, plan.venueId);
  const title = type?.name ?? "Training";
  const today = todayISO();
  const canStart = status !== "done" && plan.date <= today;
  const sum = drillMinutes(c.checklist);
  const holiday = getHoliday(plan.date);
  const vacation = getSchoolHoliday(plan.date);

  async function remove() {
    const text = status === "done"
      ? "Das erfasste Training bleibt im Trainingsbuch erhalten."
      : `${title} am ${fmtDateLong(plan.date)} mit Vorbereitung und Übungen.`;
    if (!(await confirm({ title: "Planung löschen?", text, confirmLabel: "Löschen", danger: true }))) return;
    update(d => ({ ...d, plannedSessions: d.plannedSessions.filter(p => p.id !== plan.id) }));
    back();
  }

  const edit = () => go("plan_edit", { planId: plan.id });
  const start = () => go("new_session", { planId: plan.id, step: 2 });

  return (
    <div className="page">
      <PageHeader title="Planung" back={back} actions={<>
        <IconButton icon={Copy} label="Duplizieren" onClick={() => go("plan_edit", { from: { kind: "plan", id: plan.id } })} />
        <IconButton icon={Printer} label="Drucken" onClick={() => printPlan(plan, data)} />
        <IconButton icon={Trash2} label="Planung löschen" variant="danger" onClick={remove} />
      </>} />
      <div className="page-body">
        <div className="detail-head">
          <p className="detail-head__eyebrow">{fmtDateLong(plan.date)}{c.time && ` · ${c.time} Uhr`}</p>
          <h2 className="detail-head__title">{title}</h2>
          <p className="detail-head__meta"><Meta items={[team?.name, venue?.name, `${plan.durationMinutes} min`]} /></p>
          <PlanStatus status={status} />
        </div>

        {(holiday || vacation) && (
          <Notice tone={holiday ? "danger" : "warning"} icon={holiday ? AlertTriangle : Sun}>
            {holiday ? `Feiertag: ${holiday}` : `${vacation.name} – Ferientraining`}
          </Notice>
        )}

        <div className="btn-row">
          {status === "done" ? (
            <Button variant="primary" onClick={() => go("session_detail", { sessionId: plan.recordedId })}>Erfasstes Training öffnen</Button>
          ) : canStart ? (
            <Button variant="primary" size="lg" icon={Play} onClick={start}>Training starten</Button>
          ) : null}
          <Button icon={Pencil} onClick={edit}>{status === "planned" ? "Vorbereiten" : "Bearbeiten"}</Button>
        </div>

        {status === "planned" ? (
          <EmptyState icon={ClipboardList} title="Noch nicht vorbereitet"
            text="Schwerpunkt und Übungen kannst du jetzt oder später ergänzen – auch unterwegs." />
        ) : (<>
          {c.focus && (
            <Section title="Schwerpunkt">
              <p className="prose">{c.focus}</p>
            </Section>
          )}
          {c.tags.length > 0 && (
            <Section title="Themen"><TagList tags={c.tags} /></Section>
          )}
          {c.checklist.length > 0 && (
            <Section title="Übungen" hint={sum > 0 ? `${sum} von ${plan.durationMinutes} min` : `${c.checklist.length}`}>
              <DrillList items={c.checklist} onChange={() => {}} checkable={false} editable={false} />
            </Section>
          )}
        </>)}

        {c.note && (
          <Section title="Notiz zur Vorbereitung"><p className="prose">{c.note}</p></Section>
        )}
      </div>
    </div>
  );
}
