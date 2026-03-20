/* =========================================
   pdf-compress.js — Compress PDF
   ========================================= */
'use strict';

const PdfCompress = (() => {
  let state = { file: null, originalSize: 0, level: 'medium' };

  // ── Internal helpers ──────────────────────────────────────────────────────
  function _fmtSize(bytes) {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function _qualityFromLevel(level) {
    const map = { low: 0.92, medium: 0.72, high: 0.48, extreme: 0.28 };
    return map[level] ?? 0.72;
  }

  function _scaleFromLevel(level) {
    // render scale for pdfjsLib — lower = smaller output
    const map = { low: 1.5, medium: 1.2, high: 1.0, extreme: 0.85 };
    return map[level] ?? 1.2;
  }

  // ── Level selector ────────────────────────────────────────────────────────
  function _setLevel(level) {
    state.level = level;
    document.querySelectorAll('.pc-level-card').forEach(el => {
      el.classList.toggle('active', el.dataset.level === level);
    });
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    state.file = file;
    state.originalSize = file.size;
    window.showToolbox('page-pdf-compress');
    document.getElementById('pcDropzone').style.display = 'none';
    document.getElementById('pcWorkspace').classList.add('show');
    document.getElementById('pcOriginalSize').textContent = _fmtSize(file.size);
    document.getElementById('pcResultSize').textContent = '—';
    document.getElementById('pcRatio').textContent = '—';
    document.getElementById('pcRatio').style.color = '';
    document.getElementById('pcFileName').textContent = file.name;
    document.getElementById('btnPcProcess').disabled = false;
    e.target.value = '';
  }

  // ── Compress ──────────────────────────────────────────────────────────────
  async function process() {
    if (!state.file) return;
    const level = state.level;
    const quality = _qualityFromLevel(level);
    const scale = _scaleFromLevel(level);

    window.showLoader('pcLoader');
    window.setLoaderText('pcLoaderText', 'Memuat PDF...');

    try {
      const buf = await state.file.arrayBuffer();
      const pdfSrc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
      const total = pdfSrc.numPages;

      const newPdf = await PDFLib.PDFDocument.create();

      for (let i = 1; i <= total; i++) {
        window.setLoaderText('pcLoaderText', `Kompresi halaman ${i} / ${total}...`);

        // Render via pdf.js to canvas
        const page = await pdfSrc.getPage(i);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

        // Convert to JPEG bytes
        const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
        const jpegBase64 = jpegDataUrl.split(',')[1];
        const jpegBytes = Uint8Array.from(atob(jpegBase64), c => c.charCodeAt(0));

        // Original page dimensions (in PDF points = 1/72 inch)
        const origVp = page.getViewport({ scale: 1 });
        const pageW = origVp.width;
        const pageH = origVp.height;

        // Embed JPEG and draw full-page
        const jpgImg = await newPdf.embedJpg(jpegBytes);
        const pdfPage = newPdf.addPage([pageW, pageH]);
        pdfPage.drawImage(jpgImg, { x: 0, y: 0, width: pageW, height: pageH });
      }

      window.setLoaderText('pcLoaderText', 'Menyimpan PDF...');
      const out = await newPdf.save();
      const outSize = out.byteLength;

      // Update stats
      const ratio = ((1 - outSize / state.originalSize) * 100).toFixed(1);
      document.getElementById('pcResultSize').textContent = _fmtSize(outSize);
      const ratioEl = document.getElementById('pcRatio');
      ratioEl.textContent = Number(ratio) >= 0 ? `↓ ${ratio}%` : `↑ ${Math.abs(ratio)}%`;
      ratioEl.style.color = Number(ratio) >= 0 ? '#10b981' : '#f59e0b';

      state.compressedBytes = out;
      document.getElementById('btnPcDownload').style.display = '';
    } catch (err) {
      Swal.fire('Error', err.message || 'Gagal mengompresi PDF', 'error');
    } finally {
      window.hideLoader('pcLoader');
    }
  }

  // ── Clear ─────────────────────────────────────────────────────────────────
  function clear() {
    state = { file: null, originalSize: 0, level: state.level };
    window.showHero('page-pdf-compress');
    document.getElementById('pcDropzone').style.display = '';
    document.getElementById('pcWorkspace').classList.remove('show');
    document.getElementById('btnPcProcess').disabled = true;
    document.getElementById('pcInput').value = '';
    document.getElementById('pcResultSize').textContent = '—';
    document.getElementById('pcRatio').style.color = '';
    document.getElementById('btnPcDownload').style.display = 'none';
    state.compressedBytes = null;
  }

  function download() {
    if (!state.compressedBytes) return;
    const baseName = state.file.name.replace(/\\.pdf$/i, '');
    window.triggerDownloadModal(
      baseName + '_compressed',
      URL.createObjectURL(new Blob([state.compressedBytes], { type: 'application/pdf' })),
      '.pdf',
      state.compressedBytes
    );
  }

  return { upload, process, clear, _setLevel, download };
})();

window.PdfCompress = PdfCompress;
