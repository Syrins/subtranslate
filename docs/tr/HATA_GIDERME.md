Aşağıda metnin Türkçe çevirisi yer almaktadır:

---

# Sorun Giderme Rehberi

## Yaygın Sorunlar ve Çözümleri

### 1. Celery Worker Redis’e Bağlanamıyor

**Hata Mesajı:**

```
[ERROR/MainProcess] consumer: Cannot connect to redis://redis:6379/0: Error 22 connecting to redis:6379. Invalid argument.
```

**Temel Neden:**
Platforma özel tamsayı sabitleri (TCP_KEEPIDLE, TCP_KEEPINTVL, TCP_KEEPCNT) kullanan socket keepalive ayarları, tüm Docker/Linux ortamlarında uyumlu değildir.

**Çözüm:**
Sorun [celery_app.py](../backend/app/workers/celery_app.py) dosyasında şu şekilde giderildi:

* Platforma özel sabitler içeren `socket_keepalive_options` kaldırıldı
* Bağlantı izleme için `health_check_interval: 30` korundu
* Daha iyi performans için `broker_pool_limit` 1’den 10’a çıkarıldı

**Doğrulama:**

```bash
# Celery worker loglarını kontrol edin
docker logs <celery-worker-container>

# Şu çıktıyı görmelisiniz:
# [tasks]
#   . app.workers.tasks.cleanup_expired_files_task
#   . app.workers.tasks.reset_monthly_usage
#   . app.workers.tasks.run_export_task
#   . app.workers.tasks.run_project_processing_task
#   . app.workers.tasks.run_translation_task
# [INFO/MainProcess] Connected to redis://redis:6379/0
```

---

### 2. Redis Bellek Uyarısı

**Uyarı Mesajı:**

```
WARNING Memory overcommit must be enabled! Without it, a background save or replication may fail under low memory condition.
```

**Etkisi:**
Bu bir hatadan ziyade uyarıdır. Redis çalışmaya devam eder, ancak düşük bellek durumunda arka plan kayıt işlemleri başarısız olabilir.

**Çözüm (Coolify/Docker):**
Coolify’nin host yapılandırması tarafından yönetilir. Redis hataları görmüyorsanız işlem yapmanız gerekmez.

**Çözüm (Linux Host):**

```bash
sudo sysctl vm.overcommit_memory=1
# Kalıcı yapmak için:
echo "vm.overcommit_memory = 1" | sudo tee -a /etc/sysctl.conf
```

---

### 3. Backend Storage’a Erişemiyor

**Hata Mesajı:**

```
FileNotFoundError: [Errno 2] No such file or directory: '/app/storage/users/...'
```

**Temel Neden:**
Storage volume’leri doğru mount edilmemiş veya dizinler oluşturulmamış.

**Çözüm:**
docker-compose.yml içindeki volume’leri kontrol edin:

```yaml
volumes:
  - backend_storage:/app/storage
  - backend_tmp:/app/tmp
```

Volume’lerle birlikte container’ları yeniden oluşturun:

```bash
docker-compose down
docker-compose up -d
```

---

### 4. Frontend Build Başarısız – Eksik Ortam Değişkenleri

**Hata Mesajı:**

```
Error: NEXT_PUBLIC_SUPABASE_URL is not defined
```

**Temel Neden:**
Next.js `NEXT_PUBLIC_*` değişkenlerini **build sırasında** ister (bundle içine gömülür).

**Çözüm (Coolify):**

1. Frontend servisine gidin
2. Build-time environment variable’ları ekleyin:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_API_URL=https://api.yourdomain.com
   ```
3. Servisi yeniden build edin

**Çözüm (docker-compose):**
Root dizindeki `.env` dosyasına ekleyin:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

### 5. Celery Beat Görev Zamanlamıyor

**Belirtiler:**

* Süresi dolan dosyalar otomatik silinmiyor
* Aylık kullanım sıfırlanmıyor

**Temel Neden:**

* Celery beat schedule dosyası sorunu
* Birden fazla beat instance çalışıyor

**Çözüm:**

```bash
# Tüm celery servislerini durdurun
docker-compose stop celery-beat celery-worker

# Eski schedule dosyalarını silin
docker-compose exec celery-beat rm -f /tmp/celerybeat-schedule*

# Yeniden başlatın
docker-compose up -d celery-beat celery-worker
```

**Doğrulama:**

```bash
# Beat loglarını kontrol edin
docker logs <celery-beat-container>

# Şu çıktıyı görmelisiniz:
# Scheduler: Sending due task cleanup-expired-files
# Scheduler: Sending due task reset-monthly-usage
```

---

### 6. Yüksek Bellek Kullanımı

**Belirtiler:**

* Backend OOM (Out of Memory) hatası
* Yavaş çeviri işlemleri

**Temel Neden:**

* Büyük video dosyalarının belleğe yüklenmesi
* FFmpeg işlemleri

**Çözümler:**

1️⃣ **Dosya streaming kullanın** (storage.py içinde mevcut):

```python
# Doğru: Dosya yolları kullanır
storage.copy_to(key, dest_path)
storage.upload_file(key, file_path)

# Kaçının: RAM’e yükler
data = storage.download(key)  # Sadece küçük dosyalar için
```

2️⃣ **Eşzamanlı worker sayısını sınırlayın:**

```yaml
celery-worker:
  command: celery -A app.workers.celery_app worker --loglevel=info --concurrency=2
```

3️⃣ **Bellek limitleri ayarlayın (Coolify):**

* Backend: 2GB
* Celery Worker: 4GB (FFmpeg daha fazla bellek ister)
* Redis: 512MB

---

### 7. Çeviri İşleri "Processing" Durumunda Takılı Kalıyor

**Belirtiler:**

* İş sürekli "processing" durumunda kalıyor
* Loglarda hata görünmüyor

**Temel Neden:**

* Celery worker çökmüş olabilir
* API anahtarı geçersiz/süresi dolmuş
* AI servisine ağ zaman aşımı

**Debug:**

```bash
docker logs <celery-worker-container> --tail 100
```

Veritabanında ilgili işi kontrol edin (`translation_jobs` tablosundaki `error_message` alanı).

**Çözümler:**

1. Environment variable’lardaki API anahtarlarını kontrol edin
2. Celery worker’ı yeniden başlatın
3. Takılı işi iptal edip yeniden deneyin:

```bash
curl -X POST http://localhost:8000/translate/{job_id}/cancel \
  -H "Authorization: Bearer $TOKEN"
```

---

### 8. Frontend’de CORS Hataları

**Hata Mesajı (Tarayıcı Konsolu):**

```
Access to XMLHttpRequest at 'https://api.domain.com' from origin 'https://app.domain.com' has been blocked by CORS policy
```

**Çözüm:**
Backend environment değişkenlerinde `CORS_ORIGINS` güncelleyin:

```bash
# Coolify
CORS_ORIGINS=https://app.yourdomain.com,https://www.yourdomain.com

# docker-compose .env
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
```

Backend’i yeniden başlatın:

```bash
docker-compose restart backend
```

---

# Deployment Kontrol Listesi (Coolify)

### ✅ Environment Variables

* Backend: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REDIS_URL, CORS_ORIGINS
* Frontend: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_API_URL
* Workers: Backend değişkenleri + AI API anahtarları (OPENAI_API_KEY, DEEPL_API_KEY, GEMINI_API_KEY)

### ✅ Health Check

* Backend: `/health` endpoint
* Frontend: `http://localhost:3000`
* Redis: `redis-cli ping`

### ✅ Volume’ler

* `redis_data:/data`
* `backend_storage:/app/storage`
* `backend_tmp:/app/tmp`

### ✅ Servis Bağımlılıkları

* Backend → Redis (healthy)
* Workers → Redis (healthy)
* Frontend → Backend (healthy)

### ✅ Portlar

* Backend: 8000
* Frontend: 3000
* Redis: 6379 (sadece internal)

---

# Log ve İzleme

### Docker Logları

```bash
docker-compose logs -f
docker-compose logs -f backend
docker-compose logs -f celery-worker
docker-compose logs --tail 100 celery-worker
```

### Coolify Logları

1. Servis sayfasına gidin
2. "Logs" sekmesine tıklayın
3. Log türünü seçin (build, deployment, application)

---

# Performans Ayarları

### Celery Worker Concurrency

* Düşük bellek (< 4GB): `--concurrency=2`
* Orta (4–8GB): `--concurrency=4`
* Yüksek (> 8GB): `--concurrency=8`

### Redis Bellek

```yaml
redis:
  command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
```

### Backend Worker Sayısı

```yaml
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2

# Yüksek trafik için:
--workers 4
```

---

# İlgili Dokümantasyon

* Ana README
* Backend Dokümantasyonu
* Frontend Dokümantasyonu
* Deployment Rehberi