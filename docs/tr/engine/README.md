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
- `CHAR_LIMIT_SINGLE = 35000`
- `CHAR_LIMIT_MEDIUM = 60000`
- `MAX_LINES_PER_BLOCK = 300`
- `OVERLAP_LINES = 20`

Kurallar:
- Kucuk icerik tek chunk
- Orta boy icerik bolumlere ayrilir
- Buyuk icerik max satir limitli bloklarla ilerler
- Context surekliligi icin overlap satirlari kullanilir

Amaç:
- Token/istek limitlerini zorlamamak
- Ceviri tutarliligini korumak
- Buyuk dosyalarda kararlilik saglamak

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

Ceviri istemi genelde su prensiple yazilir:
- Giris satirlari numaralandirilir (`1.`, `2.`, ...)
- Modelden ayni formatta yalnizca ceviri istenir
- Aciklama veya ekstra metin istenmez

Yanit parse:
- `_parse_numbered_response` satir bazli parse eder
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

