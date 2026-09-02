/* =========================================
   img-rotate.js — Bundle Image Rotate
   ========================================= */
'use strict';

const ImgRotate = (() => {
  let state = { files: [], sortable: null };

  function _render() {
    const grid = document.getElementById('irGrid');
    grid.innerHTML = '';
    state.files.forEach(item => {
      const card = document.createElement('div');
      card.className = 'thumb-card';
      card.setAttribute('data-id', item.id);
      card.innerHTML = `
        <button class="btn-remove-thumb" onclick="ImgRotate.remove('${item.id}')"><i class="fa-solid fa-xmark"></i></button>
        <div class="thumb-card-rot-btns" style="position:absolute;top:.25rem;right:.25rem;display:flex;flex-direction:column;gap:.2rem;z-index:5">
          <button onclick="ImgRotate.rotateSingle('${item.id}',90)" style="width:1.6rem;height:1.6rem;border-radius:50%;border:none;background:#06b6d4;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.65rem"><i class="fa-solid fa-rotate-right"></i></button>
          <button onclick="ImgRotate.rotateSingle('${item.id}',-90)" style="width:1.6rem;height:1.6rem;border-radius:50%;border:none;background:#06b6d4;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.65rem"><i class="fa-solid fa-rotate-left"></i></button>
        </div>
        <div class="thumb-img-wrap"><img src="${item.thumb}" alt="${escapeHTML(item.name)}" style="transform:rotate(${item.angle}deg);transition:transform .3s ease"></div>
        <span class="thumb-name">${escapeHTML(item.name)}</span>`;
      grid.appendChild(card);
    });
    if (state.sortable) state.sortable.destroy();
    state.sortable = new Sortable(grid, { animation: 150, ghostClass: 'sortable-ghost' });
    document.getElementById('irCountText').innerText = `${state.files.length} file`;
    document.getElementById('btnIrProcess').disabled = state.files.length === 0;
  }

  return {
    upload(e) {
      if (!e.target.files.length) return;
      window.showToolbox('page-image-rotate');
      document.getElementById('irDropzone').style.display = 'none';
      document.getElementById('irWorkspace').classList.add('show');
      const files = Array.from(e.target.files);
      let hasError = false;
      files.forEach(file => {
        const validation = window.validateImageFile(file);
        if (!validation.valid) {
          Swal.fire('Peringatan', validation.error, 'warning');
          hasError = true;
          return;
        }
        const reader = new FileReader();
        reader.onload = ev => {
          state.files.push({ id: 'ir_' + Date.now() + Math.random(), fileObj: file, thumb: ev.target.result, name: file.name, angle: 0 });
          _render();
        };
        reader.onerror = function() {
          Swal.fire('Error', 'Gagal membaca file: ' + file.name, 'error');
          hasError = true;
        };
        reader.onabort = function() {
          Swal.fire('Error', 'Pembacaan file dibatalkan: ' + file.name, 'error');
          hasError = true;
        };
        reader.readAsDataURL(file);
      });
      e.target.value = '';
    },

    rotateSingle(id, deg) {
      const item = state.files.find(f => f.id === id);
      if (item) { item.angle = (item.angle + deg) % 360; _render(); }
    },

    rotateAll(deg) {
      state.files.forEach(f => f.angle = (f.angle + deg) % 360);
      _render();
    },

    remove(id) {
      state.files = state.files.filter(f => f.id !== id);
      _render();
      if (state.files.length === 0) this.clear();
    },

    clear() {
      if (state.sortable) { state.sortable.destroy(); }
      state = { files: [], sortable: null };
      window.showHero('page-image-rotate');
      document.getElementById('irDropzone').style.display = '';
      document.getElementById('irWorkspace').classList.remove('show');
      document.getElementById('btnIrProcess').disabled = true;
    },

    async process() {
      if (!state.files.length) return;
      window.showLoader('irLoader');
      window.setLoaderText('irLoaderText', 'Memproses gambar...');

      const rotateBlob = (item) => new Promise(resolve => {
        if (item.angle === 0) { resolve(item.fileObj); return; }
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const abs = Math.abs(item.angle);
          if (abs === 90 || abs === 270) { canvas.width = img.height; canvas.height = img.width; }
          else { canvas.width = img.width; canvas.height = img.height; }
          const ctx = canvas.getContext('2d');
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(item.angle * Math.PI / 180);
          ctx.drawImage(img, -img.width / 2, -img.height / 2);
          const mime = item.fileObj.type === 'image/png' ? 'image/png' : item.fileObj.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
          canvas.toBlob(b => resolve(b), mime, 0.92);
        };
        img.src = item.thumb;
      });

      try {
        if (state.files.length === 1) {
          const item = state.files[0];
          const blob = await rotateBlob(item);
          const ext = item.fileObj.type === 'image/png' ? '.png' : item.fileObj.type === 'image/webp' ? '.webp' : '.jpg';
          window.triggerDownloadModal(item.name.replace(/\.[^/.]+$/, '') + '_rotated', URL.createObjectURL(blob), ext, null);
        } else {
          const zip = new JSZip();
          for (let i = 0; i < state.files.length; i++) {
            const item = state.files[i];
            window.setLoaderText('irLoaderText', `Memproses ${i + 1}/${state.files.length}...`);
            const blob = await rotateBlob(item);
            const ext = item.fileObj.type === 'image/png' ? '.png' : item.fileObj.type === 'image/webp' ? '.webp' : '.jpg';
            zip.file(item.name.replace(/\.[^/.]+$/, '') + '_rotated' + ext, blob);
          }
          window.setLoaderText('irLoaderText', 'Membuat ZIP...');
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          window.triggerDownloadModal('rotated_images', URL.createObjectURL(zipBlob), '.zip', null);
        }
      } catch (err) {
        Swal.fire('Error', err.message, 'error');
      } finally {
        window.hideLoader('irLoader');
      }
    }
  };
})();

window.ImgRotate = ImgRotate;
