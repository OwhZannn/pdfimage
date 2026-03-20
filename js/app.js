/* =========================================
   app.js — Core: Theme, Navigation, Utilities
   ========================================= */
'use strict';



// ─── Navigation ──────────────────────────────────────────────────────────────
let activePage = 'image-compress';

window.showPage = function (pageName, btnEl) {
  activePage = pageName;

  // Deactivate all nav buttons
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  // Hide all pages
  document.querySelectorAll('.page-section').forEach(p => {
    p.classList.remove('active');
  });

  // Show target page
  const target = document.getElementById('page-' + pageName);
  if (target) target.classList.add('active');

  // Special: re-render Sign PDF if returning
  if (pageName === 'pdf-sign' && window._signState?.pdfDoc) {
    setTimeout(() => window.renderSignPage(window._signState.currentPage), 80);
  }
};

/** Hide the hero header and reveal the tool-box in the given section */
window.showToolbox = function (sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  const hero = section.querySelector('.page-hero');
  const toolBox = section.querySelector('.tool-box');
  if (hero) hero.style.display = 'none';
  if (toolBox) toolBox.style.display = '';
};

/** Show the hero header and hide the tool-box in the given section */
window.showHero = function (sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  const hero = section.querySelector('.page-hero');
  const toolBox = section.querySelector('.tool-box');
  if (hero) hero.style.display = '';
  if (toolBox) toolBox.style.display = 'none';
};



// ─── Utilities ────────────────────────────────────────────────────────────────
window.escapeHTML = function (str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
};

window.showLoader = function (id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('hidden'); el.classList.add('show'); }
};

window.hideLoader = function (id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('show'); el.classList.add('hidden'); }
};

window.setLoaderText = function (id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
};

/** Generate PDF page thumbnails using pdf.js */
window.generatePdfThumbnails = async function (file, loaderTextId, maxPages = 0) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const total = pdf.numPages;
  const limit = maxPages > 0 ? Math.min(maxPages, total) : total;
  const thumbs = [];

  for (let i = 1; i <= limit; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 0.4 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    thumbs.push(canvas.toDataURL('image/jpeg', 0.8));
    if (i % 5 === 0) window.setLoaderText(loaderTextId, `Merender ${i} dari ${limit}...`);
  }

  return { thumbs, total };
};

// ─── Download Modal ───────────────────────────────────────────────────────────
let _previewPdf = null;
let _previewPage = 1;

window.triggerDownloadModal = function (defaultName, blobUrl, extension, pdfBytes) {
  const modal = document.getElementById('downloadModal');
  const input = document.getElementById('dlFileName');
  const extSpan = document.getElementById('dlExt');
  const preview = document.getElementById('previewArea');
  const nav = document.getElementById('previewNav');
  const btn = document.getElementById('btnDownload');

  input.value = defaultName;
  extSpan.innerText = extension;
  modal.classList.add('show');

  if (extension === '.pdf' && pdfBytes) {
    nav.classList.add('show');
    preview.innerHTML = '<div style="color:#94a3b8;text-align:center"><i class="fa-solid fa-spinner fa-spin" style="font-size:2rem"></i><br>Memuat preview...</div>';
    pdfjsLib.getDocument({ data: pdfBytes }).promise.then(pdf => {
      _previewPdf = pdf; _previewPage = 1;
      renderDlPage(1);
    }).catch(() => {
      preview.innerHTML = '<p style="color:#f87171">Preview gagal. File tetap bisa diunduh.</p>';
    });
  } else if (extension === '.zip') {
    nav.classList.remove('show');
    preview.innerHTML = `<div style="text-align:center;color:#94a3b8">
      <i class="fa-solid fa-file-zipper" style="font-size:4rem;color:#38bdf8;display:block;margin-bottom:.75rem"></i>
      <strong style="color:${document.documentElement.classList.contains('dark') ? '#e2e8f0' : '#1e293b'}">Arsip ZIP Siap Diunduh</strong>
      <br><small>Berisi file yang berhasil diproses</small></div>`;
  } else {
    nav.classList.remove('show');
    preview.innerHTML = `<img src="${blobUrl}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:.5rem;box-shadow:0 4px 20px rgba(0,0,0,.15)">`;
  }

  btn.onclick = function () {
    let name = (input.value.trim() || 'document').replace(new RegExp(extension.replace('.', '\\.') + '$', 'i'), '');
    const a = document.createElement('a');
    a.href = blobUrl; a.download = name + extension;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    modal.classList.remove('show');
  };
};

async function renderDlPage(n) {
  if (!_previewPdf) return;
  const preview = document.getElementById('previewArea');
  const page = await _previewPdf.getPage(n);
  const h = Math.max(preview.clientHeight, 350);
  const vp1 = page.getViewport({ scale: 1 });
  const scale = Math.min((h - 20) / vp1.height, window.innerWidth / vp1.width, 2.2);
  const vp = page.getViewport({ scale });
  let canvas = document.getElementById('dlPreviewCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'dlPreviewCanvas';
    canvas.style.cssText = 'border-radius:.4rem;box-shadow:0 4px 16px rgba(0,0,0,.2);background:white';
    preview.innerHTML = '';
    preview.appendChild(canvas);
  }
  canvas.width = vp.width; canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  document.getElementById('previewPageTxt').innerText = `${n} / ${_previewPdf.numPages}`;
}

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('btnPrevPage').onclick = () => { if (_previewPage > 1) { _previewPage--; renderDlPage(_previewPage); } };
  document.getElementById('btnNextPage').onclick = () => { if (_previewPdf && _previewPage < _previewPdf.numPages) { _previewPage++; renderDlPage(_previewPage); } };
  document.getElementById('btnCloseDl').onclick = () => document.getElementById('downloadModal').classList.remove('show');

  // Activate first page on load
  window.showPage('image-compress', document.querySelector('.nav-btn'));
});
