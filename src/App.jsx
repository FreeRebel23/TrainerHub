import { useState, useCallback } from "react";
import {
  Home, Users, BarChart2, Plus, ArrowLeft, Check, Settings, Calendar,
  ChevronRight, ChevronLeft, Trash2, User, MoreVertical, Activity,
  Trophy, Edit3, FileText, X
} from "lucide-react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { usePwaUpdate } from "./usePwaUpdate.js";

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const STORE_KEY = "trainerhub_v1";

const STATUSES = {
  present:         { label: "Dabei",                  icon: "✅", short: "✓",   factorMult: 1.0, color: "#4ade80" },
  injured_present: { label: "Verletzt – trotzdem da", icon: "🤕❤️", short: "❤️", factorMult: 0.5, color: "#fb923c" },
  injured_absent:  { label: "Verletzt – nicht da",    icon: "🤕",  short: "🤕",  factorMult: 0.0, color: "#6b7280" },
  excused:         { label: "Entschuldigt",           icon: "📝",  short: "📝",  factorMult: 0.0, color: "#60a5fa" },
  absent:          { label: "Fehlt",                  icon: "❌",  short: "✗",   factorMult: 0.0, color: "#f87171" },
};
const STATUS_KEYS = Object.keys(STATUSES);

const INIT = {
  players: [
    { id: "p1", name: "Anna Müller",  birthYear: 2009, injured: false },
    { id: "p2", name: "Sarah Klein",  birthYear: 2010, injured: false },
    { id: "p3", name: "Lena Berg",    birthYear: 2009, injured: true  },
    { id: "p4", name: "Julia Koch",   birthYear: 2010, injured: false },
    { id: "p5", name: "Marie Hahn",   birthYear: 2009, injured: false },
  ],
  teams: [{
    id: "t0", name: "U16w",
    playerIds: ["p1","p2","p3","p4","p5"],
  }],
  trainingTypes: [
    { id: "tt1", name: "Basketball", duration: 90, emoji: "🏀" },
    { id: "tt2", name: "Fitness",    duration: 60, emoji: "💪" },
    { id: "tt3", name: "Taktik",     duration: 90, emoji: "🧠" },
    { id: "tt4", name: "Technik",    duration: 75, emoji: "🎯" },
  ],
  venues: [
    { id: "v1", name: "HSB Hallensportzentrum", address: "Sportzentrum 4",  emoji: "🏟️" },
    { id: "v2", name: "TV-Halle",               address: "Withumanlage 7", emoji: "🏠" },
    { id: "v3", name: "Jahnhalle",              address: "Postweg",        emoji: "🏛️" },
    { id: "v4", name: "TV-Platz (Außen)",       address: "Außenanlage",    emoji: "🌤️" },
  ],
  sessions: [],
  plannedSessions: [],
  seasons: [],
  settings: { trainerName: "" },
};

// ─────────────────────────────────────────────
// COLORS & SHARED STYLES
// ─────────────────────────────────────────────

const C = {
  bg:       "#09090f",
  card:     "#111118",
  card2:    "#16161f",
  border:   "#1f2937",
  border2:  "#374151",
  muted:    "#4b5563",
  muted2:   "#6b7280",
  text:     "#f1f5f9",
  textSoft: "#d1d5db",
  orange:   "#f97316",
  orangeDk: "#c2410c",
  orangeBg: "#1c0a00",
};

const ss = {
  label: {
    color: C.muted, fontSize: 11, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.08em",
    display: "block", marginBottom: 8,
  },
  input: {
    width: "100%", background: "#1f2937", border: `1px solid ${C.border2}`,
    borderRadius: 12, padding: "12px 14px", color: C.text, fontSize: 15,
    outline: "none", boxSizing: "border-box", display: "block",
  },
  primaryBtn: {
    width: "100%", padding: "16px 20px", borderRadius: 16,
    background: `linear-gradient(135deg,${C.orange},${C.orangeDk})`,
    border: "none", color: "white", fontWeight: 800, fontSize: 17, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  ghostBtn: {
    padding: "10px 16px", background: "#1f2937", border: "none",
    borderRadius: 12, color: C.muted2, fontWeight: 700, cursor: "pointer",
  },
};

function optBtn(active) {
  return {
    display: "flex", width: "100%", marginBottom: 8, padding: "13px 16px",
    background: active ? "#2d1000" : C.card,
    border: `1px solid ${active ? "#c2410c" : C.border}`,
    borderRadius: 13, color: active ? "#fdba74" : C.muted2,
    fontWeight: 700, fontSize: 15, cursor: "pointer", textAlign: "left",
    alignItems: "center", gap: 10,
  };
}
function chipBtn(active) {
  return {
    padding: "8px 14px", background: active ? "#2d1000" : C.card,
    border: `1px solid ${active ? "#c2410c" : C.border}`,
    borderRadius: 10, color: active ? "#fdba74" : C.muted2,
    fontWeight: 700, fontSize: 14, cursor: "pointer",
  };
}

// ─────────────────────────────────────────────
// BAWÜ HOLIDAY DATA  (Stage 3)
// ─────────────────────────────────────────────

const BAWUE_HOLIDAYS = {
  // 2025
  "2025-01-01": "Neujahr",
  "2025-01-06": "Heilige Drei Könige",
  "2025-04-18": "Karfreitag",
  "2025-04-20": "Ostersonntag",
  "2025-04-21": "Ostermontag",
  "2025-05-01": "Tag der Arbeit",
  "2025-05-29": "Christi Himmelfahrt",
  "2025-06-08": "Pfingstsonntag",
  "2025-06-09": "Pfingstmontag",
  "2025-06-19": "Fronleichnam",
  "2025-10-03": "Tag der Deutschen Einheit",
  "2025-11-01": "Allerheiligen",
  "2025-12-25": "1. Weihnachtstag",
  "2025-12-26": "2. Weihnachtstag",
  // 2026
  "2026-01-01": "Neujahr",
  "2026-01-06": "Heilige Drei Könige",
  "2026-04-03": "Karfreitag",
  "2026-04-05": "Ostersonntag",
  "2026-04-06": "Ostermontag",
  "2026-05-01": "Tag der Arbeit",
  "2026-05-14": "Christi Himmelfahrt",
  "2026-05-24": "Pfingstsonntag",
  "2026-05-25": "Pfingstmontag",
  "2026-06-04": "Fronleichnam",
  "2026-10-03": "Tag der Deutschen Einheit",
  "2026-11-01": "Allerheiligen",
  "2026-12-25": "1. Weihnachtstag",
  "2026-12-26": "2. Weihnachtstag",
  // 2027
  "2027-01-01": "Neujahr",
  "2027-01-06": "Heilige Drei Könige",
};

// BaWü Schulferien – offizielle Termine laut Kultusministerium BaWü (km.baden-wuerttemberg.de/de/service/ferien)
const BAWUE_SCHOOL_HOLIDAYS = [
  // Schuljahr 2024/2025
  { name: "Osterferien",       start: "2025-04-11", end: "2025-04-25" },
  { name: "Pfingstferien",     start: "2025-06-10", end: "2025-06-21" },
  // Schuljahr 2025/2026
  { name: "Sommerferien",      start: "2025-07-31", end: "2025-09-13" },
  { name: "Herbstferien",      start: "2025-10-27", end: "2025-10-31" }, // 31.10. = Reformationsfest, schulfrei
  { name: "Weihnachtsferien",  start: "2025-12-22", end: "2026-01-05" },
  { name: "Osterferien",       start: "2026-03-30", end: "2026-04-11" }, // amtlich: 30.03.–11.04.2026
  { name: "Pfingstferien",     start: "2026-05-26", end: "2026-06-05" }, // amtlich: 26.05.–05.06.2026
  // Schuljahr 2026/2027
  { name: "Sommerferien",      start: "2026-07-30", end: "2026-09-12" },
  { name: "Herbstferien",      start: "2026-10-26", end: "2026-10-31" }, // 31.10. = Reformationsfest, schulfrei
  { name: "Weihnachtsferien",  start: "2026-12-23", end: "2027-01-09" }, // amtlich: 23.12.2026–09.01.2027
  { name: "Pfingstferien",     start: "2027-05-18", end: "2027-05-29" }, // amtlich: 18.05.–29.05.2027
];

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function loadData() {
  try {
    const r = localStorage.getItem(STORE_KEY);
    if (r) {
      const d = JSON.parse(r);
      if (!d.plannedSessions) d.plannedSessions = [];  // migration
      if (!d.venues) d.venues = JSON.parse(JSON.stringify(INIT.venues)); // migration
      if (!d.seasons) d.seasons = []; // migration
      if (!d.settings) d.settings = { trainerName: "" }; // migration
      // Migrate old format: extract team.players → global players + playerIds
      if (!d.players) {
        const map = {};
        (d.teams ?? []).forEach(t => {
          (t.players ?? []).forEach(p => { if (!map[p.id]) map[p.id] = { ...p }; });
        });
        d.players = Object.values(map);
        d.teams = (d.teams ?? []).map(t => ({
          ...t,
          playerIds: (t.players ?? []).map(p => p.id),
          players:   undefined,
        }));
      }
      return d;
    }
  } catch {}
  return JSON.parse(JSON.stringify(INIT));
}
function persist(d) { try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch {} }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function todayISO() { return new Date().toISOString().split("T")[0]; }

function fmtDate(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("de-DE", {
    weekday: "short", day: "2-digit", month: "2-digit",
  });
}
function fmtDateFull(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("de-DE", {
    weekday: "long", day: "numeric", month: "long",
  });
}
function calcFactor(min) { return +(min / 60).toFixed(1); }

// ─────────────────────────────────────────────
// CALENDAR HELPERS  (Stage 3)
// ─────────────────────────────────────────────

const MONTHS_DE = ["Januar","Februar","März","April","Mai","Juni",
                   "Juli","August","September","Oktober","November","Dezember"];
const WEEKDAYS  = ["Mo","Di","Mi","Do","Fr","Sa","So"];

function getHoliday(iso) { return BAWUE_HOLIDAYS[iso] || null; }

function getSchoolHoliday(iso) {
  return BAWUE_SCHOOL_HOLIDAYS.find(h => iso >= h.start && iso <= h.end) || null;
}

function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const startDow = (firstDay.getDay() + 6) % 7;   // 0=Mon, 6=Sun
  const grid = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month, 1 - startDow + i);
    grid.push(d.toISOString().split("T")[0]);
  }
  return grid;
}

// ─────────────────────────────────────────────
// SEASON CONSTANTS & HELPERS  (Stage 4)
// ─────────────────────────────────────────────

const PHASES = {
  vorbereitung:  { label: "Vorbereitung",    emoji: "🟡", color: "#ca8a04", bg: "#1c1700"  },
  saison:        { label: "Reguläre Saison", emoji: "🟢", color: "#4ade80", bg: "#052e16"  },
  offseason:     { label: "Offseason",        emoji: "⚫", color: "#6b7280", bg: "#111118"  },
  abgeschlossen: { label: "Abgeschlossen",   emoji: "✅", color: "#60a5fa", bg: "#0c1a2e"  },
};

function getActiveSeason(teamId, seasons) {
  return (seasons ?? [])
    .filter(s => s.teamId === teamId && s.phase !== "abgeschlossen")
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
}

function getSeasonSessions(season, sessions) {
  if (!season) return sessions ?? [];
  return (sessions ?? []).filter(s =>
    s.teamId === season.teamId &&
    s.date >= season.startDate &&
    s.date <= season.endDate
  );
}

// ─────────────────────────────────────────────
// PLAYER HELPERS
// ─────────────────────────────────────────────

function getTeamPlayers(teamId, data) {
  const team = (data.teams ?? []).find(t => t.id === teamId);
  if (!team) return [];
  const ids = new Set(team.playerIds ?? []);
  return (data.players ?? []).filter(p => ids.has(p.id));
}

function getPlayerName(pid, data) {
  return (data.players ?? []).find(p => p.id === pid)?.name ?? "?";
}


// ─────────────────────────────────────────────
// DATA HOOK
// ─────────────────────────────────────────────

function useData() {
  const [data, setData] = useState(loadData);
  const update = useCallback(fn => {
    setData(prev => { const next = fn(prev); persist(next); return next; });
  }, []);
  return { data, update };
}

// ─────────────────────────────────────────────
// SHARED UI
// ─────────────────────────────────────────────

function BottomNav({ active, go }) {
  const tabs = [
    ["home",     "Start",    Home],
    ["calendar", "Kalender", Calendar],
    ["teams",    "Teams",    Users],
    ["stats",    "Stats",    BarChart2],
    ["settings", "Einst.",   Settings],
  ];
  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
      background: "#0d0d15", borderTop: `1px solid ${C.border}`,
      display: "flex", justifyContent: "space-around",
      padding: "10px 0 max(12px, env(safe-area-inset-bottom))",
    }}>
      {tabs.map(([key, label, Icon]) => (
        <button key={key} onClick={() => go(key)} style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
          background: "none", border: "none", cursor: "pointer", padding: "0 10px",
        }}>
          <Icon size={21} color={active === key ? C.orange : C.muted} />
          <span style={{ fontSize: 10, color: active === key ? C.orange : C.muted }}>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function Hdr({ title, back, action }) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 10,
      background: C.bg, borderBottom: `1px solid ${C.border}`,
      display: "flex", alignItems: "center", padding: "13px 16px", gap: 12,
    }}>
      {back && (
        <button onClick={back} style={{
          background: "#1f2937", border: "none", borderRadius: 9,
          padding: 7, cursor: "pointer", display: "flex", flexShrink: 0,
        }}>
          <ArrowLeft size={20} color={C.textSoft} />
        </button>
      )}
      <span style={{ flex: 1, fontWeight: 800, fontSize: 18, color: C.text }}>{title}</span>
      {action}
    </div>
  );
}

// ─────────────────────────────────────────────
// HOME VIEW  (updated: upcoming planned sessions)
// ─────────────────────────────────────────────

function HomeView({ data, go }) {
  const today    = todayISO();
  const sessions = [...(data.sessions ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const todaySess = sessions.find(s => s.date === today);
  const getType  = id => (data.trainingTypes ?? []).find(t => t.id === id);
  const getTeam  = id => (data.teams ?? []).find(t => t.id === id);
  const nPresent = s  => (s.attendance ?? []).filter(a => ["present","injured_present"].includes(a.status)).length;

  // Upcoming planned sessions (next 3, not yet recorded)
  const upcoming = [...(data.plannedSessions ?? [])]
    .filter(p => p.date >= today && !p.recordedId)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", paddingBottom: 100 }}>
      <div style={{ padding: "24px 16px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
          <span style={{ color: C.muted2, fontSize: 13 }}>
            {new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
          </span>
          <span style={{ fontSize: 22 }}>🏀</span>
        </div>
        <h1 style={{ color: C.text, fontSize: 32, fontWeight: 900, margin: "0 0 4px", letterSpacing: "-1.5px" }}>
          TrainerHub
        </h1>
        {(() => {
          const firstTeam = (data.teams ?? [])[0];
          if (!firstTeam) return null;
          const as = getActiveSeason(firstTeam.id, data.seasons ?? []);
          if (!as) return null;
          const ph = PHASES[as.phase] ?? PHASES.offseason;
          return (
            <p style={{ margin: "0 0 16px", color: ph.color, fontSize: 13, fontWeight: 600 }}>
              {ph.emoji} {as.name} · {ph.label}
            </p>
          );
        })()}
        <div style={{ marginBottom: 16 }} />
        <button onClick={() => go("new_session")} style={ss.primaryBtn}>
          <span>Neues Training erfassen</span>
          <Plus size={22} color="white" />
        </button>
      </div>

      {/* Today's recorded session */}
      {todaySess && (
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ background: "#052e16", border: "1px solid #166534", borderRadius: 16, padding: 16 }}>
            <p style={{ color: "#4ade80", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>
              Heute erfasst ✓
            </p>
            <p style={{ color: "white", fontWeight: 700, margin: 0, fontSize: 16 }}>
              {getType(todaySess.trainingTypeId)?.emoji} {getType(todaySess.trainingTypeId)?.name}
            </p>
            <p style={{ color: "#86efac", fontSize: 13, margin: 0 }}>{nPresent(todaySess)} Spieler:innen dabei</p>
          </div>
        </div>
      )}

      {/* Upcoming planned */}
      {upcoming.length > 0 && (
        <div style={{ padding: "0 16px 14px" }}>
          <p style={{ ...ss.label, marginBottom: 8 }}>Nächste geplante Trainings</p>
          {upcoming.map(p => {
            const type      = getType(p.trainingTypeId);
            const team      = getTeam(p.teamId);
            const isToday   = p.date === today;
            const isVacation = !!getSchoolHoliday(p.date);
            const isHoliday  = !!getHoliday(p.date);
            return (
              <div key={p.id} style={{
                background: C.card,
                border: `1px solid ${isHoliday ? "#7f1d1d" : isVacation ? "#713f12" : C.border}`,
                borderRadius: 14, padding: "12px 14px", marginBottom: 6,
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <span style={{ fontSize: 26, flexShrink: 0 }}>{type?.emoji ?? "🏋️"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, color: C.text, fontSize: 15 }}>{type?.name}</p>
                  <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>
                    {isToday ? "Heute" : fmtDate(p.date)} · {team?.name} · {p.durationMinutes} min
                  </p>
                  <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                    {isVacation && <span style={{ fontSize: 11, color: "#ca8a04" }}>🟡 Ferientraining</span>}
                    {isHoliday  && <span style={{ fontSize: 11, color: "#ef4444" }}>🔴 Feiertag!</span>}
                  </div>
                </div>
                {isToday && (
                  <button onClick={() => go("new_session", { plan: p })} style={{
                    padding: "8px 13px", borderRadius: 12, flexShrink: 0,
                    background: `linear-gradient(135deg,${C.orange},${C.orangeDk})`,
                    border: "none", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer",
                  }}>
                    Erfassen →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Recent sessions */}
      <div style={{ padding: "0 16px" }}>
        <p style={{ ...ss.label, marginBottom: 10 }}>Letzte Trainings</p>
        {sessions.length === 0 ? (
          <div style={{ background: C.card, borderRadius: 16, padding: "32px 16px", textAlign: "center" }}>
            <Activity size={30} color={C.border2} style={{ margin: "0 auto 10px", display: "block" }} />
            <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>Noch keine Trainings erfasst</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sessions.slice(0, 8).map(s => {
              const tp = getType(s.trainingTypeId);
              const tm = getTeam(s.teamId);
              return (
                <button key={s.id} onClick={() => go("session_detail", { sessionId: s.id })} style={{
                  background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
                  padding: 16, display: "flex", alignItems: "center", gap: 14, cursor: "pointer", textAlign: "left",
                }}>
                  <div style={{ width: 50, height: 50, background: "#1a1a24", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>
                    {tp?.emoji ?? "🏋️"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, color: C.text, fontSize: 15 }}>{tp?.name ?? "Training"}</p>
                    <p style={{ margin: "2px 0 0", color: C.muted, fontSize: 12 }}>{fmtDate(s.date)} · {tm?.name}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 1 }}>
                      <p style={{ margin: 0, color: C.muted2, fontSize: 12 }}>
                        {nPresent(s)} dabei · {s.durationMinutes} min · F {s.factor}
                        {s.venueId && (() => { const v = (data.venues??[]).find(x=>x.id===s.venueId); return v ? " · " + v.emoji + " " + v.name : ""; })()}
                      </p>
                      {s.note && <span style={{ fontSize: 12 }}>📝</span>}
                    </div>
                  </div>
                  <ChevronRight size={16} color={C.border2} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// NEW SESSION WIZARD  (updated: plan prop)
// ─────────────────────────────────────────────

function NewSessionView({ data, onSave, back, plan }) {
  const [step, setStep]       = useState(1);
  const [teamId, setTeam]     = useState(plan?.teamId ?? data.teams?.[0]?.id ?? "");
  const [typeId, setType]     = useState(plan?.trainingTypeId ?? data.trainingTypes?.[0]?.id ?? "");
  const [dur, setDur]         = useState(plan?.durationMinutes ?? data.trainingTypes?.[0]?.duration ?? 90);
  const [venueId, setVenueId] = useState(plan?.venueId ?? data.venues?.[0]?.id ?? "");

  function pickType(id) {
    setType(id);
    const t = (data.trainingTypes ?? []).find(t => t.id === id);
    if (t) setDur(t.duration);
  }

  const team  = (data.teams ?? []).find(t => t.id === teamId);
  const type  = (data.trainingTypes ?? []).find(t => t.id === typeId);
  const venue = (data.venues ?? []).find(v => v.id === venueId);

  if (!data.teams?.length) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh" }}>
        <Hdr title="Neues Training" back={back} />
        <div style={{ padding: 32, textAlign: "center" }}>
          <Users size={42} color={C.border2} style={{ margin: "0 auto 16px", display: "block" }} />
          <p style={{ color: C.muted, marginBottom: 20 }}>Bitte zuerst ein Team im Teams-Bereich anlegen.</p>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <AttendanceView
        team={team}
        players={getTeamPlayers(teamId, data)}
        type={type} dur={dur}
        sessionDate={plan?.date ?? todayISO()}
        planId={plan?.id}
        venue={venue}
        onSave={onSave}
        back={() => setStep(1)}
      />
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", paddingBottom: 24 }}>
      <Hdr title={plan ? "Geplantes Training erfassen" : "Neues Training"} back={back} />
      {plan && (
        <div style={{ margin: "12px 16px 0", padding: "10px 14px", background: "#1c0a00", border: `1px solid ${C.orangeDk}`, borderRadius: 13 }}>
          <p style={{ margin: 0, color: C.orange, fontSize: 13 }}>📋 Geplant für {fmtDateFull(plan.date)}</p>
        </div>
      )}
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 22 }}>

        {(data.teams ?? []).length > 1 && (
          <div>
            <span style={ss.label}>Team</span>
            {(data.teams ?? []).map(t => (
              <button key={t.id} onClick={() => setTeam(t.id)} style={optBtn(teamId === t.id)}>
                <span style={{ fontSize: 18 }}>👥</span>
                <span style={{ flex: 1 }}>{t.name}</span>
                <span style={{ fontWeight: 400, fontSize: 12, color: C.muted2 }}>{t.playerIds?.length ?? 0} Spieler:innen</span>
              </button>
            ))}
          </div>
        )}

        <div>
          <span style={ss.label}>Trainingsart</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {(data.trainingTypes ?? []).map(t => (
              <button key={t.id} onClick={() => pickType(t.id)} style={{
                ...optBtn(typeId === t.id),
                flexDirection: "column", alignItems: "center", padding: 18, marginBottom: 0,
              }}>
                <span style={{ fontSize: 30, marginBottom: 6 }}>{t.emoji}</span>
                <span style={{ fontWeight: 700 }}>{t.name}</span>
                <span style={{ fontSize: 12, opacity: 0.6, fontWeight: 400 }}>{t.duration} min</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <span style={ss.label}>
            Dauer — Faktor: <span style={{ color: C.orange }}>{calcFactor(dur)}</span>
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[45, 60, 75, 90, 105, 120, 150].map(m => (
              <button key={m} onClick={() => setDur(m)} style={chipBtn(dur === m)}>{m} min</button>
            ))}
          </div>
        </div>

        {(data.venues ?? []).length > 0 && (
          <div>
            <span style={ss.label}>Halle / Standort</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(data.venues ?? []).map(v => (
                <button key={v.id} onClick={() => setVenueId(v.id)} style={optBtn(venueId === v.id)}>
                  <span style={{ fontSize: 20 }}>{v.emoji}</span>
                  <span style={{ flex: 1 }}>{v.name}</span>
                  <span style={{ fontWeight: 400, fontSize: 12, color: C.muted2 }}>{v.address}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
          <p style={{ color: C.muted2, fontSize: 12, margin: "0 0 4px" }}>Zusammenfassung</p>
          <p style={{ color: C.text, fontWeight: 800, fontSize: 17, margin: 0 }}>{type?.emoji} {type?.name}</p>
          <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
            {team?.name} · {dur} min · F {calcFactor(dur)}
            {venue && <span> · {venue.emoji} {venue.name}</span>}
          </p>
        </div>

        <button onClick={() => setStep(2)} style={ss.primaryBtn}>
          <span>Anwesenheit erfassen</span>
          <ChevronRight size={22} color="white" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ATTENDANCE VIEW  (updated: planId + sessionDate)
// ─────────────────────────────────────────────

function AttendanceView({ team, players, type, dur, sessionDate, planId, venue, onSave, back }) {
  const f = calcFactor(dur);
  const today = todayISO();

  const [att, setAtt] = useState(() =>
    (players ?? []).map(p => ({
      playerId: p.id,
      status: p.injured ? "injured_absent" : "absent",
    }))
  );
  const [expanded,  setExpanded]  = useState(null);
  const [note,      setNote]      = useState("");
  const [showNote,  setShowNote]  = useState(false);
  const [checklist, setChecklist] = useState([]);
  const [showCL,    setShowCL]    = useState(false);
  const [newDrill,  setNewDrill]  = useState("");

  function addDrill(text) {
    const t = (text || newDrill).trim();
    if (!t) return;
    setChecklist(prev => [...prev, { id: uid(), text: t, done: false }]);
    setNewDrill("");
  }
  function toggleDrill(id) {
    setChecklist(prev => prev.map(d => d.id === id ? { ...d, done: !d.done } : d));
  }
  function deleteDrill(id) {
    setChecklist(prev => prev.filter(d => d.id !== id));
  }

  function toggle(player) {
    const cur = att.find(a => a.playerId === player.id)?.status;
    const isPresent = cur === "present" || cur === "injured_present";
    const next = isPresent
      ? (player.injured ? "injured_absent" : "absent")
      : (player.injured ? "injured_present" : "present");
    setAtt(prev => prev.map(a => a.playerId === player.id ? { ...a, status: next } : a));
    setExpanded(null);
  }
  function setStatus(pid, status) {
    setAtt(prev => prev.map(a => a.playerId === pid ? { ...a, status } : a));
    setExpanded(null);
  }

  const presentCount = att.filter(a => ["present","injured_present"].includes(a.status)).length;
  const commitCount  = att.filter(a => a.status === "injured_present").length;
  const schoolHol    = getSchoolHoliday(sessionDate);

  function statusIcon(status) {
    return { present:"✓", injured_present:"❤️", injured_absent:"🤕", excused:"📝", absent:"✗" }[status] ?? "–";
  }

  function save() {
    onSave({
      id: uid(), teamId: team.id, trainingTypeId: type.id,
      date: sessionDate, durationMinutes: dur, factor: f,
      attendance: att, note: note.trim(),
      venueId: venue?.id ?? null,
      checklist,
    }, planId);
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", paddingBottom: 110 }}>
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: C.bg, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", padding: "13px 16px", gap: 12 }}>
          <button onClick={back} style={{ background: "#1f2937", border: "none", borderRadius: 9, padding: 7, cursor: "pointer", display: "flex", flexShrink: 0 }}>
            <ArrowLeft size={20} color={C.textSoft} />
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 800, color: C.text, fontSize: 15 }}>{type?.emoji} {type?.name}</p>
            <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>
              {team?.name} · {sessionDate !== today ? fmtDate(sessionDate) + " · " : ""}{dur} min · F {f}
              {venue && <span> · {venue.emoji} {venue.name}</span>}
              {schoolHol && <span style={{ color: "#ca8a04", marginLeft: 6 }}>· Ferientraining</span>}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: 0, color: C.orange, fontWeight: 900, fontSize: 30, lineHeight: 1 }}>{presentCount}</p>
            <p style={{ margin: 0, color: C.muted, fontSize: 11 }}>dabei</p>
          </div>
        </div>
        <p style={{ margin: 0, padding: "0 16px 10px", color: C.muted, fontSize: 11 }}>
          Antippen = dabei / nicht dabei &nbsp;·&nbsp; ··· = mehr Optionen
        </p>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {(players ?? []).map(player => {
          const status    = att.find(a => a.playerId === player.id)?.status ?? "absent";
          const s         = STATUSES[status];
          const isPresent = status === "present" || status === "injured_present";
          const isOpen    = expanded === player.id;

          return (
            <div key={player.id} style={{
              borderRadius: 16,
              border: `1px solid ${isPresent ? s.color + "50" : C.border}`,
              background: isPresent ? s.color + "12" : C.card,
              overflow: "hidden",
            }}>
              <div style={{ display: "flex", alignItems: "center", padding: "14px 14px 14px 16px", gap: 14 }}>
                <button onClick={() => toggle(player)} style={{
                  width: 54, height: 54, flexShrink: 0, borderRadius: 15,
                  background: isPresent ? s.color + "22" : "#1a1a24",
                  border: `2.5px solid ${isPresent ? s.color : C.border2}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, cursor: "pointer", color: s.color, fontWeight: 900,
                }}>
                  {statusIcon(status)}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <p style={{ margin: 0, fontWeight: 700, color: C.text, fontSize: 17 }}>{player.name}</p>
                    {player.injured && (
                      <span style={{ fontSize: 11, background: "#450a0a", color: "#f87171", border: "1px solid #7f1d1d", borderRadius: 20, padding: "2px 7px" }}>
                        verletzt
                      </span>
                    )}
                  </div>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: s.color }}>{s.label}</p>
                </div>
                <button onClick={() => setExpanded(isOpen ? null : player.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
                  <MoreVertical size={18} color={C.muted} />
                </button>
              </div>

              {isOpen && (
                <div style={{ padding: "0 16px 16px" }}>
                  <div style={{ background: C.bg, borderRadius: 13, overflow: "hidden", border: `1px solid ${C.border}` }}>
                    {STATUS_KEYS.map((key, i) => {
                      const opt = STATUSES[key]; const active = status === key;
                      return (
                        <button key={key} onClick={() => setStatus(player.id, key)} style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 12,
                          padding: "13px 16px", background: active ? opt.color + "15" : "transparent",
                          border: "none", borderBottom: i < STATUS_KEYS.length - 1 ? `1px solid ${C.border}` : "none",
                          cursor: "pointer", textAlign: "left",
                        }}>
                          <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>{opt.icon}</span>
                          <span style={{ fontSize: 14, fontWeight: active ? 700 : 400, color: active ? opt.color : C.muted2, flex: 1 }}>
                            {opt.label}
                          </span>
                          {opt.factorMult > 0 && <span style={{ fontSize: 12, color: opt.color, opacity: 0.7 }}>×{opt.factorMult}</span>}
                          {active && <Check size={14} color={opt.color} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {commitCount > 0 && (
        <div style={{ padding: "4px 16px 12px" }}>
          <div style={{ background: "#1c1202", border: "1px solid #854d0e", borderRadius: 16, padding: "14px 18px", display: "flex", gap: 14, alignItems: "center" }}>
            <span style={{ fontSize: 26 }}>🤕❤️</span>
            <div>
              <p style={{ margin: 0, color: "#fb923c", fontWeight: 800, fontSize: 15 }}>Commitment!</p>
              <p style={{ margin: 0, color: "#92400e", fontSize: 12 }}>
                {commitCount} Spieler:in{commitCount > 1 ? "nen" : ""} trotz Verletzung dabei
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      <div style={{ padding: "4px 16px 16px" }}>
        {!showNote ? (
          <button onClick={() => setShowNote(true)} style={{
            display: "flex", alignItems: "center", gap: 8,
            background: C.card2, border: `1px dashed ${C.border2}`,
            borderRadius: 14, padding: "12px 16px", cursor: "pointer", width: "100%",
          }}>
            <FileText size={16} color={C.muted} />
            <span style={{ color: C.muted, fontSize: 14 }}>Trainingsnotiz hinzufügen …</span>
          </button>
        ) : (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
              <FileText size={14} color={C.orange} style={{ marginRight: 8 }} />
              <span style={{ color: C.orange, fontSize: 13, fontWeight: 700, flex: 1 }}>Trainingsnotiz</span>
              {!note && <button onClick={() => setShowNote(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><X size={14} color={C.muted} /></button>}
            </div>
            <textarea
              value={note} onChange={e => setNote(e.target.value)}
              placeholder="z.B. Fokus: Pick & Roll verteidigen. Gute Intensität heute."
              autoFocus rows={3}
              style={{ ...ss.input, borderRadius: 0, border: "none", background: "transparent", resize: "none", fontSize: 14, padding: "12px 14px", lineHeight: 1.5 }}
            />
          </div>
        )}
      </div>

      {/* Checklist / Drills */}
      <div style={{ padding: "0 16px 16px" }}>
        {!showCL ? (
          <button onClick={() => setShowCL(true)} style={{
            display: "flex", alignItems: "center", gap: 8,
            background: C.card2, border: "1px dashed " + C.border2,
            borderRadius: 14, padding: "12px 16px", cursor: "pointer", width: "100%",
          }}>
            <span style={{ fontSize: 16 }}>📋</span>
            <span style={{ color: C.muted, fontSize: 14 }}>Drills und Uebungen planen ...</span>
          </button>
        ) : (
          <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid " + C.border }}>
              <span style={{ fontSize: 14, marginRight: 8 }}>📋</span>
              <span style={{ color: C.orange, fontSize: 13, fontWeight: 700, flex: 1 }}>Drills und Uebungen</span>
              <span style={{ fontSize: 12, color: C.muted }}>
                {checklist.filter(d => d.done).length}/{checklist.length}
              </span>
              {checklist.length === 0 && (
                <button onClick={() => setShowCL(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 4, marginLeft: 8 }}>
                  <X size={14} color={C.muted} />
                </button>
              )}
            </div>
            {checklist.map(d => (
              <div key={d.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px", borderBottom: "1px solid " + C.border,
              }}>
                <button onClick={() => toggleDrill(d.id)} style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0, cursor: "pointer",
                  background: d.done ? "#4ade8020" : "#1f2937",
                  border: "2px solid " + (d.done ? "#4ade80" : C.border2),
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {d.done && <Check size={14} color="#4ade80" />}
                </button>
                <span style={{
                  flex: 1, fontSize: 15, color: d.done ? C.muted : C.text,
                  textDecoration: d.done ? "line-through" : "none",
                }}>
                  {d.text}
                </span>
                <button onClick={() => deleteDrill(d.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                  <X size={14} color={C.muted} />
                </button>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px 8px 14px" }}>
              <input
                value={newDrill}
                onChange={e => setNewDrill(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addDrill()}
                placeholder="Drill eingeben, z.B. Stride 4x 400m..."
                style={{ flex: 1, background: "transparent", border: "none", color: C.text, fontSize: 14, outline: "none" }}
              />
              <button onClick={() => addDrill()} style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                background: newDrill.trim() ? C.orange : C.border,
                border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Plus size={16} color="white" />
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: 16, background: C.bg, borderTop: "1px solid " + C.border }}>
        <button onClick={save} style={ss.primaryBtn}>
          <span>Training speichern</span>
          <span style={{ fontWeight: 900, fontSize: 20 }}>{presentCount} dabei</span>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// EXPORT / PRINT / BACKUP UTILITIES  (Stage 5)
// ─────────────────────────────────────────────

function printSession(session, data) {
  const team  = (data.teams ?? []).find(t => t.id === session.teamId);
  const type  = (data.trainingTypes ?? []).find(t => t.id === session.trainingTypeId);
  const venue = (data.venues ?? []).find(v => v.id === session.venueId);
  const schH  = getSchoolHoliday(session.date);
  const dateStr = new Date(session.date + "T12:00:00").toLocaleDateString("de-DE",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const att   = session.attendance ?? [];
  const presentCount = att.filter(a => ["present","injured_present"].includes(a.status)).length;
  const getName = pid => (data.players ?? []).find(p => p.id === pid)?.name ?? pid;

  const rows = att.map(a => {
    const s = STATUSES[a.status] ?? {};
    const pts = (session.factor * (s.factorMult ?? 0)).toFixed(1);
    return `<tr>
      <td>${s.icon ?? "?"}</td>
      <td>${getName(a.playerId)}</td>
      <td style="color:#555">${s.label ?? a.status}</td>
      <td style="text-align:right">${(s.factorMult ?? 0) > 0 ? pts : "—"}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
  <title>Training ${session.date} · ${team?.name ?? ""}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,Helvetica Neue,sans-serif;color:#111;padding:32px;max-width:600px}
    .club{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
    .ttl{font-size:26px;font-weight:900;margin-bottom:4px}
    .sub{font-size:14px;color:#444;margin-bottom:4px}
    .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:#fff3cd;color:#856404;margin-top:4px}
    .meta{display:flex;flex-wrap:wrap;gap:20px;margin:16px 0;padding:16px;background:#f5f5f5;border-radius:10px}
    .ml{font-size:10px;color:#999;text-transform:uppercase}
    .mv{font-size:18px;font-weight:700}
    .st{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888;margin:18px 0 6px}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;font-size:10px;text-transform:uppercase;color:#999;padding:6px 8px;border-bottom:2px solid #eee}
    td{padding:8px;border-bottom:1px solid #f0f0f0;font-size:13px}
    .note{background:#fff8f0;border-left:3px solid #f97316;padding:12px 16px;border-radius:0 8px 8px 0;font-size:13px;line-height:1.6}
    .foot{margin-top:28px;padding-top:14px;border-top:1px solid #eee;font-size:10px;color:#bbb;display:flex;justify-content:space-between}
    @media print{body{padding:16px}}
  </style></head><body>
  <div class="club">TV Bretten Basketball · TrainerHub</div>
  <div class="ttl">${type?.emoji ?? "🏋️"} ${type?.name ?? "Training"}</div>
  <div class="sub">${dateStr}</div>
  ${schH ? '<span class="badge">🟡 ' + schH.name + ' – Ferientraining</span>' : ""}
  <div class="meta">
    <div><div class="ml">Team</div><div class="mv">${team?.name ?? "—"}</div></div>
    <div><div class="ml">Dauer</div><div class="mv">${session.durationMinutes} min</div></div>
    <div><div class="ml">Faktor</div><div class="mv">${session.factor}</div></div>
    <div><div class="ml">Dabei</div><div class="mv">${presentCount} / ${att.length}</div></div>
    ${venue ? '<div><div class="ml">Halle</div><div class="mv">' + venue.name + '</div></div>' : ""}
  </div>
  <div class="st">Anwesenheit</div>
  <table><thead><tr><th></th><th>Spieler:in</th><th>Status</th><th style="text-align:right">Pkt.</th></tr></thead>
  <tbody>${rows}</tbody></table>
  ${session.note ? '<div class="st">Notiz</div><div class="note">' + session.note + '</div>' : ""}
  <div class="foot"><span>TrainerHub · ${team?.name ?? ""}</span><span>Erstellt ${new Date().toLocaleDateString("de-DE")}</span></div>
  </body></html>`;

  const w = window.open("","_blank");
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
}

function printStats(teamName, allSess, ranking, selSeason) {
  const dateStr = new Date().toLocaleDateString("de-DE");
  const rows = ranking.map((r, i) => {
    const medal = ["🥇","🥈","🥉"][i] ?? (i + 1);
    const types = Object.entries(r.byType).map(([k,v]) => k+": "+v+"x").join(" · ");
    return `<tr>
      <td style="text-align:center;font-size:${i<3?18:13}px">${medal}</td>
      <td><strong>${r.player.name}</strong>${r.commits > 0 ? ' <span style="color:#fb923c;font-size:11px">🤕❤️ x'+r.commits+"</span>" : ""}
        ${types ? '<br><span style="font-size:10px;color:#999">'+types+'</span>' : ""}</td>
      <td style="text-align:center">${r.cnt}</td>
      <td style="text-align:center">${r.pct}%</td>
      <td style="text-align:right;font-weight:700;color:#f97316">${r.pts}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
  <title>Ranking · ${teamName}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,Helvetica Neue,sans-serif;color:#111;padding:32px;max-width:680px}
    .club{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
    .ttl{font-size:24px;font-weight:900;margin-bottom:4px}
    .sub{font-size:13px;color:#555;margin-bottom:16px}
    .totals{display:flex;gap:24px;padding:16px;background:#f5f5f5;border-radius:10px;margin-bottom:20px}
    .tl{font-size:10px;color:#999;text-transform:uppercase}.tv{font-size:20px;font-weight:900;color:#f97316}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;font-size:10px;text-transform:uppercase;color:#999;padding:8px;border-bottom:2px solid #eee}
    td{padding:9px 8px;border-bottom:1px solid #f0f0f0;vertical-align:middle}
    .foot{margin-top:28px;padding-top:14px;border-top:1px solid #eee;font-size:10px;color:#bbb;display:flex;justify-content:space-between}
    @media print{body{padding:16px}}
  </style></head><body>
  <div class="club">TV Bretten Basketball · TrainerHub</div>
  <div class="ttl">Partizipations-Ranking</div>
  <div class="sub">${teamName}${selSeason ? " · " + selSeason.name : ""}</div>
  <div class="totals">
    <div><div class="tl">Trainings</div><div class="tv">${allSess.length}</div></div>
    <div><div class="tl">Ges. Min.</div><div class="tv">${allSess.reduce((s,x)=>s+x.durationMinutes,0)}</div></div>
    <div><div class="tl">Spieler:innen</div><div class="tv">${ranking.length}</div></div>
  </div>
  <table><thead><tr><th style="text-align:center">#</th><th>Spielerin</th>
  <th style="text-align:center">Einheiten</th><th style="text-align:center">Quote</th>
  <th style="text-align:right">Punkte</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="foot"><span>TrainerHub · ${teamName}</span><span>Erstellt ${dateStr}</span></div>
  </body></html>`;

  const w = window.open("","_blank");
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
}

function downloadBackup(data) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href: url, download: "trainerhub_" + new Date().toISOString().split("T")[0] + ".json"
  });
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}


// ─────────────────────────────────────────────
// SESSION DETAIL
// ─────────────────────────────────────────────

function SessionDetailView({ data, update, sessionId, back, onDelete }) {
  const sess = (data.sessions ?? []).find(s => s.id === sessionId);
  const [editing,  setEditing]  = useState(false);
  const [editNote, setEditNote] = useState("");
  const [editAtt,  setEditAtt]  = useState([]);
  const [editCL,   setEditCL]   = useState([]);
  const [expandEd, setExpandEd] = useState(null);

  if (!sess) return <div style={{ background: C.bg, minHeight: "100vh", padding: 24, color: C.muted, textAlign: "center" }}>Nicht gefunden.</div>;

  const team    = (data.teams ?? []).find(t => t.id === sess.teamId);
  const type    = (data.trainingTypes ?? []).find(t => t.id === sess.trainingTypeId);
  const getName   = pid => getPlayerName(pid, data);
  const getPlayer = pid => (data.players ?? []).find(p => p.id === pid);
  const schoolHol = getSchoolHoliday(sess.date);
  const sessVenue = (data.venues ?? []).find(v => v.id === sess.venueId);
  const nPresent  = (sess.attendance ?? []).filter(a => ["present","injured_present"].includes(a.status)).length;

  function startEdit() {
    setEditNote(sess.note ?? "");
    setEditAtt((sess.attendance ?? []).map(a => ({ ...a })));
    setEditCL((sess.checklist ?? []).map(d => ({ ...d })));
    setEditing(true);
  }

  function saveEdit() {
    update(d => ({
      ...d,
      sessions: d.sessions.map(s => s.id !== sessionId ? s : {
        ...s, note: editNote.trim(), attendance: editAtt, checklist: editCL,
      }),
    }));
    setEditing(false);
  }

  function setEdStatus(pid, status) {
    setEditAtt(prev => prev.map(a => a.playerId === pid ? { ...a, status } : a));
    setExpandEd(null);
  }

  function statusIcon(status) {
    return { present:"✓", injured_present:"❤️", injured_absent:"🤕", excused:"📝", absent:"✗" }[status] ?? "–";
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", paddingBottom: 24 }}>
      <Hdr title="Training" back={back} action={
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => printSession(sess, data)} style={{ background: "#1f2937", border: "none", borderRadius: 8, padding: "7px 10px", cursor: "pointer" }}>
            <FileText size={16} color={C.muted2} />
          </button>
          {!editing && (
            <button onClick={startEdit} style={{ background: "#1f2937", border: "none", borderRadius: 8, padding: "7px 10px", cursor: "pointer" }}>
              <Edit3 size={16} color={C.muted2} />
            </button>
          )}
          <button onClick={() => onDelete(sess.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
            <Trash2 size={18} color="#ef4444" />
          </button>
        </div>
      } />
      <div style={{ padding: 16 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 20, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            <span style={{ fontSize: 46 }}>{type?.emoji ?? "🏋️"}</span>
            <div>
              <p style={{ margin: 0, fontWeight: 900, color: C.text, fontSize: 22 }}>{type?.name}</p>
              <p style={{ margin: 0, color: C.muted, fontSize: 13 }}>
                {team?.name} · {fmtDate(sess.date)}
                {sessVenue && <span> · {sessVenue.emoji} {sessVenue.name}</span>}
                {schoolHol && <span style={{ color: "#ca8a04", marginLeft: 8 }}>· 🟡 {schoolHol.name}</span>}
              </p>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {[["Dabei", nPresent], ["Minuten", sess.durationMinutes + "'"], ["Faktor", sess.factor]].map(([l, v]) => (
              <div key={l} style={{ background: "#1a1a24", borderRadius: 12, padding: 12, textAlign: "center" }}>
                <p style={{ margin: 0, color: C.orange, fontWeight: 900, fontSize: 22 }}>{v}</p>
                <p style={{ margin: 0, color: C.muted, fontSize: 11 }}>{l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── NOTE ── */}
        {editing ? (
          <div style={{ marginBottom: 16 }}>
            <span style={ss.label}>Trainingsnotiz</span>
            <textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={3}
              placeholder="Notiz zum Training…"
              style={{ ...ss.input, resize: "none", fontSize: 14, lineHeight: 1.5 }} />
          </div>
        ) : sess.note ? (
          <div style={{ background: C.card, border: "1px solid " + C.border2, borderRadius: 14, padding: 14, marginBottom: 16, display: "flex", gap: 10 }}>
            <FileText size={16} color={C.orange} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ margin: "0 0 2px", color: C.orange, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Trainingsnotiz</p>
              <p style={{ margin: 0, color: C.textSoft, fontSize: 14, lineHeight: 1.5 }}>{sess.note}</p>
            </div>
          </div>
        ) : null}

        {/* ── ATTENDANCE (read or edit) ── */}
        {editing ? (
          <div style={{ marginBottom: 16 }}>
            <span style={ss.label}>Anwesenheit bearbeiten</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {editAtt.map(a => {
                const player = getPlayer(a.playerId);
                const s = STATUSES[a.status] ?? STATUSES.absent;
                const isOpen = expandEd === a.playerId;
                return (
                  <div key={a.playerId} style={{ borderRadius: 14, border: "1px solid " + s.color + "50", background: s.color + "10", overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", padding: "12px 14px", gap: 12 }}>
                      <span style={{ fontSize: 20, width: 32, textAlign: "center", color: s.color }}>{statusIcon(a.status)}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontWeight: 700, color: C.text }}>{getName(a.playerId)}</p>
                        <p style={{ margin: 0, fontSize: 12, color: s.color }}>{s.label}</p>
                      </div>
                      <button onClick={() => setExpandEd(isOpen ? null : a.playerId)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
                        <MoreVertical size={16} color={C.muted} />
                      </button>
                    </div>
                    {isOpen && (
                      <div style={{ padding: "0 14px 14px" }}>
                        <div style={{ background: C.bg, borderRadius: 12, overflow: "hidden", border: "1px solid " + C.border }}>
                          {STATUS_KEYS.map((key, i) => {
                            const opt = STATUSES[key]; const active = a.status === key;
                            return (
                              <button key={key} onClick={() => setEdStatus(a.playerId, key)} style={{
                                width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
                                background: active ? opt.color + "15" : "transparent", border: "none",
                                borderBottom: i < STATUS_KEYS.length - 1 ? "1px solid " + C.border : "none",
                                cursor: "pointer", textAlign: "left",
                              }}>
                                <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{opt.icon}</span>
                                <span style={{ fontSize: 13, color: active ? opt.color : C.muted2, fontWeight: active ? 700 : 400, flex: 1 }}>{opt.label}</span>
                                {active && <Check size={13} color={opt.color} />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={saveEdit} style={{ ...ss.primaryBtn, flex: 1, padding: "12px 16px", fontSize: 15, justifyContent: "center" }}>
                Änderungen speichern ✓
              </button>
              <button onClick={() => setEditing(false)} style={{ ...ss.ghostBtn, flex: 1 }}>Abbrechen</button>
            </div>
          </div>
        ) : (
          STATUS_KEYS.map(key => {
            const group = (sess.attendance ?? []).filter(a => a.status === key);
            if (!group.length) return null;
            const s = STATUSES[key];
            return (
              <div key={key} style={{ marginBottom: 16 }}>
                <p style={{ color: s.color, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  {s.icon} {s.label} ({group.length})
                </p>
                {group.map(a => (
                  <div key={a.playerId} style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 12, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ color: s.color, fontSize: 16 }}>{s.short}</span>
                    <span style={{ color: C.textSoft, fontSize: 14, flex: 1 }}>{getName(a.playerId)}</span>
                    {key === "injured_present" && (
                      <span style={{ fontSize: 11, color: "#fb923c", fontWeight: 700, background: "#1c1202", border: "1px solid #854d0e", borderRadius: 20, padding: "2px 8px" }}>
                        ❤️ Commitment
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })
        )}
        {/* ── CHECKLIST ── */}
        {(editing ? editCL : (sess.checklist ?? [])).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ ...ss.label, marginBottom: 0 }}>Drills und Uebungen</span>
              {!editing && (() => {
                const cl    = sess.checklist ?? [];
                const done  = cl.filter(d => d.done).length;
                const pct   = cl.length > 0 ? Math.round(done / cl.length * 100) : 0;
                return (
                  <span style={{ fontSize: 12, color: pct === 100 ? "#4ade80" : C.muted }}>
                    {done}/{cl.length} {pct === 100 ? "✓ alle erledigt" : "erledigt"}
                  </span>
                );
              })()}
            </div>
            {(editing ? editCL : (sess.checklist ?? [])).map(d => (
              <div key={d.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
                background: C.card, border: "1px solid " + (d.done ? "#4ade8030" : C.border),
                borderRadius: 12, marginBottom: 4,
              }}>
                {editing ? (
                  <button onClick={() => setEditCL(prev => prev.map(x => x.id === d.id ? { ...x, done: !x.done } : x))}
                    style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0, cursor: "pointer",
                      background: d.done ? "#4ade8020" : "#1f2937",
                      border: "2px solid " + (d.done ? "#4ade80" : C.border2),
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                    {d.done && <Check size={13} color="#4ade80" />}
                  </button>
                ) : (
                  <span style={{ fontSize: 16 }}>{d.done ? "✅" : "⬜"}</span>
                )}
                <span style={{
                  flex: 1, fontSize: 14,
                  color: d.done ? C.muted : C.textSoft,
                  textDecoration: d.done ? "line-through" : "none",
                }}>
                  {d.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CALENDAR VIEW  ← NEU Stage 3
// ─────────────────────────────────────────────

function CalendarView({ data, go }) {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const grid  = buildMonthGrid(year, month);
  const today = todayISO();
  const ymStr = `${year}-${String(month + 1).padStart(2, "0")}`;

  // Precompute markers per day
  const recordedDays = {};
  (data.sessions ?? []).forEach(s => { recordedDays[s.date] = true; });
  const plannedDays = {};
  (data.plannedSessions ?? []).filter(p => !p.recordedId).forEach(p => { plannedDays[p.date] = true; });

  function prevMonth() { month === 0 ? (setYear(y => y-1), setMonth(11)) : setMonth(m => m-1); }
  function nextMonth() { month === 11 ? (setYear(y => y+1), setMonth(0)) : setMonth(m => m+1); }

  // Upcoming unrecorded planned sessions
  const upcoming = [...(data.plannedSessions ?? [])]
    .filter(p => p.date >= today && !p.recordedId)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", paddingBottom: 100 }}>
      <Hdr title="Trainingsplan" />

      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", padding: "14px 16px 10px", gap: 8 }}>
        <button onClick={prevMonth} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 13px", cursor: "pointer", display: "flex" }}>
          <ChevronLeft size={18} color={C.textSoft} />
        </button>
        <h2 style={{ flex: 1, textAlign: "center", margin: 0, color: C.text, fontWeight: 800, fontSize: 20 }}>
          {MONTHS_DE[month]} {year}
        </h2>
        <button onClick={nextMonth} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 13px", cursor: "pointer", display: "flex" }}>
          <ChevronRight size={18} color={C.textSoft} />
        </button>
      </div>

      {/* Weekday headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 6px 6px" }}>
        {WEEKDAYS.map((d, i) => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, padding: "3px 0", color: i >= 5 ? C.muted2 : C.muted }}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 6px", gap: 3 }}>
        {grid.map(iso => {
          const inMonth   = iso.startsWith(ymStr);
          const isToday   = iso === today;
          const holiday   = getHoliday(iso);
          const schoolHol = getSchoolHoliday(iso);
          const hasRec    = !!recordedDays[iso];
          const hasPlan   = !!plannedDays[iso];
          const dayNum    = parseInt(iso.split("-")[2]);
          const dow       = (new Date(iso + "T12:00:00").getDay() + 6) % 7;
          const isWeekend = dow >= 5;

          return (
            <button key={iso} onClick={() => go("calendar_day", { date: iso })} style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: "5px 2px 6px", borderRadius: 10, minHeight: 50,
              background: isToday ? C.orange + "28" : (schoolHol && inMonth) ? "#1a1700" : "transparent",
              border: isToday ? `2px solid ${C.orange}` : "2px solid transparent",
              cursor: "pointer",
            }}>
              <span style={{
                fontSize: 14, lineHeight: 1,
                fontWeight: isToday ? 900 : 400,
                color: !inMonth ? C.border2 : holiday ? "#ef4444" : isWeekend ? C.muted2 : C.text,
              }}>
                {dayNum}
              </span>
              {inMonth && (hasRec || hasPlan || holiday) && (
                <div style={{ display: "flex", gap: 2, marginTop: 3 }}>
                  {hasRec  && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ade80", flexShrink: 0 }} />}
                  {hasPlan && <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.orange, flexShrink: 0 }} />}
                  {holiday && !hasRec && !hasPlan && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, padding: "10px 16px", flexWrap: "wrap", borderTop: `1px solid ${C.border}`, marginTop: 4 }}>
        {[["#4ade80","Erfasst"],["#f97316","Geplant"],["#ef4444","Feiertag"],["#ca8a04","Schulferien"]].map(([col, label]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: col, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Upcoming list */}
      <div style={{ padding: "8px 16px 0" }}>
        <p style={{ ...ss.label, marginBottom: 10 }}>Kommende Trainings</p>
        {upcoming.length === 0 ? (
          <div style={{ background: C.card, borderRadius: 14, padding: "20px 16px", textAlign: "center" }}>
            <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Noch keine Trainings geplant. Tippe auf einen Tag im Kalender.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {upcoming.map(p => {
              const type = (data.trainingTypes ?? []).find(t => t.id === p.trainingTypeId);
              const team = (data.teams ?? []).find(t => t.id === p.teamId);
              const isVac = !!getSchoolHoliday(p.date);
              const isHol = !!getHoliday(p.date);
              return (
                <button key={p.id} onClick={() => go("calendar_day", { date: p.date })} style={{
                  background: C.card, border: `1px solid ${isHol ? "#7f1d1d" : isVac ? "#713f12" : C.border}`,
                  borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left",
                }}>
                  <span style={{ fontSize: 26, flexShrink: 0 }}>{type?.emoji ?? "🏋️"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, color: C.text }}>{type?.name}</p>
                    <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>
                      {fmtDateFull(p.date)} · {team?.name} · {p.durationMinutes} min
                    </p>
                    <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                      {isVac && <span style={{ fontSize: 11, color: "#ca8a04" }}>🟡 Ferientraining</span>}
                      {isHol && <span style={{ fontSize: 11, color: "#ef4444" }}>🔴 Feiertag!</span>}
                    </div>
                  </div>
                  <ChevronRight size={16} color={C.border2} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CALENDAR DAY VIEW  ← NEU Stage 3
// ─────────────────────────────────────────────

function CalendarDayView({ data, update, date, go, back }) {
  const [showPlan, setShowPlan]   = useState(false);
  const [teamId, setTeamId]      = useState((data.teams ?? [])[0]?.id ?? "");
  const [typeId, setTypeId]      = useState((data.trainingTypes ?? [])[0]?.id ?? "");
  const [dur, setDur]            = useState((data.trainingTypes ?? [])[0]?.duration ?? 90);
  const [venueId, setPlanVenueId] = useState((data.venues ?? [])[0]?.id ?? "");

  const today     = todayISO();
  const isPastOrToday = date <= today;
  const holiday   = getHoliday(date);
  const schoolHol = getSchoolHoliday(date);
  const planned   = (data.plannedSessions ?? []).filter(s => s.date === date);
  const recorded  = (data.sessions ?? []).filter(s => s.date === date);

  const getType = id => (data.trainingTypes ?? []).find(t => t.id === id);
  const getTeam = id => (data.teams ?? []).find(t => t.id === id);
  const nPres   = s  => (s.attendance ?? []).filter(a => ["present","injured_present"].includes(a.status)).length;

  function pickType(id) { setTypeId(id); const t = getType(id); if (t) setDur(t.duration); }

  function savePlanned() {
    const plan = { id: uid(), teamId, trainingTypeId: typeId, durationMinutes: dur, date, venueId, recordedId: null };
    update(d => ({ ...d, plannedSessions: [...(d.plannedSessions ?? []), plan] }));
    setShowPlan(false);
  }

  function deletePlanned(id) {
    update(d => ({ ...d, plannedSessions: (d.plannedSessions ?? []).filter(p => p.id !== id) }));
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", paddingBottom: 24 }}>
      <Hdr title={fmtDateFull(date)} back={back} />
      <div style={{ padding: 16 }}>

        {/* Feiertag banner */}
        {holiday && (
          <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 14, padding: "12px 16px", marginBottom: 12, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 20 }}>🔴</span>
            <div>
              <p style={{ margin: 0, color: "#fca5a5", fontWeight: 700 }}>Gesetzlicher Feiertag (BaWü)</p>
              <p style={{ margin: 0, color: "#f87171", fontSize: 13 }}>{holiday}</p>
            </div>
          </div>
        )}

        {/* Schulferien banner */}
        {schoolHol && (
          <div style={{ background: "#1c1700", border: "1px solid #713f12", borderRadius: 14, padding: "12px 16px", marginBottom: 12, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 20 }}>🟡</span>
            <div>
              <p style={{ margin: 0, color: "#fcd34d", fontWeight: 700 }}>Schulferien BaWü</p>
              <p style={{ margin: 0, color: "#ca8a04", fontSize: 13 }}>{schoolHol.name} · Ferientraining wird extra gewürdigt</p>
            </div>
          </div>
        )}

        {/* Erfasste Trainings */}
        {recorded.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ ...ss.label, color: "#4ade80" }}>Erfasste Trainings</p>
            {recorded.map(s => (
              <button key={s.id} onClick={() => go("session_detail", { sessionId: s.id })} style={{
                width: "100%", background: "#052e16", border: "1px solid #166534", borderRadius: 14,
                padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left", marginBottom: 6,
              }}>
                <span style={{ fontSize: 24 }}>{getType(s.trainingTypeId)?.emoji}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 700, color: C.text }}>{getType(s.trainingTypeId)?.name}</p>
                  <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>{getTeam(s.teamId)?.name} · {nPres(s)} dabei · {s.durationMinutes} min</p>
                </div>
                <span style={{ color: "#4ade80", fontSize: 14, fontWeight: 700 }}>✓</span>
              </button>
            ))}
          </div>
        )}

        {/* Geplante Trainings */}
        {planned.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={ss.label}>Geplante Trainings</p>
            {planned.map(p => {
              const isRec = !!p.recordedId;
              return (
                <div key={p.id} style={{
                  background: C.card, border: `1px solid ${isRec ? "#166534" : C.border}`,
                  borderRadius: 14, padding: "12px 14px", marginBottom: 6,
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <span style={{ fontSize: 24 }}>{getType(p.trainingTypeId)?.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, color: C.text }}>{getType(p.trainingTypeId)?.name}</p>
                    <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>
                      {getTeam(p.teamId)?.name} · {p.durationMinutes} min · F {calcFactor(p.durationMinutes)}
                      {schoolHol && <span style={{ color: "#ca8a04", marginLeft: 6 }}>· Ferientraining</span>}
                    </p>
                  </div>
                  {isRec ? (
                    <span style={{ color: "#4ade80", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>✓ erfasst</span>
                  ) : (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {isPastOrToday && (
                        <button onClick={() => go("new_session", { plan: p })} style={{
                          padding: "8px 12px", borderRadius: 12, flexShrink: 0,
                          background: `linear-gradient(135deg,${C.orange},${C.orangeDk})`,
                          border: "none", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer",
                        }}>
                          Erfassen
                        </button>
                      )}
                      <button onClick={() => deletePlanned(p.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
                        <Trash2 size={15} color={C.muted} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Training planen */}
        {!showPlan ? (
          <button onClick={() => setShowPlan(true)} style={optBtn(false)}>
            <Plus size={18} color={C.orange} />
            <span style={{ color: C.orange }}>Training für diesen Tag planen</span>
          </button>
        ) : (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
            <p style={{ ...ss.label, marginBottom: 12, color: C.orange }}>Training planen · {fmtDateFull(date)}</p>

            {(data.teams ?? []).length > 1 && (
              <div style={{ marginBottom: 14 }}>
                <span style={ss.label}>Team</span>
                {(data.teams ?? []).map(t => (
                  <button key={t.id} onClick={() => setTeamId(t.id)} style={{ ...optBtn(teamId === t.id), marginBottom: 4 }}>
                    {t.name}
                  </button>
                ))}
              </div>
            )}

            <span style={ss.label}>Trainingsart</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
              {(data.trainingTypes ?? []).map(t => (
                <button key={t.id} onClick={() => pickType(t.id)} style={{
                  ...optBtn(typeId === t.id),
                  flexDirection: "column", alignItems: "center", padding: 14, marginBottom: 0,
                }}>
                  <span style={{ fontSize: 24, marginBottom: 4 }}>{t.emoji}</span>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{t.name}</span>
                  <span style={{ fontSize: 11, opacity: 0.6 }}>{t.duration} min</span>
                </button>
              ))}
            </div>

            <span style={ss.label}>Dauer — Faktor: <span style={{ color: C.orange }}>{calcFactor(dur)}</span></span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {[45, 60, 75, 90, 105, 120, 150].map(m => (
                <button key={m} onClick={() => setDur(m)} style={chipBtn(dur === m)}>{m} min</button>
              ))}
            </div>

            {(data.venues ?? []).length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <span style={ss.label}>Halle / Standort</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(data.venues ?? []).map(v => (
                    <button key={v.id} onClick={() => setPlanVenueId(v.id)} style={{ ...optBtn(venueId === v.id), marginBottom: 0 }}>
                      <span style={{ fontSize: 18 }}>{v.emoji}</span>
                      <span style={{ flex: 1 }}>{v.name}</span>
                      <span style={{ fontWeight: 400, fontSize: 11, color: C.muted2 }}>{v.address}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {holiday && (
              <div style={{ background: "#2d0a0a", border: "1px solid #7f1d1d", borderRadius: 10, padding: "8px 12px", marginBottom: 12 }}>
                <p style={{ margin: 0, color: "#f87171", fontSize: 12 }}>⚠️ Achtung: Das ist ein gesetzlicher Feiertag ({holiday}).</p>
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={savePlanned} style={{ ...ss.primaryBtn, flex: 1, padding: "12px 16px", fontSize: 15, justifyContent: "center" }}>
                Speichern ✓
              </button>
              <button onClick={() => setShowPlan(false)} style={{ ...ss.ghostBtn, flex: 1 }}>Abbrechen</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TEAMS VIEW
// ─────────────────────────────────────────────

function TeamsView({ data, update, go }) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName]       = useState("");

  function addTeam() {
    if (!name.trim()) return;
    update(d => ({ ...d, teams: [...(d.teams ?? []), { id: uid(), name: name.trim(), players: [] }] }));
    setName(""); setShowAdd(false);
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", paddingBottom: 100 }}>
      <Hdr title="Teams" action={
        <button onClick={() => setShowAdd(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <Plus size={24} color={C.orange} />
        </button>
      } />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {showAdd && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, marginBottom: 4 }}>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus
              placeholder="z.B. U14w oder U16w" onKeyDown={e => e.key === "Enter" && addTeam()}
              style={{ ...ss.input, marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addTeam} style={{ ...ss.primaryBtn, flex: 1, padding: "10px 16px", fontSize: 15, justifyContent: "center" }}>Erstellen</button>
              <button onClick={() => setShowAdd(false)} style={{ ...ss.ghostBtn, flex: 1 }}>Abbrechen</button>
            </div>
          </div>
        )}
        {(data.teams ?? []).map(t => {
          const sessionCount = (data.sessions ?? []).filter(s => s.teamId === t.id).length;
          return (
            <button key={t.id} onClick={() => go("team_detail", { teamId: t.id })} style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
              padding: 16, display: "flex", alignItems: "center", gap: 14, cursor: "pointer", textAlign: "left",
            }}>
              <div style={{ width: 52, height: 52, background: C.orangeBg, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Users size={24} color={C.orange} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, color: C.text, fontWeight: 800, fontSize: 18 }}>{t.name}</p>
                <p style={{ margin: 0, color: C.muted, fontSize: 13 }}>
                  {t.playerIds?.length ?? 0} Spieler:innen · {sessionCount} Trainings
                  {(() => {
                    const inj = getTeamPlayers(t.id, data).filter(p => p.injured).length;
                    return inj > 0 ? <span style={{ color: "#f87171", marginLeft: 8 }}>· 🤕 {inj}</span> : null;
                  })()}
                </p>
              </div>
              <ChevronRight size={18} color={C.border2} />
            </button>
          );
        })}
        {!data.teams?.length && !showAdd && (
          <div style={{ background: C.card, borderRadius: 16, padding: "32px 16px", textAlign: "center" }}>
            <p style={{ color: C.muted, margin: 0 }}>Noch kein Team. Tippe auf + um loszulegen.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TEAM DETAIL
// ─────────────────────────────────────────────

function TeamDetailView({ data, update, teamId, back, go }) {
  const team       = (data.teams ?? []).find(t => t.id === teamId);
  const [showNew,  setShowNew]  = useState(false);
  const [showPick, setShowPick] = useState(false);
  const [newName,  setNewName]  = useState("");
  const [newYear,  setNewYear]  = useState("");
  const [selPick,  setSelPick]  = useState({});
  if (!team) return null;

  const teamPlayers = getTeamPlayers(teamId, data);
  const teamIds     = new Set(team.playerIds ?? []);

  // Players in global registry but NOT yet in this team
  const available = (data.players ?? []).filter(p => !teamIds.has(p.id));

  // Which other teams is a player in?
  function otherTeams(pid) {
    return (data.teams ?? [])
      .filter(t => t.id !== teamId && (t.playerIds ?? []).includes(pid))
      .map(t => t.name);
  }

  function addNewPlayer() {
    if (!newName.trim()) return;
    const p = { id: uid(), name: newName.trim(), birthYear: parseInt(newYear) || null, injured: false };
    update(d => ({
      ...d,
      players: [...(d.players ?? []), p],
      teams:   d.teams.map(t => t.id !== teamId ? t : { ...t, playerIds: [...(t.playerIds ?? []), p.id] }),
    }));
    setNewName(""); setNewYear(""); setShowNew(false);
  }

  function addExisting() {
    const ids = Object.entries(selPick).filter(([,v]) => v).map(([k]) => k);
    if (!ids.length) return;
    update(d => ({
      ...d,
      teams: d.teams.map(t => t.id !== teamId ? t : {
        ...t, playerIds: [...new Set([...(t.playerIds ?? []), ...ids])],
      }),
    }));
    setSelPick({}); setShowPick(false);
  }

  function removeFromTeam(pid) {
    update(d => ({
      ...d,
      teams: d.teams.map(t => t.id !== teamId ? t : {
        ...t, playerIds: (t.playerIds ?? []).filter(id => id !== pid),
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

  return (
    <div style={{ background: C.bg, minHeight: "100vh", paddingBottom: 24 }}>
      <Hdr title={team.name} back={back} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>

        {/* Saison card */}
        {(() => {
          const as = getActiveSeason(teamId, data.seasons ?? []);
          const ph = as ? (PHASES[as.phase] ?? PHASES.offseason) : null;
          return (
            <button onClick={() => go("season_list", { teamId })} style={{
              width: "100%", background: ph ? ph.bg : C.card,
              border: "1px solid " + (ph ? ph.color + "40" : C.border),
              borderRadius: 16, padding: 16, display: "flex", alignItems: "center",
              gap: 14, cursor: "pointer", textAlign: "left",
            }}>
              <span style={{ fontSize: 28 }}>{ph ? ph.emoji : "📅"}</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 700, color: C.text }}>
                  {as ? as.name : "Noch keine Saison"}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: ph ? ph.color : C.muted }}>
                  {ph ? ph.label : "Saison anlegen →"}
                </p>
              </div>
              <ChevronRight size={18} color={C.border2} />
            </button>
          );
        })()}

        {/* Player list */}
        <p style={{ ...ss.label, marginBottom: 4 }}>
          {teamPlayers.length} Spieler:innen im Kader
        </p>

        {teamPlayers.map(p => {
          const others = otherTeams(p.id);
          return (
            <div key={p.id} style={{
              background: C.card,
              border: "1px solid " + (p.injured ? "#7f1d1d" : C.border),
              borderRadius: 14, padding: "13px 14px",
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{ width: 42, height: 42, background: "#1a1a24", borderRadius: 12,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <User size={18} color={C.muted} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <p style={{ margin: 0, fontWeight: 700, color: C.text }}>{p.name}</p>
                  {others.length > 0 && (
                    <span style={{ fontSize: 10, background: "#0c1a2e", color: "#60a5fa",
                      border: "1px solid #1e3a5f", borderRadius: 20, padding: "2px 7px" }}>
                      auch {others.join(", ")}
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>
                  {p.birthYear ? "Jg. " + p.birthYear : "Kein Jahrgang"}
                </p>
              </div>
              <button onClick={() => toggleInjured(p.id)} style={{
                padding: "5px 11px", borderRadius: 20, cursor: "pointer", fontWeight: 700,
                fontSize: 12, flexShrink: 0,
                background: p.injured ? "#450a0a" : "#1a1a24",
                border: "1px solid " + (p.injured ? "#7f1d1d" : C.border2),
                color: p.injured ? "#f87171" : C.muted,
              }}>
                {p.injured ? "🤕 verletzt" : "🤕"}
              </button>
              <button onClick={() => removeFromTeam(p.id)}
                title="Aus diesem Team entfernen"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 6, flexShrink: 0 }}>
                <X size={16} color={C.muted} />
              </button>
            </div>
          );
        })}

        {teamPlayers.length === 0 && !showNew && !showPick && (
          <div style={{ background: C.card, borderRadius: 16, padding: "24px 16px", textAlign: "center" }}>
            <p style={{ color: C.muted, margin: 0 }}>Noch keine Spieler:innen im Kader.</p>
          </div>
        )}

        {/* Add new player */}
        {showNew ? (
          <div style={{ background: C.card, border: "1px solid " + C.orange + "40",
            borderRadius: 16, padding: 16 }}>
            <p style={{ ...ss.label, color: C.orange, marginBottom: 10 }}>Neue Spielerin anlegen</p>
            <input value={newName} onChange={e => setNewName(e.target.value)} autoFocus
              placeholder="Vollständiger Name" style={{ ...ss.input, marginBottom: 8 }} />
            <input value={newYear} onChange={e => setNewYear(e.target.value)}
              placeholder="Geburtsjahr (optional, z.B. 2009)" type="number"
              style={{ ...ss.input, marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addNewPlayer} style={{ ...ss.primaryBtn, flex: 1, padding: "10px 16px", fontSize: 15, justifyContent: "center" }}>
                Anlegen + hinzufügen
              </button>
              <button onClick={() => setShowNew(false)} style={{ ...ss.ghostBtn, flex: 1 }}>Abbrechen</button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setShowNew(true); setShowPick(false); }} style={optBtn(false)}>
            <Plus size={18} color={C.orange} />
            <span style={{ color: C.orange }}>Neue Spielerin anlegen</span>
          </button>
        )}

        {/* Add existing player */}
        {showPick ? (
          <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 16, padding: 16 }}>
            <p style={{ ...ss.label, color: "#60a5fa", marginBottom: 10 }}>
              Bestehende Spielerin hinzufügen ({available.length} verfügbar)
            </p>
            {available.length === 0 ? (
              <p style={{ color: C.muted, fontSize: 13 }}>
                Alle Spielerinnen aus dem globalen Register sind bereits in diesem Team.
              </p>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                  {available.map(p => {
                    const inTeams = otherTeams(p.id);
                    const on = !!selPick[p.id];
                    return (
                      <button key={p.id} onClick={() => setSelPick(s => ({ ...s, [p.id]: !s[p.id] }))} style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
                        background: on ? "#0c1a2e" : C.card2,
                        border: "1px solid " + (on ? "#60a5fa" : C.border),
                        borderRadius: 12, cursor: "pointer", textAlign: "left",
                      }}>
                        <div style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                          background: on ? "#60a5fa" : C.border2,
                          border: "2px solid " + (on ? "#60a5fa" : C.border),
                          display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {on && <Check size={13} color="white" />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontWeight: 700, color: C.text, fontSize: 14 }}>{p.name}</p>
                          <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>
                            {p.birthYear ? "Jg. " + p.birthYear : "kein Jg."}
                            {inTeams.length > 0 && <span style={{ color: "#60a5fa", marginLeft: 8 }}>in {inTeams.join(", ")}</span>}
                            {inTeams.length === 0 && <span style={{ color: C.muted2, marginLeft: 8 }}>kein Team</span>}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={addExisting} disabled={pickCount === 0} style={{
                    ...ss.primaryBtn, flex: 1, padding: "10px 16px", fontSize: 15,
                    justifyContent: "center", opacity: pickCount === 0 ? 0.4 : 1,
                  }}>
                    {pickCount > 0 ? pickCount + " hinzufügen" : "Auswählen"}
                  </button>
                  <button onClick={() => { setShowPick(false); setSelPick({}); }} style={{ ...ss.ghostBtn, flex: 1 }}>Abbrechen</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button onClick={() => { setShowPick(true); setShowNew(false); }} style={optBtn(false)}>
            <Users size={18} color="#60a5fa" />
            <span style={{ color: "#60a5fa" }}>Bestehende Spielerin hinzufügen</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// STATS VIEW
// ─────────────────────────────────────────────

function StatsView({ data }) {
  const [tid, setTid]         = useState((data.teams ?? [])[0]?.id ?? "");
  const [filter, setFilter]   = useState("all");
  const [sfilt, setSfilt]     = useState("all"); // season filter
  const team       = (data.teams ?? []).find(t => t.id === tid);
  const teamSeasons = [...(data.seasons ?? []).filter(s => s.teamId === tid)]
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const selSeason  = teamSeasons.find(s => s.id === sfilt) ?? null;
  const allSess    = selSeason
    ? (data.sessions ?? []).filter(s => s.teamId === tid && s.date >= selSeason.startDate && s.date <= selSeason.endDate)
    : (data.sessions ?? []).filter(s => s.teamId === tid);
  const sessions = filter === "all" ? allSess : allSess.filter(s => s.trainingTypeId === filter);

  const ranking = getTeamPlayers(tid, data).map(player => {
    let pts = 0, cnt = 0, commits = 0, byType = {};
    sessions.forEach(s => {
      const a = (s.attendance ?? []).find(a => a.playerId === player.id);
      if (!a) return;
      const mult = STATUSES[a.status]?.factorMult ?? 0;
      pts += s.factor * mult;
      if (["present","injured_present"].includes(a.status)) {
        cnt++;
        const tName = (data.trainingTypes ?? []).find(t => t.id === s.trainingTypeId)?.name ?? "?";
        byType[tName] = (byType[tName] ?? 0) + 1;
      }
      if (a.status === "injured_present") commits++;
    });
    return { player, pts: +pts.toFixed(1), cnt, commits,
             pct: sessions.length ? Math.round(cnt / sessions.length * 100) : 0, byType };
  }).sort((a, b) => b.pts - a.pts);

  const typeTotals = {};
  allSess.forEach(s => {
    const n = (data.trainingTypes ?? []).find(t => t.id === s.trainingTypeId);
    const k = n ? n.emoji + " " + n.name : "?";
    typeTotals[k] = (typeTotals[k] ?? 0) + 1;
  });
  const medals = ["\u{1F947}","\u{1F948}","\u{1F949}"];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", paddingBottom: 100 }}>
      <Hdr title="Statistiken" action={
        allSess.length > 0 ? (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => printStats(team?.name ?? "Team", allSess, ranking, selSeason)}
              style={{ background: "#1f2937", border: "none", borderRadius: 8, padding: "7px 10px", cursor: "pointer" }}
              title="Drucken / PDF">
              <FileText size={16} color={C.muted2} />
            </button>
            <button onClick={() => exportRankingXLSX(team?.name ?? "Team", allSess, ranking, selSeason?.name)}
              style={{ background: "#1f2937", border: "none", borderRadius: 8, padding: "7px 10px", cursor: "pointer" }}
              title="Excel Export">
              <span style={{ fontSize: 14, fontWeight: 700, color: C.muted2 }}>XLS</span>
            </button>
          </div>
        ) : null
      } />
      <div style={{ padding: 16 }}>

        {(data.teams?.length ?? 0) > 1 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto" }}>
            {(data.teams ?? []).map(t => (
              <button key={t.id} onClick={() => setTid(t.id)}
                style={{ ...chipBtn(tid === t.id), flexShrink: 0 }}>
                {t.name}
              </button>
            ))}
          </div>
        )}

        {/* Season filter */}
        {teamSeasons.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={ss.label}>Saison</p>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
              <button onClick={() => setSfilt("all")} style={{ ...chipBtn(sfilt === "all"), flexShrink: 0 }}>
                Alle
              </button>
              {teamSeasons.map(s => {
                const ph = PHASES[s.phase] ?? PHASES.offseason;
                return (
                  <button key={s.id} onClick={() => setSfilt(s.id)}
                    style={{ ...chipBtn(sfilt === s.id), flexShrink: 0 }}>
                    {ph.emoji} {s.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {allSess.length === 0 ? (
          <div style={{ background: C.card, borderRadius: 16, padding: "48px 16px", textAlign: "center" }}>
            <Trophy size={34} color={C.border2} style={{ margin: "0 auto 12px", display: "block" }} />
            <p style={{ color: C.muted, margin: 0 }}>Noch keine Trainings fuer {team?.name ?? "dieses Team"}</p>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 20 }}>
              {[
                ["Trainings",  allSess.length],
                ["Ges.-Min.",  allSess.reduce((s, x) => s + x.durationMinutes, 0)],
                ["Fak. Ø",    allSess.length ? +(allSess.reduce((s,x)=>s+x.factor,0)/allSess.length).toFixed(1) : 0],
              ].map(([l, v]) => (
                <div key={l} style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 14, padding: 14 }}>
                  <p style={{ margin: 0, color: C.orange, fontWeight: 900, fontSize: 22 }}>{v}</p>
                  <p style={{ margin: 0, color: C.muted, fontSize: 11 }}>{l}</p>
                </div>
              ))}
            </div>

            {Object.keys(typeTotals).length > 1 && (
              <div style={{ marginBottom: 20 }}>
                <p style={ss.label}>Trainingsart-Verteilung</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {Object.entries(typeTotals).map(([name, count]) => (
                    <span key={name} style={{ background: C.card, border: "1px solid " + C.border,
                      borderRadius: 20, padding: "6px 12px", fontSize: 13, color: C.textSoft }}>
                      {name} <strong style={{ color: C.orange }}>{count}x</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <p style={ss.label}>Ranking filtern</p>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                <button onClick={() => setFilter("all")}
                  style={{ ...chipBtn(filter === "all"), flexShrink: 0 }}>Alle</button>
                {(data.trainingTypes ?? []).map(t => {
                  if (!allSess.some(s => s.trainingTypeId === t.id)) return null;
                  return (
                    <button key={t.id} onClick={() => setFilter(t.id)}
                      style={{ ...chipBtn(filter === t.id), flexShrink: 0 }}>
                      {t.emoji} {t.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <p style={ss.label}>Partizipations-Ranking
              {filter !== "all" && " · " + ((data.trainingTypes ?? []).find(t => t.id === filter)?.name ?? "")}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ranking.map((r, i) => (
                <div key={r.player.id} style={{
                  background: C.card,
                  border: "1px solid " + (i === 0 ? C.orange + "80" : C.border),
                  borderRadius: 16, padding: "14px 16px",
                  display: "flex", alignItems: "center", gap: 14,
                }}>
                  <span style={{ width: 32, textAlign: "center", fontSize: i < 3 ? 26 : 14,
                    fontWeight: 700, color: C.muted2, flexShrink: 0 }}>
                    {i === 0 ? "\u{1F947}" : i === 1 ? "\u{1F948}" : i === 2 ? "\u{1F949}" : (i + 1)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <p style={{ margin: 0, fontWeight: 700, color: C.text }}>{r.player.name}</p>
                      {r.commits > 0 && (
                        <span style={{ fontSize: 11, background: "#1c1202",
                          border: "1px solid #854d0e", color: "#fb923c",
                          borderRadius: 20, padding: "2px 8px" }}>
                          x{r.commits}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: "2px 0 0", color: C.muted, fontSize: 12 }}>
                      {r.cnt} Einheiten · {r.pct}% Anwesenheit
                    </p>
                    {Object.keys(r.byType).length > 0 && (
                      <p style={{ margin: "1px 0 0", color: C.muted2, fontSize: 11 }}>
                        {Object.entries(r.byType).map(([k, v]) => k + ": " + v + "x").join(" · ")}
                      </p>
                    )}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ margin: 0, color: C.orange, fontWeight: 900, fontSize: 24 }}>{r.pts}</p>
                    <p style={{ margin: 0, color: C.muted, fontSize: 11 }}>Punkte</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TRAINING TYPE FORM
// ─────────────────────────────────────────────

function TrainingTypeForm({ val, onChange, onSave, onCancel }) {
  const DURS = [30, 45, 60, 75, 90, 105, 120, 150];
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input value={val.emoji} onChange={e => onChange({ ...val, emoji: e.target.value })}
          style={{ ...ss.input, width: 58, textAlign: "center", fontSize: 24, padding: "9px 6px" }} />
        <input value={val.name} onChange={e => onChange({ ...val, name: e.target.value })}
          placeholder="Name" autoFocus style={{ ...ss.input, flex: 1 }} />
      </div>
      <span style={ss.label}>Standard-Dauer</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {DURS.map(m => (
          <button key={m} onClick={() => onChange({ ...val, duration: m })}
            style={chipBtn(val.duration === m)}>{m} min</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onSave}
          style={{ ...ss.primaryBtn, flex: 1, padding: "10px 16px", fontSize: 15, justifyContent: "center" }}>
          Speichern
        </button>
        <button onClick={onCancel} style={{ ...ss.ghostBtn, flex: 1 }}>Abbrechen</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SYNC / EXCEL / IMPORT UTILITIES  (Stage 6)
// ─────────────────────────────────────────────

function dlFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── SYNC ──────────────────────────────────────

function exportSync(data) {
  const name = data.settings?.trainerName?.trim() || "Trainer";
  const mySessions = (data.sessions ?? []).filter(s =>
    !s.erfasstVon || s.erfasstVon === name
  );
  const payload = {
    syncVersion: 1,
    exportedBy:  name,
    exportedAt:  new Date().toISOString(),
    sessions:    mySessions,
  };
  const date = new Date().toISOString().split("T")[0];
  dlFile(JSON.stringify(payload, null, 2),
    "trainerhub_sync_" + name + "_" + date + ".json",
    "application/json");
  return mySessions.length;
}

function importSync(file, currentData, update, onDone) {
  const r = new FileReader();
  r.onload = ev => {
    try {
      const sync = JSON.parse(ev.target.result);
      if (!sync.sessions || !Array.isArray(sync.sessions))
        throw new Error("Kein gueltiges Sync-Format.");
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

// ── EXCEL EXPORTS ─────────────────────────────

function exportAttendanceXLSX(data, teamId, sfilt) {
  const team = (data.teams ?? []).find(t => t.id === teamId);
  if (!team) return;
  const selSeason = (data.seasons ?? []).find(s => s.id === sfilt) ?? null;
  let sessions = (data.sessions ?? []).filter(s => s.teamId === teamId);
  if (selSeason) {
    sessions = sessions.filter(s => s.date >= selSeason.startDate && s.date <= selSeason.endDate);
  }
  sessions = sessions.sort((a, b) => a.date.localeCompare(b.date));

  const getType = id => (data.trainingTypes ?? []).find(t => t.id === id);

  // Header row
  const hdr = ["Spielerin", "Jg.", ...sessions.map(s =>
    fmtDate(s.date) + " " + (getType(s.trainingTypeId)?.name ?? "")
  ), "Anwes.", "Quote", "Punkte"];

  // Status symbols
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
  const date = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, "Anwesenheit_" + team.name + "_" + date + ".xlsx");
}

function exportRankingXLSX(teamName, allSess, ranking, seasonName) {
  const hdr = ["#","Spielerin","Jg.","Einheiten","Quote %","Punkte","Commitment"];
  const rows = ranking.map((r, i) => [
    i + 1, r.player.name, r.player.birthYear ?? "",
    r.cnt, r.pct, r.pts, r.commits,
  ]);
  const info = [["Team:", teamName], ["Saison:", seasonName ?? "Alle"],
                ["Erstellt:", new Date().toLocaleDateString("de-DE")]];
  const ws = XLSX.utils.aoa_to_sheet([...info, [], hdr, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ranking");
  XLSX.writeFile(wb, "Ranking_" + teamName + "_" + new Date().toISOString().split("T")[0] + ".xlsx");
}

// ── TRAINING PLAN IMPORT ──────────────────────

function downloadPlanTemplate() {
  const csv = [
    "Datum,Trainingstyp,Dauer_min,Halle,Notiz",
    "2026-09-02,Basketball,90,HSB Hallensportzentrum,Saisonauftakt",
    "2026-09-05,Fitness,60,TV-Platz (Aussen),",
    "2026-09-09,Taktik,90,Jahnhalle,Fokus Pick and Roll",
  ].join("\n");
  dlFile(csv, "trainingsplan_vorlage.csv", "text/csv");
}

function importTrainingPlan(file, data, update, teamId, onDone) {
  const isXlsx = /\.xlsx?$/i.test(file.name);

  function processRows(rows) {
    // Skip header
    const dataRows = rows.slice(1).filter(r => r[0]);
    const plans = [];
    dataRows.forEach(row => {
      let rawDate = (row[0] ?? "").toString().trim();
      // Handle Excel date serials
      if (!isNaN(rawDate) && rawDate.length < 6) {
        try {
          const d = XLSX.SSF.parse_date_code(Number(rawDate));
          rawDate = d.y + "-" + String(d.m).padStart(2,"0") + "-" + String(d.d).padStart(2,"0");
        } catch {}
      }
      const typeName  = (row[1] ?? "").toString().trim();
      const duration  = parseInt(row[2]) || 90;
      const venueName = (row[3] ?? "").toString().trim().toLowerCase();

      const type  = (data.trainingTypes ?? []).find(t =>
        t.name.toLowerCase() === typeName.toLowerCase()
      );
      const venue = (data.venues ?? []).find(v =>
        v.name.toLowerCase().includes(venueName) || venueName.includes(v.name.toLowerCase())
      );
      const team = (data.teams ?? []).find(t => t.id === teamId) ?? (data.teams ?? [])[0];

      if (!rawDate || !team) return;

      plans.push({
        id: uid(), teamId: team.id,
        trainingTypeId: type?.id ?? "",
        durationMinutes: duration,
        venueId: venue?.id ?? null,
        date: rawDate,
        recordedId: null,
      });
    });

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
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      processRows(rows);
    };
    r.readAsArrayBuffer(file);
  } else {
    Papa.parse(file, {
      complete: res => processRows(res.data),
      skipEmptyLines: true,
    });
  }
}


// ─────────────────────────────────────────────
// SETTINGS VIEW
// ─────────────────────────────────────────────

function SettingsView({ data, update, pwa }) {
  const [editingId, setEditingId]       = useState(null);
  const [draft, setDraft]               = useState({});
  const [showAdd, setShowAdd]           = useState(false);
  const [newType, setNewType]           = useState({ emoji: "⚽", name: "", duration: 90 });
  // Venue editing state
  const [editingVenueId, setEditingVenueId] = useState(null);
  const [venueDraft, setVenueDraft]         = useState({});
  const [showAddVenue, setShowAddVenue]     = useState(false);
  const [newVenue, setNewVenue]             = useState({ emoji: "🏠", name: "", address: "" });
  // Sync / export / import state
  const [syncMsg,   setSyncMsg]     = useState("");
  const [expTid,    setExpTid]      = useState((data.teams??[])[0]?.id ?? "");
  const [expSid,    setExpSid]      = useState("all");
  const [impTid,    setImpTid]      = useState((data.teams??[])[0]?.id ?? "");
  const [impMsg,    setImpMsg]      = useState("");

  function startEdit(type) { setEditingId(type.id); setDraft({ ...type }); setShowAdd(false); }

  function saveEdit(id) {
    if (!draft.name?.trim()) return;
    update(d => ({ ...d, trainingTypes: d.trainingTypes.map(t =>
      t.id !== id ? t : { ...t, ...draft, name: draft.name.trim() }
    )}));
    setEditingId(null);
  }

  function deleteType(id) {
    if ((data.sessions ?? []).some(s => s.trainingTypeId === id)) return;
    update(d => ({ ...d, trainingTypes: d.trainingTypes.filter(t => t.id !== id) }));
  }

  function addType() {
    if (!newType.name?.trim()) return;
    update(d => ({ ...d, trainingTypes: [
      ...d.trainingTypes,
      { id: uid(), ...newType, name: newType.name.trim() }
    ]}));
    setNewType({ emoji: "⚽", name: "", duration: 90 });
    setShowAdd(false);
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", paddingBottom: 100 }}>
      <Hdr title="Einstellungen" />
      <div style={{ padding: 16 }}>
        <p style={{ ...ss.label, marginBottom: 12 }}>Trainingsarten</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          {(data.trainingTypes ?? []).map(type => {
            const usedIn = (data.sessions ?? []).filter(s => s.trainingTypeId === type.id).length;
            return (
              <div key={type.id} style={{
                background: C.card,
                border: "1px solid " + (editingId === type.id ? C.orange + "60" : C.border),
                borderRadius: 16, padding: 16,
              }}>
                {editingId === type.id ? (
                  <TrainingTypeForm val={draft} onChange={setDraft}
                    onSave={() => saveEdit(type.id)} onCancel={() => setEditingId(null)} />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 28, width: 38, textAlign: "center" }}>{type.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 700, color: C.text, fontSize: 16 }}>{type.name}</p>
                      <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>
                        Standard: {type.duration} min · F {calcFactor(type.duration)}
                        {usedIn > 0 && <span style={{ color: C.muted2 }}> · {usedIn}x verwendet</span>}
                      </p>
                    </div>
                    <button onClick={() => startEdit(type)}
                      style={{ background: "#1f2937", border: "none", borderRadius: 8, padding: "7px 10px", cursor: "pointer" }}>
                      <Edit3 size={14} color={C.muted2} />
                    </button>
                    <button onClick={() => deleteType(type.id)} disabled={usedIn > 0}
                      style={{ background: "none", border: "none",
                        cursor: usedIn > 0 ? "not-allowed" : "pointer", padding: 6 }}>
                      <Trash2 size={16} color={usedIn > 0 ? C.border2 : "#ef4444"} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {showAdd ? (
          <div style={{ background: C.card, border: "1px solid " + C.orange + "40",
            borderRadius: 16, padding: 16 }}>
            <p style={{ ...ss.label, color: C.orange, marginBottom: 10 }}>Neue Trainingsart</p>
            <TrainingTypeForm val={newType} onChange={setNewType}
              onSave={addType} onCancel={() => setShowAdd(false)} />
          </div>
        ) : (
          <button onClick={() => { setShowAdd(true); setEditingId(null); }} style={optBtn(false)}>
            <Plus size={18} color={C.orange} />
            <span style={{ color: C.orange }}>Neue Trainingsart hinzufügen</span>
          </button>
        )}

        {/* Venues management */}
        <p style={{ ...ss.label, marginTop: 28, marginBottom: 12 }}>Hallen & Standorte</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          {(data.venues ?? []).map((venue, i) => {
            const usedIn = (data.sessions ?? []).filter(s => s.venueId === venue.id).length
                         + (data.plannedSessions ?? []).filter(p => p.venueId === venue.id).length;
            return editingVenueId === venue.id ? (
              <div key={venue.id} style={{ background: C.card, border: "1px solid " + C.orange + "60", borderRadius: 16, padding: 16 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input value={venueDraft.emoji} onChange={e => setVenueDraft(v => ({ ...v, emoji: e.target.value }))}
                    style={{ ...ss.input, width: 58, textAlign: "center", fontSize: 22, padding: "9px 6px" }} />
                  <input value={venueDraft.name} onChange={e => setVenueDraft(v => ({ ...v, name: e.target.value }))}
                    placeholder="Hallenname" autoFocus style={{ ...ss.input, flex: 1 }} />
                </div>
                <input value={venueDraft.address} onChange={e => setVenueDraft(v => ({ ...v, address: e.target.value }))}
                  placeholder="Adresse / Kurzbezeichnung" style={{ ...ss.input, marginBottom: 10 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => {
                    if (!venueDraft.name?.trim()) return;
                    update(d => ({ ...d, venues: d.venues.map(v => v.id !== venue.id ? v : { ...v, ...venueDraft, name: venueDraft.name.trim() }) }));
                    setEditingVenueId(null);
                  }} style={{ ...ss.primaryBtn, flex: 1, padding: "10px 16px", fontSize: 15, justifyContent: "center" }}>
                    Speichern
                  </button>
                  <button onClick={() => setEditingVenueId(null)} style={{ ...ss.ghostBtn, flex: 1 }}>Abbrechen</button>
                </div>
              </div>
            ) : (
              <div key={venue.id} style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 14, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 26, width: 36, textAlign: "center" }}>{venue.emoji}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 700, color: C.text }}>{venue.name}</p>
                  <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>
                    {venue.address}
                    {usedIn > 0 && <span style={{ color: C.muted2 }}> · {usedIn}x genutzt</span>}
                  </p>
                </div>
                <button onClick={() => { setEditingVenueId(venue.id); setVenueDraft({ ...venue }); }}
                  style={{ background: "#1f2937", border: "none", borderRadius: 8, padding: "7px 10px", cursor: "pointer" }}>
                  <Edit3 size={14} color={C.muted2} />
                </button>
                <button onClick={() => {
                  if (usedIn > 0) return;
                  update(d => ({ ...d, venues: d.venues.filter(v => v.id !== venue.id) }));
                }} disabled={usedIn > 0} style={{ background: "none", border: "none", cursor: usedIn > 0 ? "not-allowed" : "pointer", padding: 6 }}>
                  <Trash2 size={16} color={usedIn > 0 ? C.border2 : "#ef4444"} />
                </button>
              </div>
            );
          })}
        </div>
        {showAddVenue ? (
          <div style={{ background: C.card, border: "1px solid " + C.orange + "40", borderRadius: 16, padding: 16, marginBottom: 8 }}>
            <p style={{ ...ss.label, color: C.orange, marginBottom: 10 }}>Neue Halle / Standort</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input value={newVenue.emoji} onChange={e => setNewVenue(v => ({ ...v, emoji: e.target.value }))}
                style={{ ...ss.input, width: 58, textAlign: "center", fontSize: 22, padding: "9px 6px" }} />
              <input value={newVenue.name} onChange={e => setNewVenue(v => ({ ...v, name: e.target.value }))}
                placeholder="Hallenname" autoFocus style={{ ...ss.input, flex: 1 }} />
            </div>
            <input value={newVenue.address} onChange={e => setNewVenue(v => ({ ...v, address: e.target.value }))}
              placeholder="Adresse / Kurzbezeichnung" style={{ ...ss.input, marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => {
                if (!newVenue.name?.trim()) return;
                update(d => ({ ...d, venues: [...(d.venues??[]), { id: uid(), ...newVenue, name: newVenue.name.trim() }] }));
                setNewVenue({ emoji: "🏠", name: "", address: "" }); setShowAddVenue(false);
              }} style={{ ...ss.primaryBtn, flex: 1, padding: "10px 16px", fontSize: 15, justifyContent: "center" }}>
                Erstellen
              </button>
              <button onClick={() => setShowAddVenue(false)} style={{ ...ss.ghostBtn, flex: 1 }}>Abbrechen</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddVenue(true)} style={{ ...optBtn(false), marginBottom: 8 }}>
            <Plus size={18} color={C.orange} />
            <span style={{ color: C.orange }}>Neue Halle hinzufügen</span>
          </button>
        )}

        {/* ── TRAINER-PROFIL ── */}
        <p style={{ ...ss.label, marginBottom: 10 }}>Trainer-Profil</p>
        <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 16, padding: 16, marginBottom: 4 }}>
          <p style={{ margin: "0 0 8px", color: C.muted, fontSize: 12 }}>
            Dein Name erscheint in jedem erfassten Training und im Sync-Paket.
          </p>
          <input
            value={data.settings?.trainerName ?? ""}
            onChange={e => update(d => ({ ...d, settings: { ...(d.settings ?? {}), trainerName: e.target.value } }))}
            placeholder="z.B. Florian"
            style={ss.input}
          />
        </div>

        {/* ── SYNCHRONISATION ── */}
        <p style={{ ...ss.label, marginTop: 24, marginBottom: 10 }}>Synchronisation mit Rüdiger</p>
        <div style={{ background: "#0c1a2e", border: "1px solid #1e3a5f", borderRadius: 16, padding: 14, marginBottom: 10 }}>
          <p style={{ margin: "0 0 4px", color: "#93c5fd", fontSize: 13, lineHeight: 1.6 }}>
            Jeder Trainer arbeitet mit seiner eigenen App. Zum Abgleich:
            <br/>① <strong>Sync senden</strong> → JSON per WhatsApp teilen
            <br/>② Empfänger tippt <strong>Sync empfangen</strong> → fertig
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          <button onClick={() => {
            if (!data.settings?.trainerName?.trim()) {
              setSyncMsg("⚠️ Bitte zuerst deinen Namen eintragen.");
              return;
            }
            const n = exportSync(data);
            setSyncMsg("✓ " + n + " Trainings exportiert.");
          }} style={{ ...optBtn(false), background: "#052e16", border: "1px solid #166534" }}>
            <span style={{ fontSize: 20 }}>📤</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 700, color: "#4ade80" }}>Sync senden</p>
              <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
                Meine Trainings ({(data.sessions??[]).filter(s => !s.erfasstVon || s.erfasstVon === (data.settings?.trainerName??""  )).length}x) als Sync-Datei exportieren
              </p>
            </div>
          </button>
          <label style={{ ...optBtn(false), cursor: "pointer" }}>
            <span style={{ fontSize: 20 }}>📥</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 700, color: C.textSoft }}>Sync empfangen</p>
              <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Sync-Datei von Rüdiger importieren</p>
            </div>
            <input type="file" accept=".json" style={{ display: "none" }} onChange={e => {
              const f = e.target.files?.[0];
              if (!f) return;
              importSync(f, data, update, (n, from) => {
                if (n < 0) setSyncMsg("Fehler: " + from);
                else if (n === 0) setSyncMsg("Keine neuen Trainings in der Datei.");
                else setSyncMsg("✓ " + n + " neue Trainings von " + from + " importiert.");
              });
              e.target.value = "";
            }} />
          </label>
        </div>
        {syncMsg && (
          <div style={{ background: syncMsg.startsWith("✓") ? "#052e16" : "#2d1000",
            border: "1px solid " + (syncMsg.startsWith("✓") ? "#166534" : "#854d0e"),
            borderRadius: 12, padding: "10px 14px", marginBottom: 8 }}>
            <p style={{ margin: 0, color: syncMsg.startsWith("✓") ? "#4ade80" : "#fb923c", fontSize: 13 }}>
              {syncMsg}
            </p>
          </div>
        )}

        {/* ── EXCEL EXPORTE ── */}
        <p style={{ ...ss.label, marginTop: 24, marginBottom: 10 }}>Excel-Export</p>

        {/* Anwesenheitsmatrix */}
        <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 16, padding: 16, marginBottom: 10 }}>
          <p style={{ margin: "0 0 12px", fontWeight: 700, color: C.text }}>📊 Anwesenheitsliste</p>
          {(data.teams ?? []).length > 1 && (
            <div style={{ marginBottom: 10 }}>
              <span style={ss.label}>Team</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(data.teams ?? []).map(t => (
                  <button key={t.id} onClick={() => setExpTid(t.id)}
                    style={{ ...chipBtn(expTid === t.id) }}>{t.name}</button>
                ))}
              </div>
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <span style={ss.label}>Saison</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button onClick={() => setExpSid("all")} style={chipBtn(expSid === "all")}>Alle</button>
              {(data.seasons ?? []).filter(s => s.teamId === expTid).map(s => {
                const ph = PHASES[s.phase] ?? PHASES.offseason;
                return (
                  <button key={s.id} onClick={() => setExpSid(s.id)}
                    style={chipBtn(expSid === s.id)}>{ph.emoji} {s.name}</button>
                );
              })}
            </div>
          </div>
          <button onClick={() => exportAttendanceXLSX(data, expTid, expSid)}
            style={{ ...ss.primaryBtn, justifyContent: "center", padding: "12px 16px" }}>
            <span>Excel herunterladen</span>
          </button>
        </div>

        {/* TRAININGSPLAN IMPORT */}
        <p style={{ ...ss.label, marginTop: 4, marginBottom: 10 }}>Trainingsplan importieren (CSV / Excel)</p>
        <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 16, padding: 16, marginBottom: 8 }}>
          <p style={{ margin: "0 0 10px", color: C.muted, fontSize: 13, lineHeight: 1.5 }}>
            Spalten: <strong style={{ color: C.textSoft }}>Datum, Trainingstyp, Dauer_min, Halle, Notiz</strong>
            <br/>Datum-Format: JJJJ-MM-TT (z.B. 2026-09-02)
          </p>
          {(data.teams ?? []).length > 1 && (
            <div style={{ marginBottom: 10 }}>
              <span style={ss.label}>Ziel-Team</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(data.teams ?? []).map(t => (
                  <button key={t.id} onClick={() => setImpTid(t.id)}
                    style={{ ...chipBtn(impTid === t.id) }}>{t.name}</button>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={downloadPlanTemplate} style={{ ...ss.ghostBtn, flex: 1 }}>
              📋 Vorlage laden
            </button>
            <label style={{ ...ss.primaryBtn, flex: 1, padding: "10px 16px", fontSize: 15, justifyContent: "center", cursor: "pointer" }}>
              <span>Datei importieren</span>
              <input type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={e => {
                const f = e.target.files?.[0];
                if (!f) return;
                setImpMsg("");
                importTrainingPlan(f, data, update, impTid, n => {
                  setImpMsg(n > 0
                    ? "✓ " + n + " Trainings importiert."
                    : "Keine gueltigen Zeilen gefunden.");
                });
                e.target.value = "";
              }} />
            </label>
          </div>
          {impMsg && (
            <p style={{ margin: "8px 0 0", fontSize: 13,
              color: impMsg.startsWith("✓") ? "#4ade80" : "#fb923c" }}>
              {impMsg}
            </p>
          )}
        </div>

        {/* ── BACKUP / RESTORE ── */}
        <p style={{ ...ss.label, marginTop: 16, marginBottom: 10 }}>Datensicherung</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          <button onClick={() => downloadBackup(data)} style={{
            ...optBtn(false), background: "#052e16", border: "1px solid #166534",
          }}>
            <span style={{ fontSize: 20 }}>💾</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 700, color: "#4ade80" }}>Backup herunterladen</p>
              <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
                Alle Daten als JSON exportieren · {data.sessions?.length ?? 0} Trainings, {(data.players??[]).length} Spieler:innen
              </p>
            </div>
          </button>
          <label style={{ ...optBtn(false), cursor: "pointer" }}>
            <span style={{ fontSize: 20 }}>📂</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 700, color: C.textSoft }}>Backup wiederherstellen</p>
              <p style={{ margin: 0, fontSize: 12, color: C.muted }}>JSON-Datei importieren · überschreibt alle Daten</p>
            </div>
            <input type="file" accept=".json" style={{ display: "none" }} onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const r = new FileReader();
              r.onload = ev => {
                try {
                  const imp = JSON.parse(ev.target.result);
                  if (!imp.teams || !imp.sessions) throw new Error("Ungültiges Format");
                  if (!imp.plannedSessions) imp.plannedSessions = [];
                  if (!imp.seasons)         imp.seasons = [];
                  if (!imp.venues)          imp.venues  = JSON.parse(JSON.stringify(INIT.venues));
                  update(() => imp);
                } catch(err) { alert("Import fehlgeschlagen: " + err.message); }
              };
              r.readAsText(file);
              e.target.value = "";
            }} />
          </label>
        </div>

        {/* ── DATENSTAND ── */}
        <p style={{ ...ss.label, marginTop: 20, marginBottom: 10 }}>Datenstand</p>
        <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 16, padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            {[
              ["Teams",         data.teams?.length ?? 0],
              ["Spieler:innen", (data.players ?? []).length],
              ["Trainings",     data.sessions?.length ?? 0],
            ].map(([l, v]) => (
              <div key={l} style={{ textAlign: "center" }}>
                <p style={{ margin: 0, color: C.orange, fontWeight: 900, fontSize: 22 }}>{v}</p>
                <p style={{ margin: 0, color: C.muted, fontSize: 11 }}>{l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── PWA INSTALL HINT ── */}
        <p style={{ ...ss.label, marginTop: 20, marginBottom: 10 }}>App installieren</p>
        <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 16, padding: 16 }}>
          <p style={{ margin: "0 0 10px", fontWeight: 700, color: C.text }}>📱 TrainerHub als App nutzen</p>
          <p style={{ margin: "0 0 8px", color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
            <strong style={{ color: C.textSoft }}>iPhone / iPad (Safari):</strong><br/>
            Tippe auf das Teilen-Symbol → "Zum Home-Bildschirm" → Hinzufügen
          </p>
          <p style={{ margin: 0, color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
            <strong style={{ color: C.textSoft }}>Android (Chrome):</strong><br/>
            Tippe auf ⋮ → "App installieren" oder "Zum Startbildschirm"
          </p>
          <div style={{ marginTop: 10, padding: "8px 12px", background: "#1c0a00", border: "1px solid " + C.orangeDk, borderRadius: 10 }}>
            <p style={{ margin: 0, color: C.orange, fontSize: 12 }}>
              💡 Einmal installiert läuft TrainerHub offline — auch ohne WLAN in der Halle.
            </p>
          </div>
        </div>

        {/* ── APP-VERSION & UPDATE ── */}
        <p style={{ ...ss.label, marginTop: 20, marginBottom: 10 }}>App-Version</p>
        <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 16, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ color: C.textSoft, fontSize: 13 }}>Stand</span>
            <span style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{__BUILD_TIME__}</span>
          </div>

          {pwa?.needRefresh ? (
            <button onClick={pwa.applyUpdate} style={{
              width: "100%", background: C.orange, color: "#1a0a00", border: "none",
              borderRadius: 12, padding: "12px", fontWeight: 800, fontSize: 14, cursor: "pointer",
            }}>
              ⬇️ Neue Version installieren
            </button>
          ) : (
            <button onClick={pwa?.checkForUpdate} disabled={pwa?.checking} style={{
              width: "100%", background: "transparent", color: C.orange,
              border: "1px solid " + C.orangeDk, borderRadius: 12, padding: "12px",
              fontWeight: 700, fontSize: 14, cursor: pwa?.checking ? "default" : "pointer",
              opacity: pwa?.checking ? 0.6 : 1,
            }}>
              {pwa?.checking ? "Suche nach Updates …" : "🔄 Auf Updates prüfen"}
            </button>
          )}

          {pwa?.upToDate && !pwa?.needRefresh && (
            <p style={{ margin: "10px 0 0", color: C.muted, fontSize: 12, textAlign: "center" }}>
              ✅ Du nutzt bereits die neueste Version.
            </p>
          )}
          <p style={{ margin: "10px 0 0", color: C.muted, fontSize: 12, lineHeight: 1.6 }}>
            Ein Update tauscht nur den App-Code aus — deine Teams, Spieler:innen und
            erfassten Trainings bleiben dabei erhalten.
          </p>
        </div>

        <p style={{ color: C.muted, fontSize: 11, textAlign: "center", marginTop: 20 }}>
          TrainerHub · Stage 6 · TV Bretten Basketball
        </p>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────
// SEASON LIST VIEW  (Stage 4)
// ─────────────────────────────────────────────

function SeasonListView({ data, update, teamId, go, back }) {
  const team    = (data.teams ?? []).find(t => t.id === teamId);
  const seasons = [...(data.seasons ?? []).filter(s => s.teamId === teamId)]
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <div style={{ background: C.bg, minHeight: "100vh", paddingBottom: 100 }}>
      <Hdr title={(team?.name ?? "Team") + " · Saisons"} back={back} action={
        <button onClick={() => go("new_season", { teamId })}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <Plus size={24} color={C.orange} />
        </button>
      } />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {seasons.length === 0 ? (
          <div style={{ background: C.card, borderRadius: 16, padding: "40px 16px", textAlign: "center" }}>
            <p style={{ color: C.muted, margin: "0 0 16px" }}>Noch keine Saison angelegt.</p>
            <button onClick={() => go("new_season", { teamId })}
              style={{ ...ss.primaryBtn, display: "inline-flex", width: "auto", padding: "12px 24px" }}>
              Erste Saison anlegen
            </button>
          </div>
        ) : seasons.map(s => {
          const ph      = PHASES[s.phase] ?? PHASES.offseason;
          const sessCnt = getSeasonSessions(s, data.sessions).length;
          const gameCnt = (s.gamedays ?? []).length;
          return (
            <button key={s.id} onClick={() => go("season_detail", { seasonId: s.id, teamId })} style={{
              background: C.card,
              border: "1px solid " + (s.phase !== "abgeschlossen" ? ph.color + "40" : C.border),
              borderRadius: 16, padding: 16, display: "flex", alignItems: "center",
              gap: 14, cursor: "pointer", textAlign: "left",
            }}>
              <div style={{ width: 50, height: 50, background: ph.bg, borderRadius: 14,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, flexShrink: 0 }}>
                {ph.emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 800, color: C.text, fontSize: 16 }}>{s.name}</p>
                <p style={{ margin: "2px 0 0", color: ph.color, fontSize: 13, fontWeight: 600 }}>{ph.label}</p>
                <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>
                  {fmtDate(s.startDate)} – {fmtDate(s.endDate)} · {sessCnt} Trainings · {gameCnt} Spieltage
                </p>
              </div>
              <ChevronRight size={18} color={C.border2} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// NEW SEASON VIEW  (Stage 4)
// ─────────────────────────────────────────────

function NewSeasonView({ data, update, teamId, back }) {
  const now = new Date();
  const yr  = now.getFullYear();
  const [name,  setName]  = useState("Saison " + yr + "/" + String(yr + 1).slice(2));
  const [start, setStart] = useState(yr + "-09-01");
  const [end,   setEnd]   = useState((yr + 1) + "-06-30");
  const [phase, setPhase] = useState("vorbereitung");

  function save() {
    if (!name.trim() || !start || !end) return;
    const season = { id: uid(), teamId, name: name.trim(), startDate: start, endDate: end, phase, gamedays: [] };
    update(d => ({ ...d, seasons: [...(d.seasons ?? []), season] }));
    back();
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", paddingBottom: 24 }}>
      <Hdr title="Neue Saison" back={back} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <span style={ss.label}>Saisonname</span>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="z.B. Saison 2025/26" style={ss.input} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <span style={ss.label}>Beginn</span>
            <input type="date" value={start} onChange={e => setStart(e.target.value)}
              style={{ ...ss.input, colorScheme: "dark" }} />
          </div>
          <div>
            <span style={ss.label}>Ende</span>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)}
              style={{ ...ss.input, colorScheme: "dark" }} />
          </div>
        </div>
        <div>
          <span style={ss.label}>Startphase</span>
          {Object.entries(PHASES).filter(([k]) => k !== "abgeschlossen").map(([key, ph]) => (
            <button key={key} onClick={() => setPhase(key)} style={optBtn(phase === key)}>
              <span style={{ fontSize: 20 }}>{ph.emoji}</span>
              <span style={{ flex: 1 }}>{ph.label}</span>
            </button>
          ))}
        </div>
        <button onClick={save} style={ss.primaryBtn}>
          <span>Saison anlegen</span>
          <Check size={22} color="white" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SEASON DETAIL VIEW  (Stage 4)
// ─────────────────────────────────────────────

function SeasonDetailView({ data, update, seasonId, go, back }) {
  const season = (data.seasons ?? []).find(s => s.id === seasonId);
  const [showAddGame, setShowAddGame] = useState(false);
  const [gd, setGd] = useState({ date: todayISO(), opponent: "", isHome: true, result: "" });

  if (!season) return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: 24, color: C.muted }}>
      Saison nicht gefunden.
    </div>
  );

  const team     = (data.teams ?? []).find(t => t.id === season.teamId);
  const ph       = PHASES[season.phase] ?? PHASES.offseason;
  const sessions = getSeasonSessions(season, data.sessions);
  const gamedays = [...(season.gamedays ?? [])].sort((a, b) => a.date.localeCompare(b.date));

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
        ...s, gamedays: [...(s.gamedays ?? []), entry]
      }),
    }));
    setGd({ date: todayISO(), opponent: "", isHome: true, result: "" });
    setShowAddGame(false);
  }

  function delGameday(id) {
    update(d => ({
      ...d,
      seasons: d.seasons.map(s => s.id !== seasonId ? s : {
        ...s, gamedays: (s.gamedays ?? []).filter(g => g.id !== id)
      }),
    }));
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", paddingBottom: 100 }}>
      <Hdr title={season.name} back={back} />
      <div style={{ padding: 16 }}>

        {/* Hero */}
        <div style={{ background: ph.bg, border: "1px solid " + ph.color + "40",
          borderRadius: 20, padding: 20, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 38 }}>{ph.emoji}</span>
            <div>
              <p style={{ margin: 0, fontWeight: 900, color: C.text, fontSize: 20 }}>{season.name}</p>
              <p style={{ margin: 0, color: ph.color, fontWeight: 700, fontSize: 15 }}>{ph.label}</p>
              <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>
                {team?.name} · {fmtDate(season.startDate)} – {fmtDate(season.endDate)}
              </p>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {[["Trainings", sessions.length], ["Spieltage", gamedays.length],
              ["Spieler:in", getTeamPlayers(season.teamId, data).length]].map(([l, v]) => (
              <div key={l} style={{ background: "rgba(0,0,0,0.3)", borderRadius: 12, padding: 12, textAlign: "center" }}>
                <p style={{ margin: 0, color: ph.color, fontWeight: 900, fontSize: 20 }}>{v}</p>
                <p style={{ margin: 0, color: C.muted, fontSize: 11 }}>{l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Phase control */}
        {season.phase !== "abgeschlossen" && (
          <div style={{ marginBottom: 20 }}>
            <p style={ss.label}>Phase wechseln</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(PHASES).filter(([k]) => k !== season.phase).map(([key, p]) => (
                <button key={key} onClick={() => changePhase(key)} style={{
                  padding: "8px 14px", borderRadius: 12, cursor: "pointer", fontWeight: 600, fontSize: 13,
                  background: p.bg, border: "1px solid " + p.color + "60", color: p.color,
                }}>
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Spieltage */}
        <div style={{ marginBottom: 20 }}>
          <p style={ss.label}>Spieltage ({gamedays.length})</p>
          {gamedays.length === 0 && !showAddGame && (
            <div style={{ background: C.card, borderRadius: 14, padding: "18px 16px",
              textAlign: "center", marginBottom: 8 }}>
              <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Noch keine Spieltage eingetragen.</p>
            </div>
          )}
          {gamedays.map(g => {
            const hol  = getHoliday(g.date);
            const schH = getSchoolHoliday(g.date);
            return (
              <div key={g.id} style={{ background: C.card, border: "1px solid " + C.border,
                borderRadius: 14, padding: "12px 14px", marginBottom: 6,
                display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ textAlign: "center", minWidth: 40, flexShrink: 0 }}>
                  <p style={{ margin: 0, fontWeight: 900, color: C.orange, fontSize: 18 }}>
                    {new Date(g.date + "T12:00:00").getDate()}
                  </p>
                  <p style={{ margin: 0, color: C.muted, fontSize: 10 }}>
                    {new Date(g.date + "T12:00:00").toLocaleDateString("de-DE", { month: "short" })}
                  </p>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                      background: g.isHome ? "#052e16" : "#1c0a00",
                      color: g.isHome ? "#4ade80" : C.orange }}>
                      {g.isHome ? "Heim" : "Auswärts"}
                    </span>
                    <span style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>
                      {g.opponent || "Gegner offen"}
                    </span>
                    {g.result && <span style={{ color: C.muted2, fontSize: 13 }}>{g.result}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                    {hol  && <span style={{ fontSize: 11, color: "#f87171" }}>🔴 {hol}</span>}
                    {schH && <span style={{ fontSize: 11, color: "#ca8a04" }}>🟡 Schulferien</span>}
                  </div>
                </div>
                <button onClick={() => delGameday(g.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
                  <Trash2 size={15} color={C.muted} />
                </button>
              </div>
            );
          })}

          {showAddGame ? (
            <div style={{ background: C.card, border: "1px solid " + C.border,
              borderRadius: 14, padding: 16, marginTop: 6 }}>
              <p style={{ ...ss.label, color: C.orange, marginBottom: 12 }}>Spieltag eintragen</p>
              <input type="date" value={gd.date} onChange={e => setGd(g => ({ ...g, date: e.target.value }))}
                style={{ ...ss.input, marginBottom: 8, colorScheme: "dark" }} />
              <input value={gd.opponent} onChange={e => setGd(g => ({ ...g, opponent: e.target.value }))}
                placeholder="Gegner (optional)" style={{ ...ss.input, marginBottom: 8 }} />
              <input value={gd.result} onChange={e => setGd(g => ({ ...g, result: e.target.value }))}
                placeholder="Ergebnis (optional, z.B. 72:65)" style={{ ...ss.input, marginBottom: 10 }} />
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {[true, false].map(h => (
                  <button key={h ? "heim" : "aus"} onClick={() => setGd(g => ({ ...g, isHome: h }))} style={{
                    flex: 1, padding: "9px 0", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer",
                    background: gd.isHome === h ? (h ? "#052e16" : "#1c0a00") : C.card2,
                    border: "1px solid " + (gd.isHome === h ? (h ? "#4ade80" : C.orange) : C.border),
                    color: gd.isHome === h ? (h ? "#4ade80" : C.orange) : C.muted,
                  }}>
                    {h ? "🏠 Heim" : "✈️ Auswärts"}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={addGameday}
                  style={{ ...ss.primaryBtn, flex: 1, padding: "10px 16px", fontSize: 15, justifyContent: "center" }}>
                  Spieltag speichern
                </button>
                <button onClick={() => setShowAddGame(false)} style={{ ...ss.ghostBtn, flex: 1 }}>Abbrechen</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddGame(true)} style={optBtn(false)}>
              <Plus size={18} color={C.orange} />
              <span style={{ color: C.orange }}>Spieltag hinzufügen</span>
            </button>
          )}
        </div>

        {/* Jahrgangs-Upgrade */}
        {season.phase !== "abgeschlossen" && (
          <div>
            <p style={ss.label}>Saisonabschluss</p>
            <button onClick={() => go("jahrgang_upgrade", { seasonId, teamId: season.teamId })} style={{
              width: "100%", padding: "16px 20px", borderRadius: 16, cursor: "pointer", textAlign: "left",
              background: "#0c1a2e", border: "1px solid #1e3a5f",
              display: "flex", alignItems: "center", gap: 14,
            }}>
              <span style={{ fontSize: 30 }}>🔄</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 700, color: "#60a5fa", fontSize: 15 }}>
                  Jahrgangs-Upgrade starten
                </p>
                <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>
                  Spielerinnen in anderes Team übertragen · Saison abschließen
                </p>
              </div>
              <ChevronRight size={18} color="#60a5fa" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// JAHRGANG UPGRADE VIEW  (Stage 4)
// ─────────────────────────────────────────────

function JahrgangUpgradeView({ data, update, seasonId, go, back }) {
  const season   = (data.seasons ?? []).find(s => s.id === seasonId);
  const srcTeam   = season ? (data.teams ?? []).find(t => t.id === season.teamId) : null;
  const srcPlayers = srcTeam ? getTeamPlayers(srcTeam.id, data) : [];
  const others    = (data.teams ?? []).filter(t => t.id !== srcTeam?.id);
  const [sel, setSel]       = useState({});
  const [targetId, setTgt]  = useState(others[0]?.id ?? "");
  const [done, setDone]     = useState(false);

  if (!season || !srcTeam) return null;

  function toggle(pid) { setSel(s => ({ ...s, [pid]: !s[pid] })); }

  function execute() {
    const ids = Object.entries(sel).filter(([,v]) => v).map(([k]) => k);
    if (!ids.length || !targetId) return;
    update(d => {
      const tgt = d.teams.find(t => t.id === targetId);
      if (!tgt) return d;
      const existing = new Set(tgt.playerIds ?? []);
      const toAdd    = ids.filter(id => !existing.has(id));
      return {
        ...d,
        teams:   d.teams.map(t => t.id !== targetId ? t : {
          ...t, playerIds: [...(t.playerIds ?? []), ...toAdd]
        }),
        seasons: d.seasons.map(s => s.id !== seasonId ? s : { ...s, phase: "abgeschlossen" }),
      };
    });
    setDone(true);
  }

  const cnt = Object.values(sel).filter(Boolean).length;

  if (done) {
    const tgtName = (data.teams ?? []).find(t => t.id === targetId)?.name ?? "Zielteam";
    return (
      <div style={{ background: C.bg, minHeight: "100vh", padding: 32, textAlign: "center" }}>
        <span style={{ fontSize: 64, display: "block", marginBottom: 16 }}>✅</span>
        <p style={{ color: C.text, fontWeight: 900, fontSize: 22, marginBottom: 8 }}>Upgrade abgeschlossen!</p>
        <p style={{ color: C.muted, lineHeight: 1.6, marginBottom: 24 }}>
          {cnt} Spieler:in{cnt !== 1 ? "nen" : ""} wurde{cnt !== 1 ? "n" : ""} nach <strong style={{ color: C.text }}>{tgtName}</strong> übertragen.
          Die Saison ist als Abgeschlossen markiert.
        </p>
        <button onClick={() => go("teams")}
          style={{ ...ss.primaryBtn, display: "inline-flex", width: "auto", padding: "12px 28px" }}>
          Zurück zu Teams
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", paddingBottom: 100 }}>
      <Hdr title="Jahrgangs-Upgrade" back={back} />
      <div style={{ padding: 16 }}>
        <div style={{ background: "#0c1a2e", border: "1px solid #1e3a5f",
          borderRadius: 14, padding: 14, marginBottom: 20 }}>
          <p style={{ margin: 0, color: "#93c5fd", fontSize: 13, lineHeight: 1.6 }}>
            Spielerinnen aus <strong>{srcTeam.name}</strong> auswählen und in ein anderes Team übertragen.
            Sie bleiben im Quellteam erhalten — dort anschließend manuell entfernen.
          </p>
        </div>

        {others.length > 0 ? (
          <div style={{ marginBottom: 20 }}>
            <p style={ss.label}>Zielteam</p>
            {others.map(t => (
              <button key={t.id} onClick={() => setTgt(t.id)} style={optBtn(targetId === t.id)}>
                <span style={{ fontSize: 18 }}>👥</span>
                <span style={{ flex: 1 }}>{t.name}</span>
                <span style={{ fontWeight: 400, fontSize: 12, color: C.muted2 }}>
                  {t.playerIds?.length ?? 0} Spieler:innen
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ background: "#2d1000", border: "1px solid #854d0e",
            borderRadius: 14, padding: 14, marginBottom: 20 }}>
            <p style={{ margin: 0, color: "#fb923c", fontSize: 13 }}>
              ⚠️ Kein weiteres Team vorhanden. Bitte zuerst unter Teams ein neues Team anlegen.
            </p>
          </div>
        )}

        <p style={ss.label}>Spielerinnen auswählen ({cnt} ausgewählt)</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {srcPlayers.map(p => {
            const on = !!sel[p.id];
            return (
              <button key={p.id} onClick={() => toggle(p.id)} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
                background: on ? "#0c1a2e" : C.card,
                border: "1px solid " + (on ? "#60a5fa" : C.border),
                borderRadius: 14, cursor: "pointer", textAlign: "left",
              }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: on ? "#60a5fa" : C.border2,
                  border: "2px solid " + (on ? "#60a5fa" : C.border),
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {on && <Check size={16} color="white" />}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 700, color: C.text }}>{p.name}</p>
                  <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>
                    {p.birthYear ? "Jg. " + p.birthYear : "Kein Jahrgang"}
                    {p.injured && <span style={{ color: "#f87171", marginLeft: 8 }}>🤕 verletzt</span>}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <button onClick={execute}
          disabled={cnt === 0 || !targetId || others.length === 0}
          style={{ ...ss.primaryBtn,
            opacity: cnt === 0 || !targetId || others.length === 0 ? 0.4 : 1,
            cursor:  cnt === 0 || !targetId || others.length === 0 ? "not-allowed" : "pointer" }}>
          <span>
            {cnt > 0
              ? cnt + " Spieler:in" + (cnt !== 1 ? "nen" : "") + " übertragen"
              : "Spieler:innen auswählen"}
          </span>
          <span style={{ fontSize: 20 }}>🔄</span>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────

export default function App() {
  const { data, update } = useData();
  const [nav, setNav]    = useState({ view: "home", params: {} });
  const pwa              = usePwaUpdate();

  function go(view, params = {}) { setNav({ view, params }); }

  function saveSession(sess, planId) {
    const sessWithAuthor = { ...sess, erfasstVon: data.settings?.trainerName ?? "" };
    update(d => {
      const next = { ...d, sessions: [...(d.sessions ?? []), sessWithAuthor] };
      if (planId) {
        next.plannedSessions = (d.plannedSessions ?? []).map(p =>
          p.id === planId ? { ...p, recordedId: sess.id } : p
        );
      }
      return next;
    });
    go("session_detail", { sessionId: sess.id });
  }

  function deleteSession(id) {
    update(d => ({
      ...d,
      sessions: (d.sessions ?? []).filter(s => s.id !== id),
      plannedSessions: (d.plannedSessions ?? []).map(p =>
        p.recordedId === id ? { ...p, recordedId: null } : p
      ),
    }));
    go("home");
  }

  const v = nav.view;
  const showTabs = v !== "new_session";

  return (
    <div style={{ fontFamily: "-apple-system, \'Helvetica Neue\', BlinkMacSystemFont, sans-serif",
      background: C.bg }}>
      {pwa.needRefresh && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000,
          background: C.orange, color: "#1a0a00", padding: "calc(env(safe-area-inset-top) + 10px) 16px 10px",
          display: "flex", alignItems: "center", gap: 12, boxShadow: "0 2px 12px #0008",
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>
            Neue Version verfügbar — deine Daten bleiben erhalten.
          </span>
          <button onClick={pwa.applyUpdate} style={{
            background: "#1a0a00", color: C.orange, border: "none", borderRadius: 10,
            padding: "8px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
          }}>
            Jetzt aktualisieren
          </button>
        </div>
      )}
      {v === "home"           && <HomeView data={data} go={go} />}
      {v === "new_session"    && <NewSessionView data={data} onSave={saveSession}
                                   back={() => go("home")} plan={nav.params?.plan} />}
      {v === "session_detail" && <SessionDetailView data={data} update={update} sessionId={nav.params.sessionId}
                                   back={() => go("home")} onDelete={deleteSession} />}
      {v === "calendar"       && <CalendarView data={data} go={go} />}
      {v === "calendar_day"   && <CalendarDayView data={data} update={update}
                                   date={nav.params.date} go={go} back={() => go("calendar")} />}
      {v === "teams"          && <TeamsView data={data} update={update} go={go} />}
      {v === "team_detail"    && <TeamDetailView data={data} update={update} go={go}
                                   teamId={nav.params.teamId} back={() => go("teams")} />}
      {v === "season_list"    && <SeasonListView data={data} update={update}
                                   teamId={nav.params.teamId} go={go} back={() => go("team_detail", { teamId: nav.params.teamId })} />}
      {v === "new_season"     && <NewSeasonView data={data} update={update}
                                   teamId={nav.params.teamId} back={() => go("season_list", { teamId: nav.params.teamId })} />}
      {v === "season_detail"  && <SeasonDetailView data={data} update={update}
                                   seasonId={nav.params.seasonId} go={go} back={() => go("season_list", { teamId: nav.params.teamId })} />}
      {v === "jahrgang_upgrade" && <JahrgangUpgradeView data={data} update={update}
                                   seasonId={nav.params.seasonId} go={go} back={() => go("season_detail", { seasonId: nav.params.seasonId, teamId: nav.params.teamId })} />}
      {v === "stats"          && <StatsView data={data} />}
      {v === "settings"       && <SettingsView data={data} update={update} pwa={pwa} />}
      {showTabs && <BottomNav active={v} go={go} />}
    </div>
  );
}
