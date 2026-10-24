// Prints the extension ID that a private key gives a self-hosted package:
//   node scripts/extension-id.js keys/pii-review-assistant.pem
// Chrome derives the ID from the public key, so the same key always gives the
// same ID. Keep the .pem file secret and backed up; never commit it.
'use strict';
const fs = require('fs');
const crypto = require('crypto');

function extensionId(pem) {
  const der = crypto.createPublicKey(pem).export({ type: 'spki', format: 'der' });
  const hex = crypto.createHash('sha256').update(der).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16))).join('');
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node scripts/extension-id.js <key.pem>'); process.exit(1); }
  console.log(extensionId(fs.readFileSync(file, 'utf8')));
}

module.exports = { extensionId };
