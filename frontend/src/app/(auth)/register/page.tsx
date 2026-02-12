"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Languages,
  Subtitles,
  Download,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuthContext } from "@/components/auth-provider";
import { toast } from "sonner";

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { signUp, signInWithGoogle } = useAuthContext();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !firstName) return;
    if (password.length < 8) {
      toast.error("Şifre en az 8 karakter olmalıdır.");
      return;
    }
    setSubmitting(true);
    const fullName = `${firstName} ${lastName}`.trim();
    const ok = await signUp(email, password, fullName);
    setSubmitting(false);
    if (ok) {
      toast.success("Kayıt başarılı! E-postanızı kontrol edin.");
      router.push("/login");
    } else {
      toast.error("Kayıt başarısız. Lütfen bilgilerinizi kontrol edin.");
    }
  };

  return (
    <div className="flex h-screen">
      {/* Left - Branding */}
      <div className="hidden flex-col justify-between overflow-hidden bg-primary/5 p-10 lg:flex lg:w-1/2">
        <Link href="/landing" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold">SubTranslate</span>
        </Link>

        <div className="space-y-5">
          <h1 className="text-3xl font-bold leading-tight tracking-tight">
            Ücretsiz başlayın,
            <br />
            <span className="text-primary">hemen çevirmeye</span> başlayın.
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Kayıt olun ve altyazı çeviri iş akışınızı dakikalar içinde
            başlatın. Kredi kartı gerekmez.
          </p>

          {/* Mock translation preview */}
          <div className="overflow-hidden rounded-xl border bg-card shadow-lg">
            <div className="flex items-center gap-1.5 border-b bg-muted/50 px-3 py-1.5">
              <div className="h-2 w-2 rounded-full bg-red-500/50" />
              <div className="h-2 w-2 rounded-full bg-yellow-500/50" />
              <div className="h-2 w-2 rounded-full bg-green-500/50" />
              <span className="ml-2 text-[10px] text-muted-foreground">çeviri — japonca → türkçe</span>
            </div>
            <div className="divide-y text-xs">
              <div className="grid grid-cols-[24px_1fr_1fr] gap-2 bg-muted/30 px-3 py-1.5 font-medium text-muted-foreground">
                <span>#</span><span>Orijinal</span><span>Çeviri</span>
              </div>
              {[
                { id: 1, orig: "おはようございます、先生。", tr: "Günaydın, hocam." },
                { id: 2, orig: "今日はとても良い天気ですね。", tr: "Bugün hava çok güzel, değil mi?" },
                { id: 3, orig: "散歩に行きましょう。", tr: "Yürüyüşe çıkalım." },
              ].map((line) => (
                <div key={line.id} className="grid grid-cols-[24px_1fr_1fr] gap-2 px-3 py-2">
                  <span className="text-muted-foreground">{line.id}</span>
                  <span className="text-muted-foreground">{line.orig}</span>
                  <span className="text-green-400">{line.tr}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {[
              { icon: Languages, text: "Aylık 1.000 satır ücretsiz çeviri" },
              { icon: Subtitles, text: "Tüm stil ve düzenleme araçları" },
              { icon: Download, text: "720p video dışa aktarma dahil" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3 text-sm">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <item.icon className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs text-muted-foreground">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            &copy; 2026 SubTranslate
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>30+ Dil</span>
            <span>140+ Font</span>
            <span>4K Export</span>
          </div>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex w-full flex-col items-center justify-center px-6 lg:w-1/2">
        <div className="w-full max-w-sm space-y-5">
          <div className="flex flex-col items-center gap-2 lg:items-start">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground lg:hidden">
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-bold">Kayıt Ol</h2>
            <p className="text-sm text-muted-foreground">
              Ücretsiz hesap oluşturun
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-xs">Ad</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="firstName" placeholder="Ad" className="h-10 pl-9" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-xs">Soyad</Label>
                <Input id="lastName" placeholder="Soyad" className="h-10" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">E-posta</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="email@example.com"
                  className="h-10 pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">Şifre</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="h-10 pl-9 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                En az 8 karakter, bir büyük harf ve bir rakam
              </p>
            </div>

            <Button className="h-10 w-full" type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Kayıt Ol
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                veya
              </span>
            </div>
          </div>

          <Button variant="outline" className="h-10 w-full" onClick={signInWithGoogle} type="button">
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Google ile Kayıt Ol
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Zaten hesabınız var mı?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Giriş Yap
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
