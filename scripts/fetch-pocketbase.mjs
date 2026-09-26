// Lädt die in pocketbase/version.json festgelegte PocketBase-Version (mit Prüfsumme) nach
// .cache/pocketbase/<version>/pocketbase – für Integrationstests und lokales Arbeiten.
// Der Docker-Build lädt dieselbe Version unabhängig davon (pocketbase/Dockerfile).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, chmodSync, renameSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version, sha256 } = JSON.parse(await import("node:fs").then(fs => fs.readFileSync(join(root, "pocketbase/version.json"), "utf8")));

export function pocketbasePath() {
  return process.env.PB_BIN || join(root, ".cache/pocketbase", version, "pocketbase");
}

export async function ensurePocketBase() {
  const bin = pocketbasePath();
  if (existsSync(bin)) return bin;
  const os = { linux: "linux", darwin: "darwin" }[process.platform];
  const arch = { x64: "amd64", arm64: "arm64" }[process.arch];
  const key = `${os}_${arch}`;
  if (!sha256[key]) throw new Error(`Keine PocketBase-Prüfsumme für ${process.platform}/${process.arch} – PB_BIN setzen.`);
  const url = `https://github.com/pocketbase/pocketbase/releases/download/v${version}/pocketbase_${version}_${key}.zip`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download fehlgeschlagen: ${url} (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = createHash("sha256").update(buf).digest("hex");
  if (got !== sha256[key]) throw new Error(`Prüfsumme stimmt nicht für ${url}`);
  const dir = dirname(bin);
  mkdirSync(dir, { recursive: true });
  // In einem eigenen Temp-Verzeichnis entpacken und atomar umbenennen: parallele Testdateien
  // laden sonst gleichzeitig in dieselbe Datei und zerstören sich das Archiv gegenseitig.
  const tmp = mkdtempSync(join(dir, ".dl-"));
  try {
    const zip = join(tmp, "pocketbase.zip");
    writeFileSync(zip, buf);
    execFileSync("unzip", ["-o", "-q", zip, "pocketbase", "-d", tmp]);
    chmodSync(join(tmp, "pocketbase"), 0o755);
    renameSync(join(tmp, "pocketbase"), bin);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return bin;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(await ensurePocketBase());
}
