/* =========================================
   pdf-sign.js — Sign PDF (drag & drop tanda tangan)
   ========================================= */
'use strict';

// ─── State (module-level, accessible by all inner funcs) ────────────────────
const _signState = {
  file: null, pdfBytes: null, pdfDoc: null,
  totalPages: 0, currentPage: 1, scale: 1,
  items: [],
  savedSignatures: [],
  savedStamps: [],
  modalType: 'signature',
  modalTab: 'draw',
  padDrawing: false
};

// Load saved sigs safely
try {
  _signState.savedSignatures = JSON.parse(localStorage.getItem('savedSignatures') || '[]');
  _signState.savedStamps = JSON.parse(localStorage.getItem('savedStamps') || '[]');
} catch (e) { /* ignore */ }

window._signState = _signState;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function _signShowLoader(msg) {
  const loader = document.getElementById('signLoader');
  const uploadArea = document.getElementById('signUploadArea');
  loader.querySelector('span').innerText = msg || 'Memuat editor...';
  loader.style.display = 'flex';
  uploadArea.style.display = 'none';
}

function _signHideLoader() {
  document.getElementById('signLoader').style.display = 'none';
}

// ─── Render Gallery (saved signatures/stamps) ─────────────────────────────
function _renderSignGallery() {
  const sigEl = document.getElementById('savedSigsGallery');
  const stEl = document.getElementById('savedStampsGallery');

  if (!sigEl || !stEl) return;

  sigEl.innerHTML = _signState.savedSignatures.length === 0
    ? '<span class="gallery-empty">Belum ada.</span>'
    : _signState.savedSignatures.map((d, i) => `
        <div class="gallery-item" onclick="window.addSavedItemToPage('signature',${i})">
          <img src="${d}" class="sig-img">
          <button class="btn-gallery-remove" onclick="PdfSign.removeSaved('signature',${i},event)"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join('');

  stEl.innerHTML = _signState.savedStamps.length === 0
    ? '<span class="gallery-empty">Belum ada.</span>'
    : _signState.savedStamps.map((d, i) => `
        <div class="gallery-item" onclick="window.addSavedItemToPage('stamp',${i})">
          <img src="${d}" class="stamp-img">
          <button class="btn-gallery-remove" onclick="PdfSign.removeSaved('stamp',${i},event)"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join('');
}

// ─── Build Thumbnails ─────────────────────────────────────────────────────
function _buildThumbs() {
  const c = document.getElementById('signThumbContainer');
  c.innerHTML = '';
  for (let i = 1; i <= _signState.totalPages; i++) {
    const div = document.createElement('div');
    div.className = 'sign-thumb-item' + (i === 1 ? ' active-thumb' : '');
    div.id = 'signThumb_' + i;
    div.onclick = (function(n) { return function() { window.switchSignPage(n); }; })(i);
    const can = document.createElement('canvas');
    can.id = 'signCanvasThumb_' + i;
    const lbl = document.createElement('span');
    lbl.innerText = String(i);
    div.appendChild(can); div.appendChild(lbl);
    c.appendChild(div);
  }
  // Render thumbs async
  (async () => {
    for (let i = 1; i <= _signState.totalPages; i++) {
      if (!_signState.pdfDoc) break;
      const page = await _signState.pdfDoc.getPage(i);
      const vp = page.getViewport({ scale: 0.18 });
      const canvas = document.getElementById('signCanvasThumb_' + i);
      if (!canvas) continue;
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    }
  })();
}

// ─── Render Overlays ──────────────────────────────────────────────────────
function _renderOverlays() {
  const container = document.getElementById('signOverlayContainer');
  if (!container) return;
  container.innerHTML = '';
  _signState.items.filter(it => it.pageNum === _signState.currentPage).forEach(it => {
    const div = document.createElement('div');
    div.className = 'draggable-item';
    div.id = 'drag_' + it.id;
    div.style.cssText = `left:${it.x}px;top:${it.y}px;width:${it.w}px;height:${it.h}px;position:absolute;cursor:move;user-select:none`;

    const img = document.createElement('img');
    img.src = it.dataUrl;
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;pointer-events:none;display:block';

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-handle';
    delBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    delBtn.onclick = function(e) { e.stopPropagation(); _deleteItem(it.id); };

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';

    div.appendChild(img);
    div.appendChild(delBtn);
    div.appendChild(resizeHandle);

    // Drag
    div.addEventListener('mousedown', function(e) {
      if (e.target === resizeHandle || e.target === delBtn || delBtn.contains(e.target)) return;
      e.preventDefault();
      document.querySelectorAll('.draggable-item').forEach(d => d.classList.remove('active'));
      div.classList.add('active');
      const wrapper = document.getElementById('signPageWrapper');
      const wrapRect = wrapper.getBoundingClientRect();
      const startMX = e.clientX, startMY = e.clientY;
      const startX = it.x, startY = it.y;
      function onMove(ev) {
        it.x = Math.max(0, Math.min(startX + ev.clientX - startMX, wrapper.offsetWidth - it.w));
        it.y = Math.max(0, Math.min(startY + ev.clientY - startMY, wrapper.offsetHeight - it.h));
        div.style.left = it.x + 'px'; div.style.top = it.y + 'px';
      }
      function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // Resize
    resizeHandle.addEventListener('mousedown', function(e) {
      e.preventDefault(); e.stopPropagation();
      div.classList.add('active');
      const startX = e.clientX, startW = it.w, startH = it.h;
      const ratio = startH / startW;
      function onMove(ev) {
        it.w = Math.max(40, startW + ev.clientX - startX);
        it.h = it.w * ratio;
        div.style.width = it.w + 'px'; div.style.height = it.h + 'px';
      }
      function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    container.appendChild(div);
  });
}

function _deleteItem(id) {
  _signState.items = _signState.items.filter(it => it.id !== id);
  _renderOverlays();
}

// ─── Render Page ─────────────────────────────────────────────────────────
window.renderSignPage = async function(n) {
  if (!_signState.pdfDoc) return;
  _signState.currentPage = n;
  document.querySelectorAll('.sign-thumb-item').forEach(el => el.classList.remove('active-thumb'));
  const active = document.getElementById('signThumb_' + n);
  if (active) { active.classList.add('active-thumb'); active.scrollIntoView({ block: 'nearest' }); }

  const page = await _signState.pdfDoc.getPage(n);
  const centerPanel = document.getElementById('signCenterPanel');
  const maxW = (centerPanel.clientWidth || 700) * 0.9;
  const maxH = (centerPanel.clientHeight || 600) * 0.9;
  const vp1 = page.getViewport({ scale: 1 });
  _signState.scale = Math.min(maxW / vp1.width, maxH / vp1.height, 1.8);
  const vp = page.getViewport({ scale: _signState.scale });

  const canvas = document.getElementById('signPdfCanvas');
  canvas.width = vp.width; canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

  const wrapper = document.getElementById('signPageWrapper');
  wrapper.style.width = vp.width + 'px';
  wrapper.style.height = vp.height + 'px';
  _renderOverlays();
};

window.switchSignPage = function(n) { window.renderSignPage(n); };

window.clearSignSelection = function(e) {
  const ids = ['signCenterPanel', 'signPageWrapper', 'signPdfCanvas'];
  if (ids.includes(e.target.id) || e.target === document.getElementById('signPdfCanvas')) {
    document.querySelectorAll('.draggable-item').forEach(el => el.classList.remove('active'));
  }
};

// ─── Add Item To Page ────────────────────────────────────────────────────
function _addItemToPage(dataUrl, itemType) {
  const wrapper = document.getElementById('signPageWrapper');
  const img = new Image();
  img.onload = function() {
    const initW = Math.min(160, (wrapper.offsetWidth || 400) * 0.35);
    const ratio = img.naturalHeight / img.naturalWidth || 1;
    _signState.items.push({
      id: 'sg_' + Date.now() + '_' + Math.floor(Math.random() * 9999),
      pageNum: _signState.currentPage,
      itemType: itemType || 'signature',
      dataUrl,
      x: (wrapper.offsetWidth / 2) - (initW / 2),
      y: (wrapper.offsetHeight / 2) - (initW * ratio / 2),
      w: initW, h: initW * ratio
    });
    _renderOverlays();
  };
  img.onerror = function() {
    Swal.fire('Error', 'Gambar tidak valid.', 'error');
  };
  img.src = dataUrl;
}

window.addSignItemToPage = function(dataUrl) { _addItemToPage(dataUrl, 'signature'); };
window.addSavedItemToPage = function(type, idx) {
  const dataUrl = type === 'stamp'
    ? _signState.savedStamps[idx]
    : _signState.savedSignatures[idx];
  if (dataUrl) _addItemToPage(dataUrl, type);
};

// ─── Signature Pad ────────────────────────────────────────────────────────
function _initPad() {
  const canvas = document.getElementById('signaturePadCanvas');
  if (!canvas) return;
  // Size to container
  const area = document.getElementById('sigDrawArea');
  canvas.width = area.offsetWidth || 400;
  canvas.height = area.offsetHeight || 192;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  _signState.padDrawing = false;

  // Mouse
  canvas.onmousedown = function(ev) {
    _signState.padDrawing = true;
    const r = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(ev.clientX - r.left, ev.clientY - r.top);
  };
  canvas.onmousemove = function(ev) {
    if (!_signState.padDrawing) return;
    const r = canvas.getBoundingClientRect();
    ctx.lineTo(ev.clientX - r.left, ev.clientY - r.top);
    ctx.stroke();
  };
  canvas.onmouseup = canvas.onmouseleave = function() { _signState.padDrawing = false; };
  // Touch
  canvas.ontouchstart = function(ev) {
    ev.preventDefault();
    _signState.padDrawing = true;
    const t = ev.touches[0];
    const r = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(t.clientX - r.left, t.clientY - r.top);
  };
  canvas.ontouchmove = function(ev) {
    ev.preventDefault();
    if (!_signState.padDrawing) return;
    const t = ev.touches[0];
    const r = canvas.getBoundingClientRect();
    ctx.lineTo(t.clientX - r.left, t.clientY - r.top);
    ctx.stroke();
  };
  canvas.ontouchend = function() { _signState.padDrawing = false; };
}

// ─── Modal ────────────────────────────────────────────────────────────────
window.openSignModal = function(type) {
  _signState.modalType = type;
  document.getElementById('signModalTitle').innerText =
    type === 'signature' ? 'Tambah Tanda Tangan' : 'Tambah Stempel';
  document.getElementById('signModal').classList.add('show');
  // Reset upload preview
  const prev = document.getElementById('signFilePreview');
  const ph = document.getElementById('signFilePlaceholder');
  if (prev) { prev.src = ''; prev.style.display = 'none'; }
  if (ph) ph.style.display = '';
  const fi = document.getElementById('signFileInput');
  if (fi) fi.value = '';

  // Stamp = upload only, hide Draw tab
  const tabDrawBtn = document.getElementById('tabDraw');
  const tabUploadBtn = document.getElementById('tabUpload');
  if (type === 'stamp') {
    if (tabDrawBtn) tabDrawBtn.style.display = 'none';
    if (tabUploadBtn) tabUploadBtn.style.display = '';
    window.switchSignTab('upload');
  } else {
    if (tabDrawBtn) tabDrawBtn.style.display = '';
    if (tabUploadBtn) tabUploadBtn.style.display = '';
    window.switchSignTab('draw');
  }
};

window.closeSignModal = function() {
  document.getElementById('signModal').classList.remove('show');
};

window.switchSignTab = function(tab) {
  _signState.modalTab = tab;
  const isDraw = (tab === 'draw');
  document.getElementById('tabDraw').classList.toggle('active', isDraw);
  document.getElementById('tabUpload').classList.toggle('active', !isDraw);
  document.getElementById('sigDrawArea').style.display = isDraw ? '' : 'none';
  document.getElementById('sigUploadArea').style.display = isDraw ? 'none' : 'flex';
  document.getElementById('btnClearPad').style.display = isDraw ? '' : 'none';
  if (isDraw) setTimeout(_initPad, 20); // wait for element to be visible
};

window.clearSignaturePad = function() {
  const canvas = document.getElementById('signaturePadCanvas');
  if (!canvas) return;
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
};

window.previewSignUpload = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    const img = document.getElementById('signFilePreview');
    const ph = document.getElementById('signFilePlaceholder');
    img.src = ev.target.result;
    img.style.display = 'block';
    ph.style.display = 'none';
  };
  reader.readAsDataURL(file);
};

window.applySignCreation = function() {
  let dataUrl = null;
  if (_signState.modalTab === 'draw') {
    const canvas = document.getElementById('signaturePadCanvas');
    if (!canvas) { Swal.fire('Error', 'Canvas tidak ditemukan.', 'error'); return; }
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const hasContent = data.some((v, i) => (i % 4 === 3) && v > 0);
    if (!hasContent) {
      Swal.fire('Peringatan', 'Belum ada tanda tangan yang digambar.', 'warning');
      return;
    }
    dataUrl = canvas.toDataURL('image/png');
  } else {
    const img = document.getElementById('signFilePreview');
    if (!img || !img.src || img.style.display === 'none' || img.src === window.location.href) {
      Swal.fire('Peringatan', 'Belum ada file yang dipilih.', 'warning');
      return;
    }
    dataUrl = img.src;
  }

  const save = document.getElementById('saveSignPref').checked;
  if (save) {
    if (_signState.modalType === 'signature') {
      _signState.savedSignatures = _signState.savedSignatures || [];
      _signState.savedSignatures.push(dataUrl);
      try { localStorage.setItem('savedSignatures', JSON.stringify(_signState.savedSignatures)); } catch(e){}
    } else {
      _signState.savedStamps = _signState.savedStamps || [];
      _signState.savedStamps.push(dataUrl);
      try { localStorage.setItem('savedStamps', JSON.stringify(_signState.savedStamps)); } catch(e){}
    }
    _renderSignGallery();
  }
  _addItemToPage(dataUrl, _signState.modalType);
  window.closeSignModal();
};

// ─── Upload PDF ───────────────────────────────────────────────────────────
async function _signUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  _signState.file = file;
  _signState.items = [];
  _signShowLoader('Memuat PDF...');
  
  const hero = document.querySelector('#page-pdf-sign .page-hero');
  if (hero) hero.style.display = 'none';

  try {
    const buf = await file.arrayBuffer();
    _signState.pdfBytes = buf.slice(0);
    _signState.pdfDoc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
    _signState.totalPages = _signState.pdfDoc.numPages;
    _signState.currentPage = 1;

    _buildThumbs();
    _renderSignGallery();

    _signHideLoader();
    document.getElementById('signWorkspace').classList.add('show');

    setTimeout(() => window.renderSignPage(1), 60);
  } catch (err) {
    _signHideLoader();
    window.showHero('page-pdf-sign');
    Swal.fire('Error', 'Gagal memuat PDF: ' + (err.message || err), 'error');
  }
}

// ─── Clear ─────────────────────────────────────────────────────────────────
function _signClear() {
  _signState.file = null;
  _signState.pdfBytes = null;
  _signState.pdfDoc = null;
  _signState.items = [];
  _signState.currentPage = 1;
  _signState.totalPages = 0;

  const workspace = document.getElementById('signWorkspace');
  const upload = document.getElementById('signUploadArea');
  const loader = document.getElementById('signLoader');

  if (workspace) workspace.classList.remove('show');
  if (loader) loader.style.display = 'none';
  
  window.showHero('page-pdf-sign');

  const thumbs = document.getElementById('signThumbContainer');
  if (thumbs) thumbs.innerHTML = '';
  const overlay = document.getElementById('signOverlayContainer');
  if (overlay) overlay.innerHTML = '';
}

// ─── Process / Download ───────────────────────────────────────────────────
async function _signProcess() {
  if (!_signState.pdfBytes) return;
  document.querySelectorAll('.draggable-item').forEach(el => el.classList.remove('active'));

  const btn = document.getElementById('btnSignProcess');
  const origHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
  btn.disabled = true;

  try {
    const pdfDoc = await PDFLib.PDFDocument.load(new Uint8Array(_signState.pdfBytes));

    for (const item of _signState.items) {
      const page = pdfDoc.getPage(item.pageNum - 1);
      const renderedPage = await _signState.pdfDoc.getPage(item.pageNum);
      const vp = renderedPage.getViewport({ scale: 1 });

      // Convert screen coords to PDF coords
      const nativeH = vp.height;
      const tx = item.x / _signState.scale;
      const ty = nativeH - (item.y / _signState.scale) - (item.h / _signState.scale);
      const tw = item.w / _signState.scale;
      const th = item.h / _signState.scale;

      // Fetch image bytes from data URL
      const resp = await fetch(item.dataUrl);
      const imgBytes = await resp.arrayBuffer();

      let emb;
      try {
        emb = await pdfDoc.embedPng(imgBytes);
      } catch (_) {
        try { emb = await pdfDoc.embedJpg(imgBytes); }
        catch (e2) { console.error('Gagal embed gambar:', e2); continue; }
      }

      page.drawImage(emb, { x: tx, y: ty, width: tw, height: th });
    }

    const out = await pdfDoc.save();
    const blob = new Blob([out], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    const baseName = _signState.file.name.replace(/\.pdf$/i, '') + '_signed';
    window.triggerDownloadModal(baseName, blobUrl, '.pdf', out);
  } catch (err) {
    Swal.fire('Error', 'Gagal menyimpan PDF: ' + (err.message || err), 'error');
  } finally {
    btn.innerHTML = origHTML;
    btn.disabled = false;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────
const PdfSign = {
  upload: _signUpload,
  clear:  _signClear,
  process: _signProcess,
  deleteItem: _deleteItem,
  removeSaved: function(type, idx, e) {
    if (e) e.stopPropagation();
    if (type === 'signature') {
      _signState.savedSignatures.splice(idx, 1);
      try { localStorage.setItem('savedSignatures', JSON.stringify(_signState.savedSignatures)); } catch(_e){}
    } else {
      _signState.savedStamps.splice(idx, 1);
      try { localStorage.setItem('savedStamps', JSON.stringify(_signState.savedStamps)); } catch(_e){}
    }
    _renderSignGallery();
  }
};

window.PdfSign = PdfSign;
