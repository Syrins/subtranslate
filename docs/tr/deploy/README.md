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

Container port eslesmesine gore gir:
- Backend: `https://subtranslate-backend.syrins.tech:8000`
- Frontend: `https://subtranslate.syrins.tech:3000`

Bos birak:
- celery-worker domains
- celery-beat domains

## 5. SSL / HTTPS

Coolify otomatik Let's Encrypt alir.

Gerekli kosullar:
- DNS dogru IP'ye gitmeli
- Sunucuda 80/443 acik olmali
- Reverse proxy veya CDN challenge'i engellememeli

## 6. Environment Variables

`docker-compose.yml` zorunlu degiskenleri:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `CORS_ORIGINS`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL`

Opsiyonel:
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT`
- `R2_BUCKET_NAME`
- `R2_CDN_DOMAIN`
- `OPENAI_API_KEY`
- `DEEPL_API_KEY`
- `GEMINI_API_KEY`
- `DEBUG`

Ornek domain degerleri:
- `CORS_ORIGINS=https://subtranslate.syrins.tech`
- `NEXT_PUBLIC_API_URL=https://subtranslate-backend.syrins.tech`

## 7. Coolify Tarafinda Gorulebilen Service Degiskenleri

Bazi kurulumlarda su degiskenler otomatik gelebilir:
- `SERVICE_URL_BACKEND`
- `SERVICE_FQDN_BACKEND`
- `SERVICE_URL_FRONTEND`
- `SERVICE_FQDN_FRONTEND`

Bu degiskenler uygulama kodunda zorunlu degilse, sadece Coolify internal metadata olarak kalabilir.

## 8. Volume ve Kalicilik

Compose volume'lari:
- `redis_data`
- `backend_storage`
- `backend_tmp`

Kritik not:
- `backend_storage` ve `backend_tmp` volume'larini silme.
- Kullanici dosyalari ve process gecici dosyalari bu volume'larda tutulur.

## 9. Deploy Sonrasi Kontroller

1. `https://subtranslate-backend.syrins.tech/health`
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

## 11. Production Onerileri

- `DEBUG=false`
- Secret rotasyonu yap
- Worker concurrency sunucu CPU'ya gore ayarla
- Log retention ve monitoring aktif et
- Periyodik backup ve restore testi yap

## 12. Rollback Stratejisi

1. Son bilinen saglam commit/tag'i sec
2. Coolify redeploy tetikle
3. Health ve temel akis testlerini tekrar calistir
4. Gerekirse DB migration rollback planini uygula

