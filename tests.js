'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const scripts = ['app.js', 'img-compress.js', 'img-to-pdf.js', 'img-rotate.js', 'pdf-sign.js', 'pdf-tools.js', 'pdf-compress.js'];
for (const script of scripts) {
  assert.ok(fs.existsSync(`js/${script}`), `missing js/${script}`);
  assert.ok(html.includes(`src="js/${script}"`), `index does not load js/${script}`);
}
assert.ok(!html.includes('@latest'), 'CDN URL must be pinned');
for (const url of ['font-awesome/6.4.0', 'sweetalert2@11.26.25', 'browser-image-compression@2.0.2', 'pdf-lib@1.17.1', 'jszip/3.10.1', 'sortablejs@1.15.7', 'pdf.js/3.11.174/pdf.min.js']) {
  const tag = html.slice(html.indexOf(url), html.indexOf(url) + 500);
  assert.ok(tag.includes('integrity='), `missing SRI: ${url}`);
  assert.ok(tag.includes('crossorigin="anonymous"'), `missing CORS mode: ${url}`);
}
const app = fs.readFileSync('js/app.js', 'utf8');
const tools = fs.readFileSync('js/pdf-tools.js', 'utf8');
const sign = fs.readFileSync('js/pdf-sign.js', 'utf8');
for (const [source, needle] of [[app, 'enableFileDrop'], [app, 'closeDownloadModal'], [tools, 'selectAll'], [tools, 'clearSelection'], [tools, 'invertSelection'], [sign, 'renderScale']]) {
  assert.ok(source.includes(needle), `missing safety hook: ${needle}`);
}
console.log('Smoke checks passed.');
