# parolSave — arxitektura

Status: **amalga oshirilmoqda**.

## 1. Maqsad (aniqlashtirilgan)

Parol **boshqaruvchisi** emas — oddiy **xavfsiz saqlash qutisi**:

- Yozuv: `kategoriya` (Gmail, server, ...), `nom`, `parol`.
- Kategoriya bo'yicha guruhlash; ustiga bossangiz — parol ko'rinadi / nusxalanadi.
- Parol ekranda **yashirin** turadi (faqat kerak paytda ko'rsatish), DB'da **shifreli**.
- Windows va Linux'da ishlaydi; GitHub'dan clone qilganda ham ma'lumot tiklanadi.
- Ma'lumot **umuman yo'qolmasligi kerak**.

Yo'q: avtomatik to'ldirish, brauzer integratsiyasi, parol tahlili, audit log, bulut servisi.

## 2. Texnologiya

| Qatlam | Tanlov | Sabab |
| --- | --- | --- |
| Shell | Electron + electron-vite | Main/preload/renderer tayyor |
| UI | React + TypeScript | Oddiy |
| DB | **PostgreSQL** (lokal, embedded) | Siz tanladingiz; ishonchli dump/restore |
| DB driver | `pg` (node-postgres) | Sof JS, Electron bilan muammo yo'q |
| DB binaries | `embedded-postgres` + electron-builder `extraResources` | Windows/Linux'ga o'zi bilan tarqatiladi |
| Migratsiya | Inline SQL (`electron/db/migrate.ts`), `meta.schema_version` | Qo'shimcha dependency yo'q |
| Validatsiya | `zod` | IPC chegarasida tekshirish |
| Shifrlash | Node `crypto` (scrypt + AES-256-GCM) | Qo'shimcha moduli yo'q |
| Pack | electron-builder | Windows: NSIS; Linux: AppImage/deb |

**Muhim faraz:** PostgreSQL foydalanuvchi kompyuterida **lokal** ishlaydi
(`userData/pgdata`), internet va alohida server kerak emas. Agar markaziy
serverli variant kerak bo'lsa, ayting — faqat ulanish sozlamalari va
`DATABASE_URL` qismi o'zgaradi.

Embedded Postgres binarilari katta (~50–100 MB) va platformaga qarab farq
qiladi: electron-builder'da `extraResources` orqali `pg-bin/win32-x64`,
`pg-bin/linux-x64` qo'shiladi. Port 127.0.0.1 da dinamik tanlanadi;
DB paroli tasodifiy generatsiya qilinib `userData/db.json` ga saqlanadi
(Linux'da `chmod 0600`). Bu fayl hech qachon Git'ga kirmaydi.

## 3. Ochish paroli (nima u?)

Dastur ochilganda so'raladigan **bitta parol**. Qolgan barcha parollar shu
paroldan olingan kalit bilan shifrlanadi. DB faylini yoki repo'ni olgan odam
hech narsa o'qiy olmaydi. Unutsangiz — bir marta ko'rsatiladigan
**recovery code** (zaxira kod) qutqaradi.

## 4. Kalitlar modeli

```
masterPassword ──scrypt(salt, N=131072,r=8,p=1)──> KEK (32 bayt)
random 32 bayt ─────────────────────────────────> DEK (vault kaliti)

meta.wrapped_dek          = AES-GCM(KEK, DEK)
recoveryCode ──scrypt──> KEK_r
meta.wrapped_dek_recovery = AES-GCM(KEK_r, DEK)

entries.payload = AES-GCM(DEK, JSON{ category, name, password })  -- BYTEA
```

- `category` ham shifreli qismda; DB'da faqat `payload` ko'rinadi.
  Guruhlab ko'rsatish ochilgandan keyin xotirada qilinadi.
- Parol almashganda faqat `wrapped_dek` yangilanadi, yozuvlar qayta shifrlanmaydi.
- Har safar yangi 12 baytli IV; GCM auth tag o'zgartirishni aniqlaydi.
- Lock qilganda kalitlar `fill(0)` bilan xotiradan o'chiriladi.

## 5. Jarayonlar va chegara

```
Renderer (React) — Unlock | CategoryTabs | EntryList | EntryDetail | AddForm
   │  window.vault.* (tiplangan API; kalit/DB/pg yo'q)
Preload — contextIsolation: true, sandbox: true, nodeIntegration: false
   │  ipcRenderer.invoke
Main — crypto/ (scrypt, AES) · db/ (pg.Pool, migratsiya)
       services/ (vault, entries, backup) · ipc/ (.pwsafe eksport/import)
   │  barcha kiritmalar zod bilan tekshiriladi
PostgreSQL (lokal) — pgdata + WAL
```

Xavfsizlik: CSP `default-src 'self'`, tashqi URL/HTML yo'q,
`setWindowOpenHandler` → rad, `remote` yo'q, Electron yangilanishlarini kuzatish.

## 6. Papka tuzilmasi

```
parolSave/
├── electron/
│   ├── main/index.ts          # window + IPC + pg ishga tushirish
│   ├── preload/index.ts       # contextBridge
│   ├── ipc/vault.ts           # IPC kanallari, .pwsafe eksport/import, sinxronlash
│   ├── crypto/kdf.ts
│   ├── crypto/aes.ts
│   ├── db/pool.ts             # embedded server start/stop, pg.Pool
│   ├── db/migrate.ts          # inline SQL migratsiya, schema_version
│   ├── services/vault.ts      # create / unlock / restore / changePassword / lock
│   ├── services/entries.ts    # add / list / get / remove
│   └── services/backup.ts     # mantiqiy JSON snapshot, rotatsiya, restoreSnapshot
├── pg-bin/                    # platform binarilari (extraResources)
├── data/vault.pwsafe          # shifreli ko'chma nusxa (private repo'da saqlanadi)
├── src/
│   ├── components/UnlockScreen.tsx
│   ├── components/CategoryTabs.tsx
│   ├── components/EntryList.tsx
│   ├── components/EntryDetail.tsx
│   ├── components/AddEntry.tsx
│   └── api.ts
├── shared/types.ts
├── docs/ARCHITECTURE.md
└── electron.vite.config.ts
```

## 7. Ma'lumotlar bazasi (PostgreSQL)

```sql
CREATE TABLE IF NOT EXISTS meta (
  key   text PRIMARY KEY,
  value text NOT NULL
);
-- schema_version, kdf_params, salt, wrapped_dek,
-- recovery_salt, wrapped_dek_recovery

CREATE TABLE IF NOT EXISTS entries (
  id         uuid PRIMARY KEY,        -- app tomonida crypto.randomUUID()
  payload    bytea NOT NULL,          -- IV(12) | authTag(16) | ciphertext
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entries_created ON entries(created_at DESC);
```

`payload` ichidagi JSON: `{ "category": "server", "name": "prod-db", "password": "..." }`.
Kategoriyalar alohida jadval emas — yozuvlardan olinadi.

Ishonchlilik uchun postgres konfiguratsiyasi: `fsync = on`,
`synchronous_commit = on`, `wal_level = replica`. Bu SQLite'ning
`WAL + synchronous=FULL` o'rnini bosadi.

## 8. Foydalanish oqimi

1. Birinchi ishga tushirish: master parol + recovery code yaratish.
2. Keyingi ishga tushirish: parol → DEK → ochish.
3. Kategoriya → nomlar ro'yxati → bosish → parol yashirin →
   "Ko'rsat" (15 s keyin yashirinadi) / "Nusxalash" (30 s keyin clipboard tozalanadi).
4. "Qo'shish": kategoriya + nom + parol → shifreli yozuv → DB + backup.
5. "Chiqish" → lock (kalitlar xotiradan o'chiriladi); avto-lock hali yo'q.

## 9. IPC API

| Kanal | Vazifa |
| --- | --- |
| `vault:status` | DB bor / yo'q, qulflanganmi |
| `vault:create` | Yangi vault, master parol, recovery code |
| `vault:unlock` / `vault:lock` | Ochish / kalitlarni o'chirish |
| `vault:changePassword` | Faqat `wrapped_dek` yangilanadi |
| `entries:list` / `get` / `add` / `remove` | Shifreli amallar |
| `backup:now` | Mantiqiy JSON snapshot (`backups/vault-YYYYMMDD-HHmmss.json`) |
| `vault:export` / `vault:import` | `.pwsafe` shifreli fayl |

Natija: `{ ok: true, data } | { ok: false, error }`.

## 10. Yo'qolishga qarshi

1. `fsync = on`, `synchronous_commit = on` — elektr o'chib qolsa ham yozuv yo'qolmaydi.
2. Har o'zgarishdan keyin darhol mantiqiy JSON snapshot →
   `backups/vault-YYYYMMDD-HHmmss.json` (shifreli `payload` lar base64).
   `embedded-postgres` tarkibida `pg_dump` yo'q, shuning uchun `pg` orqali
   `meta` va `entries` jadvallari o'qilib snapshot yaratiladi.
3. Oxirgi 10 nusxa saqlanadi; tiklash `restoreSnapshot()` bilan bitta
   tranzaksiyada `entries` va `meta` jadvallarini tozalab, snapshot satrlarini
   o'z holicha qayta yozish (eski DEK bilan shifreqlangan satrlar qolmaydi).
4. `.pwsafe` eksporti — asosiy ko'chirish va oxirgi chora. Import oldin
   mavjud DB ham dump qilinadi.
5. `pgdata`, `backups`, `db.json` — faqat egasi uchun (Linux'da `chmod 0700/0600`).

## 11. GitHub + Windows/Linux (ma'lumot saqlanishi kerak)

**A. Kod** → private repo. `pgdata/`, `backups/`, `db.json`, `node_modules/`,
`data/*.tmp` — `.gitignore` da. `pgdata` papkasini Windows'dan Linux'ga ko'chirib bo'lmaydi
(binary format va versiya farqi) — shuning uchun u hech qachon repo'da yo'q.

**B. Ma'lumot** → faqat shifreli `.pwsafe` (JSON: meta + entries). Ikkita variant:

- **Tavsiya:** USB/bulut orqali o'tkazish, yangi mashinada `Import`.
- **GitHub varianti (joriy):** `data/vault.pwsafe` **atayin private repo'ga commit
  qilinadi** (ichida faqat shifreli `meta` + `entries`). Repo **private** bo'lishi
  shart. Fayl atomar yoziladi: avval `data/vault.pwsafe.tmp`, keyin `vault.pwsafe`
  ga `rename` qilinadi; `data/*.tmp` `.gitignore` da va hech qachon commit qilinmaydi.
  Ishga tushganda local DB yo'q, lekin fayl bor bo'lsa → interfeysda ko'chma nusxa
  topilgani haqida xabar ko'rsatiladi; import foydalanuvchi tomonidan qo'lda bajariladi.
  Har o'zgarishda fayl yangilanadi; siz `git add data/vault.pwsafe && git commit` qilasiz.
  Master parol almashganda faylni qayta eksport qilib commit qilish kerak
  (eski commit'lardagi nusxa eski parol bilan o'qiladi).

Yangi kompyuter: `git clone` → `npm install` → `npm run build` → `Import (.pwsafe)` → parol → ma'lumot tayyor.

## 12. Ish bosqichlari

1. Arxitektura (bu hujjat) ✔
2. Skeleton: electron-vite + React + TS + embedded Postgres + `pg` + birinchi IPC.
3. Vault yaratish/ochish/lock + scrypt + AES.
4. Kategoriya + ro'yxat + parolni ko'rsatish/nusxalash + qo'shish/o'chirish.
5. Mantiqiy JSON backup, `.pwsafe` eksport/import, `data/vault.pwsafe`.
6. Avto-lock, ko'rsatish vaqti, clipboard tozalash.
7. Linux test → Windows `.exe` → clone + import sinovi.

## 13. Sinov rejasi

- scrypt → wrap → unwrap → AES aylanma sinovi; noto'g'ri parol rad etilishi.
- Yozuv qo'shish → dastur qayta ishga tushish → tiklanishi (Postgres qayta start bo'lganda ham).
- `.pwsafe` eksport → toza DB'ga import → ochilishi (Windows ↔ Linux).
- JSON snapshot → toza DB'ga `restoreSnapshot()` → yozuvlar soni va `payload` baytlari tengligi.
- Yozish paytida jarayon o'ldirilsa → DB buzilmasligi.
