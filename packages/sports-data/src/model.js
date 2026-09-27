// Normalisierte Domänenobjekte – der produktneutrale Vertrag zwischen Provider-Adaptern und
// Verbrauchern (TrainerHub, GameDay, …). Sprachneutral gedacht: Die CLI (bin/sports-data.mjs) gibt
// genau diese Objekte als JSON aus, damit auch Nicht-JS-Verbraucher (GameDay/Python) sie nutzen.
// Änderungen, die Verbraucher brechen, erhöhen SCHEMA_VERSION.

export const SCHEMA_VERSION = 1;

// Status nur so, wie die Quelle ihn liefert. „Verlegt“ ist kein Status, sondern ein geändertes
// Datum desselben Spiels (gleiche externalId).
export const GAME_STATUS = Object.freeze({ PLANNED: "planned", FINISHED: "finished", CANCELLED: "cancelled" });

/**
 * @typedef {object} Competition   Wettbewerb/Liga einer Saison
 * @property {string} provider     z. B. "basketball-bund"
 * @property {string} externalId   stabile ID der Quelle (basketball-bund: ligaId)
 * @property {string} name
 * @property {string} season       Saison-ID der Quelle ("2026" = 2026/2027)
 * @property {string} seasonName
 * @property {string} level
 * @property {string} ageGroup
 * @property {string} gender
 * @property {string} association
 * @property {string} district
 * @property {boolean} hasStandings
 *
 * @typedef {object} TeamRef       Mannschaft, wie sie in einem Spiel/einer Tabelle auftritt
 * @property {string} externalId   wettbewerbsübergreifend stabil (basketball-bund: teamPermanentId)
 * @property {string} seasonTeamId Mannschaft in genau diesem Wettbewerb
 * @property {string} clubId
 * @property {string} name         Anzeigename der Quelle (nicht eindeutig! nie als Identität nutzen)
 * @property {boolean} withdrawn
 *
 * @typedef {object} Period        Abschnitt (Basketball Q1–Q4, OT1, OT2; andere Sportarten eigene Labels)
 * @property {string} label
 * @property {number} home         Punkte in diesem Abschnitt (nicht kumuliert)
 * @property {number} away
 *
 * @typedef {object} Game
 * @property {string} provider
 * @property {string} externalId   global eindeutige Spiel-ID der Quelle
 * @property {string} competitionExternalId
 * @property {string} matchNo      nur je Wettbewerb eindeutig
 * @property {number|null} matchDay
 * @property {string} date         lokaler Kalendertag YYYY-MM-DD ("" = unbekannt)
 * @property {string} time         HH:MM, "" = noch nicht angesetzt
 * @property {TeamRef} home
 * @property {TeamRef} away
 * @property {number|null} homeScore
 * @property {number|null} awayScore
 * @property {"planned"|"finished"|"cancelled"} status
 * @property {boolean} forfeit
 * @property {boolean} resultConfirmed
 *
 * @typedef {object} GameDetails
 * @property {Game|null} game
 * @property {Period[]|null} periods   null = von der Quelle nicht (stimmig) geliefert
 * @property {Venue|null} venue
 *
 * @typedef {object} Venue
 * @property {string} externalId
 * @property {string} name
 * @property {string} address
 *
 * @typedef {object} StandingEntry  offizielle Tabelle, nicht berechnet
 * @property {number} rank
 * @property {string} teamExternalId
 * @property {string} seasonTeamId
 * @property {string} clubId
 * @property {string} teamName
 * @property {number} games
 * @property {number} wins
 * @property {number} losses
 * @property {number} points
 * @property {number} pointsAgainst
 * @property {number} scored
 * @property {number} conceded
 * @property {number} difference
 * @property {boolean} withdrawn
 *
 * @typedef {object} PlayerGameStat  Basketball, je Person und Spiel
 * @property {string} externalPlayerId  stabile Personen-ID der Quelle
 * @property {string} jerseyNumber
 * @property {string} name
 * @property {number|null} points
 * @property {number|null} twoPointersMade
 * @property {number|null} threePointersMade
 * @property {number|null} freeThrowsMade
 * @property {number|null} freeThrowAttempts
 * @property {number|null} fouls
 *
 * @typedef {object} BoxscoreSide
 * @property {boolean} available     false = Quelle liefert keine echten Werte (nur Nullen/leer)
 * @property {PlayerGameStat[]} players
 * @property {number} anonymous      nicht identifizierbare Personen (nicht enthalten)
 */

/**
 * Schnittstelle eines Provider-Adapters (jede Quelle implementiert dieselbe):
 * @typedef {object} SportsDataProvider
 * @property {string} id
 * @property {number} schemaVersion
 * @property {(date: string) => string} seasonFor
 * @property {(clubId: string, opts?: {rangeDays?: number}) => Promise<{competition: Competition, game: Game}[]>} clubMatches
 * @property {(competitionId: string) => Promise<{competition: Competition|null, games: Game[]}>} schedule
 * @property {(competitionId: string) => Promise<{competition: Competition|null, entries: StandingEntry[]|null}>} standings
 * @property {(gameId: string) => Promise<GameDetails>} gameDetails
 * @property {(gameId: string) => Promise<{game: Game|null, home: BoxscoreSide, away: BoxscoreSide}>} [boxscore]
 */
