/* =========================================
   img-compress.js — Bundle Image Compress
   ========================================= */
'use strict';

const ImgCompress = (() => {
  let state = { files: [], sortable: null, level: 'medium', originalSize: 0 };

  function _qualityFromLevel(level) {
    const map = { low: 0.92, medium: 0.75, high: 0.50, extreme: 0.28 };
    return map[level] ?? 0.75;
  }

  function _maxSizeFromLevel(level) {
    // maxSizeMB passed to imageCompression
    const map = { low: 0.8, medium: 0.4, high: 0.2, extreme: 0.1 };
    return map[level] ?? 0.4;
  }

  function _setLevel(level) {
    state.level = level;
    document.querySelectorAll('.ic-level-card').forEach(el => {
      el.classList.toggle('active', el.dataset.level === level);
    });
  }

  function _sizeStr(bytes) {
    if (bytes > 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
    return (bytes / 1024).toFixed(1) + ' KB';
  }

  function _render() {
    const grid = document.getElementById('icGrid');
    grid.innerHTML = '';
    state.files.forEach(item => {
      const card = document.createElement('div');
      card.className = 'thumb-card';
      card.setAttribute('data-id', item.id);
      card.innerHTML = `
        <button class="btn-remove-thumb" onclick="ImgCompress.remove('${item.id}')"><i class="fa-solid fa-xmark"></i></button>
        <div class="thumb-img-wrap"><img src="${item.thumb}" alt="${escapeHTML(item.name)}"></div>
        <span class="thumb-name">${escapeHTML(item.name)}</span>
        <span class="thumb-sub">${_sizeStr(item.fileObj.size)}</span>
        ${item.compressedBlob ? `
          <div style="font-size:0.7rem;font-weight:700;color:#10b981;margin-top:0.2rem">New Size: ${_sizeStr(item.compressedBlob.size)}</div>
          <button class="btn-primary" style="margin-top:0.4rem;padding:0.3rem;font-size:0.75rem;width:100%" onclick="ImgCompress.downloadItem('${item.id}')"><i class="fa-solid fa-download"></i> Download</button>
        ` : ''}`;
      grid.appendChild(card);
    });

    if (state.sortable) state.sortable.destroy();
    state.sortable = new Sortable(grid, { animation: 150, ghostClass: 'sortable-ghost' });

    document.getElementById('icCountText').innerText = `${state.files.length} file`;
    document.getElementById('btnIcProcess').disabled = state.files.length === 0;
    
    let totalSize = 0;
    state.files.forEach(f => totalSize += f.fileObj.size);
    state.originalSize = totalSize;
  }

  function _showWorkspace() {
    document.getElementById('icDropzone').classList.remove('show') || document.getElementById('icDropzone').style.setProperty('display', 'none');
    document.getElementById('icDropzone').style.display = 'none';
    document.getElementById('icWorkspace').classList.add('show');
  }

  return {
    upload(e) {
      if (!e.target.files.length) return;
      window.showToolbox('page-image-compress');
      document.getElementById('icDropzone').style.display = 'none';
      document.getElementById('icWorkspace').classList.add('show');
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
          state.files.push({ id: 'ic_' + Date.now() + Math.random(), fileObj: file, thumb: ev.target.result, name: file.name });
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

    remove(id) {
      state.files = state.files.filter(f => f.id !== id);
      _render();
      if (state.files.length === 0) this.clear();
    },

    clear() {
      if (state.sortable) { state.sortable.destroy(); }
      state = { files: [], sortable: null, level: state.level, originalSize: 0 };
      window.showHero('page-image-compress');
      document.getElementById('icDropzone').style.display = '';
      document.getElementById('icWorkspace').classList.remove('show');
      document.getElementById('icGrid').innerHTML = '';
      document.getElementById('icCountText').innerText = '0 file';
      document.getElementById('btnIcProcess').disabled = true;
      document.getElementById('btnIcDownloadAll').style.display = 'none';
    },

    async process() {
      if (!state.files.length) return;
      const quality = _qualityFromLevel(state.level);
      const maxSizeMB = _maxSizeFromLevel(state.level);
      // Read dimension and format settings
      const dimSelect = document.getElementById('icMaxDimSelect');
      const formatSelect = document.getElementById('icFormatSelect');
      const maxDim = dimSelect ? dimSelect.value : '1920';
      const format = formatSelect ? formatSelect.value : 'auto'; // auto means keep original
      window.showLoader('icLoader');
      window.setLoaderText('icLoaderText', 'Memproses...');
      try {
        const opts = {
          maxSizeMB,
          useWebWorker: true,
          initialQuality: quality
        };
        if (maxDim !== '0') {
          opts.maxWidthOrHeight = parseInt(maxDim, 10);
        }
        // A value of 0 means no dimension cap.
        if (format === 'jpeg') {
          opts.fileType = 'image/jpeg';
        }
        let totalOut = 0;
        
        if (state.files.length === 1) {
          const item = state.files[0];
          window.setLoaderText('icLoaderText', `Mengompresi ${item.name}...`);
          const compressed = await imageCompression(item.fileObj, opts);
          totalOut += compressed.size;
          item.compressedBlob = compressed;
          item.outputType = compressed.type || (format === 'jpeg' ? 'image/jpeg' : item.fileObj.type);
        } else {
          for (let i = 0; i < state.files.length; i++) {
            const item = state.files[i];
            window.setLoaderText('icLoaderText', `Mengompresi ${i + 1}/${state.files.length}...`);
            const compressed = await imageCompression(item.fileObj, opts);
            totalOut += compressed.size;
            item.compressedBlob = compressed;
            item.outputType = compressed.type || (format === 'jpeg' ? 'image/jpeg' : item.fileObj.type);
          }
        }
        
        document.getElementById('btnIcDownloadAll').style.display = '';
        _render();
        window.hideLoader('icLoader');
        // Optional: show success with size reduction
        const totalIn = state.originalSize;
        const reduction = totalIn > 0 ? ((1 - totalOut / totalIn) * 100).toFixed(1) : 0;
        Swal.fire('Sukses', `Kompresi selesai! Total ukuran berkurang ${reduction}%.`, 'success');
      } catch (err) {
        Swal.fire('Error', err.message, 'error');
        window.hideLoader('icLoader');
      }
    },

    setLevel: _setLevel,
    
    downloadItem(id) {
      const item = state.files.find(f => f.id === id);
      if (!item || !item.compressedBlob) return;
      const type = item.outputType || item.fileObj.type;
      let ext;
      if (type === 'image/jpeg' || type === 'image/jpg') ext = '.jpg';
      else if (type === 'image/png') ext = '.png';
      else if (type === 'image/webp') ext = '.webp';
      else ext = '.bin';
      const name = item.name.replace(/\.[^/.]+$/, '') + '_compressed' + ext;
      const a = document.createElement('a');
      const url = URL.createObjectURL(item.compressedBlob);
      a.href = url;
      a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    async downloadAll() {
      if (!state.files.length) return;
      if (state.files.length === 1 && state.files[0].compressedBlob) {
        this.downloadItem(state.files[0].id);
        return;
      }
      window.showLoader('icLoader');
      window.setLoaderText('icLoaderText', 'Membuat ZIP...');
      try {
        const zip = new JSZip();
        let hasItems = false;
        for (const item of state.files) {
          if (!item.compressedBlob) continue;
          hasItems = true;
          const type = item.outputType || item.fileObj.type;
          let ext;
          if (type === 'image/jpeg' || type === 'image/jpg') ext = '.jpg';
          else if (type === 'image/png') ext = '.png';
          else if (type === 'image/webp') ext = '.webp';
          else ext = '.bin';
          zip.file(item.name.replace(/\.[^/.]+$/, '') + '_compressed' + ext, item.compressedBlob);
        }
        if (!hasItems) throw new Error('Belum ada gambar yang dikompresi!');
        const blob = await zip.generateAsync({ type: 'blob' });
        window.triggerDownloadModal('compressed_images', URL.createObjectURL(blob), '.zip', null);
      } catch (err) {
        Swal.fire('Error', err.message, 'error');
      } finally {
        window.hideLoader('icLoader');
      }
    }
  };
})();

window.ImgCompress = ImgCompress;
