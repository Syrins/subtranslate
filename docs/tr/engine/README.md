# Engine Dokumani (TR)

Bu dokuman, projedeki ceviri ve medya isleme motorlarinin teknik yapisini anlatir.

## 1. Kapsam

Bu baslik iki ayri motor katmanini kapsar:
- AI ceviri motorlari (`openai`, `deepl`, `gemini`)
- Medya export motoru (FFmpeg tabanli burn-in/mux)

## 2. Ceviri Pipeline Ozeti

Ceviri pipeline asamalari:
1. Job kaydi olusturulur (`queued`)
2. Worker job'u `processing` yapar
3. Altyazi dosyasi parse edilir
4. Chunk olusturma algoritmasi uygulanir
5. Her chunk ilgili engine'e gonderilir
6. Sonuclar satir numarasina gore birlestirilir
7. Cikti dosyasi yazilir
8. Job `completed` veya `failed` olur

## 3. Chunking Stratejisi

Temel parametreler:
- `CHAR_LIMIT_SAFE_CAP = 12000` — API istek boyutu icin guvenlik limiti
- `MAX_LINES_PER_BLOCK = 80` — chunk basina optimal satir sayisi (LLM desync onler)
- `OVERLAP_LINES = 20` — chunklar arasi baglam ortusme sayisi
- `MIN_LINES_FOR_SPLIT = 100` — bunun altindaki dosyalar tek chunk olarak gonderilir

Kurallar:
- **Satir sayisi birincil bolme kriteridir**, karakter sayisi degil
- Kucuk dosyalar (≤100 satir VE ≤12K karakter) → tek chunk
- Buyuk dosyalar → 80 satirlik bloklar, 20 satirlik overlap ile kayan pencere
- Karakter limiti sadece guvenlik agi olarak kullanilir (asilarsa blok kuculur)

Overlap yonetimi:
- Ilk chunk: overlap yok, tum satirlar cevrilir
- Sonraki chunklar: ilk 20 satir sadece baglam icin (onceki bloktan)
- AI'ya overlap satirlarini cevirMEmesi soylenir (prompt muhendisligi)
- Post-processing guvenlik agi: model talimati yok sayarsa overlap satirlari otomatik silinir
- `translated_map` tekrar kontrolu ile hicbir satir iki kez yazilmaz

Amac:
- Uzun dosyalarda LLM satir kaymasi / desenkronizasyonu onlemek
- Chunklar arasi karakter sesi ve ton tutarliligini korumak
- Token/istek limitlerini zorlamamak

## 4. Desteklenen AI Engine'ler

### 4.1 OpenAI Engine
- Async OpenAI client kullanir.
- Numbered subtitle prompt modeli uygular.
- Yanit numbered parse edilerek satirlara map edilir.

### 4.2 DeepL Engine
- DeepL Python client kullanir.
- Blocking cagrilar event loop'u bloklamasin diye executor ile calistirilir.
- Dil kodu esleme tablosu (`DEEPL_LANG_MAP`) kullanilir.

### 4.3 Gemini Engine
- Google GenAI client kullanir.
- Cagrilar executor uzerinden calistirilir.
- Numbered response parse edilir.

## 5. Prompt ve Cikti Formati

### System Prompt (Adaptif Lokalizasyon)
System prompt AI'ya sabit kurallar vermek yerine *nasil dusunecegini* ogretir:
- **Guc dinamigi analizi** — dominant/submissive/esit konusmacilari tespit et
- **Duygusal sicaklik eslestirme** — romantik vs yogun vs komedi
- **Karakter sesi tutarliligi** — baglamdan karakter tipini cikar
- **Akicilik > Literallik** — deyimleri adapte et, asla kelimesi kelimesine cevirme
- Teknik kurallar: numaralama, ASS taglari, kekelemeler, ses efektleri korunur

### Overlap-Aware Kullanici Mesaji
Ilk chunk disindaki chunklar icin:
- Onceki cevrilen satirlar ton/karakter referansi olarak verilir
- Overlap satirlari acikca "SADECE BAGLAM — cevirME" olarak isaretlenir
- AI'ya ciktisina N+1. satirdan baslamasi soylenir

### Cikti Parse
- `_parse_numbered_response` satir bazli parse eder
- **Post-processing guvenlik agi**: model overlap talimatini yok sayar ve tum satirlari cevirirse, ilk N overlap satiri otomatik silinir
- Eksik satir varsa bos string ile pad edilir
- Fazla satir varsa kesilir

Bu sayede satir sayisi tutarliligi korunur.

## 6. Glossary Davranisi

Glossary aciksa:
- On islemde kaynak metne marker eklenir (`term[=target]`)
- Ceviri sonrasi marker temizlenir

Amac:
- Kritik terimlerin daha kararlı cevrilmesi
- Marka/urun/ozel ad tutarliligi

## 7. Retry ve Hata Toleransi

Engine seviyesinde:
- `tenacity` ile retry uygulanir
- exponential backoff kullanilir

Worker seviyesinde:
- task bazli retry (`max_retries`, `default_retry_delay`)
- job status DB'ye yazilarak izlenebilirlik korunur

## 8. Maliyet Hesaplama

Ceviri maliyeti:
- `translation_engines.cost_per_line` x `total_lines`

Bu deger job tamamlandiginda `cost_usd` alanina yazilir.

## 9. Medya Export Engine (FFmpeg)

Desteklenen modlar:
- Burn-in (hard subtitle)
- Soft-sub mux

Temel fonksiyonlar:
- `burn_subtitles(...)`
- `mux_subtitles(...)`
- `probe_file(...)`
- `extract_all_subtitles(...)`

Codec secenekleri:
- h264, h265, vp9, av1, copy

Progress:
- FFmpeg `-progress` ciktisi ile yuzde guncellenir
- Job ilerlemesi DB'ye yazilir

## 10. Performans ve Kalite Tuning

Ceviri kalitesi:
- context acik tut
- uygun source/target dili kullan
- glossary'i domain bazli tanimla

Hiz:
- Chunk boyutu asiri buyutulmemeli
- Worker concurrency sunucuya gore ayarlanmali
- API rate limitlerine gore engine secimi yapilmali

## 11. Yeni Ceviri Engine Ekleme Rehberi

1. `TranslationEngine` interface'ini implemente et.
2. `translate_batch()` sozlesmesine uy.
3. Numbered output parse stratejisini koru.
4. `get_engine()` factory map'ine ekle.
5. Gerekli env/config alanlarini tanimla.
6. Admin panelde engine kaydini ac.

## 12. Riskler ve Korumalar

Risk:
- Model cevabi satir sayisini bozabilir.
- External API timeout/rate-limit olabilir.
- Buyuk dosyalarda uzun sureli encode tasklari iptal edilebilir.

Koruma:
- parse pad/trim
- retry + backoff
- cancel kontrol noktalarini arttirma
- queue tabanli islemlerle API stabilitesini koruma

