/* =========================================
   img-to-pdf.js — Image to PDF Converter
   ========================================= */
'use strict';

const ImgToPdf = (() => {
  let state = { files: [], sortable: null };

  function _render() {
    const grid = document.getElementById('i2pGrid');
    grid.innerHTML = '';
    state.files.forEach(item => {
      const card = document.createElement('div');
      card.className = 'thumb-card';
      card.setAttribute('data-id', item.id);
      card.innerHTML = `
        <button class="btn-remove-thumb" onclick="ImgToPdf.remove('${item.id}')"><i class="fa-solid fa-xmark"></i></button>
        <div class="thumb-img-wrap"><img src="${item.thumb}" alt="${escapeHTML(item.name)}"></div>
        <span class="thumb-name">${escapeHTML(item.name)}</span>`;
      grid.appendChild(card);
    });
    if (state.sortable) state.sortable.destroy();
    state.sortable = new Sortable(grid, { animation: 150, ghostClass: 'sortable-ghost' });
    document.getElementById('btnI2pProcess').disabled = state.files.length === 0;
  }

  return {
    upload(e) {
      if (!e.target.files.length) return;
      window.showToolbox('page-image-to-pdf');
      document.getElementById('i2pDropzone').style.display = 'none';
      const gc = document.getElementById('i2pGridContainer');
      gc.classList.add('show');
      window.showLoader('i2pLoader');
      window.setLoaderText('i2pLoaderText', 'Memuat gambar...');
      let loaded = 0;
      const total = e.target.files.length;
      Array.from(e.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = ev => {
          state.files.push({ id: 'i2p_' + Date.now() + Math.random(), fileObj: file, thumb: ev.target.result, name: file.name });
          loaded++;
          if (loaded === total) { _render(); window.hideLoader('i2pLoader'); }
        };
        reader.readAsDataURL(file);
      });
      e.target.value = '';
    },

    remove(id) {
      state.files = state.files.filter(f => f.id !== id);
      _render();
      if (state.files.length === 0) this.clear();
    },

    clear() {
      state = { files: [], sortable: null };
      window.showHero('page-image-to-pdf');
      document.getElementById('i2pDropzone').style.display = '';
      document.getElementById('i2pGridContainer').classList.remove('show');
      document.getElementById('btnI2pProcess').disabled = true;
    },

    async process() {
      if (!state.files.length) return;
      window.showLoader('i2pLoader');
      window.setLoaderText('i2pLoaderText', 'Membuat PDF...');
      try {
        const ordered = Array.from(document.getElementById('i2pGrid').children).map(n => n.dataset.id);
        const pdfDoc = await PDFLib.PDFDocument.create();
        for (const id of ordered) {
          const item = state.files.find(f => f.id === id);
          if (!item) continue;
          const bytes = await item.fileObj.arrayBuffer();
          let img;
          const t = item.fileObj.type;
          if (t === 'image/jpeg' || t === 'image/jpg') img = await pdfDoc.embedJpg(bytes);
          else if (t === 'image/png') img = await pdfDoc.embedPng(bytes);
          else continue;
          const page = pdfDoc.addPage([img.width, img.height]);
          page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
        }
        const out = await pdfDoc.save();
        window.triggerDownloadModal('images_to_pdf', URL.createObjectURL(new Blob([out], { type: 'application/pdf' })), '.pdf', out);
      } catch (err) {
        Swal.fire('Error', err.message, 'error');
      } finally {
        window.hideLoader('i2pLoader');
      }
    }
  };
})();

window.ImgToPdf = ImgToPdf;
