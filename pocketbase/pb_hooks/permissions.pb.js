/// <reference path="../pb_data/types.d.ts" />
// Berechtigungs-Invarianten, die sich mit API-Regeln allein nicht ausdrücken lassen
// (Logik in permissions.js). Gilt für alle Anfragen, auch vom Superuser/Admin-Skript.

onRecordCreateRequest((e) => { require(`${__hooks}/permissions.js`).organization(e); e.next(); }, "organizations");
onRecordUpdateRequest((e) => { require(`${__hooks}/permissions.js`).organization(e); e.next(); }, "organizations");

onRecordCreateRequest((e) => { require(`${__hooks}/permissions.js`).section(e, true); e.next(); }, "sections");
onRecordUpdateRequest((e) => { require(`${__hooks}/permissions.js`).section(e, false); e.next(); }, "sections");

onRecordCreateRequest((e) => { require(`${__hooks}/permissions.js`).team(e, true); e.next(); }, "teams");
onRecordUpdateRequest((e) => { require(`${__hooks}/permissions.js`).team(e, false); e.next(); }, "teams");
