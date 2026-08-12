import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);

// Supports both:
// node unwrap-markdown.js -- .\docs\guide
// node unwrap-markdown.js --docs\guide
let targetArg = args[0];
if (targetArg === "--") targetArg = args[1];
if (targetArg?.startsWith("--")) targetArg = targetArg.slice(2);

if (!targetArg) {
  console.error("Usage: node unwrap-markdown.js -- <folder-or-file>");
  process.exit(1);
}

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

const target = path.resolve(repoRoot, targetArg);

if (!fs.existsSync(target)) {
  console.error(`Target does not exist: ${target}`);
  process.exit(1);
}

const targetIsFile = fs.statSync(target).isFile();

function isInsideTarget(file) {
  if (targetIsFile) return path.resolve(repoRoot, file) === target;

  const relative = path.relative(target, path.resolve(repoRoot, file));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

const files = execFileSync("git", ["ls-files", "-z", "--", "*.md"])
  .toString()
  .split("\0")
  .filter(Boolean)
  .filter(isInsideTarget);

const fenceRe = /^\s*(`{3,}|~{3,})/;
const listRe = /^\s*(?:[-+*]|\d+[.)])\s+/;
const structuralRe =
  /^\s*(?:#{1,6}\s|>|[-*_]{3,}\s*$|\|.*\||\[[^\]]+\]:|<[^>]+>| {4}|\t)/;

function unwrap(text) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const hadFinalNewline = text.endsWith("\n");
  const lines = text.split(/\r?\n/);
  const output = [];
  let buffer = [];
  let inFence = false;
  let inFrontMatter = lines[0] === "---";

  function flush() {
    if (buffer.length) {
      output.push(buffer.map((line) => line.trim()).join(" "));
      buffer = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Preserve YAML front matter exactly.
    if (inFrontMatter) {
      output.push(line);
      if (i > 0 && line === "---") inFrontMatter = false;
      continue;
    }

    if (fenceRe.test(line)) {
      flush();
      output.push(line);
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      output.push(line);
      continue;
    }

    if (!line.trim()) {
      flush();
      output.push("");
      continue;
    }

    // Preserve intentional Markdown hard line breaks.
    if (/ {2,}$|\\$/.test(line)) {
      flush();
      output.push(line);
      continue;
    }

    // Preserve headings, blockquotes, tables, rules, reference defs, code.
    if (structuralRe.test(line) && !listRe.test(line)) {
      flush();
      output.push(line);
      continue;
    }

    // Start a new list item; wrapped lines beneath it are joined.
    if (listRe.test(line)) {
      flush();
      buffer.push(line);
      continue;
    }

    buffer.push(line);
  }

  flush();

  return output.join(newline) + (hadFinalNewline ? newline : "");
}

for (const file of files) {
  const original = fs.readFileSync(file, "utf8");
  const rewritten = unwrap(original);

  if (rewritten !== original) {
    fs.writeFileSync(file, rewritten, "utf8");
    console.log(`Updated: ${file}`);
  }
}