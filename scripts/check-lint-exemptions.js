// Fails when .oxlintrc.json exempts something the base did not: a file added
// to an override's `files`, or a new `ignorePatterns` entry. Exemption lists
// only shrink. Code that breaks a rule gets fixed, not listed.
// Usage: node scripts/check-lint-exemptions.js [base-ref, default origin/main]

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONFIG = ".oxlintrc.json";

const base = process.argv[2] ?? "origin/main";

// The config is JSON with comments and trailing commas, which JSON.parse
// rejects. Drop both, leaving string contents alone.
const parseJsonc = (text) => {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const end = text.indexOf('"', i + 1);
      let close = end;
      while (text[close - 1] === "\\") close = text.indexOf('"', close + 1);
      out += text.slice(i, close + 1);
      i = close;
    } else if (char === "/" && text[i + 1] === "/") {
      i = text.indexOf("\n", i) - 1;
      if (i < 0) break;
    } else if (char === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i) + 1;
    } else {
      out += char;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
};

// One entry per (rules, file) pair, so moving a file from one override to
// another counts as a new exemption.
const exemptions = (config) => {
  const entries = new Set(
    (config.ignorePatterns ?? []).map((pattern) => `ignorePatterns: ${pattern}`)
  );
  for (const override of config.overrides ?? []) {
    const rules = JSON.stringify(override.rules ?? {});
    for (const file of override.files ?? []) entries.add(`${rules}: ${file}`);
  }
  return entries;
};

const before = exemptions(
  parseJsonc(
    execFileSync("git", ["show", `${base}:${CONFIG}`], { encoding: "utf8" })
  )
);
const after = exemptions(parseJsonc(readFileSync(CONFIG, "utf8")));
const added = [...after].filter((entry) => !before.has(entry));

if (added.length > 0) {
  console.error(`${CONFIG} has new lint exemptions since ${base}:\n`);
  for (const entry of added) console.error(`  ${entry}`);
  console.error(
    "\nRemove them and make the code pass the rule instead: split a long function into smaller ones."
  );
  process.exit(1);
}
