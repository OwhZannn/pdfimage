# PDF & Image Tools

Alat PDF dan gambar yang memproses file sepenuhnya di browser; file tidak diunggah ke server aplikasi.

## Jalankan

Jalankan melalui HTTP(S), bukan `file://`, agar PDF worker dan browser security policy bekerja konsisten:

```sh
python3 -m http.server 8080
```

Buka `http://localhost:8080`.

## Verifikasi

```sh
node tests.js
for file in js/*.js; do node --check "$file"; done
```

## Batasan PDF Compress

Fitur Compress PDF merender setiap halaman menjadi JPEG. Teks tidak lagi dapat dipilih/dicari; anotasi dan formulir dapat hilang, dan ukuran hasil pada PDF tertentu dapat lebih besar.
