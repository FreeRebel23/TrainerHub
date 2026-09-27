# sports-data – produktneutrale Verbandsdaten-Capability

**Separate Products, Shared Capabilities.** Dieses Paket liest Verbandsdaten (derzeit
basketball-bund.net) und liefert sie als normalisierte Domänenobjekte. Es gehört weder TrainerHub
noch GameDay. Beide (und weitere Produkte) können es unabhängig voneinander nutzen.

```
basketball-bund.net
       ↓
packages/sports-data   (Provider-Adapter, HTTP, Normalisierung, Vertrag)
       ↓
normalisierte Domänenobjekte (src/model.js, SCHEMA_VERSION 1)
    ↙                        ↘
TrainerHub-Adapter            GameDay-Adapter
server/trainerhub-sports      (im GameDay-Repo, später)
→ PocketBase                  → Rendering/Publishing
```

## Grenze (verbindlich, per Test abgesichert)

- Das Paket importiert **nur** `node:`-Module und eigene Dateien. Es gibt keine PocketBase-, React-,
  TrainerHub- oder GameDay-Bezüge und keine npm-Abhängigkeiten (`test/boundary.test.js`).
- Das Paket speichert nichts, kennt keine Vereine/Teams eines Produkts und ordnet nichts zu. Es sagt
  nur, was die Quelle liefert. Welche Mannschaft „die eigene“ ist, entscheidet der Verbraucher über
  die stabilen IDs.
- Verbraucher importieren nur `src/index.js` (bzw. rufen `bin/sports-data.mjs` auf).
- Eine Extraktion als eigenes Paket/Repository ist ohne Rewrite möglich: Verzeichnis verschieben,
  `package.json` ist bereits vorhanden.

## Nutzung

**JavaScript**

```js
import { createBasketballBundProvider, politeHttp, basketballBund } from "./packages/sports-data/src/index.js";
const provider = createBasketballBundProvider({
  http: politeHttp({ baseUrl: basketballBund.BASE_URL, userAgent: "MeinProdukt/1.0 (Kontakt/Zweck)" }),
});
const { competition, games } = await provider.schedule("56442");
```

Die Adapter-Schnittstelle `SportsDataProvider` bietet `seasonFor`, `clubMatches`, `schedule`,
`standings`, `gameDetails` und `boxscore` (siehe `src/model.js`).

**Andere Sprachen (z. B. GameDay/Python)**: Die CLI gibt denselben Vertrag als JSON aus.

```bash
node packages/sports-data/bin/sports-data.mjs club-games --club 484 --details --user-agent "GameDay/2.0 (TV Bretten)"
node packages/sports-data/bin/sports-data.mjs schedule --competition 56442
node packages/sports-data/bin/sports-data.mjs standings --competition 56442
node packages/sports-data/bin/sports-data.mjs game --id 2946251
node packages/sports-data/bin/sports-data.mjs boxscore --id 2946251
```

Ausgabe: `{ schemaVersion, provider, command, fetchedAt, requests, data }`. Bei einem Fehler wird
JSON auf stderr geschrieben und der Exit-Code ist 1.

## Quelle und Höflichkeit

- Genutzt wird nur die öffentliche JSON-Schnittstelle `/rest/…` von basketball-bund.net. Die
  Webseite nutzt sie selbst, und robots.txt schließt sie nicht aus. Per robots.txt gesperrte Seiten
  (`index.jsp?Action=103/106`, Archiv, `statistik.do?reqCode=statTeam`) werden nicht genutzt.
- `politeHttp`: streng nacheinander, mindestens 1,5 s Abstand, Timeout, wenige Wiederholungen nur
  bei 5xx/Netzwerk, Cache je Lauf, ehrlicher User-Agent je Produkt. Es gibt keine Umgehung von
  Schutzmechanismen.
- Stabile IDs, Besonderheiten (`heimHalbzeitstand` = 2. Viertel, `00:00` = Zeit unbekannt,
  `matchNo` nur je Liga eindeutig) und verifizierte Beispiele stehen in
  `docs/SPORTS_DATA_ARCHITECTURE.md`, §1–§3.

## Tests

`test/basketball-bund.test.js` prüft die Normalisierung anhand anonymisierter echter Antworten
(`test/fixtures/*.json`), den HTTP-Client und die Namensvorschläge. `test/boundary.test.js` sichert
die Modulgrenze. `test/fixtures/world.js` ist eine synthetische Verbandswelt im Quellformat, die
Verbraucher für eigene Tests nutzen können.
