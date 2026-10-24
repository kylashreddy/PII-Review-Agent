// Postal codes — OUT OF SCOPE in the team's scope sheet ("pincode is not PII"), so the
// engine only reports them when PIIRA.SETTINGS.reportOutOfScope is on. They are detected
// so that a postal code labeled on the right can be explained as a possible overscrub.
//   - Postal Code: Indian PIN (6 digits) after a PIN keyword or at the end of an address line;
//     US ZIP after a ZIP keyword or a state abbreviation
//   - Brazilian CEP: #####-### (or 8 digits after CEP)
//   - Indonesian Postal Code (kode pos): 5 digits after "Kode Pos"
(function (g) {
  'use strict';
  const P = g.PIIRA;
  const U = P.util;

  const PIN_KW = U.keyed(String.raw`pin(?:[ \t]*code)?|pincode|postal[ \t]+code|post[ \t]+code|zip(?:[ \t]*code)?`,
    String.raw`[1-9]\d{2}[ ]?\d{3}(?!\d)|\d{5}(?:-\d{4})?(?!\d)`);
  // "…, Bengaluru 560001", "Bengaluru - 560 041" at the end of an address
  const PIN_TAIL = /(?<=(?:,[ \t]*[A-Z][a-z]+[ \t]*[,–-]?|\b[A-Z][a-z]+[ \t]*[–-])[ \t]*)[1-9]\d{2}[ ]?\d{3}(?![\d\w])/gd;
  const US_ZIP = /(?<=\b(?:A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])[ \t]+)\d{5}(?:-\d{4})?\b/gd;
  const CEP = /(?<![\w.-])\d{5}-\d{3}(?![\w-])/gd;
  const CEP_KW = U.keyed(String.raw`cep`, String.raw`\d{5}-?\d{3}(?!\d)`);
  const KODEPOS = U.keyed(String.raw`kode[ \t]*pos`, String.raw`\d{5}(?!\d)`);

  function detect(text) {
    return [
      ...U.collect(text, PIN_KW, 'Postal Code', 0.95, 'regex', { group: 1, rule: 'postal-keyword' }),
      ...U.collect(text, PIN_TAIL, 'Postal Code', 0.8, 'regex', { rule: 'postal-pin-tail' }),
      ...U.collect(text, US_ZIP, 'Postal Code', 0.85, 'regex', { rule: 'postal-us-zip' }),
      ...U.collect(text, CEP, 'Brazilian CEP', 0.85, 'regex', { rule: 'cep' }),
      ...U.collect(text, CEP_KW, 'Brazilian CEP', 0.95, 'regex', { group: 1, rule: 'cep-keyword' }),
      ...U.collect(text, KODEPOS, 'Indonesian Postal Code', 0.95, 'regex', { group: 1, rule: 'kodepos-keyword' }),
    ];
  }

  U.register('Postal Code', detect);
})(globalThis);
