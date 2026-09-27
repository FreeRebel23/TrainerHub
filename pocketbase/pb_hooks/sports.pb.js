/// <reference path="../pb_data/types.d.ts" />
// Öffentlicher Lese-Feed Spielbetrieb (v1) für GameDay/Scoreboard – Logik in sports_feed.js.
// Nur veröffentlichte Teams (team_links.publish), keine Personendaten.

routerAdd("GET", "/api/trainerhub/sports/v1/games", (e) => require(`${__hooks}/sports_feed.js`).games(e));
routerAdd("GET", "/api/trainerhub/sports/v1/standings", (e) => require(`${__hooks}/sports_feed.js`).standings(e));
