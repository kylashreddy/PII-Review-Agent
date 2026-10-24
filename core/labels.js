// The review site's labels, the PII types that fold into them, colours, and the
// tie-break order used when two detections cover the same text.
//
//  - A LABEL is what the reviewer puts on the right document (the site has 13).
//    Comparison with the right side, highlights and the panel's sections use labels.
//  - A TYPE is what a detector finds ("Indian GSTIN", "Stripe Key"…). Every type
//    belongs to one label; the panel shows the type next to the label.
// Colours here must match highlight.css.
(function (g) {
  'use strict';
  const P = g.PIIRA;

  // group: PI = PII – Personal, BI = PII – Business, CRED = PII – Credentials (highest risk).
  // "Overscrubbed" is a review label, not an entity.
  P.LABELS = [
    { name: 'Person Name', slug: 'person-name', color: '#43a047', group: 'PI' },
    { name: 'Person Username', slug: 'person-username', color: '#fb8c00', group: 'PI' },
    { name: 'Email Address', slug: 'email-address', color: '#1e88e5', group: 'PI' },
    { name: 'Contact Number', slug: 'contact-number', color: '#00897b', group: 'PI' },
    { name: 'Address', slug: 'address', color: '#8e24aa', group: 'PI' },
    { name: 'Date', slug: 'date', color: '#f9a825', group: 'PI' },
    { name: 'URL/Link', slug: 'url-link', color: '#0097a7', group: 'PI' },
    { name: 'Vehicle Number Plate', slug: 'vehicle-number-plate', color: '#7cb342', group: 'PI' },
    { name: 'Business Name', slug: 'business-name', color: '#3949ab', group: 'BI' },
    { name: 'Account Number', slug: 'account-number', color: '#e53935', group: 'CRED' },
    { name: 'Credentials', slug: 'credentials', color: '#ad1457', group: 'CRED' },
    { name: 'IP Address', slug: 'ip-address', color: '#6d4c41', group: 'CRED' },
    { name: 'Overscrubbed', slug: 'overscrubbed', color: '#757575', group: null },
  ];
  P.GROUP_NAMES = { PI: 'PII – Personal', BI: 'PII – Business', CRED: 'PII – Credentials' };
  P.GROUP_SHORT = { PI: 'Personal PII', BI: 'Business PII', CRED: 'a Credential' };

  // Every PII type from the team's list, and the site label it is labeled as.
  // scope 'out': the team's scope sheet says it is NOT PII (dates, postal codes). Their
  // detectors exist but are only reported when P.SETTINGS.reportOutOfScope is on.
  const T = (label, names, scope) => names.map((name) => ({ name, label, scope: scope || 'in' }));
  P.TYPES = [
    ...T('Person Name', ['Person Name']),
    ...T('Person Username', ['Person Username', 'GitHub Username']),
    ...T('Email Address', ['Email Address']),
    ...T('Contact Number', ['Contact Number', 'Indian Mobile Number', 'International Phone Number']),
    ...T('Address', ['Address', 'GPS Coordinates']),
    ...T('Address', ['Postal Code', 'Brazilian CEP', 'Indonesian Postal Code'], 'out'),
    ...T('Date', ['Date', 'Date of Birth'], 'out'),
    ...T('URL/Link', ['URL/Link']),
    ...T('Vehicle Number Plate', ['Vehicle Number Plate', 'Indian Vehicle Number Plate']),
    ...T('Business Name', ['Business Name']),
    ...T('Account Number', ['Account Number', 'Bank Account Number', 'IBAN', 'US Bank Account/Routing Number',
      'Payment Card Number', 'Indian UPI ID', 'Indian IFSC Code', 'Crypto Wallet Address']),
    ...T('IP Address', ['Public IPv4 Address', 'Private IP Address', 'IPv6 Address', 'MAC Address']),
    ...T('Credentials', [
      // government and tax IDs
      'Passport Number', 'Driver Licence Number', 'IMEI Number',
      'Indian Aadhaar Number', 'Indian PAN (Individual)', 'Indian PAN (Business)', 'Indian GSTIN', 'Indian TAN',
      'Indian CIN', 'Indian UAN', 'Indian Voter ID',
      'US Social Security Number', 'US Passport Number', 'US Employer Identification Number', 'US Driver Licence Number',
      'Brazilian CPF', 'Brazilian CNPJ', 'Brazilian RG', 'Brazilian CNH', 'Brazilian PIS/PASEP', 'Brazilian Voter Registration',
      'Indonesian NIK', 'Indonesian Family Card (KK)', 'Indonesian NPWP', 'Indonesian BPJS Number',
      'Indonesian Civil Servant Number (NIP)', 'Indonesian Passport Number', 'Indonesian Driving Licence (SIM)',
      // keys, tokens and passwords
      'Anthropic API Key', 'OpenAI API Key', 'Stripe Key', 'AWS Access Key ID', 'AWS Secret Access Key', 'Google API Key',
      'Slack Token', 'GitHub Token', 'GitLab Token', 'SendGrid Key', 'npm Token', 'PyPI Token', 'Sentry Token',
      'JWT Token', 'Bearer Token', 'Private Key Block', 'Connection URL with Credentials', 'Generic API Key', 'Password',
    ]),
  ];

  // When two detections cover exactly the same length of text, the type that
  // appears earlier in this list wins (more specific first). Types not listed come last.
  P.SPECIFICITY = [
    'Private Key Block', 'Connection URL with Credentials', 'Anthropic API Key', 'OpenAI API Key', 'Stripe Key',
    'AWS Access Key ID', 'Google API Key', 'Slack Token', 'GitHub Token', 'GitLab Token', 'SendGrid Key', 'npm Token',
    'PyPI Token', 'Sentry Token', 'JWT Token', 'AWS Secret Access Key', 'Bearer Token',
    'Email Address', 'Indian UPI ID', 'URL/Link', 'Crypto Wallet Address',
    'Indian GSTIN', 'Indian CIN', 'Brazilian CNPJ', 'Brazilian CPF', 'Brazilian PIS/PASEP', 'Indonesian NPWP',
    'Indonesian Civil Servant Number (NIP)', 'Indonesian Family Card (KK)', 'Indonesian NIK', 'Indonesian BPJS Number',
    'Indonesian Driving Licence (SIM)', 'Indonesian Passport Number', 'Brazilian CNH', 'Brazilian Voter Registration',
    'Brazilian RG', 'US Social Security Number', 'US Employer Identification Number', 'US Passport Number',
    'US Driver Licence Number', 'US Bank Account/Routing Number', 'Indian UAN', 'IMEI Number',
    'IBAN', 'Bank Account Number', 'Payment Card Number', 'Indian IFSC Code', 'Indian PAN (Business)',
    'Indian PAN (Individual)', 'Indian TAN', 'Indian Aadhaar Number', 'Passport Number', 'Driver Licence Number',
    'Indian Voter ID', 'Indian Vehicle Number Plate', 'Vehicle Number Plate', 'Account Number', 'Generic API Key', 'Password',
    'MAC Address', 'IPv6 Address', 'Private IP Address', 'Public IPv4 Address', 'GPS Coordinates',
    'Indian Mobile Number', 'International Phone Number', 'Contact Number', 'GitHub Username', 'Person Username',
    'Date of Birth', 'Date', 'Address', 'Postal Code', 'Brazilian CEP', 'Indonesian Postal Code', 'Business Name', 'Person Name',
  ];

  // Key used in the panel's show/hide set for the RIGHT-side overscrub marks.
  P.RIGHT_OVERSCRUB_KEY = 'Possible overscrub (right)';
  // Key for the marks on names from the business names list (not PII).
  P.KNOWN_NAMES_KEY = 'Known names (not PII)';

  // Project rules.
  P.SETTINGS = {
    // Dates (including dates of birth) and postal codes are out of scope: not reported, and
    // labeling them on the right is reported as a possible overscrub. Turn on to report them.
    reportOutOfScope: false,
    // A trailing PIN code belongs to the multi-line address block it ends (a shipping label's
    // "Kanpur Nagar, Uttar Pradesh - 208011"). Inline addresses and PIN codes on their own still leave it out.
    addressIncludesPin: true,
  };

  // Department / team names. They name a part of an organisation, never a person or a company,
  // so they are never PII ("Field Services", "People Ops"), in any column or sentence.
  P.DEPARTMENTS = new Set(('support|customer support|customer success|customer service|logistics|procurement|purchasing|finance|' +
    'accounts|accounting|accounts payable|accounts receivable|people ops|people operations|people|hr|human resources|talent|' +
    'recruiting|recruitment|field services|field service|field operations|compliance|operations|ops|legal|sales|marketing|' +
    'engineering|it|it services|information technology|admin|administration|facilities|security|information security|' +
    'quality|quality assurance|qa|research|r&d|research and development|product|design|data|analytics|risk|audit|internal audit|' +
    'treasury|payroll|strategy|partnerships|growth|infrastructure|devops|platform|shared services|professional services|' +
    'managed services|technical services|business development|supply chain|warehouse|dispatch|billing|collections|' +
    'customer care|helpdesk|service desk|training|communications|public relations|pr|executive|management').split('|'));
  // Words of invoice, form and table headings ("Goods and Services", "Mode/Terms of Payment",
  // "Delivery Note", "Godown Address"). A phrase made only of these is a heading, never a name or address.
  P.DOC_WORDS = new Set(('goods services service products product items item terms conditions payment payments delivery ' +
    'dispatch shipping shipment note notes mode reference references ref invoice invoices bill billing dated date description ' +
    'quantity qty rate rates amount amounts total totals subtotal tax taxes taxable gst cgst sgst igst hsn sac discount disc ' +
    'charges charge freight order orders purchase sales sale buyer buyers seller sellers consignee consignor supplier suppliers ' +
    'vendor details particulars remarks other others destination dispatched through declaration signature authorised authorized ' +
    'signatory godown warehouse unit units per no number summary balance due price prices value values net gross').split(' '));
  /** Is every word of `text` heading vocabulary ("Goods and Services")? Joiners (and, of, &, /) are ignored. */
  P.isDocPhrase = (text) => {
    const words = String(text || '').toLowerCase().split(/[^a-z]+/).filter((w) => w && !/^(?:and|of|the|for|to|&)$/.test(w));
    return words.length > 0 && words.every((w) => P.DOC_WORDS.has(w));
  };

  /** Is `text` a department / team name ("Field Services", "PEOPLE OPS")? */
  P.isDepartment = (text) => P.DEPARTMENTS.has(String(text || '').toLowerCase().replace(/[\s_]+/g, ' ').replace(/\s+(?:dept|department|team)\.?$/, '').trim());

  // Detections below this confidence are reported as NEEDS REVIEW.
  P.REVIEW_THRESHOLD = 0.7;

  // ------------------------------------------------------------------ label modes
  // 'broad' (default): the site's 13 labels; every type folds into one ("Indian Aadhaar Number" -> Credentials).
  // 'types': tasks whose label list has one label per PII type (the team's "Complete PII Type List": Indian
  //          Aadhaar Number, Stripe Key, Indonesian NIK…). Each type is its own label, coloured and grouped like
  //          the broad label it belongs to, and labels on the right are checked type by type.
  // In 'types' mode a few generic detector types become the type the list names:
  const TYPE_REMAP = {
    'Contact Number': 'International Phone Number',  // landlines, toll-free: "phone number other than an Indian mobile"
    'Account Number': 'Bank Account Number',         // masked or keyword account numbers
  };
  const BROAD_LABELS = P.LABELS.slice();
  const typeByName = new Map(P.TYPES.map((t) => [t.name, t]));
  const broadByName = new Map(BROAD_LABELS.map((l) => [l.name, l]));
  let byName = new Map(broadByName);
  const rank = new Map(P.SPECIFICITY.map((n, i) => [n, i]));
  P.SETTINGS.labelMode = P.SETTINGS.labelMode || 'broad';
  let built = 'broad';   // the mode P.LABELS is built for

  /** The broad (13-label) family of a label or type: "Indian Aadhaar Number" -> "Credentials". */
  P.broadLabel = (name) => (broadByName.has(name) ? name : (typeByName.get(name) || {}).label || name);

  /** Switch label mode ('broad' | 'types'). Rebuilds P.LABELS; returns true when it changed. */
  P.setLabelMode = (mode) => {
    const next = mode === 'types' ? 'types' : 'broad';
    if (next === built) return false;
    built = next;
    P.SETTINGS.labelMode = next;
    if (next === 'broad') {
      P.LABELS = BROAD_LABELS.slice();
    } else {
      const seen = new Set();
      P.LABELS = [];
      for (const grp of ['PI', 'BI', 'CRED']) {
        for (const t of P.TYPES) {
          const parent = broadByName.get(t.label);
          const name = TYPE_REMAP[t.name] || t.name;
          if (parent.group !== grp || seen.has(name)) continue;
          seen.add(name);
          P.LABELS.push({ name, slug: parent.slug, color: parent.color, group: parent.group, parent: parent.name, scope: t.scope });
        }
      }
      // The site's list also keeps the broad labels; they stay valid label names.
      for (const l of BROAD_LABELS) if (!seen.has(l.name)) P.LABELS.push({ ...l, parent: l.name, broad: true });
    }
    byName = new Map(P.LABELS.map((l) => [l.name, l]));
    return true;
  };

  P.labelGroup = (name) => (byName.get(name) || broadByName.get(P.broadLabel(name)) || {}).group || null;
  P.labelInfo = (name) => byName.get(name) || broadByName.get(P.broadLabel(name)) || { name, slug: 'unknown', color: '#9e9e9e' };
  P.typeInfo = (name) => typeByName.get(name) || null;
  /** The label a type is labeled as: its broad label, or in 'types' mode the type itself (a label maps to itself). */
  P.labelOfType = (name) => {
    if (P.SETTINGS.labelMode === 'types') return TYPE_REMAP[name] || name;
    return (typeByName.get(name) || {}).label || name;
  };
  /** Is this type reported with the current settings? Unknown names are. */
  P.typeReported = (name) => {
    const t = typeByName.get(name);
    return !t || t.scope === 'in' || Boolean(P.SETTINGS.reportOutOfScope);
  };
  /** "Credentials (Indian GSTIN)" for a detection or finding with a type, else its label. */
  P.describe = (d) => {
    const base = d.type && d.type !== d.label ? `${d.label} (${d.type})` : d.label;
    // On-device model: say where a suggestion came from.
    if (d.source === 'model') return `${base} [model, ${Math.round(((d.model && d.model.score) || 0) * 100)}%]`;
    if (d.model && !d.model.agrees) return `${base} [model suggests ${d.model.label}, ${Math.round(d.model.score * 100)}%]`;
    // Information only: many private people share a famous name.
    if (d.kb && d.kb.publicFigure) return `${base} [also a public figure]`;
    return base;
  };
  P.specificityRank = (name) => (rank.has(name) ? rank.get(name) : P.SPECIFICITY.length);
})(globalThis);
