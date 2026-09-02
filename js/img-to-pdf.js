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
      const files = Array.from(e.target.files);
      const validFiles = files.filter(file => {
        const validation = window.validateImageFile(file);
        if (!validation.valid) {
          Swal.fire('Peringatan', validation.error, 'warning');
          return false;
        }
        return true;
      });
      if (validFiles.length === 0) {
        window.hideLoader('i2pLoader');
        window.showHero('page-image-to-pdf');
        document.getElementById('i2pDropzone').style.display = '';
        gc.classList.remove('show');
        return;
      }
      let loaded = 0;
      const total = validFiles.length;
      validFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = ev => {
          state.files.push({ id: 'i2p_' + Date.now() + Math.random(), fileObj: file, thumb: ev.target.result, name: file.name });
          loaded++;
          if (loaded === total) { _render(); window.hideLoader('i2pLoader'); }
        };
        reader.onerror = function() {
          Swal.fire('Error', 'Gagal membaca file: ' + file.name, 'error');
          loaded++;
          if (loaded === total) { _render(); window.hideLoader('i2pLoader'); }
        };
        reader.onabort = function() {
          Swal.fire('Error', 'Pembacaan file dibatalkan: ' + file.name, 'error');
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
      if (state.sortable) { state.sortable.destroy(); }
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
        // Read settings
        const pageSize = document.getElementById('i2pPageSizeSelect')?.value || 'fit';
        const orientation = document.getElementById('i2pOrientationSelect')?.value || 'auto';
        const marginMode = document.getElementById('i2pMarginSelect')?.value || 'normal';
        const margin = marginMode === 'none' ? 0 : 36; // points

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
          else if (t === 'image/webp') {
            // Convert WebP to PNG via canvas
            const imgEl = new Image();
            imgEl.src = item.thumb; // data URL from file read
            await new Promise((resolve, reject) => { imgEl.onload = resolve; imgEl.onerror = reject; });
            const canvas = document.createElement('canvas');
            canvas.width = imgEl.naturalWidth; canvas.height = imgEl.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imgEl, 0, 0);
            const pngDataUrl = canvas.toDataURL('image/png');
            const pngBytes = await (await fetch(pngDataUrl)).arrayBuffer();
            img = await pdfDoc.embedPng(pngBytes);
          } else continue;

          // Determine page dimensions
          let pageWidth, pageHeight;
          const imgWidth = img.width;
          const imgHeight = img.height;

          if (pageSize === 'fit') {
            // Existing Fit behavior: page exactly image size, no margin
            pageWidth = imgWidth;
            pageHeight = imgHeight;
          } else {
            // A4 or Letter
            let baseWidth, baseHeight;
            if (pageSize === 'a4') {
              baseWidth = 595.28;
              baseHeight = 841.89;
            } else if (pageSize === 'letter') {
              baseWidth = 612;
              baseHeight = 792;
            } else {
              // fallback to Fit
              pageWidth = imgWidth;
              pageHeight = imgHeight;
              // use Fit behavior
              const page = pdfDoc.addPage([pageWidth, pageHeight]);
              page.drawImage(img, { x: 0, y: 0, width: pageWidth, height: pageHeight });
              continue;
            }
            // Determine orientation
            let isPortrait;
            if (orientation === 'portrait') isPortrait = true;
            else if (orientation === 'landscape') isPortrait = false;
            else { // auto
              isPortrait = imgHeight >= imgWidth; // portrait if height >= width
            }
            if (isPortrait) {
              pageWidth = baseWidth;
              pageHeight = baseHeight;
            } else {
              pageWidth = baseHeight;
              pageHeight = baseWidth;
            }
          }

          // Add page with calculated dimensions
          const page = pdfDoc.addPage([pageWidth, pageHeight]);

          if (pageSize === 'fit') {
            // Existing Fit: draw image at full size
            page.drawImage(img, { x: 0, y: 0, width: pageWidth, height: pageHeight });
          } else {
            // Scale image to fit within (pageWidth - 2*margin) x (pageHeight - 2*margin), preserve ratio, centered
            const maxWidth = pageWidth - 2 * margin;
            const maxHeight = pageHeight - 2 * margin;
            let drawWidth = imgWidth;
            let drawHeight = imgHeight;
            if (maxWidth > 0 && maxHeight > 0) {
              const scaleX = maxWidth / imgWidth;
              const scaleY = maxHeight / imgHeight;
              const scale = Math.min(scaleX, scaleY);
              drawWidth = imgWidth * scale;
              drawHeight = imgHeight * scale;
            }
            const x = (pageWidth - drawWidth) / 2;
            const y = (pageHeight - drawHeight) / 2;
            page.drawImage(img, { x, y, width: drawWidth, height: drawHeight });
          }
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
