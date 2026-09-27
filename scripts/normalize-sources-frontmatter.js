#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

function listMarkdownFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const cur = stack.pop();
    const st = fs.statSync(cur);
    if (st.isDirectory()) {
      for (const ent of fs.readdirSync(cur)) stack.push(path.join(cur, ent));
    } else if (st.isFile() && cur.toLowerCase().endsWith('.md')) {
      out.push(cur);
    }
  }
  return out;
}

function splitTopLevelCsv(text) {
  const items = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && text[i - 1] !== '\\') {
      inQuote = !inQuote;
      cur += ch;
      continue;
    }
    if (ch === ',' && !inQuote) {
      items.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) items.push(cur.trim());
  return items;
}

function normalizeSourceItem(item) {
  let s = item.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    s = s.slice(1, -1);
  } else {
    if (s.startsWith('[')) s = s.slice(1);
    if (s.endsWith(']')) s = s.slice(0, -1);
  }
  return s.trim();
}

function normalizeSourcesLine(line) {
  const match = line.match(/^(\s*sources:\s*)(\[[\s\S]*\])(\s*)$/);
  if (!match) return null;
  const [, prefix, rawList, suffix] = match;
  const inner = rawList.slice(1, -1).trim();
  const items = splitTopLevelCsv(inner)
    .map(normalizeSourceItem)
    .filter(Boolean);
  if (items.length === 0) return null;
  return `${prefix}[${items.map((s) => JSON.stringify(s)).join(', ')}]${suffix}`;
}

function rewriteFile(absPath) {
  const raw = fs.readFileSync(absPath, 'utf8');
  if (!raw.startsWith('---')) return false;
  const newline = raw.includes('\r\n') ? '\r\n' : '\n';
  const parts = raw.split(/\r?\n/);
  const closeIdx = parts.indexOf('---', 1);
  if (closeIdx <= 0) return false;

  let changed = false;
  for (let i = 1; i < closeIdx; i++) {
    if (!parts[i].includes('sources:')) continue;
    const next = normalizeSourcesLine(parts[i]);
    if (next && next !== parts[i]) {
      parts[i] = next;
      changed = true;
    }
  }

  if (!changed) return false;
  fs.writeFileSync(absPath, parts.join(newline), 'utf8');
  return true;
}

function main() {
  const root = process.argv[2];
  if (!root) {
    console.error('usage: normalize-sources-frontmatter.js <brain-root>');
    process.exit(1);
  }
  const files = listMarkdownFiles(root);
  let changed = 0;
  for (const file of files) {
    try {
      if (rewriteFile(file)) changed++;
    } catch (err) {
      console.error(`[normalize-sources-frontmatter] ${file}: ${err.message}`);
    }
  }
  console.log(JSON.stringify({ scanned: files.length, changed }, null, 2));
}

main();
