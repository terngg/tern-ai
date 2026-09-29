# Tern AI

[![CI](https://github.com/terngg/tern-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/terngg/tern-ai/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 22.16+](https://img.shields.io/badge/Node.js-%3E%3D22.16-339933.svg)](package.json)

**A terminal AI coding assistant for GTPS Hosting Lua.** Local documentation, Gemini + OpenRouter, multi-key failover, and local validation before saving generated scripts.

[Get started](#instalasi) · [Commands](#commands) · [Contribute](CONTRIBUTING.md) · [Roadmap](ROADMAP.md) · [Releases](https://github.com/terngg/tern-ai/releases) · [Discussions](https://github.com/terngg/tern-ai/discussions)

Tern AI adalah coding assistant terminal untuk **Lua pada engine GTPS Hosting yang didokumentasikan di project ini**. Menggunakan **Google Gemini → OpenRouter** secara otomatis, dengan rotasi beberapa API key per provider dan perilaku free-first. Tidak ada web app, GUI, atau pemindaian repository otomatis.

## Fitur

- Generate, fix dengan diff, review, explain, dan chat dengan context selama sesi.
- Streaming Gemini dan OpenRouter, pembatalan Ctrl+C, timeout, error provider yang dinormalisasi.
- Multi-key, round-robin, cooldown per key, serta fallback Gemini → OpenRouter.
- `auth add/list/remove/test`, provider mode/priority, dan status lokal tanpa jaringan.
- Knowledge base lokal **485 entri / 483 nama unik**, mencakup overload dan catatan.
- Retrieval nama fungsi, keyword, dan konsep Bahasa Indonesia tanpa vector database.
- Generate dialog memakai syntax dan tema dari C++ `sourcecppalbin/`, dengan API Lua `player:onDialogRequest` dan `onPlayerDialogCallback`. Referensinya dibundel di `docs/gtps-lua-api.md`, jadi tetap tersedia setelah instalasi npm tanpa folder source C++.
- Pemisahan API live, extension, stub, dan callback yang tidak dispatched.
- Parser syntax Lua, pemeriksaan API melalui AST, dan maksimal dua repair otomatis.
- Model gratis dinamis berdasarkan metadata harga; cache enam jam dan fallback gratis.
- File output dilindungi dari overwrite; tidak menjalankan kode Lua yang dihasilkan.

## Instalasi

Memerlukan **Node.js 22.16+**, disarankan Node.js 24 LTS. Mendukung Linux, macOS, dan Windows PowerShell.

Package bernama `tern-ai` menyediakan binary `tern`. Project tersedia di GitHub; **belum dipublikasikan ke npm registry**. Instal dari source:

```sh
git clone https://github.com/terngg/tern-ai.git
cd tern-ai
npm ci
npm run build
npm link
tern --help
```

Alternatif tanpa global link: `node dist/index.js --help` atau `npm run dev -- --help`.
Untuk instalasi artifact lokal, jalankan `npm pack`, lalu `npm install -g ./tern-ai-0.2.1.tgz`.

## Providers dan setup

Buat key milik Anda di [Google AI Studio](https://aistudio.google.com/api-keys) dan/atau [OpenRouter](https://openrouter.ai/keys). Setup dengan input tersembunyi:

```sh
tern auth add gemini
tern auth add gemini
tern auth add openrouter
tern auth list
tern provider set auto
tern doctor
tern
```

`tern auth` membuka menu interaktif. Penambahan berikutnya membuat credential baru, bukan menimpa credential sebelumnya. Key duplikat ditolak dengan ID credential yang sudah ada. ID tersimpan seperti `gemini-1`, `gemini-2`, `openrouter-1` stabil setelah restart; penghapusan tidak menomori ulang ID lain.

```sh
tern auth test                  # semua key, hanya metadata, tanpa generation
tern auth test gemini
tern auth test openrouter-1
tern auth remove gemini-2       # konfirmasi interaktif
tern auth remove gemini-2 --yes # automation
tern auth status               # command lama tetap tersedia
tern auth logout               # hapus key OpenRouter tersimpan; Gemini tetap ada
```

`auth test` memeriksa akses model Gemini via SDK `models.get`; OpenRouter via `/key` dan `/models`. Keberhasilan metadata bukan jaminan kuota generation. Tidak ada token generation yang digunakan. Tanpa credential untuk provider aktif, generation keluar dengan petunjuk setup.

### Multiple API keys melalui environment

```sh
export GEMINI_API_KEY_1="<gemini-key-1>"
export GEMINI_API_KEY_2="<gemini-key-2>"
export GEMINI_API_KEY_3="<gemini-key-3>"
export OPENROUTER_API_KEY_1="<openrouter-key-1>"
export OPENROUTER_API_KEY_2="<openrouter-key-2>"
```

`GEMINI_API_KEY` dan `OPENROUTER_API_KEY` lama juga didukung. Tidak ada batas jumlah key yang ditetapkan Tern; suffix integer positif `_1`, `_2`, … diurutkan numerik. Hanya nama exact tersebut dipindai, bukan variable lain yang kebetulan memiliki prefix mirip. Di PowerShell gunakan `$env:GEMINI_API_KEY_1="<key>"`.

Urutan awal per provider: variable tanpa suffix → variable bernomor → credential tersimpan. Semua key unik masuk pool; env tidak menonaktifkan key tersimpan yang berbeda. Nilai sama pada env/env atau env/stored hanya dicoba sekali, dengan source environment diprioritaskan. Key environment memiliki ID stabil berdasarkan nama, misalnya `gemini-env-default` atau `gemini-env-2`; jika nilainya sama dengan credential tersimpan, ID tersimpan dipakai. Hapus key env dengan `unset` di shell. Env tidak pernah otomatis ditulis ke disk.

Multiple keys ditujukan untuk quota/failover yang sah pada credential milik atau yang diotorisasi pengguna. Hormati rate limit dan kebijakan provider. Key dalam project/account sama bisa berbagi kuota; menambah key tidak menjamin tambahan kapasitas dan bukan cara menghindari pembatasan provider.

### Provider mode, fallback, dan status

```sh
tern provider                  # mode dan prioritas
tern provider set gemini       # hanya Gemini
tern provider set openrouter   # hanya OpenRouter
tern provider set auto         # alias: tern provider auto
tern config set providerPriority '["gemini","openrouter"]'
tern status                    # lokal; tidak menghubungi provider
tern status --live             # pemeriksaan metadata provider
tern generate "buat /daily" --verbose
```

Default `auto` mencoba semua key Gemini yang sehat, lalu semua key OpenRouter yang sehat. Round-robin berlaku antar-request dalam proses/chat yang sama. Setiap attempt menggunakan satu key; key yang telah dicoba tidak diputar lagi dalam request tersebut. Pemulihan stream Gemini: jika output buffered (`--raw`/file/non-TTY) terputus sebelum penanda selesai, Tern membuang draft dan mencoba sekali dengan key yang sama lewat respons non-streaming. Budget satu kali ini berlaku untuk seluruh request, bukan per key. Tidak berlaku untuk auth/quota, pembatalan, atau draft yang tampil secara streaming; konfigurasi `stream` tidak diubah.

Pengecualian kompatibilitas terbatas: jika hanya ada satu key aktif untuk `openrouter/free`, kegagalan transport/server pada output buffered dapat dicoba sekali tanpa streaming.

HTTP 429/quota memberi cooldown hanya pada key yang gagal: `Retry-After` atau retry delay Gemini dihormati; tanpa informasi tersebut, 30/60/120 detik. Tern tidak tidur lalu berputar tanpa batas. HTTP 401/invalid key dinonaktifkan selama proses. Billing/permission memblokir credential selama proses. Timeout/network/server berpindah secara terbatas ke key berikutnya. Model hilang melewati provider tersebut tanpa menyalahkan key. Bad request berhenti; Ctrl+C menghentikan seluruh retry/fallback.

Normal mode menampilkan fallback provider seperlunya. `--verbose` menampilkan provider, model, ID credential, dan attempt, tanpa key. Jika draft terminal sudah tampil saat stream gagal, penanda menyatakan draft dibuang sebelum respons pengganti. `--raw`/file hanya menerima satu hasil akhir yang tervalidasi, bukan gabungan partial attempts.

`status` dan `auth list` tidak melakukan health check jaringan. Status awal `ready` berarti belum ditolak pada proses saat ini; cooldown/invalid counters tidak disimpan setelah proses keluar. `doctor` keluar `0` bila komponen lokal valid dan sekurangnya satu provider yang diizinkan berhasil diakses, atau `1` bila tidak ada provider usable/komponen kritis rusak. Provider lain yang gagal menjadi warning. `doctor --offline` hanya menilai konfigurasi lokal, bukan membuktikan connectivity atau kuota generation.

## Quick start

```sh
tern "buat /daily yang kasih 5 WL"
tern generate "buat daily reward 5 WL cooldown 24 jam" -o daily.lua
tern generate "buat command /balance untuk gems" --raw > balance.lua
tern fix bank.lua
tern fix bank.lua --write
tern review bank.lua
tern explain bank.lua
tern chat bank.lua
tern -f bank.lua -f config.lua
```

`--raw` hanya mengeluarkan **Lua yang lolos validasi statis** ke stdout. Progress dimatikan; warning/error tetap ke stderr. Dengan `--raw --verbose`, diagnostik provider/retry juga ke stderr, sementara stdout tetap hanya Lua final. Output sengaja dibuffer sampai streaming, validasi, dan repair selesai supaya draf invalid tidak tercampur dalam file shell. Dalam terminal biasa, draf muncul secara streaming, lalu diperiksa; perhatikan warning dan hasil repair terakhir.

`-o` menolak file yang sudah ada. Tambahkan `--force` untuk overwrite. `fix` menampilkan unified diff secara default; `--write` menerapkan setelah validasi dan pemeriksaan bahwa file asal belum berubah. Penulisan pengganti menggunakan temporary file di direktori yang sama dan rename. Symlink output ditolak.

## Commands

| Command | Kegunaan |
| --- | --- |
| `tern` / `tern chat [files...]` | Chat interaktif |
| `tern "prompt"` | Alias generate |
| `tern generate "prompt" [-o file] [--force] [--raw]` | Script lengkap |
| `tern generate "prompt" -f existing.lua` | Generate dengan context eksplisit |
| `tern fix file.lua [--write]` | Diff atau terapkan perbaikan |
| `tern review file.lua` | Review compatibility, runtime, safety, storage, security |
| `tern explain file.lua` | Penjelasan ringkas |
| `tern models [gemini\|openrouter] [--free] [--all] [--refresh]` | Model provider; default daftar OpenRouter gratis |
| `tern model` | Model saat ini |
| `tern model set gemini <id>` / `tern model set openrouter <id>` | Pilih model provider; single ID OpenRouter lama tetap diterima |
| `tern model reset` | Kembali ke `openrouter/free` |
| `tern auth [add\|list\|remove\|test\|status\|logout]` | Credential |
| `tern provider [auto\|set <mode>]` | Mode provider |
| `tern status [--live]` | Status lokal atau health check |
| `tern config [list\|get key\|set key value]` | Config tervalidasi |
| `tern doctor [--offline]` | Cek setup; offline melewati jaringan |

Exit code: `0` sukses, `1` kesalahan input/config/network, `2` output gagal validasi, `130` request dibatalkan. Review melaporkan temuan tanpa mengubah script. Broken pipe diperlakukan sebagai penutupan consumer normal.

## Chat

```text
Tern AI · GTPS Lua Assistant
Provider: auto
Gemini: 2 keys
OpenRouter: 1 keys
Type /help for commands.

> buat command /heal
> ubah hanya moderator yang bisa
> tambahkan cooldown 10 detik
```

| Perintah sesi | Kegunaan |
| --- | --- |
| `/help` | Bantuan |
| `/clear` | Hapus percakapan, pertahankan file awal |
| `/reset` | Hapus percakapan dan file |
| `/model [nomor\|model-id\|gemini <id>\|openrouter <id>]` | Daftar/pilih model dan simpan ke config |
| `/models [gemini\|openrouter]` | Daftar model provider; OpenRouter hanya gratis |
| `/context` | File dan ukuran percakapan |
| `/save path.lua` | Simpan script terakhir yang lolos validasi; tidak overwrite |
| `/exit` | Keluar |

Ganti model langsung di chat:

```text
> /model
> /model 2
> /model gemini-3.8-flash
> /models gemini
> /model gemini <model-id-dari-daftar>
```

`/model` menampilkan model saat ini serta pilihan bernomor. `/model 2` memilih nomor dari daftar terakhir yang ditampilkan dalam sesi tersebut. `/model gemini` juga membuka daftar Gemini. Daftar Gemini diambil dari API resmi menggunakan key yang tersedia; nama model tidak di-hardcode. Jika listing sedang gagal, Anda tetap bisa memasukkan ID model secara langsung.

Model baru tersimpan ke config dan dipakai pada request berikutnya tanpa menghapus percakapan atau file context. ID `gemini-...` dan `models/gemini-...` otomatis ditujukan ke Gemini. Format OpenRouter lama `/model provider/model` tetap didukung, termasuk `/model openrouter/free`. Pemilihan model tidak mengubah mode provider. Dalam mode `auto`, daftar default mengikuti prioritas provider yang enabled dan memiliki credential; gunakan `/models gemini` atau `/models openrouter` untuk memilih daftar tertentu.

Ctrl+C membatalkan request aktif; saat idle keluar. Tidak ada riwayat chat yang disimpan ke disk. Model menerima percakapan terbaru dan hanya file yang Anda berikan. Respons mengikuti bahasa user; tanpa petunjuk bahasa, default Bahasa Indonesia. Pilihan `language` dapat menggantinya.

## Contoh permintaan

```sh
tern "buat sistem bank gems dengan deposit withdraw balance"
tern "buat command /giveitem khusus role staff"
tern "buat logger saat player drop item"
tern "buat leaderboard gems pemain online"
tern "buat NPC di world START"
tern "buat command teleport ke world tertentu"
tern "buat custom sidebar button"
tern "buat daily quest"
tern "buat auto announcement setiap 5 menit"
tern "buat anti spam command sederhana"
tern "buat playmod custom Frost"
tern "buat script world effect dengan bonus gems"
```

Fitur yang tidak didukung engine harus dijelaskan sebagai keterbatasan. Leaderboard semua akun offline, misalnya, tidak boleh mengarang API untuk membaca seluruh database pemain.

## Model dan konfigurasi

Gemini menggunakan SDK resmi maintained **`@google/genai`**, dengan `models.generateContentStream` dan system instruction/context GTPS lokal. Default **`gemini-3.8-flash`** diverifikasi pada 28 September 2026 dari [daftar model resmi](https://ai.google.dev/gemini-api/docs/models), [halaman Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), dan [pricing/free tier](https://ai.google.dev/gemini-api/docs/pricing). SDK mengikuti [dokumentasi resmi JavaScript](https://googleapis.github.io/js-genai/). Jika model berubah/tidak tersedia pada project Anda, ganti melalui CLI; adapter tidak terkunci ke versi model tertentu.

```sh
tern models gemini
tern model set gemini gemini-3.8-flash
tern models openrouter
tern model set openrouter openrouter/free
tern model reset gemini
```

Daftar Gemini menggunakan SDK `models.list`, difilter untuk generation teks; perlu key Gemini. Tidak ada asumsi bahwa setiap model dalam daftar gratis. Daftar OpenRouter tetap memakai cache lokal enam jam.


```sh
tern models --free --refresh
tern model set openrouter/free
tern model set provider/model:free
tern config set temperature 0.2
tern config set language "Bahasa Indonesia"
tern config set stream false
tern config set maxRepairAttempts 2
tern config list
```

Default:

```json
{
  "providerMode": "auto",
  "providerPriority": ["gemini", "openrouter"],
  "providers": {
    "gemini": { "enabled": true, "model": "gemini-3.8-flash" },
    "openrouter": { "enabled": true, "model": "openrouter/free" }
  },
  "model": "openrouter/free",
  "temperature": 0.2,
  "language": "auto",
  "stream": true,
  "maxRepairAttempts": 2
}
```

`temperature`: 0–2; `stream`: boolean; `maxRepairAttempts`: integer 0–2. Unknown config keys ditolak.

Daftar gratis memakai harga prompt, completion, dan komponen harga lain yang tersedia—bukan sekadar suffix `:free`. Cache berlaku enam jam; saat fetch gagal, cache lama dapat dipakai dengan warning. Tanpa cache, hanya router default tersedia. Cache bukan jaminan ketersediaan provider.

`model` lama adalah alias tersinkronisasi untuk `providers.openrouter.model`. Config 0.1.x dan credential OpenRouter lama dibaca otomatis tanpa kehilangan nilai. Credential tidak boleh ada dalam config provider; field tidak dikenal ditolak.

### Free-first

OpenRouter automatic fallback menggunakan `openrouter/free`, atau **hanya model yang sudah dipilih secara eksplisit pengguna**. Tern tidak mencari atau memilih model berbayar saat model gratis gagal. Router gratis dan ID `:free` mengirim batas harga provider nol. Pemilihan ID berbayar secara eksplisit mengizinkan request/repair ke ID tersebut. Tidak ada pembelian kredit, upgrade billing, atau telemetry otomatis.

Gemini Flash menyediakan free tier, tetapi billing ditentukan oleh project Google pemilik key. Tern tidak dapat memaksa project dengan billing aktif menggunakan tier gratis. Gunakan project free-tier jika menginginkan penggunaan tanpa biaya; model dan kuota mengikuti provider.

Integrasi OpenRouter mempertahankan [streaming](https://openrouter.ai/docs/api/reference/streaming), [model discovery](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties), dan [provider price limits](https://openrouter.ai/docs/guides/routing/provider-selection).

### Troubleshooting

```sh
tern auth list
tern auth test
tern doctor
tern model
tern models gemini
tern models openrouter --free --refresh
tern generate "buat command /test" --verbose
```

- **Invalid key**: tambahkan key baru, hapus ID lama atau unset env yang salah. Key invalid tidak dicoba berulang dalam proses.
- **Quota/rate limit**: hormati cooldown/Retry-After dan batas account/project provider. Bila seluruh key unavailable, request berhenti dengan error yang aman.
- **Model unavailable**: `tern model set gemini <model-id>` atau `tern model set openrouter <model-id>`; key tidak dinonaktifkan karena model hilang.
- **Billing/permission**: periksa izin dan pengaturan project di provider. Tidak ada pemilihan model berbayar otomatis.
- **Respons tidak lengkap / server**: error sekarang membedakan stream tanpa penanda selesai, respons kosong, batas token, dan HTTP server. Gunakan `--raw --verbose` untuk melihat key ID/attempt tanpa membocorkan key. Jika mode `gemini`, OpenRouter tidak dipakai; jalankan `tern provider set auto` bila menginginkan fallback antar-provider.
- **Network/timeout/stream terpotong**: periksa koneksi/proxy; coba `tern config set stream false` lalu pulihkan ke `true`. Error provider dinormalisasi; body mentah, header, dan URL yang membawa secret tidak dicetak.
- **Global binary berbeda**: setelah build, uji `node dist/index.js --help`, lalu `which tern` dan `ls -l "$(which tern)"`. Package lain seperti `tern-cli` juga dapat memiliki binary `tern`. Jangan hapus package global lain secara diam-diam; gunakan entry project langsung atau atur instalasi/link Anda secara eksplisit.

## GTPS Lua API integration

[docs/gtps-lua-api.md](docs/gtps-lua-api.md) merupakan satu-satunya referensi engine. File ini menormalisasi semua 485 entri yang diberikan pemilik, mempertahankan signature, status, detail perilaku, catatan, serta contoh representatif. Teks repetitif diringkas; bukan salinan byte-identik halaman HTML. Dua signature `getSubscription` dipertahankan, sedangkan `onPlayerSendRaw notes` bukan fungsi tambahan.

[docs/engine-notes.md](docs/engine-notes.md) mencatat konflik dokumentasi. Contohnya `movePlayer` memakai pixel, `spawnItem` memakai tile; `setPlayerPosition` memiliki deskripsi yang bertentangan. Helper `sendConsole`, `log`, dan `player:updateHealth` yang muncul dalam contoh tidak otomatis menjadi API valid.

Parser membangun indeks lokal saat startup; tidak ada download dokumentasi engine. Retrieval memberi bobot nama API, kata kunci dan konsep Indonesia, termasuk alias metode dalam script. Sekitar 40 entri maksimum masuk context, dibatasi byte budget. Entri yang dipilih membawa status dan aturan kategorinya, termasuk prasyarat Profile & Store.

Urutan context: aturan sistem, referensi API, turn percakapan utuh terbaru, lalu request dengan file eksplisit. Aturan tidak dipotong. Turn lama dibuang dengan pemberitahuan; bila turn terakhir atau file tidak muat, request ditolak alih-alih memotong script diam-diam. Batas: lima file `.lua`, **16 KiB total**, prompt 8 KiB, response 256 KiB; model dengan context kecil dapat memerlukan input lebih kecil. Byte budget konservatif menyediakan cadangan output, bukan tokenizer khusus tiap model.

## Validasi dan batas jaminan

Lua diparse menggunakan `luaparse` dalam mode **Lua 5.3** tanpa menjalankan kode. Versi Lua engine tidak disebutkan sumber, sehingga syntax 5.4-only tidak dijanjikan. AST validator mengenali fungsi lokal, standard library yang dipilih, callback parameter, alias handle, dan koleksi umum. Ia memeriksa fungsi asing, API tidak aktif, sebagian arity/urutan argumen, unit posisi, profile gating, nil chaining, dan operasi berat dalam callback.

Unknown API atau syntax invalid memicu maksimum dua repair pass. Setelah tetap gagal, code tidak ditulis; diagnostics keluar dengan status nonzero. Warning potensial tetap ditampilkan. Validator statis **bukan pembuktian runtime**: dynamic dispatch, helper kompleks, dataflow lintas fungsi, kondisi nil, transaksi ekonomi, dan perilaku engine perlu review/manual test. Tidak ada engine GTPS yang dijalankan oleh test suite ini. Deteksi nama API tidak berarti seluruh script pasti benar.

## Security dan privacy

- File yang dikirim hanya file `.lua` yang disebutkan user. Tidak ada scan home/repository, `.env`, atau upload otomatis.
- API key dikirim ke provider pemiliknya: OpenRouter memakai Authorization dan Gemini memakai header SDK resmi `x-goog-api-key`. Redirect HTTP ditolak. Tidak ada log request atau dump environment.
- Semua key yang diketahui dan pola key Gemini/OpenRouter di-redact dari prompt, file context, dan output. Tetap periksa file sebelum mengirim: secret lain seperti password database bukan otomatis terdeteksi.
- `tern auth` memakai input tersembunyi tanpa echo. Credential disimpan terpisah dari `config.json` dalam `credentials.json`, **tidak dienkripsi**; file mode `0600` dan direktori `0700` pada POSIX. Windows memakai perlindungan direktori user yang diwariskan OS; tidak mengklaim Windows Credential Manager/keychain.
- Gunakan environment injection dari secret manager bila tidak ingin key tersimpan lokal. `.env` di-ignore dan tidak dibaca otomatis.
- Lokasi: Linux `$XDG_CONFIG_HOME/tern-ai` atau `~/.config/tern-ai`; macOS `~/Library/Application Support/tern-ai`; Windows `%APPDATA%\tern-ai`. `TERN_CONFIG_DIR` mengganti lokasi, berguna untuk isolasi/testing.
- Script tidak dieksekusi. Output terminal membersihkan control sequence. File output symlink tidak ditimpa; pemeriksaan perubahan file membantu mencegah kehilangan edit, tetapi bukan lock lintas proses.
- Tidak ada telemetry. Prompt/file dikirim hanya ke Gemini atau OpenRouter/provider model yang dipilih; fallback dapat mengirim konteks yang sama ke provider berikutnya. Periksa kebijakan privasi provider sebelum mengirim source sensitif.

## Development

```sh
npm install
npm run dev -- --help
npm run typecheck
npm run lint
npm run build
npm test
node dist/index.js doctor --offline
npm pack --dry-run
```

Dependency runtime: `@google/genai`, `commander`, `luaparse`, `diff`; fetch, SSE framing, config, crypto, file handling dan readline memakai Node.js. TypeScript strict. Lockfile disertakan.

Struktur:

```text
src/cli/          parsing command dan terminal I/O
src/commands/     chat, task orchestration, doctor
src/config/       config tervalidasi dan credential
src/providers/    adapter Gemini/OpenRouter, errors, key pool, fallback
src/openrouter/   HTTP, SSE, discovery/cache model
src/gtps/         parser dokumentasi, retrieval, AST validator
src/prompts/      aturan engine dan context budgeting
src/utils/        file, output extraction, security, errors
docs/             referensi authoritative dan catatan konflik
tests/            unit dan CLI integration, seluruh Gemini/OpenRouter request dimock
```

Test mencakup config/model persistence, key masking, parsing/index/retrieval 485 entri, unknown/stub API, syntax/coordinate/argument checks, framing SSE UTF-8/chunk boundaries, error HTTP/timeout, extraction output, bounded repair, fallback gratis, privacy, file overwrite, raw stdout, diff dan chat context. Test biasa tidak memakai credential asli atau kuota provider. Tambahan coverage: env exact/dedup, ID stabil, round-robin, auth/quota/cooldown, provider fallback/free-first, abort, partial raw stream, repair lintas provider, SDK Gemini, doctor degraded mode, masking stdout/stderr, dan version dari package metadata. CI matrix disediakan untuk Node.js 22/24 di Linux, Windows dan macOS; menjalankan lokal di satu OS tidak membuktikan matrix tersebut sudah lulus.

Untuk release: jalankan lint/build/tests, periksa `npm pack --dry-run`, pastikan kepemilikan nama npm `tern-ai` dan hak distribusi dokumentasi engine, lalu maintainer dapat mempublikasikan package. Tidak ada auto-publish.

## Community

Laporan bug, pertanyaan, dan pull request dalam Bahasa Indonesia atau English diterima. Mulai dari [panduan kontribusi](CONTRIBUTING.md) dan [roadmap](ROADMAP.md), atau gunakan [Discussions](https://github.com/terngg/tern-ai/discussions) untuk membahas workflow GTPS. Sertakan reproduksi kecil dan hilangkan credential sebelum membagikan log.

Jika project ini membantu, star repository untuk menyimpannya dan bagikan pengalaman penggunaan yang nyata. Catatan perubahan tersedia di [CHANGELOG.md](CHANGELOG.md). Untuk kerentanan keamanan, gunakan [pelaporan privat](SECURITY.md).

## License

Kode project menggunakan [MIT](LICENSE). Dokumentasi engine berasal dari materi yang diberikan pemilik project; verifikasi hak distribusinya sebelum publikasi.
## Tern AI Web

The browser app lives in `apps/web` and uses the same provider adapters, prompt builder, GTPS retrieval, Lua validator, and bounded repair engine as the CLI through `packages/core`. It is a Next.js App Router app (Next.js 16, React 19) configured for Vercel's Node.js functions.

There are no accounts, logins, shared provider credentials, or cloud chat database. Users bring a Gemini API key or an OpenRouter key. Without opting in to “Remember API key on this device,” credentials exist in page memory only and disappear on reload. When remembered, a key is stored in this browser's IndexedDB; applications served from the same origin can access browser storage, so only remember a key on a device you control. A key is sent in the HTTPS request body to the Tern Web function, which forwards it to the selected provider for that request and does not persist it. Chat history, uploaded files, preferences, and generated scripts stay in browser storage. Exported conversations do not contain provider keys.

Run locally:

```sh
npm install
npm run dev:web
```

On first use, open **Settings**, enter your own key, save it for the current session, and optionally enable local remembering. Gemini model names are fetched from Google's model-list API; OpenRouter models and pricing are fetched from OpenRouter. Refresh models to update the local six-hour cache. OpenRouter defaults to `openrouter/free`; Tern does not silently choose a paid model. Selecting a paid OpenRouter model can incur charges under your provider account.

Choose **Auto** to try the configured Gemini model first and fall back to OpenRouter only if that key is also configured. OpenRouter auto fallback remains on its free router unless a paid model has been explicitly selected. A provider switch keeps the same locally stored conversation. Stop cancels the active request. `.lua` and `.txt` uploads are limited to five files and 16 KiB combined; files are sent only with the generation request, never stored by the Tern server. Generated Lua is locally validated against the GTPS reference before it is offered as a downloadable artifact.

The **GTPS API** page searches the existing local reference (485 entries); it is also the exact documentation source used by the generation and validation pipeline. Chat messages render as escaped Markdown, with raw HTML disabled.

### Deploy to Vercel

Import the repository into Vercel and set the project Root Directory to `apps/web`, with **Include source files outside of the Root Directory in the Build Step** enabled. Use the Next.js framework preset, the workspace build command `npm run build` (which runs `next build --webpack`), and default framework output. The shared `src/`, `scripts/`, `packages/core/`, and `docs/` directories must be available to the build. Keep the repository-root npm lockfile so Vercel installs the workspaces. The deployment does not need Gemini/OpenRouter environment secrets, a database, or a persistent server filesystem. Do not configure developer-owned shared API keys. Run the CLI from the **repository root**, as described in [Vercel's monorepo documentation](https://vercel.com/docs/monorepos):

```sh
vercel login
vercel link --repo
vercel project inspect --non-interactive
vercel deploy --target preview  # explicitly create a preview, including on a new project
# After testing the actual preview:
vercel deploy --prod
```

The `terngg/tern-ai` project was deployed and checked on 2026-09-29:

- Production: https://tern-ai-swart.vercel.app
- Verified preview: https://tern-8btgos9nh-terngg.vercel.app

Both deployments passed the public HTTP checks (security headers, 485 bundled APIs, required BYOK credentials, cross-origin protection and request validation) and all four browser smoke tests. AI responses in browser tests were mocked; live Gemini/OpenRouter generation with a valid key has not been verified. Deployment protection is disabled for this no-login application. No developer provider credentials were configured.

For the linked checkout, deploy from the repository root with `vercel deploy --target preview --scope terngg`, test the returned preview, then `vercel deploy --prod --scope terngg`. The explicit preview target avoids Vercel's first-deployment production default. There are no manual post-deployment file copies or database migrations.

```sh
node scripts/check-web-deployment.mjs https://tern-ai-swart.vercel.app
TERN_WEB_TEST_URL=https://tern-ai-swart.vercel.app npm run test:web
```

`.vercelignore` excludes local secrets, credentials, Vercel login metadata and build caches from source uploads. The web workspace declares its own TypeScript dependencies and the core workspace declares its provider/parser dependencies, so Vercel's filtered monorepo install can build independently of root development packages.

### Troubleshooting

- **No provider configured:** add your own provider key in Settings. A key in the CLI credential store is not exposed to the browser.
- **Invalid key / quota:** test the key in Settings and check limits and billing directly with the selected provider. Add a key only when you own or are authorized to use it, and observe provider rate limits and policies.
- **Model unavailable:** refresh the provider model list and choose an available model; model IDs can change over time.
- **No saved chats:** history is local to that browser profile and origin. Browser storage clearing, private browsing, or switching devices can remove or hide it; export JSON to make a manual backup.
- **GTPS reference unavailable on deploy:** confirm `docs/gtps-lua-api.md` is included in the deployment repository and redeploy.

### Web verification and limits

```sh
npm install
npm run lint
npm run build         # CLI + production Next.js build
npm test              # existing CLI tests + web/core/API tests, mocked providers
npx playwright install chromium
npm run test:web      # browser tests against the production build
node dist/index.js --help
```

`npm run build:cli` builds just the CLI; `npm run build:web` builds just the browser app. No real provider credentials are needed for tests. Browser tests intercept provider endpoints; API integration tests mock HTTP beneath the real provider SDK/adapters. These checks do not prove live provider access or a Vercel deployment.

Conversation context includes previous complete user/assistant turns, complete Lua artifacts, filenames and attached contents, regardless of the provider/model chosen for the next request. A bounded local extractive summary records earlier requirements, decisions, function names and storage literals as chats grow. This is a heuristic summary, not an additional AI request. The shared core reserves space for authoritative API docs and rejects oversized latest scripts instead of silently slicing code. Very large scripts may require splitting into smaller files.

A failed stream is reset before fallback/repair; failed or cancelled generations never create final downloadable artifacts. Explicit generate/fix results that still fail validation after two repair attempts return an error. Syntax highlighting and downloads run in the browser; Lua is never executed. Imported validation badges are discarded because imports are untrusted.

Endpoints are narrow (`/api/ai/generate`, `/api/ai/models`, `/api/ai/test`), validate bounded JSON bodies, reject cross-origin browser requests, and have timeouts and per-instance burst limits. The in-memory rate limiter is not a distributed quota system; Vercel Firewall rules can supplement it for a public deployment. The cross-platform Next launcher disables framework telemetry before startup. No app telemetry, shared credentials, central chat storage, or generic proxy is introduced. The Node functions read bundled documentation, with file tracing configured, and never write user data to disk.
