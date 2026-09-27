// @tvbretten/sports-data – produktneutrale Capability „Verbandsdaten“ (Spielplan, Ergebnisse,
// Viertel, Tabellen, Basketball-Spielerwerte). Einziger Einstiegspunkt für Verbraucher.
// Regel: Dieses Paket importiert nichts außerhalb von packages/sports-data und nur node:-Module
// (abgesichert durch test/boundary.test.js). Keine PocketBase-, React-, TrainerHub- oder GameDay-Bezüge.

export { SCHEMA_VERSION, GAME_STATUS } from "./model.js";
export { politeHttp, ProviderError, DEFAULT_USER_AGENT } from "./http.js";
export { normalizeName, nameCandidates } from "./names.js";
export * as basketballBund from "./providers/basketball-bund.js";
export { createBasketballBundProvider } from "./providers/basketball-bund.js";
