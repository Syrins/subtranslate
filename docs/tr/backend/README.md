# Backend Dokumani (TR)

Bu dokuman, `backend/` uygulamasinin mimarisini, calisma modelini, endpoint gruplarini ve operasyon detaylarini aciklar.

## 1. Genel Bakis

Backend, FastAPI tabanli bir API katmanidir ve asagidaki gorevleri ustlenir:
- Kimlik dogrulama ve yetkilendirme
- Proje ve dosya yonetimi
- Altyazi parse/duzenleme
- Ceviri ve export job orkestrasyonu
- Admin operasyonlari
- Saglik kontrolu

Uzun sureli isler API process icinde calistirilmaz. Celery queue uzerinden worker'a devredilir.

## 2. Servis Topolojisi

Runtime topolojisi:
- FastAPI (`backend` servisi)
- Celery Worker (`celery-worker`)
- Celery Beat (`celery-beat`)
- Redis (broker + result backend)
- Supabase (db + auth)
- Local storage volume (`/app/storage`)

Temel akis:
1. Frontend API'ye istek gonderir.
2. API job kaydini olusturur.
3. API ilgili Celery task'i `delay()` ile kuyruğa yazar.
4. Worker isi isler, ilerleme/durum bilgisini Supabase'e yazar.
5. Frontend job endpointleri ile durumu poll eder.

## 3. Kod Organizasyonu

Ana klasor:
- `backend/app/main.py`: app factory, middleware, route registration, file serving
- `backend/app/core/`: config, security, supabase client
- `backend/app/api/routes/`: tum HTTP endpointleri
- `backend/app/services/`: storage, cleanup, subtitle parser, translation engine
- `backend/app/workers/`: celery config ve tasklar
- `backend/app/models/schemas.py`: pydantic modeller
- `backend/app/utils/ffmpeg.py`: ffmpeg islemleri

## 4. Konfigurasyon ve Ortam Degiskenleri

Ana konfigurasyon `backend/app/core/config.py` dosyasinda `Settings` ile yonetilir.

Kritik env degiskenleri:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `REDIS_URL`
- `CORS_ORIGINS`
- `STORAGE_DIR`
- `TEMP_DIR`
- `OPENAI_API_KEY`
- `DEEPL_API_KEY`
- `GEMINI_API_KEY`

Not:
- Compose uzerinde `REDIS_URL` servis ici `redis://redis:6379/0` olarak set edilir.
- `TEMP_DIR` ve `STORAGE_DIR` container path olarak set edilir.

## 5. Auth ve Yetki Modeli

Auth mekanizmasi:
- `HTTPBearer` token alinir.
- Token Supabase Auth endpoint ile dogrulanir.
- User profile `profiles` tablosundan cekilir.

Yetki seviyesi:
- Standart endpointler: `get_current_user`
- Admin endpointler: `require_admin`

Admin router:
- Tum `/api/admin/*` endpointleri router seviyesinde admin guard ile korunur.

## 6. Endpoint Gruplari

### 6.1 Health
- `GET /health`
- FFmpeg, Redis, Supabase, storage durumunu doner.

### 6.2 Projects (`/api/projects`)
- `GET /api/projects`
- `GET /api/projects/storage/info`
- `GET /api/projects/{project_id}`
- `POST /api/projects` (video upload)
- `POST /api/projects/subtitle` (altyazi upload)
- `DELETE /api/projects/{project_id}`
- `GET /api/projects/{project_id}/tracks`
- `GET /api/projects/{project_id}/subtitles`
- `PATCH /api/projects/{project_id}/subtitles/batch`
- `GET /api/projects/{project_id}/export-srt`

### 6.3 Translation (`/api/translate`)
- `POST /api/translate`
- `GET /api/translate/{job_id}`
- `POST /api/translate/{job_id}/cancel`
- `GET /api/translate/history/{project_id}`

### 6.4 Export (`/api/export`)
- `POST /api/export`
- `GET /api/export/{job_id}`
- `GET /api/export/{job_id}/download`
- `POST /api/export/{job_id}/cancel`
- `POST /api/export/{project_id}/uploaded-to-own-storage`

### 6.5 Glossary (`/api/glossary`)
- `GET /api/glossary`
- `POST /api/glossary`
- `DELETE /api/glossary/{term_id}`

### 6.6 Admin (`/api/admin`)
- stats, users, jobs, engines, settings, announcements, storage endpointleri
- job cancel/retry endpointleri queue tabanli calisir

## 7. Queue ve Worker Modeli

API'den queue'ya aktarma:
- Ceviri: `run_translation_task.delay(...)`
- Export: `run_export_task.delay(...)`
- Video processing: `run_project_processing_task.delay(...)`

Worker tasklari:
- `run_translation_task`
- `run_export_task`
- `run_project_processing_task`
- `cleanup_expired_files_task` (beat)
- `reset_monthly_usage` (beat)

Cancel davranisi:
- Job `cancelled` olursa worker kontrol eder ve proje status'unu toparlar.
- Export'ta encode sonrasi ikinci cancel kontrolu vardir.

## 8. Storage ve Dosya Yasam Dongusu

Storage implementasyonu:
- `backend/app/services/storage.py`
- Varsayilan local file system tabanli (`/app/storage`)

Guvenlik:
- Path traversal kontrolu `relative_to` ile yapilir.
- `/files/{path}` endpointinde de root boundary kontrolu vardir.

Cleanup:
- `cleanup.py` retention ve kota temizligi yapar.
- Aktif proje durumlari (`processing`, `translating`, `exporting`) silme isleminden korunur.

## 9. Supabase Client Davranisi

Supabase istemcisi custom HTTP katmani ile yazilmistir (`httpx`).

`single/maybeSingle` notu:
- 0 satir durumu `None` olarak doner.
- Coklu satir anomalisi artik sessiz yutulmaz, hata firlatilir.

Bu tasarim veri tutarsizliklarini erken yakalamak icin kritiktir.

## 10. FFmpeg ve Medya Isleme

FFmpeg kullanim alanlari:
- Medya metadata probe
- Embedded subtitle extraction
- Burn-in export
- Soft-sub mux

Dosya isleme stratejisi:
- Buyuk dosyalarda memory yerine file copy tercih edilir.
- Progress callback ile export job ilerlemesi DB'ye yazilir.

## 11. Operasyon Notlari

Production:
- `DEBUG=false`
- Redis ve Celery servisleri zorunlu
- Health endpoint izlenmeli
- `backend_storage` volume korunmali

Olcekleme:
- Backend worker sayisi Dockerfile CMD'den ayarlanir.
- Celery concurrency compose command ile ayarlanir.
- En kritik bottleneck: FFmpeg ve translation API throughput.

## 12. Troubleshooting

Job queued'da kaliyorsa:
- `celery-worker` logunu kontrol et.
- Redis baglantisi saglam mi kontrol et.

401/403 hatalari:
- Supabase key'lerini ve token akisini kontrol et.

Dosya bulunamiyor hatalari:
- `STORAGE_DIR` mount dogru mu
- `/files/` endpoint path root disina cikiyor mu

## 13. Gelistirme Kontrol Listesi

Yeni endpoint eklerken:
1. Schema ekle (`models/schemas.py`)
2. Router'a endpoint yaz
3. Auth/role kurallarini belirle
4. Hata kodlarini standartlastir
5. Gerekirse queue taskina tasi

Yeni background is eklerken:
1. Task'i `workers/tasks.py` icine ekle
2. API route'ta `delay()` ile dispatch et
3. Job status lifecycle'ini tanimla (`queued -> processing -> completed/failed/cancelled`)
4. Proje status geri donuslerini unutma

