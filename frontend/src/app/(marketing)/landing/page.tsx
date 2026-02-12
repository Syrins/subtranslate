"use client";

import Link from "next/link";
import {
  Sparkles,
  Upload,
  Languages,
  Subtitles,
  Download,
  ArrowRight,
  Zap,
  Shield,
  Globe,
  CheckCircle2,
  Play,
  FileVideo,
  Palette,
  Volume2,
  Monitor,
  Clock,
  Users,
  Star,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";

const steps = [
  {
    step: "01",
    icon: Upload,
    title: "Video Yükle",
    desc: "MKV/MP4 dosyanızı sürükleyip bırakın veya URL yapıştırın. Sistem altyazı ve ses parçalarını otomatik tespit eder.",
    color: "text-blue-500 bg-blue-500/10",
    detail: "SRT, ASS, SSA formatları desteklenir",
  },
  {
    step: "02",
    icon: Languages,
    title: "AI ile Çevir",
    desc: "OpenAI GPT-4, DeepL Pro veya Google Gemini motorlarıyla bağlam duyarlı, doğal çeviri yapın.",
    color: "text-green-500 bg-green-500/10",
    detail: "30+ dil, sözlük ve bağlam desteği",
  },
  {
    step: "03",
    icon: Subtitles,
    title: "Düzenle & Stillendir",
    desc: "140+ font, renk, outline, gölge ve konum ayarlarını canlı video önizleme üzerinde yapın.",
    color: "text-purple-500 bg-purple-500/10",
    detail: "Google Fonts entegrasyonu",
  },
  {
    step: "04",
    icon: Download,
    title: "Dışa Aktar",
    desc: "Burn-in veya soft-sub olarak 4K'ya kadar yüksek kalite MP4 dışa aktarın. Watermark ve çoklu ses desteği.",
    color: "text-amber-500 bg-amber-500/10",
    detail: "H.264, H.265, VP9, AV1 codec",
  },
];

const features = [
  {
    icon: Zap,
    title: "Hızlı İşleme",
    desc: "Queue tabanlı worker sistemi ile paralel video işleme. Büyük dosyalar bile dakikalar içinde hazır.",
  },
  {
    icon: Shield,
    title: "Güvenli Depolama",
    desc: "Presigned URL ile Cloudflare R2 veya Backblaze B2 üzerinde şifreli dosya saklama ve aktarım.",
  },
  {
    icon: Globe,
    title: "30+ Dil Desteği",
    desc: "Japonca, Korece, Çince, İngilizce, Arapça dahil 30'dan fazla dil çifti arasında çeviri.",
  },
  {
    icon: Palette,
    title: "Gelişmiş Stil Editörü",
    desc: "Font, renk, outline, gölge, arka plan opaklığı ve 9 farklı konum ile tam kontrol.",
  },
  {
    icon: Volume2,
    title: "Çoklu Ses Parçası",
    desc: "Orijinal videodaki tüm ses parçalarını koruyarak dışa aktarma. Ses kalitesi kaybı yok.",
  },
  {
    icon: Monitor,
    title: "Canlı Önizleme",
    desc: "Altyazı stilini video üzerinde gerçek zamanlı görün. Değişiklikler anında yansır.",
  },
];

const stats = [
  { value: "30+", label: "Desteklenen Dil" },
  { value: "140+", label: "Font Seçeneği" },
  { value: "4K", label: "Maksimum Çözünürlük" },
  { value: "3", label: "AI Çeviri Motoru" },
];

const plans = [
  {
    name: "Free",
    price: "Ücretsiz",
    desc: "Başlangıç için ideal",
    features: ["1.000 satır/ay çeviri", "500 MB depolama", "720p dışa aktarma", "7 gün dosya saklama"],
    cta: "Ücretsiz Başla",
    popular: false,
  },
  {
    name: "Pro",
    price: "₺149/ay",
    desc: "Profesyonel çevirmenler için",
    features: ["50.000 satır/ay çeviri", "50 GB depolama", "1080p dışa aktarma", "30 gün dosya saklama", "Öncelikli kuyruk", "Watermark opsiyonel"],
    cta: "Pro'ya Geç",
    popular: true,
  },
  {
    name: "Team",
    price: "₺399/ay",
    desc: "Takımlar ve stüdyolar için",
    features: ["Sınırsız çeviri", "200 GB depolama", "4K dışa aktarma", "90 gün dosya saklama", "API erişimi", "Takım yönetimi"],
    cta: "İletişime Geç",
    popular: false,
  },
];

const faqs = [
  {
    q: "Hangi video formatları destekleniyor?",
    a: "MKV, MP4, AVI formatlarındaki videoları yükleyebilirsiniz. Altyazı olarak SRT, ASS ve SSA formatları desteklenir.",
  },
  {
    q: "Çeviri kalitesi nasıl?",
    a: "OpenAI GPT-4, DeepL Pro ve Google Gemini gibi en gelişmiş AI motorlarını kullanıyoruz. Bağlam duyarlı çeviri ile doğal sonuçlar elde edersiniz.",
  },
  {
    q: "Dosyalarım ne kadar süre saklanır?",
    a: "Free planda 7 gün, Pro planda 30 gün, Team planda 90 gün. Kendi R2/B2 depolama alanınızı bağlayarak süresiz saklayabilirsiniz.",
  },
  {
    q: "Burn-in ve soft-sub arasındaki fark nedir?",
    a: "Burn-in: Altyazı videoya kalıcı yazılır, her yerde görünür. Soft-sub: Altyazı ayrı parça olarak eklenir, oynatıcıda açılıp kapatılabilir.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between border-b bg-background/80 px-6 backdrop-blur-md lg:px-10">
        <Link href="/landing" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-base font-bold">SubTranslate</span>
        </Link>
        <div className="hidden items-center gap-6 text-sm md:flex">
          <a href="#features" className="text-muted-foreground transition-colors hover:text-foreground">Özellikler</a>
          <a href="#how-it-works" className="text-muted-foreground transition-colors hover:text-foreground">Nasıl Çalışır</a>
          <a href="#pricing" className="text-muted-foreground transition-colors hover:text-foreground">Fiyatlandırma</a>
          <a href="#faq" className="text-muted-foreground transition-colors hover:text-foreground">SSS</a>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Giriş Yap</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/register">Ücretsiz Başla</Link>
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--color-primary)/8%,transparent_60%)]" />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-20 text-center lg:py-28">
          <Badge variant="secondary" className="gap-1.5 px-4 py-1.5 text-sm">
            <Sparkles className="h-3.5 w-3.5" />
            AI Destekli Altyazı Çeviri Platformu
          </Badge>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-5xl lg:text-6xl">
            Altyazı çevirinizi{" "}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              otomatikleştirin
            </span>
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Anime, dizi ve film altyazılarını AI motorlarıyla çevirin, canlı önizleme ile
            stilleyin ve yüksek kalite video olarak dışa aktarın. Tek platformda, uçtan uca.
          </p>
          <div className="flex items-center gap-3">
            <Button size="lg" className="h-12 px-8 text-base" asChild>
              <Link href="/register">
                Ücretsiz Başla
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="h-12 px-8 text-base" asChild>
              <Link href="#how-it-works">
                <Play className="mr-2 h-4 w-4" />
                Nasıl Çalışır
              </Link>
            </Button>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {["Kredi kartı gerekmez", "1.000 satır/ay ücretsiz", "Anında başlayın"].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b bg-muted/30">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 px-6 py-10 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1 text-center">
              <span className="text-3xl font-bold text-primary">{s.value}</span>
              <span className="text-sm text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-b">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:px-10 lg:py-20">
          <div className="mb-12 text-center">
            <Badge variant="outline" className="mb-4">4 Kolay Adım</Badge>
            <h2 className="text-3xl font-bold tracking-tight">Nasıl Çalışır?</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Video yüklemeden dışa aktarmaya kadar tüm süreç 4 basit adımda tamamlanır.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <div key={s.step} className="group relative flex flex-col gap-4 rounded-2xl border bg-card p-6 transition-all hover:border-primary/40 hover:shadow-lg">
                <div className="flex items-center justify-between">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${s.color}`}>
                    <s.icon className="h-6 w-6" />
                  </div>
                  <span className="text-2xl font-bold text-muted-foreground/30">{s.step}</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                </div>
                <div className="mt-auto flex items-center gap-1.5 text-xs text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {s.detail}
                </div>
                {i < steps.length - 1 && (
                  <ChevronRight className="absolute -right-3 top-1/2 hidden h-6 w-6 -translate-y-1/2 text-muted-foreground/30 lg:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-b bg-muted/20">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:px-10 lg:py-20">
          <div className="mb-12 text-center">
            <Badge variant="outline" className="mb-4">Özellikler</Badge>
            <h2 className="text-3xl font-bold tracking-tight">Her Şey Tek Platformda</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Profesyonel altyazı çevirisi için ihtiyacınız olan tüm araçlar.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="flex gap-4 rounded-xl border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-md">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Preview */}
      <section className="border-b">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:px-10 lg:py-20">
          <div className="mb-10 text-center">
            <Badge variant="outline" className="mb-4">Canlı Önizleme</Badge>
            <h2 className="text-3xl font-bold tracking-tight">Editör Deneyimi</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Altyazılarınızı video üzerinde gerçek zamanlı düzenleyin ve stilleyin.
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border bg-card shadow-2xl">
            {/* Mock editor toolbar */}
            <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-500/60" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/60" />
                <div className="h-3 w-3 rounded-full bg-green-500/60" />
              </div>
              <span className="ml-2 text-xs text-muted-foreground">SubTranslate Editor — anime_ep01.mkv</span>
            </div>
            {/* Mock video area */}
            <div className="relative flex aspect-video items-end justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-white/10">
                  <FileVideo className="mx-auto h-20 w-20" />
                  <p className="mt-2">Video Önizleme Alanı</p>
                </div>
              </div>
              <div className="relative rounded bg-black/60 px-6 py-2">
                <p className="text-center text-lg font-medium text-white" style={{ textShadow: "2px 2px 4px #000" }}>
                  Günaydın, hocam. Bugün hava çok güzel!
                </p>
              </div>
            </div>
            {/* Mock timeline */}
            <div className="flex items-center gap-3 border-t bg-muted/30 px-4 py-3">
              <Play className="h-4 w-4 text-muted-foreground" />
              <div className="h-1.5 flex-1 rounded-full bg-muted">
                <div className="h-1.5 w-1/3 rounded-full bg-primary" />
              </div>
              <span className="text-xs text-muted-foreground">00:05 / 00:24</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-b bg-muted/20">
        <div className="mx-auto max-w-5xl px-6 py-16 lg:px-10 lg:py-20">
          <div className="mb-12 text-center">
            <Badge variant="outline" className="mb-4">Fiyatlandırma</Badge>
            <h2 className="text-3xl font-bold tracking-tight">Basit ve Şeffaf Fiyatlandırma</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              İhtiyacınıza uygun planı seçin. İstediğiniz zaman yükseltin veya iptal edin.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border p-6 transition-all hover:shadow-lg ${
                  plan.popular ? "border-primary shadow-md" : ""
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary px-3">En Popüler</Badge>
                  </div>
                )}
                <div className="mb-4">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">{plan.desc}</p>
                </div>
                <div className="mb-6">
                  <span className="text-3xl font-bold">{plan.price}</span>
                </div>
                <ul className="mb-6 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button variant={plan.popular ? "default" : "outline"} className="w-full" asChild>
                  <Link href="/register">{plan.cta}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-b">
        <div className="mx-auto max-w-3xl px-6 py-16 lg:px-10 lg:py-20">
          <div className="mb-12 text-center">
            <Badge variant="outline" className="mb-4">SSS</Badge>
            <h2 className="text-3xl font-bold tracking-tight">Sıkça Sorulan Sorular</h2>
          </div>
          <div className="space-y-4">
            {faqs.map((faq) => (
              <div key={faq.q} className="rounded-xl border bg-card p-5">
                <h3 className="font-semibold">{faq.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-b bg-primary/5">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-16 text-center lg:py-20">
          <h2 className="text-3xl font-bold tracking-tight">Hemen Başlayın</h2>
          <p className="max-w-xl text-muted-foreground">
            Ücretsiz hesap oluşturun ve altyazı çeviri iş akışınızı dakikalar içinde başlatın.
            Kredi kartı gerekmez.
          </p>
          <Button size="lg" className="h-12 px-8 text-base" asChild>
            <Link href="/register">
              Ücretsiz Hesap Oluştur
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-muted/30 px-6 py-8 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-semibold">SubTranslate</span>
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground">Gizlilik</a>
            <a href="#" className="hover:text-foreground">Kullanım Şartları</a>
            <a href="#" className="hover:text-foreground">İletişim</a>
          </div>
          <p className="text-xs text-muted-foreground">&copy; 2026 SubTranslate. Tüm hakları saklıdır.</p>
        </div>
      </footer>
    </div>
  );
}
