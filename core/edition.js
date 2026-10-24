// Which version of the extension this is. 'standard': 13 labels, switching to one label per PII type on
// tasks that list the types. 'types': the "PII Types" version, always one label per type (see labels.js).
// scripts/build.js --edition=types rewrites this line.
(function (g) { (g.PIIRA = g.PIIRA || {}).EDITION = 'standard'; })(globalThis);
