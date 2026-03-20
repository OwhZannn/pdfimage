/* =========================================
   pdf-tools.js — Organize, Merge, Split, Rotate PDF
   ========================================= */
'use strict';

// ── ORGANIZE PDF ──────────────────────────────────────────────────────────────
const PdfOrganize = (() => {
  let state = { pdfFiles: {}, pages: [], sortable: null };

  function _render() {
    const grid = document.getElementById('orgGrid');
    grid.innerHTML = '';
    state.pages.forEach((page, idx) => {
      const card = document.createElement('div');
      card.className = 'thumb-card';
      card.setAttribute('data-id', page.id);
      card.innerHTML = `
        <button class="btn-remove-thumb" onclick="PdfOrganize.removePage('${page.id}')"><i class="fa-solid fa-xmark"></i></button>
        <div class="thumb-img-wrap"><img src="${page.image}" alt="Page ${idx+1}"></div>
        <span class="thumb-badge idx-label">${idx + 1}</span>`;
      grid.appendChild(card);
    });
    if (state.sortable) state.sortable.destroy();
    state.sortable = new Sortable(grid, {
      animation: 150, ghostClass: 'sortable-ghost',
      onEnd() {
        const arr = [];
        grid.querySelectorAll('[data-id]').forEach((el, i) => {
          arr.push(state.pages.find(p => p.id === el.dataset.id));
          el.querySelector('.idx-label').innerText = i + 1;
        });
        state.pages = arr;
      }
    });
    document.getElementById('btnOrgProcess').disabled = state.pages.length === 0;
    if (state.pages.length === 0) clear();
  }

  async function upload(e) {
    if (!e.target.files[0]) return;
    const file = e.target.files[0];
    window.showToolbox('page-pdf-organize');
    document.getElementById('orgDropzone').style.display = 'none';
    window.showLoader('orgLoader'); window.setLoaderText('orgLoaderText', 'Memuat PDF...');
    try {
      const data = await window.generatePdfThumbnails(file, 'orgLoaderText');
      const fid = 'opdf_' + Date.now();
      state.pdfFiles[fid] = { fileObj: file, buffer: await file.arrayBuffer() };
      const newPages = data.thumbs.map((img, i) => ({ id: 'op_' + Date.now() + '_' + i, fileId: fid, originalIndex: i, image: img }));
      state.pages = state.pages.concat(newPages);
      document.getElementById('orgGridContainer').classList.add('show');
      _render();
    } catch { Swal.fire('Error', 'Gagal memuat PDF', 'error'); }
    finally { window.hideLoader('orgLoader'); e.target.value = ''; }
  }

  function removePage(id) {
    state.pages = state.pages.filter(p => p.id !== id);
    _render();
  }

  function clear() {
    state = { pdfFiles: {}, pages: [], sortable: null };
    window.showHero('page-pdf-organize');
    document.getElementById('orgDropzone').style.display = '';
    document.getElementById('orgGridContainer').classList.remove('show');
    document.getElementById('btnOrgProcess').disabled = true;
  }

  async function process() {
    if (!state.pages.length) return;
    window.showLoader('orgLoader'); window.setLoaderText('orgLoaderText', 'Menyusun ulang...');
    try {
      const newPdf = await PDFLib.PDFDocument.create();
      const loaded = {};
      for (const p of state.pages) {
        if (!loaded[p.fileId]) loaded[p.fileId] = await PDFLib.PDFDocument.load(state.pdfFiles[p.fileId].buffer.slice(0));
        const [pg] = await newPdf.copyPages(loaded[p.fileId], [p.originalIndex]);
        newPdf.addPage(pg);
      }
      const out = await newPdf.save();
      window.triggerDownloadModal('organized_document', URL.createObjectURL(new Blob([out], { type: 'application/pdf' })), '.pdf', out);
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
    finally { window.hideLoader('orgLoader'); }
  }

  return { upload, removePage, clear, process };
})();

window.PdfOrganize = PdfOrganize;

// ── MERGE PDF ─────────────────────────────────────────────────────────────────
const PdfMerge = (() => {
  let state = { files: [], sortable: null };

  function _render() {
    const grid = document.getElementById('mergeGrid');
    grid.innerHTML = '';
    state.files.forEach(item => {
      const card = document.createElement('div');
      card.className = 'thumb-card';
      card.setAttribute('data-id', item.id);
      card.innerHTML = `
        <button class="btn-remove-thumb" onclick="PdfMerge.remove('${item.id}')"><i class="fa-solid fa-xmark"></i></button>
        <div class="thumb-img-wrap"><img src="${item.thumb}" alt="${escapeHTML(item.name)}"></div>
        <span class="thumb-name">${escapeHTML(item.name)}</span>`;
      grid.appendChild(card);
    });
    if (state.sortable) state.sortable.destroy();
    state.sortable = new Sortable(grid, { animation: 150, ghostClass: 'sortable-ghost' });
    document.getElementById('btnMergeProcess').disabled = state.files.length < 2;
  }

  async function upload(e) {
    if (!e.target.files.length) return;
    window.showToolbox('page-pdf-merge');
    document.getElementById('mergeDropzone').style.display = 'none';
    window.showLoader('mergeLoader');
    try {
      for (const file of e.target.files) {
        window.setLoaderText('mergeLoaderText', 'Memuat ' + file.name + '...');
        const data = await window.generatePdfThumbnails(file, 'mergeLoaderText', 1);
        state.files.push({ id: 'm_' + Date.now() + Math.random(), fileObj: file, thumb: data.thumbs[0], name: file.name });
      }
      document.getElementById('mergeGridContainer').classList.add('show');
      _render();
    } catch { Swal.fire('Error', 'Gagal memuat PDF', 'error'); }
    finally { window.hideLoader('mergeLoader'); e.target.value = ''; }
  }

  function remove(id) {
    state.files = state.files.filter(f => f.id !== id);
    _render();
    if (state.files.length === 0) clear();
  }

  function clear() {
    state = { files: [], sortable: null };
    window.showHero('page-pdf-merge');
    document.getElementById('mergeDropzone').style.display = '';
    document.getElementById('mergeGridContainer').classList.remove('show');
    document.getElementById('btnMergeProcess').disabled = true;
  }

  async function process() {
    if (state.files.length < 2) return;
    window.showLoader('mergeLoader'); window.setLoaderText('mergeLoaderText', 'Menggabungkan...');
    try {
      const orderedIds = Array.from(document.getElementById('mergeGrid').children).map(n => n.dataset.id);
      const merged = await PDFLib.PDFDocument.create();
      for (const id of orderedIds) {
        const item = state.files.find(f => f.id === id);
        const pdf = await PDFLib.PDFDocument.load(await item.fileObj.arrayBuffer());
        const pages = await merged.copyPages(pdf, pdf.getPageIndices());
        pages.forEach(p => merged.addPage(p));
      }
      const out = await merged.save();
      window.triggerDownloadModal('merged_document', URL.createObjectURL(new Blob([out], { type: 'application/pdf' })), '.pdf', out);
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
    finally { window.hideLoader('mergeLoader'); }
  }

  return { upload, remove, clear, process };
})();

window.PdfMerge = PdfMerge;

// ── SPLIT PDF ─────────────────────────────────────────────────────────────────
const PdfSplit = (() => {
  let state = { file: null, pages: [] };

  function _buildRangeStr(indices) {
    if (!indices.length) return '';
    indices.sort((a, b) => a - b);
    let ranges = [], s = indices[0], e = indices[0];
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] === e + 1) { e = indices[i]; }
      else { ranges.push(s === e ? s : (s + '-' + e)); s = e = indices[i]; }
    }
    ranges.push(s === e ? s : (s + '-' + e));
    return ranges.join(', ');
  }

  function _render(updateInput) {
    const grid = document.getElementById('splitGrid');
    grid.innerHTML = '';
    let selCount = 0, selIdx = [];
    state.pages.forEach((pg, i) => {
      if (pg.selected) { selCount++; selIdx.push(i + 1); }
      const card = document.createElement('div');
      card.className = 'thumb-card' + (pg.selected ? ' selected' : '');
      card.onclick = () => { pg.selected = !pg.selected; _render(true); };
      card.style.cursor = 'pointer';
      card.innerHTML = `
        <div class="thumb-img-wrap"><img src="${pg.image}" alt="Page ${i+1}"></div>
        <span class="thumb-badge${pg.selected ? ' selected-badge' : ''} idx-label">${i + 1}</span>`;
      grid.appendChild(card);
    });
    if (updateInput) document.getElementById('splitRangeInput').value = _buildRangeStr(selIdx);
    document.getElementById('splitCount').innerText = selCount;
    document.getElementById('btnSplitProcess').disabled = selCount === 0;
    _updateSplitInfo();
  }

  function _updateSplitInfo() {
    const merged = document.getElementById('splitMergeCheck').checked;
    const box = document.getElementById('splitInfoBox');
    box.style.display = merged ? 'none' : '';
    if (!merged) {
      const n = state.pages.filter(p => p.selected).length;
      document.getElementById('splitInfoCount').innerText = n + ' PDF';
    }
  }

  async function upload(e) {
    if (!e.target.files[0]) return;
    state.file = e.target.files[0];
    window.showToolbox('page-pdf-split');
    document.getElementById('splitDropzone').style.display = 'none';
    window.showLoader('splitLoader');
    try {
      const data = await window.generatePdfThumbnails(state.file, 'splitLoaderText');
      state.pages = data.thumbs.map((img, i) => ({ originalIndex: i, image: img, selected: false }));
      document.getElementById('splitGridContainer').classList.add('show');
      _render(true);
    } catch { Swal.fire('Error', 'Gagal memuat PDF', 'error'); }
    finally { window.hideLoader('splitLoader'); e.target.value = ''; }
  }

  function handleRangeInput(val) {
    state.pages.forEach(p => p.selected = false);
    if (!val.trim()) { _render(false); return; }
    const total = state.pages.length;
    val.split(',').forEach(part => {
      part = part.trim();
      if (part.includes('-')) {
        const [a, b] = part.split('-').map(Number);
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= total) state.pages[i - 1].selected = true;
      } else {
        const n = parseInt(part);
        if (!isNaN(n) && n >= 1 && n <= total) state.pages[n - 1].selected = true;
      }
    });
    _render(false);
  }

  function clear() {
    state = { file: null, pages: [] };
    window.showHero('page-pdf-split');
    document.getElementById('splitDropzone').style.display = '';
    document.getElementById('splitGridContainer').classList.remove('show');
    document.getElementById('btnSplitProcess').disabled = true;
    document.getElementById('splitRangeInput').value = '';
  }

  async function process() {
    const indices = state.pages.filter(p => p.selected).map(p => p.originalIndex);
    if (!indices.length) return;
    const isMerged = document.getElementById('splitMergeCheck').checked;
    window.showLoader('splitLoader'); window.setLoaderText('splitLoaderText', 'Mengekstrak halaman...');
    try {
      const srcPdf = await PDFLib.PDFDocument.load(await state.file.arrayBuffer());
      if (isMerged) {
        const newPdf = await PDFLib.PDFDocument.create();
        const pages = await newPdf.copyPages(srcPdf, indices);
        pages.forEach(p => newPdf.addPage(p));
        const out = await newPdf.save();
        window.triggerDownloadModal(state.file.name.replace('.pdf', '') + '_extracted', URL.createObjectURL(new Blob([out], { type: 'application/pdf' })), '.pdf', out);
      } else {
        const zip = new JSZip();
        for (let i = 0; i < indices.length; i++) {
          window.setLoaderText('splitLoaderText', `Memisahkan ${i + 1}/${indices.length}...`);
          const pg = await PDFLib.PDFDocument.create();
          const [copied] = await pg.copyPages(srcPdf, [indices[i]]);
          pg.addPage(copied);
          zip.file(`${state.file.name.replace('.pdf', '')}_page_${indices[i] + 1}.pdf`, await pg.save());
        }
        window.setLoaderText('splitLoaderText', 'Membuat ZIP...');
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        window.triggerDownloadModal(state.file.name.replace('.pdf', '') + '_extracted', URL.createObjectURL(zipBlob), '.zip', null);
      }
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
    finally { window.hideLoader('splitLoader'); }
  }

  return { upload, handleRangeInput, clear, process, updateInfo: _updateSplitInfo };
})();

window.PdfSplit = PdfSplit;

// ── ROTATE PDF ────────────────────────────────────────────────────────────────
const PdfRotate = (() => {
  let state = { file: null, pages: [] };

  function _render() {
    const grid = document.getElementById('rotGrid');
    grid.innerHTML = '';
    state.pages.forEach((pg, i) => {
      const card = document.createElement('div');
      card.className = 'thumb-card';
      card.innerHTML = `
        <button onclick="PdfRotate.rotateSingle(${i})" style="position:absolute;top:.25rem;right:.25rem;width:2rem;height:2rem;border-radius:50%;border:none;background:#ef4444;color:white;cursor:pointer;z-index:5;display:flex;align-items:center;justify-content:center;font-size:.8rem">
          <i class="fa-solid fa-rotate-right"></i></button>
        <div class="thumb-img-wrap"><img src="${pg.image}" alt="Page ${i+1}" style="transform:rotate(${pg.angle}deg);transition:transform .3s ease"></div>
        <span class="thumb-badge">${i + 1}</span>`;
      grid.appendChild(card);
    });
  }

  async function upload(e) {
    if (!e.target.files[0]) return;
    state.file = e.target.files[0];
    window.showToolbox('page-pdf-rotate');
    document.getElementById('rotDropzone').style.display = 'none';
    window.showLoader('rotLoader');
    try {
      const data = await window.generatePdfThumbnails(state.file, 'rotLoaderText');
      state.pages = data.thumbs.map((img, i) => ({ originalIndex: i, image: img, angle: 0 }));
      document.getElementById('rotGridContainer').classList.add('show');
      document.getElementById('btnRotProcess').disabled = false;
      _render();
    } catch { Swal.fire('Error', 'Gagal memuat PDF', 'error'); }
    finally { window.hideLoader('rotLoader'); e.target.value = ''; }
  }

  function rotateSingle(i) { state.pages[i].angle = (state.pages[i].angle + 90) % 360; _render(); }
  function rotateAll() { state.pages.forEach(p => p.angle = (p.angle + 90) % 360); _render(); }

  function clear() {
    state = { file: null, pages: [] };
    window.showHero('page-pdf-rotate');
    document.getElementById('rotDropzone').style.display = '';
    document.getElementById('rotGridContainer').classList.remove('show');
    document.getElementById('btnRotProcess').disabled = true;
  }

  async function process() {
    if (!state.file) return;
    window.showLoader('rotLoader'); window.setLoaderText('rotLoaderText', 'Menyimpan rotasi...');
    try {
      const pdfDoc = await PDFLib.PDFDocument.load(await state.file.arrayBuffer());
      const pages = pdfDoc.getPages();
      state.pages.forEach(p => {
        if (p.angle !== 0) {
          const pg = pages[p.originalIndex];
          pg.setRotation(PDFLib.degrees(pg.getRotation().angle + p.angle));
        }
      });
      const out = await pdfDoc.save();
      window.triggerDownloadModal(state.file.name.replace('.pdf', '') + '_rotated', URL.createObjectURL(new Blob([out], { type: 'application/pdf' })), '.pdf', out);
    } catch (err) { Swal.fire('Error', err.message, 'error'); }
    finally { window.hideLoader('rotLoader'); }
  }

  return { upload, rotateSingle, rotateAll, clear, process };
})();

window.PdfRotate = PdfRotate;
