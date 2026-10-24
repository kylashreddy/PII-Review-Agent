// What each L1 / L2 decision means (panel/decisions.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { P } = require('./load');

const D = P.decisions;

test('L1: "Yes" on an unlabeled item means label it; on a wrong label means relabel it', () => {
  const unlabeled = { category: 'PI_TODO', status: 'unlabeled', label: 'Contact Number', group: 'PI', suggest: 'yes' };
  assert.equal(D.outcome(unlabeled, 'L1', 'yes').kind, 'label');
  const wrong = { category: 'PI_TODO', status: 'wrong', label: 'Email Address', rightLabel: 'URL/Link', group: 'PI' };
  assert.match(D.outcome(wrong, 'L1', 'yes').text, /from URL\/Link to Email Address/);
  assert.equal(D.outcome(wrong, 'L1', 'no').kind, 'remove');
  assert.equal(D.outcome(unlabeled, 'L1', 'no').fix, false);
  assert.equal(D.outcome(unlabeled, 'L1', undefined), null);
});

test('L2: Redact/Keep against what the right side did', () => {
  assert.equal(D.outcome({ category: 'LEAKAGE' }, 'L2', 'redact').kind, 'missed');
  assert.equal(D.outcome({ category: 'OVER_REDACTED' }, 'L2', 'keep').kind, 'over');
  assert.equal(D.outcome({ category: 'DATATYPE' }, 'L2', 'redact').kind, 'quality');
  assert.equal(D.outcome({ category: 'REDACTED_OK' }, 'L2', 'redact').fix, false);
  assert.equal(D.outcome({ category: 'LEAKAGE' }, 'L2', 'keep').fix, false);
});

test('questions: only decidable items ask, with buttons for the stage', () => {
  const l1 = D.question({ category: 'CRED_TODO', label: 'Account Number', type: 'Indian IFSC Code', group: 'CRED', suggest: 'yes' }, 'L1');
  assert.equal(l1.ask, 'Is it PII?');
  assert.equal(l1.yes.label, 'Yes, Account Number');
  assert.match(l1.suggestion, /a Credential — label it as Account Number \(Indian IFSC Code\)/);
  assert.equal(D.question({ category: 'LEAKAGE', suggest: 'redact' }, 'L2').yes.key, 'redact');
  assert.equal(D.question({ category: 'TASK' }, 'L2'), null);
  assert.equal(D.question({ category: 'CHECK' }, 'L1'), null);
});

test('summary counts decisions, fixes and confirmed groups', () => {
  const findings = [
    { id: 'a', category: 'PI_TODO', status: 'unlabeled', label: 'Person Name', group: 'PI' },
    { id: 'b', category: 'CRED_TODO', status: 'unlabeled', label: 'Credentials', group: 'CRED' },
    { id: 'c', category: 'NOT_PII', status: 'extra', label: 'Account Number' },
    { id: 'd', category: 'IDENTIFIED', status: 'labeled', label: 'Person Name', group: 'PI' },
  ];
  const t = D.summary(findings, 'L1', new Map([['a', 'yes'], ['b', 'yes'], ['c', 'no']]));
  assert.deepEqual(t.groups, { PI: 1, BI: 0, CRED: 1 });
  assert.equal(t.fix, 3);
  assert.equal(t.kinds.label, 2);
  assert.equal(t.kinds.remove, 1);
  assert.equal(t.open, 1);
});

test('sections: done sections are marked ok and not counted as issues', () => {
  for (const stage of ['L1', 'L2']) {
    for (const s of D.sections(stage)) assert.equal(D.isIssue({ category: s.key }), !s.ok, `${stage} ${s.key}`);
  }
});

test('every finding gets a short status for its one-line summary', () => {
  assert.equal(D.short({ category: 'PI_TODO', status: 'unlabeled' }, 'L1'), 'Not labeled');
  assert.equal(D.short({ category: 'PI_TODO', status: 'wrong', rightLabel: 'URL/Link' }, 'L1'), 'Labeled URL/Link');
  assert.equal(D.short({ category: 'NOT_PII', status: 'extra', knownName: { name: 'Infosys' } }, 'L1'), 'Over-scrubbing');
  assert.equal(D.short({ category: 'LEAKAGE', note: 'Person Name only partly redacted' }, 'L2'), 'Partly redacted');
  assert.equal(D.short({ category: 'OVER_REDACTED', knownName: { name: 'HDFC Bank' } }, 'L2'), 'Over-scrubbing');
  assert.equal(D.short({ category: 'UNKNOWN_TEXT', note: 'Text on the right that is not in the original' }, 'L2'), 'Text added');
  assert.equal(D.suggested({ suggest: 'yes' }, 'L1'), 'yes');
  assert.equal(D.suggested({ suggest: 'keep' }, 'L2'), 'keep');
  assert.equal(D.suggested({ suggest: 'unsure' }, 'L2'), null);
});

test('overview: a brief about the two documents (counts only)', () => {
  const leftText = 'Name: Ravi Kumar\nMobile: 9845012345\nEmail: ravi@gmail.com\nPAN: ABCPE1234F';
  const rightText = 'Name: Raj Mehta\nMobile: 9123456780\nEmail: raj@gmail.com\nPAN: ABCPE1234F';
  const detections = P.engine.run(leftText);
  const b = D.documentBrief({ leftText, rightText, rightLabelCount: 3, detections, l2: { replacedCount: 3, leakedCount: 1 }, taskCheck: null });
  assert.deepEqual(b.left, { words: 9, lines: 4 });
  assert.equal(b.rightLabels, 3);
  assert.equal(b.pii, 4);
  assert.deepEqual(b.groups, { PI: 3, BI: 0, CRED: 1 });
  assert.equal(b.replaced, 3);
  assert.equal(b.leaked, 1);
  assert.equal(b.language, 'English');
  assert.ok(b.structured);
  assert.ok(b.topKinds.length <= 3 && b.topKinds.every((k) => k.count >= 1 && k.name));
  assert.ok(!JSON.stringify(b).includes('Ravi'), 'no document text is kept');
});

test('overview: bucket counts leave out items ticked as reviewed', () => {
  const findings = [
    { id: 'a', category: 'LEAKAGE' }, { id: 'b', category: 'LEAKAGE' }, { id: 'c', category: 'DATATYPE' },
    { id: 'd', category: 'REDACTED_OK' },
  ];
  const rows = D.buckets(findings, 'L2', new Set(['b']));
  const get = (k) => rows.find((r) => r.key === k);
  assert.deepEqual([get('LEAKAGE').open, get('LEAKAGE').total], [1, 2]);
  assert.equal(get('DATATYPE').open, 1);
  assert.equal(get('INCOHERENT').open, 0);
  assert.ok(get('REDACTED_OK').ok);
  assert.equal(rows.length, D.sections('L2').length);
});
