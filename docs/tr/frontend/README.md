# Frontend Dokumani (TR)

Bu dokuman, `frontend/` uygulamasinin yapisini ve calisma modelini anlatir.

## 1. Teknoloji Ozeti

- Next.js 16 (App Router)
- React 19
- TypeScript
- TailwindCSS v4
- Supabase SSR (`@supabase/ssr`)
- shadcn/ui tabanli component seti

## 2. Klasor Yapisi

Temel dizinler:
- `frontend/src/app/`: route segmentleri
- `frontend/src/components/`: UI ve layout componentleri
- `frontend/src/hooks/`: custom hooklar
- `frontend/src/lib/`: API client, supabase client, utilityler
- `frontend/src/middleware.ts`: auth ve route guard

Route segment gruplari:
- `(marketing)`
- `(auth)`
- `(app)`
- `(admin)`

## 3. Auth ve Session Akisi

Auth stack:
- Supabase browser client (`lib/supabase/client.ts`)
- Supabase server client (`lib/supabase/server.ts`)
- Middleware ile request bazli session yenileme

`middleware.ts` davranisi:
- protected route'lara auth zorunlulugu
- admin route'lari icin profile role kontrolu
- login/register route'larinda aktif user redirect

## 4. Backend Ile Iletisim

API katmani:
- `frontend/src/lib/api.ts`

Temel prensip:
- `NEXT_PUBLIC_API_URL` baz URL olarak kullanilir
- Supabase session'dan access token alinir
- `Authorization: Bearer <token>` header otomatik eklenir

Kapsanan endpoint gruplari:
- projects
- translation
- export
- glossary
- health

Hata handling:
- API cevabi `ok` degilse `ApiError` firlatilir.

## 5. Ana Uygulama Akislari

### 5.1 Upload Akisi
1. Kullanici video veya subtitle yukler.
2. Backend proje olusturur.
3. Frontend proje statusunu listeler.

### 5.2 Translation Akisi
1. Frontend ceviri job'u olusturur.
2. Job id ile polling yapar.
3. Durum `completed` oldugunda editor/export ekranina gecilir.

### 5.3 Editor Akisi
1. Altyazi satirlari cekilir.
2. Kullanici satirlari duzenler.
3. Batch update endpointi ile kaydedilir.

### 5.4 Export Akisi
1. Export ayarlari secilir.
2. Export job olusturulur.
3. Job tamamlaninca download URL alinir.

## 6. UI Katmani

UI bilesenleri:
- Ortak UI componentleri `components/ui/*` altinda
- Layout bilesenleri: sidebar, auth provider, admin sidebar
- Theme/font secimi gibi ayar bilesenleri mevcuttur

Durum guncelleme:
- Polling tabanli job izleme
- Toast bildirimleri (`sonner`)

## 7. Ortam Degiskenleri

Frontend icin zorunlu degiskenler:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL`

Onemli not:
- `NEXT_PUBLIC_*` degiskenleri build zamaninda bundle'a gomulur.
- Domain degistiginde yeniden build gerekir.

## 8. Build ve Runtime

`frontend/Dockerfile` ozellikleri:
- Multi-stage build
- `output: standalone` ile optimize runtime
- Runtime command: `node server.js`
- Container port: `3000`

Coolify domain esleme:
- `subtranslate.syrins.tech:3000`

## 9. Frontend Gelistirme

Local:
1. `npm install`
2. `.env.local` olustur
3. `npm run dev`

Kodlama standardi:
- API cagrilarini tek noktadan (`lib/api.ts`) gecir
- Route-level auth kontrolunu middleware ile koru
- UI state ve side-effectleri hooklara ayir

## 10. Sik Sorunlar

Blank page / env sorunu:
- `NEXT_PUBLIC_*` eksik veya yanlis olabilir.

401 hatalari:
- Supabase session token yok veya backend URL yanlis olabilir.

CORS hatalari:
- Backend `CORS_ORIGINS` frontend domain ile birebir eslesmeli.

Polling takilmalari:
- Backend job status endpointleri ve worker loglari kontrol edilmeli.

