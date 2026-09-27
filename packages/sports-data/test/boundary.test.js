// Modulgrenze der Capability: Der Kern darf nichts außerhalb von packages/sports-data importieren
// (keine PocketBase-, React-, TrainerHub- oder GameDay-Module) und keine npm-Abhängigkeiten haben.
// So bleibt er ohne Rewrite als eigenes Paket/Repository extrahierbar.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const files = dir => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? (f === "node_modules" ? [] : files(p)) : /\.(m?js)$/.test(f) ? [p] : [];
});
const IMPORT = /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

describe("Grenze packages/sports-data", () => {
  it("nur node:-Module und Dateien innerhalb des Pakets", () => {
    const bad = [];
    for (const file of [...files(join(ROOT, "src")), ...files(join(ROOT, "bin"))]) {
      for (const m of readFileSync(file, "utf8").matchAll(IMPORT)) {
        const spec = m[1] ?? m[2];
        if (spec.startsWith("node:")) continue;
        const target = spec.startsWith(".") ? resolve(dirname(file), spec) : null;
        if (!target || relative(ROOT, target).startsWith("..")) bad.push(`${relative(ROOT, file)} → ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("keine Produktbezüge im Kern-Code", () => {
    const hits = [...files(join(ROOT, "src"))].filter(f => /pocketbase|react|\$app|collections\//i.test(
      readFileSync(f, "utf8").split("\n").filter(l => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n")));
    expect(hits.map(f => relative(ROOT, f))).toEqual([]);
  });

  it("keine npm-Abhängigkeiten", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  });
});
