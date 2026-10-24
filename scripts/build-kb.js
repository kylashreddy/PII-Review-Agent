// Builds the offline knowledge base in data/kb/ (git-ignored), from public lists:
//   companies.json  companies and brands from Wikidata (English names and aliases, how many Wikipedia
//                   languages cover them: the more, the better known)
//   people.json     public figures from Wikidata (Wikipedia in 25+ languages)
//   domains.json    the 100,000 most visited websites (Tranco list)
//   meta.json       counts, sources, build date
// Run: npm run build-kb  (a few minutes; reload the extension afterwards). Nothing is ever looked up
// online while reviewing: the extension only reads these files.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const OUT = path.join(__dirname, '..', 'data', 'kb');
const UA = 'PIIReviewAssistant-KB/1.0 (offline knowledge base build; https://github.com/kylashreddy/PII-Review-Assistant-Extension)';
const QLEVER = 'https://qlever.dev/api/wikidata';
const TRANCO = 'https://tranco-list.eu/top-1m.csv.zip';

const PREFIX = `PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#> PREFIX schema: <http://schema.org/>`;

const WDQS = 'https://query.wikidata.org/sparql';

// Kinds of organisation that are companies or brands (instance of), in small batches so each query
// stays under the Wikidata Query Service's 60-second limit. Checked against well-known Indian and global
// companies (Infosys, Wipro, TCS, Zomato, Paytm, Google, Accenture…).
const COMPANY_TYPE_BATCHES = [
  ['Q4830453'],                                   // business
  ['Q891723', 'Q6881511', 'Q783794'],             // public company, enterprise, company
  ['Q161726', 'Q1589009', 'Q658255', 'Q778575'],  // multinational, privately held, subsidiary, conglomerate
  ['Q18388277', 'Q1058914', 'Q129238', 'Q20983877', 'Q2089936', 'Q7248095'], // technology, software, startup, unicorn, consulting, professional services
  ['Q22687', 'Q19895173', 'Q46970', 'Q786820', 'Q431289', 'Q507619', 'Q167037'], // bank, payments bank, airline, automaker, brand, retail chain, corporation
];

async function sparql(query, endpoint) {
  const url = `${endpoint || QLEVER}?${new URLSearchParams({ query: `${PREFIX}\n${query}` })}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
    if (res.ok) return (await res.json()).results.bindings;
    if (attempt === 3) throw new Error(`QLever HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 3000 * attempt));
  }
  return [];
}

const qid = (b) => b.item.value.replace(/^.*\//, '');

async function companies() {
  const byQid = new Map();
  for (const batch of COMPANY_TYPE_BATCHES) {
    const rows = await sparql(`SELECT ?item ?name ?links WHERE {
      VALUES ?t { ${batch.map((q) => `wd:${q}`).join(' ')} } ?item wdt:P31 ?t ; wikibase:sitelinks ?links . FILTER(?links >= 3)
      { ?item rdfs:label ?name } UNION { ?item skos:altLabel ?name } FILTER(LANG(?name) = "en") }`, WDQS);
    for (const b of rows) {
      const id = qid(b);
      const e = byQid.get(id) || { links: +b.links.value, names: new Set() };
      e.names.add(b.name.value);
      byQid.set(id, e);
    }
    process.stdout.write('.');
  }
  const items = [];
  for (const [id, e] of byQid) for (const n of e.names) if (n.length >= 2 && n.length <= 80) items.push([n, e.links, id]);
  return { items, entities: byQid.size };
}

async function people() {
  const rows = await sparql(`SELECT ?item ?name ?links WHERE {
    ?item wdt:P31 wd:Q5 . ?item wikibase:sitelinks ?links . FILTER(?links >= 25)
    ?item rdfs:label ?name . FILTER(LANG(?name) = "en") }`);
  return { items: rows.map((b) => [b.name.value, +b.links.value, qid(b)]).filter((r) => r[0].split(/\s+/).length >= 2), entities: rows.length };
}

async function domains(limit) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tranco-'));
  const zip = path.join(tmp, 'top-1m.csv.zip');
  const res = await fetch(TRANCO, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Tranco HTTP ${res.status}`);
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  execFileSync('tar', ['-xf', zip, '-C', tmp]); // bsdtar (macOS, Windows 10+) and GNU tar with zip support
  const csv = fs.readFileSync(path.join(tmp, 'top-1m.csv'), 'utf8');
  fs.rmSync(tmp, { recursive: true, force: true });
  return csv.split('\n').slice(0, limit).map((l) => l.split(',')[1]).filter(Boolean).map((d) => d.trim().toLowerCase());
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  process.stdout.write('companies (Wikidata) … ');
  const c = await companies();
  console.log(`${c.entities.toLocaleString()} companies, ${c.items.length.toLocaleString()} names`);
  process.stdout.write('public figures (Wikidata) … ');
  const p = await people();
  console.log(`${p.items.length.toLocaleString()} names`);
  process.stdout.write('websites (Tranco) … ');
  const d = await domains(100000);
  console.log(`${d.length.toLocaleString()} domains`);

  fs.writeFileSync(path.join(OUT, 'companies.json'), JSON.stringify(c.items));
  fs.writeFileSync(path.join(OUT, 'people.json'), JSON.stringify(p.items));
  fs.writeFileSync(path.join(OUT, 'domains.json'), JSON.stringify(d));
  const meta = {
    built: new Date().toISOString().slice(0, 10),
    companies: c.entities, companyNames: c.items.length, people: p.items.length, domains: d.length,
    sources: { companies: 'Wikidata (CC0) via the Wikidata Query Service', people: 'Wikidata (CC0) via QLever, Wikipedia in 25+ languages', domains: 'Tranco top sites list' },
  };
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 1));
  const size = ['companies', 'people', 'domains'].reduce((n, f) => n + fs.statSync(path.join(OUT, `${f}.json`)).size, 0);
  console.log(`\nWrote data/kb/ (${(size / 1e6).toFixed(1)} MB) in ${Math.round((Date.now() - t0) / 1000)} s. Reload the extension.`);
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(1); });
