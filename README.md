# Tern AI

[![CI](https://github.com/terngg/tern-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/terngg/tern-ai/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 22.16+](https://img.shields.io/badge/Node.js-%3E%3D22.16-339933.svg)](package.json)

**A terminal AI coding assistant for GTPS Hosting Lua.** Local documentation, Gemini + OpenRouter, multi-key failover, and local validation before saving generated scripts.

[Get started](#instalasi) · [Commands](#commands) · [Contribute](CONTRIBUTING.md) · [Roadmap](ROADMAP.md) · [Releases](https://github.com/terngg/tern-ai/releases) · [Discussions](https://github.com/terngg/tern-ai/discussions)

Tern AI adalah coding assistant terminal untuk **Lua pada engine GTPS Hosting yang didokumentasikan di project ini**. Menggunakan **Google Gemini → OpenRouter** secara otomatis, dengan rotasi beberapa API key per provider dan perilaku free-first. Tersedia juga web app Tern AI dengan router multi-provider; CLI tidak memindai repository otomatis.

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

Antigravity model choices come from the paired machine's official `agy models`
command, following the [Antigravity CLI model selection documentation](https://antigravity.google/docs/cli/headless/#select-a-model-effort-or-agent).
Companion reports the returned IDs and names; Tern does not maintain an invented
Antigravity catalog or infer quota, pricing, or context limits. A listed model is
discovered, not necessarily inference-verified. Update and restart Tern Companion
after upgrading the CLI adapter. Saved Flash/Pro aliases remain compatible when
their corresponding real model IDs are discovered.

Antigravity chat runs in a fresh temporary working directory with the full GTPS
context and conversation included in its prompt. It uses the official headless
`stream-json` protocol, forwards only answer text, and requires a successful,
nonempty final result. CLI diagnostics stay local. No permission-bypass flag is
enabled. A timeout/cancellation is relayed back to the paired Companion; late
events cannot turn a cancelled request into a successful one. Restart Companion
after installing an adapter update; deploying the web app alone does not update
the CLI on the paired machine.
Antigravity CLI authentication, permission, timeout and quota errors are reduced to
safe categories before leaving Companion. Temporary quota/HTTP 429 failures put
the connection on cooldown; they do not invent a remaining balance or provider
reset time. Raw CLI diagnostics are never persisted in the request inspector.

The Next.js app in `apps/web` keeps the existing GTPS knowledge base, Lua
assistant, validation/repair, attachments, history, imports and artifact downloads.
Its provider layer is now a user-isolated PostgreSQL router. The CLI retains its
existing Gemini/OpenRouter configuration and is independent of web accounts.

Open **Providers**, create an account, add an API key, test/discover models, and
select a default text-chat model. Saving a credential does **not** mark it connected.
A metadata check establishes connection status; successful inference establishes
health. Unknown quota, pricing, capabilities and latency stay unknown.

Web provider keys and custom headers use AES-256-GCM encryption, bound to the user
and connection. They are never returned to the browser. Legacy browser-stored keys
are cleared on upgrade; re-enter them explicitly in the new encrypted connection
form. Chat history and attachments remain local to the browser and are not erased
on sign-out. Shared devices should clear local chat history separately.

### Routing and API

- `auto` / `auto/balanced`: persistent round-robin over enabled eligible accounts.
- `auto/fast`: health and measured latency; no manufactured speed ranking.
- `auto/quality`: user-defined priority, not an inferred quality score.
- `auto/cheap`: fresh provider-reported prices only; refuses when unavailable.
- Pools support ordered fallback, round-robin, LRU and health-aware selection.
- At most four account attempts; bounded jitter/backoff and durable cooldowns.
- A partial client-visible stream is never continued using another provider.
- GTPS chat always passes through retrieval, validation and bounded repair.

`/api/ai/generate` serves GTPS tasks. `/api/router/chat` and
`/api/router/messages` provide session-authenticated **text-only** OpenAI-style and
Anthropic-style chat envelopes, streaming and non-streaming. They are not a full
OpenAI/Anthropic API replacement: tools, images and structured output are rejected.
Metadata CRUD/testing is `/api/router`; account/session operations are `/api/auth`.
Deprecated browser-key endpoints return 410. No provider secret is an application
login token and no global provider pool is configured.

### Database and deployment

Use a managed PostgreSQL database and a pooled `DATABASE_URL` appropriate for
Vercel. Set server-side `TERN_CREDENTIAL_KEY` to a cryptographically random 32-byte
hex string. Never use `NEXT_PUBLIC_` for these values. Back up the encryption key
securely; rotating it requires re-encrypting all credentials first.

```sh
npm install
# Load DATABASE_URL and TERN_CREDENTIAL_KEY securely in the server environment.
node scripts/router-migrate.mjs
npm run dev:web
```

`migrations/001-router.sql` is idempotent and creates users, hashed sessions,
encrypted connections, pools, shared cursors, rate-limit buckets and metadata-only
request traces. No local database/file fallback is used in production. Use a
separate preview database or branch when changing schemas. Run
`node scripts/router-prune.mjs` periodically to retain 30 days of request metadata
and remove expired sessions/rate buckets.

Vercel Root Directory remains `apps/web`, with source files outside the root
included. Deploy from the repository root. Verify the preview before production:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:web
vercel deploy --target preview
node scripts/check-web-deployment.mjs https://YOUR-PREVIEW
# With server secrets securely loaded (never printed):
node --import tsx scripts/verify-router-deployment.mjs https://YOUR-PREVIEW
```

The verification script creates and removes temporary test users. It checks
managed persistence, encryption and cross-user isolation, then records a **real
failed** provider-auth check using an intentionally invalid key. It does not claim
successful inference. Browser/adapter fixtures likewise do not establish live
provider availability. See [router QA](docs/router-qa.md) for the per-card matrix,
current verification and known limitations.

### Attribution

The router architecture, error-classification concepts and SSRF policy were
adapted from [TernRouter](https://github.com/terngg/TernRouter), which derives from
[9Router](https://github.com/decolua/9router). The required MIT notice is preserved
in [licenses/TernRouter-MIT.txt](licenses/TernRouter-MIT.txt). Tern AI remains the
product; source/reference mapping is in [router architecture](docs/router-architecture.md).
