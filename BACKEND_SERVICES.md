# SubTranslate Backend Servisleri

SubTranslate backend'i **3 ayrı servis** olarak çalışır. Her biri farklı bir görevi üstlenir.

---

## 1. FastAPI Backend (Ana API Sunucusu)

**Başlatma:** `python run.py`
**Port:** `http://localhost:8000`
**Docs:** `http://localhost:8000/docs`

Ana HTTP API sunucusu. Frontend'den gelen tüm istekleri karşılar.

### Ne yapar?
- **Kullanıcı kimlik doğrulama** — Supabase JWT token kontrolü
- **Proje yönetimi** — Video/altyazı yükleme, listeleme, silme
- **Dosya işleme** — FFmpeg ile video analizi, altyazı çıkarma
- **Çeviri işi oluşturma** — AI çeviri taleplerini alır, Celery'ye iletir
- **Export işi oluşturma** — Video dışa aktarma taleplerini alır, Celery'ye iletir
- **Depolama yönetimi** — Cloudflare R2'ye dosya yükleme/indirme
- **Admin paneli** — Sistem istatistikleri, kullanıcı/iş yönetimi
- **Health check** — Tüm servislerin durumunu kontrol eder (`/health`)

### API Rotaları:
| Rota | Açıklama |
|------|----------|
| `GET /health` | Sistem sağlık kontrolü |
| `/api/projects` | Proje CRUD, altyazı yönetimi |
| `/api/translate` | Çeviri işleri oluştur/sorgula/iptal |
| `/api/export` | Video dışa aktarma işleri |
| `/api/glossary` | Sözlük terimleri yönetimi |
| `/api/admin` | Admin işlemleri (istatistik, kullanıcı, ayar) |

---

## 2. Celery Worker (Arka Plan İş İşleyici)

**Başlatma:** `celery -A app.workers.celery_app worker --loglevel=info --concurrency=4 --pool=solo`

Uzun süren ağır işleri arka planda çalıştırır. Redis üzerinden FastAPI'den görev alır.

### Ne yapar?
- **AI Çeviri** — OpenAI / DeepL / Gemini API'leri ile altyazı satırlarını toplu çevirir
- **Video Export** — FFmpeg ile altyazıları videoya yakar (burn-in) veya soft-sub olarak ekler
- **Dosya temizliği** — Süresi dolan dosyaları R2'den ve veritabanından siler
- **Aylık kota sıfırlama** — Her ayın 1'inde kullanıcı çeviri kotalarını sıfırlar

### Neden ayrı bir servis?
Çeviri ve video export işlemleri **dakikalar hatta saatler** sürebilir. Bu işlemler ana API sunucusunda yapılsaydı, sunucu o süre boyunca diğer isteklere yanıt veremezdi. Celery Worker bu işleri arka planda, ana sunucudan bağımsız olarak yürütür.

### Görev akışı:
```
Frontend → FastAPI (iş oluştur) → Redis (kuyruğa ekle) → Celery Worker (işle)
                                                              ↓
                                                    Supabase (durumu güncelle)
                                                              ↓
                                                    R2 (sonuç dosyasını yükle)
```

---

## 3. Celery Beat (Zamanlayıcı / Cron)

**Başlatma:** `celery -A app.workers.celery_app beat --loglevel=info`

Periyodik (zamanlanmış) görevleri tetikler. Kendisi iş yapmaz, sadece belirlenen zamanlarda Celery Worker'a görev gönderir.

### Ne yapar?
| Görev | Zamanlama | Açıklama |
|-------|-----------|----------|
| `cleanup_expired_files_task` | Her 30 dakikada | Süresi dolan dosyaları R2'den ve DB'den temizler |
| `reset_monthly_usage` | Her ayın 1'i 00:00 | Kullanıcıların aylık çeviri kotasını sıfırlar |

### Neden ayrı bir servis?
Celery Worker birden fazla instance olarak çalışabilir (ölçeklendirme). Eğer zamanlayıcı her worker'ın içinde olsaydı, aynı görev birden fazla kez çalışırdı. Beat tek bir instance olarak çalışarak görevlerin **tam bir kez** tetiklenmesini garanti eder.

---

## Servislerin Birbirleriyle İlişkisi

```
┌─────────────┐     HTTP      ┌──────────────────┐
│   Frontend   │ ──────────── │  FastAPI Backend  │
│  (Next.js)   │              │   (Port 8000)     │
└─────────────┘              └────────┬───────────┘
                                       │
                                       │ Görev gönder
                                       ▼
                              ┌──────────────────┐
                              │      Redis        │
                              │  (Mesaj Kuyruğu)  │
                              └───┬──────────┬────┘
                                  │          │
                    Görev al      │          │   Zamanlı tetikle
                                  ▼          ▼
                         ┌──────────┐  ┌───────────┐
                         │  Celery   │  │  Celery    │
                         │  Worker   │  │  Beat      │
                         └─────┬─────┘  └───────────┘
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
              ┌──────────┐ ┌────────┐ ┌──────┐
              │ Supabase  │ │   R2   │ │  AI  │
              │   (DB)    │ │(Dosya) │ │ API  │
              └──────────┘ └────────┘ └──────┘
```

## Hızlı Başlatma / Durdurma

```powershell
# Tümünü başlat
.\start.ps1

# Tümünü durdur
.\stop.ps1
```
