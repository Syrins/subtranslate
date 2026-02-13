# Deploy Rehberi (TR) - Coolify + Docker Compose

Bu dokuman, SubTranslate projesini Coolify uzerinde Docker Compose ile production'a cikarmak icin detayli adimlari icerir.

## 1. Mimari Ozeti

Compose servisleri:
- `redis`
- `backend`
- `celery-worker`
- `celery-beat`
- `frontend`

Dis dunyaya acik olmasi gereken servisler:
- `frontend`
- `backend`

Domain verilmeyecek servisler:
- `redis`
- `celery-worker`
- `celery-beat`

## 2. DNS Hazirligi

A kayitlari:
- `subtranslate.syrins.tech` -> Coolify sunucu IP
- `subtranslate-backend.syrins.tech` -> Coolify sunucu IP

Kontrol:
- DNS propagation tamamlanmadan SSL issuance basarisiz olabilir.

## 3. Coolify Resource Kurulumu

1. Coolify dashboard -> proje sec.
2. `Create New Resource`.
3. Repo bagla.
4. Build Pack olarak `Docker Compose` sec.
5. Base directory: `/`
6. Compose path: `/docker-compose.yml`

## 4. Domain Ayarlari

Coolify UI'da her servise domain ata:
- Backend: `https://backend.example.com:8000`
- Frontend: `https://example.com:3000`

Port numarasi sadece Coolify'a container icindeki portu soyler. Disariya 443 (HTTPS) olarak sunulur.

Bos birak:
- redis domains
- celery-worker domains
- celery-beat domains

Onemli:
- `ports:` tanimlanmadi — Coolify Traefik proxy ile yonetiyor.
- Host port acman gerekiyorsa benzersiz port sec (ornek: frontend icin `3100:3000`).

## 5. SSL / HTTPS

Coolify otomatik Let's Encrypt alir.

Gerekli kosullar:
- DNS dogru IP'ye gitmeli
- Sunucuda 80/443 acik olmali
- Reverse proxy veya CDN challenge'i engellememeli

## 6. Environment Variables

`docker-compose.yml` zorunlu degiskenleri (`${VAR:?}` — Coolify UI'da kirmizi gosterilir):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `CORS_ORIGINS`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL`

Opsiyonel (`${VAR:-default}`):
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_CDN_DOMAIN`
- `OPENAI_API_KEY`, `DEEPL_API_KEY`, `GEMINI_API_KEY`
- `DEBUG` (varsayilan: `false` — Swagger UI kapali)

Ornek domain degerleri:
- `CORS_ORIGINS=https://example.com`
- `NEXT_PUBLIC_API_URL=https://example.com`

## 7. Coolify Magic Variables

Otomatik uretilen degiskenler (manuel set etme):
- `SERVICE_PASSWORD_REDIS` — Redis icin guvenli sifre (tum servislere inject edilir)
- `SERVICE_URL_BACKEND` — Backend URL
- `SERVICE_FQDN_BACKEND` — Backend domain
- `SERVICE_URL_FRONTEND` — Frontend URL
- `SERVICE_FQDN_FRONTEND` — Frontend domain

Redis sifresi `docker-compose.yml` icinde `SERVICE_PASSWORD_REDIS` olarak referans edilir.
Coolify deploy sirasinda otomatik uretir — elle ayar gerekmez.

## 8. Volume ve Kalicilik

Compose volume'lari:
- `redis_data`
- `backend_storage`
- `backend_tmp`

Kritik not:
- `backend_storage` ve `backend_tmp` volume'larini silme.
- Kullanici dosyalari ve process gecici dosyalari bu volume'larda tutulur.

## 9. Deploy Sonrasi Kontroller

1. `https://example.com/health`
2. Frontend login/register
3. Video/subtitle upload
4. Translation job lifecycle
5. Export job lifecycle
6. Download endpoint calisiyor mu

## 10. Sik Hata Senaryolari

### 10.1 SSL Alinamiyor
- DNS yanlis IP
- 80/443 kapali
- CDN/proxy challenge engelliyor

### 10.2 Job'lar queued'da kaliyor
- `celery-worker` ayakta degil
- Redis baglantisi sorunlu

### 10.3 Frontend backend'e ulasamiyor
- `NEXT_PUBLIC_API_URL` yanlis
- backend domain/port yanlis maplenmis

### 10.4 CORS hatasi
- `CORS_ORIGINS` frontend domain ile birebir uyusmuyor

### 10.5 "port is already allocated" ile deploy hatasi
- Ornek hata: `Bind for 0.0.0.0:3000 failed: port is already allocated`
- Neden: host uzerinde baska bir process/container ayni host portu kullaniyor
- Cozum:
  - Domain bazli proxy kullaniyorsan frontend/backend icin sabit host port map'ini kaldir
  - Ya da bos bir host porta gec (frontend icin ornek `3100:3000`)
  - Hostta cakismayi kontrol et:
    - `docker ps --format '{{.Names}}\t{{.Ports}}' | grep ':3000->'`
    - `sudo lsof -iTCP:3000 -sTCP:LISTEN -P -n`

## 11. Production Onerileri

- `DEBUG=false` (Swagger UI, ReDoc, OpenAPI schema kapali)
- Secret rotasyonu yap
- Worker concurrency=2 (her task FFmpeg icin 6 thread kullanir)
- FFmpeg tum islemlerde `-threads 6` ile sinirli (%25 of 24 core)
- Upscale: Lanczos ile 2x'e kadar kaliteli, 2x ustu engellenir
- Non-root container kullanicilari (backend: appuser:1001, frontend: nextjs:1001)
- Log retention ve monitoring aktif et
- Periyodik backup ve restore testi yap

### Kaynak Limitleri

| Servis | CPU Limit | RAM Limit |
|---|---|---|
| Redis | - | 1G |
| Backend | 3 | 4G |
| Celery Worker | 6 | 16G |
| Celery Beat | 0.5 | 256M |
| Frontend | 2 | 2G |
| **Toplam** | **11.5** | **~23G** |

## 12. Rollback Stratejisi

1. Son bilinen saglam commit/tag'i sec
2. Coolify redeploy tetikle
3. Health ve temel akis testlerini tekrar calistir
4. Gerekirse DB migration rollback planini uygula
