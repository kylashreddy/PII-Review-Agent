// Builds data/names.js: common first names and surnames, so the rules can recognise a person's name
// with no "Mr." or "Name:" in front ("Divya", "Gupta sent the invoice", "Kavya and Arjun").
// Source: Wikidata (CC0) given names (P735) and family names (P734), counted over people with Indian
// citizenship (used at least twice) and over all people (used at least 40 times), plus the words of the full
// names of people with Indian citizenship (each seen at least twice). Single words only.
// Words that are also ordinary English ("Will", "May", "Grace", "Brown") are kept apart as ambiguous:
// they count only together with an unambiguous name or in a clear context ("Hi Grace,").
// Run: npm run build-names (about a minute). The output is committed, so teammates never need to run it.
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'data', 'names.js');
const QLEVER = 'https://qlever.dev/api/wikidata';
const UA = 'PIIReviewAssistant-KB/1.0 (names list build; https://github.com/kylashreddy/PII-Review-Assistant-Extension)';
const PREFIX = `PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>`;

// Ordinary English words (and words common in documents) that are also names somewhere.
const AMBIGUOUS = `will may mark grace day rose bill hope joy king young brown white green black gray grey page hill april june
summer max faith love art bob carol dawn don frank gene guy harry iris ivy jack jean jewel lane lee long major mason miles nick
norman pat penny rich ray rocky royal ruby sandy skip star sterling stone storm sunny victor violet walker ward warren wells wood
woods field fields bank banks price cost case cook baker smith miller taylor carter cooper turner parker porter hunter fisher
mills church hall park lake ford rivers river bay bell rock rocks sharp short little small strong swift wise good best new noble
golden silver gold diamond pearl amber crystal autumn winter spring august christian chance chase cash cliff colt crane crow
dove drake duke earl fox frost gale glen grant hardy heath holly hunt jade jay kay lance lily lord marsh may mercy moon nash
north south east west paris lincoln jordan london florida georgia virginia carolina dallas houston austin phoenix sydney
york kent wade will penny page reed rush sage scott shaw sky snow speed stern summers temple vale vance wolf worth wright
cross street road lane house home office manager team staff admin user client customer service support sales account
status priority action note notes total amount balance order item items date time today monday tuesday wednesday thursday
friday saturday sunday january february march july september october november december morning evening night noon
deep raja rani sunny happy lucky honey baby doll prince princess angel hero master general captain doctor judge
singer dancer player high alpha beta dear india main nagar tower block colony sector phase floor
the from film justice alias artist bed beauty chain comedian comrade crown dancing father mother sister sis brother
gala getup karate karma lovely manual meet mimicry miss mister pale pilot placid prof professor rash rosy sachet shiny
simple sir madam teacher viral bag bam boo data felt gaming glow lather mania metropolitan michigan music rather row
sable sail salve save saw sheriff solo soy tare whig wig aware airy ale wad wale mein sat sham tiger nectar chakra
sri shri smt shrimati srimati kumari imam guru dada kaka maharaja maharani rajah nawab sheik sahib mufti munshi mulla
daroga sadhu sant swami baba mian hafiz hakeem mahant baronet patwari jagirdar dhobi`.split(/\s+/).filter(Boolean);

async function sparql(query) {
  const url = `${QLEVER}?${new URLSearchParams({ query: `${PREFIX}\n${query}` })}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
    if (res.ok) return (await res.json()).results.bindings;
    if (attempt === 3) throw new Error(`QLever HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 3000 * attempt));
  }
  return [];
}

const counts = (prop, scope, min) => sparql(`SELECT ?l (COUNT(?p) AS ?n) WHERE { ${scope} ?p wdt:${prop} ?g . ?g rdfs:label ?l .
  FILTER(LANG(?l) = "en") } GROUP BY ?l HAVING(COUNT(?p) >= ${min})`);

async function list(prop) {
  const out = new Map();
  for (const [scope, min] of [['?p wdt:P27 wd:Q668 .', 2], ['?p wdt:P31 wd:Q5 .', 40]]) {
    for (const b of await counts(prop, scope, min)) {
      const name = b.l.value;
      if (!/^\p{Lu}\p{Ll}{2,}$/u.test(name)) continue; // one capitalised word of 3+ letters
      out.set(name, (out.get(name) || 0) + Number(b.n.value));
    }
  }
  return out;
}

// Wikidata rarely records the given name of Indian people, so their full names are read too: the first
// (and middle) words are first names, the last word a surname, each seen at least twice
// ("Kolli Sai Teja", "Gaddam Vamshi Krishna", "Juhi Chawla").
async function fromFullNames(first, last) {
  const rows = await sparql(`SELECT ?l WHERE { ?p wdt:P31 wd:Q5 . ?p wdt:P27 wd:Q668 . ?p rdfs:label ?l . FILTER(LANG(?l) = "en") }`);
  const f = new Map();
  const l = new Map();
  for (const b of rows) {
    const w = b.l.value.split(/\s+/).filter((x) => /^\p{Lu}\p{Ll}{2,}$/u.test(x));
    if (w.length < 2) continue;
    w.slice(0, -1).forEach((x) => f.set(x, (f.get(x) || 0) + 1));
    l.set(w[w.length - 1], (l.get(w[w.length - 1]) || 0) + 1);
  }
  for (const [n, c] of f) if (c >= 2) first.set(n, (first.get(n) || 0) + c);
  for (const [n, c] of l) if (c >= 2) last.set(n, (last.get(n) || 0) + c);
}

async function main() {
  console.log('Fetching given names and family names from Wikidata (QLever)…');
  const first = await list('P735');
  const last = await list('P734');
  await fromFullNames(first, last);
  const amb = new Set(AMBIGUOUS);
  const pick = (m) => [...m.keys()].filter((n) => !amb.has(n.toLowerCase())).sort();
  const ambiguous = [...new Set([...first.keys(), ...last.keys()])].filter((n) => amb.has(n.toLowerCase())).sort();
  const data = { first: pick(first).join(' '), last: pick(last).join(' '), ambiguous: ambiguous.join(' ') };
  const js = `// Generated by scripts/build-names.js from Wikidata (CC0) — do not edit by hand.
// ${pick(first).length} first names, ${pick(last).length} surnames, ${ambiguous.length} names that are also English words.
(function (g) { (g.PIIRA = g.PIIRA || {}).NAME_DATA = ${JSON.stringify(data)}; })(globalThis);
`;
  fs.writeFileSync(OUT, js);
  console.log(`Wrote ${path.relative(process.cwd(), OUT)}: ${(js.length / 1024).toFixed(0)} KB`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
