// Druck, Export, Import, Backup und Datei-Sync.
// xlsx und papaparse werden erst bei Bedarf geladen (hält das Start-Bundle klein;
// der Service Worker cached die Chunks trotzdem für den Offline-Betrieb).

import { INIT, STATUSES } from "./constants.js";
import { getSchoolHoliday, fmtDate, todayISO } from "./dates.js";
import { getTeamPlayers, uid, isPresent, migrate } from "./data.js";
import { content, drillMinutes, normalizeTags, byDateTime } from "./training.js";

const loadXLSX = () => import("xlsx");

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function openPrintWindow(html) {
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
}

const PRINT_CSS = `
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:#1c1917;padding:32px;max-width:680px}
  .club{font-size:11px;color:#78716c;margin-bottom:4px}
  .ttl{font-size:24px;font-weight:600;margin-bottom:4px}
  .sub{font-size:14px;color:#57534e;margin-bottom:4px}
  .badge{display:inline-block;font-size:12px;color:#b45309;margin-top:4px}
  .meta{display:flex;flex-wrap:wrap;gap:24px;margin:16px 0;padding:16px 0;border-top:1px solid #e7e5e4;border-bottom:1px solid #e7e5e4}
  .ml{font-size:11px;color:#78716c}
  .mv{font-size:18px;font-weight:600;font-variant-numeric:tabular-nums}
  .st{font-size:12px;font-weight:600;color:#57534e;margin:20px 0 6px}
  table{width:100%;border-collapse:collapse}
  th{text-align:left;font-size:11px;font-weight:500;color:#78716c;padding:6px 8px;border-bottom:1px solid #d6d3d1}
  td{padding:8px;border-bottom:1px solid #f0efee;font-size:13px;vertical-align:middle}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .note{border-left:2px solid #0f766e;padding:8px 14px;font-size:13px;line-height:1.6;white-space:pre-wrap}
  .focus{font-size:15px;line-height:1.5}
  .tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.tags span{font-size:11px;padding:2px 8px;border:1px solid #d6d3d1;border-radius:99px;color:#57534e}
  .foot{margin-top:28px;padding-top:14px;border-top:1px solid #e7e5e4;font-size:10px;color:#a8a29e;display:flex;justify-content:space-between}
  @media print{body{padding:16px}}`;

// ─── Druckansichten ───

// Schwerpunkt, Themen, Übungen (mit Dauer/Beschreibung) und Notiz
function contentHtml(x, { withDone = false, noteLabel = "Notiz" } = {}) {
  const c = content(x);
  const sum = drillMinutes(c.checklist);
  const drills = c.checklist.map((d, i) => `<tr>
      <td class="num" style="width:28px">${withDone ? (d.done ? "✓" : "–") : i + 1}</td>
      <td>${esc(d.text)}${d.note ? `<br><span style="font-size:11px;color:#78716c">${esc(d.note)}</span>` : ""}</td>
      <td class="num">${d.minutes ? esc(d.minutes) + " min" : ""}</td>
    </tr>`).join("");
  return `
  ${c.focus ? `<div class="st">Schwerpunkt</div><div class="focus">${esc(c.focus)}</div>` : ""}
  ${c.tags.length ? `<div class="tags">${c.tags.map(t => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
  ${drills ? `<div class="st">Übungen${sum ? ` · ${sum} min` : ""}</div><table><tbody>${drills}</tbody></table>` : ""}
  ${c.note ? `<div class="st">${noteLabel}</div><div class="note">${esc(c.note)}</div>` : ""}`;
}

export function printSession(session, data) {
  const team  = (data.teams ?? []).find(t => t.id === session.teamId);
  const type  = (data.trainingTypes ?? []).find(t => t.id === session.trainingTypeId);
  const venue = (data.venues ?? []).find(v => v.id === session.venueId);
  const schH  = getSchoolHoliday(session.date);
  const dateStr = new Date(session.date + "T12:00:00").toLocaleDateString("de-DE",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const att   = session.attendance ?? [];
  const presentCount = att.filter(a => isPresent(a.status)).length;
  const getName = pid => (data.players ?? []).find(p => p.id === pid)?.name ?? pid;

  const rows = att.map(a => {
    const s = STATUSES[a.status] ?? {};
    const pts = (session.factor * (s.factorMult ?? 0)).toFixed(1);
    return `<tr>
      <td>${esc(getName(a.playerId))}</td>
      <td style="color:#57534e">${esc(s.label ?? a.status)}</td>
      <td class="num">${(s.factorMult ?? 0) > 0 ? pts : "—"}</td>
    </tr>`;
  }).join("");


  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
  <title>Training ${esc(session.date)} · ${esc(team?.name)}</title>
  <style>${PRINT_CSS}</style></head><body>
  <div class="club">TV Bretten Basketball · TrainerHub</div>
  <div class="ttl">${esc(type?.name ?? "Training")}</div>
  <div class="sub">${esc(dateStr)}${session.time ? ", " + esc(session.time) + " Uhr" : ""}</div>
  ${schH ? `<span class="badge">${esc(schH.name)} – Ferientraining</span>` : ""}
  <div class="meta">
    <div><div class="ml">Team</div><div class="mv">${esc(team?.name ?? "—")}</div></div>
    <div><div class="ml">Dauer</div><div class="mv">${esc(session.durationMinutes)} min</div></div>
    <div><div class="ml">Faktor</div><div class="mv">${esc(session.factor)}</div></div>
    <div><div class="ml">Dabei</div><div class="mv">${presentCount} / ${att.length}</div></div>
    ${venue ? `<div><div class="ml">Halle</div><div class="mv">${esc(venue.name)}</div></div>` : ""}
  </div>
  ${contentHtml(session, { withDone: true })}
  <div class="st">Anwesenheit</div>
  <table><thead><tr><th>Spieler:in</th><th>Status</th><th class="num">Pkt.</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="foot"><span>TrainerHub · ${esc(team?.name)}</span><span>Erstellt ${new Date().toLocaleDateString("de-DE")}</span></div>
  </body></html>`;

  openPrintWindow(html);
}

// Trainingsblatt einer Planung (für die Halle bzw. das Co-Training)
export function printPlan(plan, data) {
  const team  = (data.teams ?? []).find(t => t.id === plan.teamId);
  const type  = (data.trainingTypes ?? []).find(t => t.id === plan.trainingTypeId);
  const venue = (data.venues ?? []).find(v => v.id === plan.venueId);
  const dateStr = new Date(plan.date + "T12:00:00").toLocaleDateString("de-DE",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const c = content(plan);
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
  <title>Trainingsplan ${esc(plan.date)} · ${esc(team?.name)}</title>
  <style>${PRINT_CSS}</style></head><body>
  <div class="club">TV Bretten Basketball · Trainingsplan</div>
  <div class="ttl">${esc(type?.name ?? "Training")}</div>
  <div class="sub">${esc(dateStr)}${c.time ? ", " + esc(c.time) + " Uhr" : ""}</div>
  <div class="meta">
    <div><div class="ml">Team</div><div class="mv">${esc(team?.name ?? "—")}</div></div>
    <div><div class="ml">Dauer</div><div class="mv">${esc(plan.durationMinutes)} min</div></div>
    ${venue ? `<div><div class="ml">Halle</div><div class="mv">${esc(venue.name)}</div></div>` : ""}
  </div>
  ${contentHtml(plan, { noteLabel: "Notiz zur Vorbereitung" })}
  <div class="foot"><span>TrainerHub · ${esc(team?.name)}</span><span>Erstellt ${new Date().toLocaleDateString("de-DE")}</span></div>
  </body></html>`;
  openPrintWindow(html);
}

export function printStats(teamName, allSess, ranking, selSeason) {
  const dateStr = new Date().toLocaleDateString("de-DE");
  const rows = ranking.map((r, i) => {
    const types = Object.entries(r.byType).map(([k,v]) => k + ": " + v + "×").join(" · ");
    return `<tr>
      <td class="num" style="width:32px">${i + 1}</td>
      <td><strong>${esc(r.player.name)}</strong>${r.commits > 0 ? ` <span style="color:#b45309;font-size:11px">${r.commits}× verletzt dabei</span>` : ""}
        ${types ? `<br><span style="font-size:10px;color:#78716c">${esc(types)}</span>` : ""}</td>
      <td class="num">${r.cnt}</td>
      <td class="num">${r.pct} %</td>
      <td class="num"><strong>${r.pts}</strong></td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
  <title>Auswertung · ${esc(teamName)}</title>
  <style>${PRINT_CSS}</style></head><body>
  <div class="club">TV Bretten Basketball · TrainerHub</div>
  <div class="ttl">Trainingsbeteiligung</div>
  <div class="sub">${esc(teamName)}${selSeason ? " · " + esc(selSeason.name) : ""}</div>
  <div class="meta">
    <div><div class="ml">Trainings</div><div class="mv">${allSess.length}</div></div>
    <div><div class="ml">Minuten gesamt</div><div class="mv">${allSess.reduce((s,x)=>s+x.durationMinutes,0)}</div></div>
    <div><div class="ml">Spieler:innen</div><div class="mv">${ranking.length}</div></div>
  </div>
  <table><thead><tr><th class="num">#</th><th>Spieler:in</th>
  <th class="num">Einheiten</th><th class="num">Quote</th>
  <th class="num">Punkte</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="foot"><span>TrainerHub · ${esc(teamName)}</span><span>Erstellt ${dateStr}</span></div>
  </body></html>`;

  openPrintWindow(html);
}

// ─── Dateien ───

export function dlFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─── Backup ───

export function downloadBackup(data) {
  dlFile(JSON.stringify(data, null, 2), "trainerhub_" + todayISO() + ".json", "application/json");
}

// Liest eine Backup-Datei. Ruft onDone(daten) bzw. onError(meldung) auf.
export function readBackup(file, onDone, onError) {
  const r = new FileReader();
  r.onload = ev => {
    try {
      const imp = JSON.parse(ev.target.result);
      if (!imp.teams || !imp.sessions) throw new Error("Ungültiges Format");
      if (!imp.plannedSessions) imp.plannedSessions = [];
      if (!imp.seasons)         imp.seasons = [];
      if (!imp.venues)          imp.venues  = JSON.parse(JSON.stringify(INIT.venues));
      onDone(migrate(imp));
    } catch (err) { onError(err.message); }
  };
  r.readAsText(file);
}

// ─── Datei-Sync zwischen Trainer:innen ───

export function mySessions(data) {
  const name = data.settings?.trainerName?.trim() ?? "";
  return (data.sessions ?? []).filter(s => !s.erfasstVon || s.erfasstVon === name);
}

export function exportSync(data) {
  const name = data.settings?.trainerName?.trim() || "Trainer";
  const sessions = (data.sessions ?? []).filter(s => !s.erfasstVon || s.erfasstVon === name);
  const payload = {
    syncVersion: 1,
    exportedBy:  name,
    exportedAt:  new Date().toISOString(),
    sessions,
  };
  dlFile(JSON.stringify(payload, null, 2),
    "trainerhub_sync_" + name + "_" + todayISO() + ".json",
    "application/json");
  return sessions.length;
}

export function importSync(file, currentData, update, onDone) {
  const r = new FileReader();
  r.onload = ev => {
    try {
      const sync = JSON.parse(ev.target.result);
      if (!sync.sessions || !Array.isArray(sync.sessions))
        throw new Error("Kein gültiges Sync-Format.");
      const existing = new Set((currentData.sessions ?? []).map(s => s.id));
      const fresh    = sync.sessions.filter(s => !existing.has(s.id));
      if (fresh.length > 0) {
        update(d => ({ ...d, sessions: [...(d.sessions ?? []), ...fresh] }));
      }
      onDone(fresh.length, sync.exportedBy ?? "?");
    } catch (e) { onDone(-1, e.message); }
  };
  r.readAsText(file);
}

// ─── Excel-Exporte ───

export async function exportAttendanceXLSX(data, teamId, sfilt) {
  const team = (data.teams ?? []).find(t => t.id === teamId);
  if (!team) return;
  const XLSX = await loadXLSX();
  const selSeason = (data.seasons ?? []).find(s => s.id === sfilt) ?? null;
  let sessions = (data.sessions ?? []).filter(s => s.teamId === teamId);
  if (selSeason) {
    sessions = sessions.filter(s => s.date >= selSeason.startDate && s.date <= selSeason.endDate);
  }
  sessions = sessions.sort((a, b) => a.date.localeCompare(b.date));

  const getType = id => (data.trainingTypes ?? []).find(t => t.id === id);

  const hdr = ["Spieler:in", "Jg.", ...sessions.map(s =>
    fmtDate(s.date) + " " + (getType(s.trainingTypeId)?.name ?? "")
  ), "Anwes.", "Quote", "Punkte"];

  const symMap = { present:"da", injured_present:"verlet.+da",
                   injured_absent:"verlet.", excused:"entsch.", absent:"fehlt" };

  const rows = getTeamPlayers(teamId, data).map(p => {
    let cnt = 0, pts = 0;
    const cells = sessions.map(sess => {
      const a = (sess.attendance ?? []).find(a => a.playerId === p.id);
      if (!a) return "";
      const mult = STATUSES[a.status]?.factorMult ?? 0;
      if (mult > 0) cnt++;
      pts += sess.factor * mult;
      return symMap[a.status] ?? a.status;
    });
    const pct = sessions.length > 0 ? Math.round(cnt / sessions.length * 100) + "%" : "–";
    return [p.name, p.birthYear ?? "", ...cells, cnt, pct, +pts.toFixed(1)];
  });

  const ws = XLSX.utils.aoa_to_sheet([hdr, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Anwesenheit");
  XLSX.writeFile(wb, "Anwesenheit_" + team.name + "_" + todayISO() + ".xlsx");
}

export async function exportRankingXLSX(teamName, allSess, ranking, seasonName) {
  const XLSX = await loadXLSX();
  const hdr = ["#","Spieler:in","Jg.","Einheiten","Quote %","Punkte","Commitment"];
  const rows = ranking.map((r, i) => [
    i + 1, r.player.name, r.player.birthYear ?? "",
    r.cnt, r.pct, r.pts, r.commits,
  ]);
  const info = [["Team:", teamName], ["Saison:", seasonName ?? "Alle"],
                ["Erstellt:", new Date().toLocaleDateString("de-DE")]];
  const ws = XLSX.utils.aoa_to_sheet([...info, [], hdr, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ranking");
  XLSX.writeFile(wb, "Ranking_" + teamName + "_" + todayISO() + ".xlsx");
}

// Trainingsbuch als Tabelle: geplante und erfasste Einheiten mit Inhalt.
// Übergang/Archiv – die Arbeit selbst findet in TrainerHub statt.
export function trainingLogRows(data, teamId) {
  const byIdOf = (list, id) => (list ?? []).find(x => x.id === id);
  const sessions = (data.sessions ?? []).filter(s => !teamId || s.teamId === teamId)
    .map(s => ({ kind: "durchgeführt", x: s }));
  const plans = (data.plannedSessions ?? []).filter(p => !p.recordedId && (!teamId || p.teamId === teamId))
    .map(p => ({ kind: "geplant", x: p }));
  const hdr = ["Datum", "Uhrzeit", "Status", "Team", "Trainingsart", "Dauer_min", "Halle", "Schwerpunkt",
    "Themen", "Übungen", "Übungen erledigt", "Anwesend", "Notiz"];
  const rows = [...sessions, ...plans].sort((a, b) => byDateTime(a.x, b.x)).map(({ kind, x }) => {
    const c = content(x);
    const att = x.attendance ?? [];
    return [
      x.date, c.time, kind,
      byIdOf(data.teams, x.teamId)?.name ?? "", byIdOf(data.trainingTypes, x.trainingTypeId)?.name ?? "",
      x.durationMinutes, byIdOf(data.venues, x.venueId)?.name ?? "", c.focus, c.tags.join(", "),
      c.checklist.map(d => d.text + (d.minutes ? ` (${d.minutes} min)` : "")).join(" | "),
      kind === "durchgeführt" && c.checklist.length ? `${c.checklist.filter(d => d.done).length}/${c.checklist.length}` : "",
      kind === "durchgeführt" ? `${att.filter(a => isPresent(a.status)).length}/${att.length}` : "",
      c.note,
    ];
  });
  return [hdr, ...rows];
}

export async function exportTrainingLogXLSX(data, teamId) {
  const XLSX = await loadXLSX();
  const team = (data.teams ?? []).find(t => t.id === teamId);
  const ws = XLSX.utils.aoa_to_sheet(trainingLogRows(data, teamId));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Trainingsbuch");
  XLSX.writeFile(wb, "Trainingsbuch_" + (team?.name ?? "alle") + "_" + todayISO() + ".xlsx");
}

// ─── Trainingsplan-Import ───

export function downloadPlanTemplate() {
  const csv = [
    "Datum,Uhrzeit,Trainingstyp,Dauer_min,Halle,Schwerpunkt,Themen,Notiz",
    "2026-09-02,18:30,Basketball,90,HSB Hallensportzentrum,Saisonauftakt,Ballhandling;Wurf,",
    "2026-09-05,17:00,Fitness,60,TV-Platz (Aussen),,Athletik,",
    "2026-09-09,18:30,Taktik,90,Jahnhalle,Pick and Roll verteidigen,Defense,Video vorher zeigen",
  ].join("\n");
  dlFile(csv, "trainingsplan_vorlage.csv", "text/csv");
}

// Spalten werden über die Kopfzeile erkannt (Reihenfolge egal, Groß-/Kleinschreibung egal).
// Ohne erkannte Kopfzeile gilt die alte feste Reihenfolge:
// Datum, Trainingstyp, Dauer_min, Halle, Notiz. Optional neu: Uhrzeit, Schwerpunkt, Themen.
const PLAN_COLUMNS = {
  date: ["datum", "date"],
  type: ["trainingstyp", "trainingsart", "art", "typ"],
  duration: ["dauer_min", "dauer", "minuten", "dauer (min)"],
  venue: ["halle", "ort", "standort"],
  note: ["notiz", "bemerkung", "hinweis"],
  time: ["uhrzeit", "zeit", "beginn", "start"],
  focus: ["schwerpunkt", "fokus", "thema"],
  tags: ["themen", "tags"],
};
const LEGACY_ORDER = { date: 0, type: 1, duration: 2, venue: 3, note: 4 };

function columnMap(header) {
  const norm = (header ?? []).map(h => String(h ?? "").trim().toLowerCase());
  const map = {};
  Object.entries(PLAN_COLUMNS).forEach(([key, names]) => {
    const i = norm.findIndex(h => names.includes(h));
    if (i >= 0) map[key] = i;
  });
  return map.date !== undefined ? map : LEGACY_ORDER;
}

function parseTime(v) {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v === "number" && v < 1) {             // Excel-Zeitwert (Bruchteil eines Tages)
    const min = Math.round(v * 24 * 60);
    return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
  }
  const m = String(v).trim().match(/^(\d{1,2})[:.](\d{2})/);
  if (!m || +m[1] > 23 || +m[2] > 59) return "";
  return m[1].padStart(2, "0") + ":" + m[2];
}

export function parsePlanRows(rows, data, teamId, XLSX) {
  const col = columnMap(rows[0]);
  const cell = (row, key) => (col[key] === undefined ? undefined : row[col[key]]);
  const dataRows = rows.slice(1).filter(r => cell(r, "date"));   // Kopfzeile überspringen
  const plans = [];
  dataRows.forEach(row => {
    let rawDate = (cell(row, "date") ?? "").toString().trim();
    // Excel-Datumsseriennummern
    if (!isNaN(rawDate) && rawDate.length < 6) {
      try {
        const d = XLSX.SSF.parse_date_code(Number(rawDate));
        rawDate = d.y + "-" + String(d.m).padStart(2,"0") + "-" + String(d.d).padStart(2,"0");
      } catch { /* kein Seriendatum */ }
    }
    const typeName  = (cell(row, "type") ?? "").toString().trim();
    const duration  = parseInt(cell(row, "duration")) || 90;
    const venueName = (cell(row, "venue") ?? "").toString().trim().toLowerCase();

    const type  = (data.trainingTypes ?? []).find(t =>
      t.name.toLowerCase() === typeName.toLowerCase()
    );
    const venue = venueName ? (data.venues ?? []).find(v =>
      v.name.toLowerCase().includes(venueName) || venueName.includes(v.name.toLowerCase())
    ) : null;
    const team = (data.teams ?? []).find(t => t.id === teamId) ?? (data.teams ?? [])[0];

    if (!rawDate || !team) return;

    const plan = {
      id: uid(), teamId: team.id,
      trainingTypeId: type?.id ?? "",
      durationMinutes: duration,
      venueId: venue?.id ?? null,
      date: rawDate,
      recordedId: null,
    };
    // Neue Felder nur setzen, wenn die Datei sie liefert
    const time  = parseTime(cell(row, "time"));
    const focus = (cell(row, "focus") ?? "").toString().trim();
    const note  = (cell(row, "note") ?? "").toString().trim();
    const tags  = normalizeTags((cell(row, "tags") ?? "").toString().split(/[,;]/));
    if (time) plan.time = time;
    if (focus) plan.focus = focus;
    if (note) plan.note = note;
    if (tags.length) plan.tags = tags;
    plans.push(plan);
  });
  return plans;
}

export async function importTrainingPlan(file, data, update, teamId, onDone) {
  const isXlsx = /\.xlsx?$/i.test(file.name);
  const XLSX = await loadXLSX();

  function processRows(rows) {
    const plans = parsePlanRows(rows, data, teamId, XLSX);
    if (plans.length > 0) {
      update(d => ({ ...d, plannedSessions: [...(d.plannedSessions ?? []), ...plans] }));
    }
    onDone(plans.length);
  }

  if (isXlsx) {
    const r = new FileReader();
    r.onload = ev => {
      const wb   = XLSX.read(ev.target.result, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      processRows(XLSX.utils.sheet_to_json(ws, { header: 1 }));
    };
    r.readAsArrayBuffer(file);
  } else {
    const { default: Papa } = await import("papaparse");
    Papa.parse(file, {
      complete: res => processRows(res.data),
      skipEmptyLines: true,
    });
  }
}
