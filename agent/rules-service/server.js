#!/usr/bin/env node
// PII rules service: the extension's engine behind a small JSON interface.
//   node server.js                 JSON lines on stdin/stdout: {"id", "method", "params"} -> {"id", "result"|"error"}
//   node server.js --http [port]   POST /rpc with the same body; GET /health. Binds to 127.0.0.1 unless RULES_HOST is set.
// Errors never carry document text: only the method, the error kind and a fixed message.
'use strict';
const readline = require('readline');
const { METHODS, BadRequest } = require('./src/methods');

function call(req) {
  const id = req && req.id !== undefined ? req.id : null;
  const fn = req && Object.prototype.hasOwnProperty.call(METHODS, req.method) ? METHODS[req.method] : null;
  if (!fn) return { id, error: { code: 'unknown_method', message: 'unknown method' } };
  const t0 = process.hrtime.bigint();
  try {
    const result = fn(req.params || {});
    return { id, result, ms: Number(process.hrtime.bigint() - t0) / 1e6 };
  } catch (err) {
    if (err instanceof BadRequest) return { id, error: { code: 'bad_request', message: err.message } };
    // An engine error may quote the document in its message: report only its kind.
    process.stderr.write(JSON.stringify({ level: 'error', method: req.method, error: err && err.name }) + '\n');
    return { id, error: { code: 'internal', message: `${err && err.name} in ${req.method}` } };
  }
}

function serveStdio() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let req;
    try { req = JSON.parse(line); } catch (e) {
      process.stdout.write(JSON.stringify({ id: null, error: { code: 'bad_json', message: 'request is not JSON' } }) + '\n');
      return;
    }
    process.stdout.write(JSON.stringify(call(req)) + '\n');
  });
  rl.on('close', () => process.exit(0));
}

function serveHttp(port) {
  const http = require('http');
  const MAX = 32 * 1024 * 1024;
  const server = http.createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true, version: METHODS.version() });
    if (req.method !== 'POST' || req.url !== '/rpc') return send(404, { error: { code: 'not_found' } });
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX) { send(413, { error: { code: 'too_large' } }); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => {
      if (size > MAX) return;
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) {
        return send(400, { id: null, error: { code: 'bad_json', message: 'request is not JSON' } });
      }
      const out = call(body);
      send(out.error ? (out.error.code === 'internal' ? 500 : 400) : 200, out);
    });
  });
  server.listen(port, process.env.RULES_HOST || '127.0.0.1');
}

if (require.main === module) {
  const i = process.argv.indexOf('--http');
  if (i >= 0) serveHttp(Number(process.argv[i + 1] || process.env.RULES_PORT || 8790));
  else serveStdio();
}

module.exports = { call };
