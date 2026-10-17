// livedot MCP: a club's or tour's members from the file an organiser dropped in (Wes, 17 Oct: "a CSV of members"). Spreadsheets come
// out every way: commas, semicolons or tabs; quotes; a header row or none; "Email", "E-mail address", "Mail"; one "Name" column, or
// "First name" and "Surname"; "Sam Smith <sam@example.com>" in one cell; a byte-order mark; blank lines. Read here, in one pass, into
// [{ name, email }]; Windline's server checks every address again, drops duplicates, and invites nobody before the organiser says yes.

export const MAX_BYTES = 2e6, MAX_ROWS = 2000;
const EMAILISH = /[^\s<>"',;]+@[^\s<>"',;]+\.[^\s<>"',;]+/;
const H = {
  email: /^(e-?mail|e-?mail ?address|email ?adres|mail|courriel|correo|e-?post|emailadres)$/i,
  name: /^(name|full ?name|naam|nom|nombre|member|member ?name|rider|runner|athlete|participant|person|contact)$/i,
  first: /^(first ?name|first|given ?name|forename|voornaam|vorname|pr[ée]nom|nombre de pila)$/i,
  last: /^(last ?name|last|surname|family ?name|achternaam|nachname|nom de famille|apellidos?)$/i,
};
const norm = (s) => String(s || '').trim().replace(/^["']|["']$/g, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ');

/** One CSV text → rows of cells, with the delimiter it uses (commas, semicolons, tabs or bars) and quotes as spreadsheets write them. */
export function rowsOf(text) {
  const s = String(text || '').replace(/^﻿/, '');
  const sample = s.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 10).join('\n').replace(/"[^"]*"/g, '');
  const d = [',', ';', '\t', '|'].map((c) => [c, sample.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"' && !cell.trim()) { q = true; cell = ''; continue; }
    if (c === d) { row.push(cell); cell = ''; continue; }
    if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); if (row.some((x) => x.trim())) rows.push(row); row = []; cell = ''; if (rows.length > MAX_ROWS + 1) break; continue; }
    cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim())) rows.push(row);
  return { rows: rows.map((r) => r.map(norm)), delimiter: d };
}

/** The file → { people: [{ name, email }], rows, header, over } (email as written: the server checks it). */
export function parseMembers(text) {
  if (String(text || '').length > MAX_BYTES) throw Object.assign(new Error('That file is over 2 MB. Split it, or send up to 2,000 people at a time.'), { status: 413 });
  const { rows } = rowsOf(text);
  if (!rows.length) return { people: [], rows: 0, header: false, over: 0 };
  const top = rows[0], isHead = !top.some((c) => EMAILISH.test(c)) && top.some((c) => H.email.test(c) || H.name.test(c) || H.first.test(c) || H.last.test(c));
  const body = isHead ? rows.slice(1) : rows, find = (re) => (isHead ? top.findIndex((c) => re.test(c)) : -1);
  let ei = find(H.email), ni = find(H.name), fi = find(H.first), li = find(H.last);
  if (ei < 0) { // the column with the most addresses in it
    const w = Math.max(...body.slice(0, 50).map((r) => r.length)), score = Array.from({ length: w }, (_, j) => body.slice(0, 50).filter((r) => EMAILISH.test(r[j] || '')).length);
    ei = score.indexOf(Math.max(...score)); if (!(score[ei] > 0)) ei = -1;
  }
  const people = [];
  for (const r of body.slice(0, MAX_ROWS)) {
    let email = ei >= 0 ? r[ei] || '' : '', name = '';
    const angle = /^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(email) || (!email && r.map((c) => /^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(c)).find(Boolean));
    if (angle) { name = norm(angle[1]); email = angle[2]; } else if (!EMAILISH.test(email)) { const m = r.join(' ').match(EMAILISH); if (m && ei < 0) email = m[0]; }
    if (!name) name = ni >= 0 ? r[ni] || '' : fi >= 0 || li >= 0 ? [fi >= 0 ? r[fi] : '', li >= 0 ? r[li] : ''].filter(Boolean).join(' ')
      : r.filter((c, j) => j !== ei && /\p{L}/u.test(c) && !EMAILISH.test(c)).slice(0, 2).join(' ');
    email = String(email || '').trim().replace(/^mailto:/i, '');
    if (!email && !name) continue;
    people.push({ name: norm(name).slice(0, 80), email: email.slice(0, 254) });
  }
  return { people, rows: body.length, header: isHead, over: Math.max(0, body.length - MAX_ROWS) };
}
