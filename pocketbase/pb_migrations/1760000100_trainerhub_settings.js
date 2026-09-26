/// <reference path="../pb_data/types.d.ts" />
// Betriebseinstellungen: keine Selbstregistrierung, längere Anmeldung (Offline in der Halle),
// tägliche Backups, Rate-Limits gegen Passwort-Raten, echte Client-IP hinter dem Proxy.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.createRule = null;                 // Konten legt nur ein Superuser an
  users.listRule = "id = @request.auth.id";
  users.viewRule = "id = @request.auth.id";
  users.updateRule = "id = @request.auth.id";
  users.deleteRule = null;
  users.authToken.duration = 30 * 24 * 60 * 60;   // 30 Tage, wird bei jedem Online-Start erneuert
  app.save(users);

  const settings = app.settings();
  settings.meta.appName = "TrainerHub";
  settings.backups.cron = "30 3 * * *";    // täglich 03:30 (Serverzeit) nach pb_data/backups
  settings.backups.cronMaxKeep = 14;
  settings.trustedProxy.headers = ["X-Real-IP"];
  settings.rateLimits.enabled = true;
  settings.rateLimits.rules = [
    { label: "*:auth", maxRequests: 10, duration: 60 },
    { label: "/api/", maxRequests: 1000, duration: 10 },
  ];
  app.save(settings);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.createRule = "";
  app.save(users);
});
