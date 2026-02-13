"use client";

import { useState, useEffect } from "react";
import {
  Settings,
  User,
  Key,
  CreditCard,
  Bell,
  Globe,
  Shield,
  Zap,
  CheckCircle2,
  ExternalLink,
  HardDrive,
  Cloud,
  Info,
  Loader2,
  Trash2,
  Wifi,
  WifiOff,
  XCircle,
  Plus,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useAuthContext } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { formatBytes } from "@/lib/utils";
import { api } from "@/lib/api";

const ENGINE_CONFIG = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-5, GPT-4.1 ve diğer OpenAI modelleri",
    color: "bg-green-500/10 text-green-500",
    placeholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
    allowCustomModel: false,
    models: [
      { id: "gpt-4.1-mini", label: "GPT-4.1 Mini (Önerilen)" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini" },
      { id: "gpt-5-nano", label: "GPT-5 Nano" },
      { id: "gpt-5-mini", label: "GPT-5 Mini" },
      { id: "gpt-5", label: "GPT-5" },
      { id: "gpt-5.2", label: "GPT-5.2" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Yüzlerce modele tek API anahtarıyla erişin",
    color: "bg-purple-500/10 text-purple-500",
    placeholder: "sk-or-...",
    docsUrl: "https://openrouter.ai/keys",
    allowCustomModel: true,
    models: [
      { id: "openai/gpt-4.1-mini", label: "OpenAI GPT-4.1 Mini" },
      { id: "openai/gpt-4.1", label: "OpenAI GPT-4.1" },
      { id: "openai/gpt-4o", label: "OpenAI GPT-4o" },
      { id: "openai/gpt-4o-mini", label: "OpenAI GPT-4o Mini" },
      { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
      { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "deepseek/deepseek-chat-v3", label: "DeepSeek V3" },
      { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Gemini 2.5 ve 3 modelleri",
    color: "bg-blue-500/10 text-blue-500",
    placeholder: "AI...",
    docsUrl: "https://aistudio.google.com/app/apikey",
    allowCustomModel: false,
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (Önerilen)" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)" },
      { id: "gemini-3-pro-preview", label: "Gemini 3 Pro (Preview)" },
    ],
  },
  {
    id: "deepl",
    name: "DeepL",
    description: "Hızlı ve doğal çeviri",
    color: "bg-cyan-500/10 text-cyan-500",
    placeholder: "...",
    docsUrl: "https://www.deepl.com/pro-api",
    allowCustomModel: false,
    models: [],
  },
];

export default function SettingsPage() {
  const { user, profile, plan, loading, refreshProfile } = useAuthContext();
  const supabase = createClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // API keys — multi-key per engine with model support
  interface ApiKeyEntry {
    id?: string;
    engine: string;
    api_key_encrypted: string;
    model_id: string;
    label: string;
    is_default: boolean;
    _isNew?: boolean;
  }
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [savingKeys, setSavingKeys] = useState(false);

  const [emailNotifications, setEmailNotifications] = useState(true);
  const [exportNotifications, setExportNotifications] = useState(true);
  const [language, setLanguage] = useState("tr");
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [allPlans, setAllPlans] = useState<Array<{
    id: string; name: string; lines_per_month: number; storage_gb: number;
    daily_job_limit: number; retention_days: number; can_use_system_keys: boolean;
    max_export_resolution: string; watermark_required: boolean; price_monthly: number;
  }>>([]);

  // Storage config state
  const [storageProvider, setStorageProvider] = useState<"r2" | "b2">("r2");
  const [r2AccountId, setR2AccountId] = useState("");
  const [r2AccessKey, setR2AccessKey] = useState("");
  const [r2SecretKey, setR2SecretKey] = useState("");
  const [r2BucketName, setR2BucketName] = useState("");
  const [r2Endpoint, setR2Endpoint] = useState("");
  const [b2KeyId, setB2KeyId] = useState("");
  const [b2AppKey, setB2AppKey] = useState("");
  const [b2BucketName, setB2BucketName] = useState("");
  const [b2BucketId, setB2BucketId] = useState("");
  const [b2Endpoint, setB2Endpoint] = useState("");
  const [storageConfigId, setStorageConfigId] = useState<string | null>(null);
  const [storageActive, setStorageActive] = useState(false);
  const [savingStorage, setSavingStorage] = useState(false);
  const [deletingStorage, setDeletingStorage] = useState(false);
  const [storageTestResult, setStorageTestResult] = useState<string | null>(null);
  const [testingStorage, setTestingStorage] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setEmailNotifications(profile.email_notifications ?? true);
      setExportNotifications(profile.export_notifications ?? true);
      setLanguage(profile.locale || "tr");
    } else if (user) {
      const fallbackName = typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : "";
      setFullName(fallbackName);
    }
    if (user) {
      setEmail(user.email || "");
    }
  }, [profile, user]);

  useEffect(() => {
    supabase.from("subscription_plans").select("*").order("price_monthly").then(({ data }) => {
      if (data) setAllPlans(data as typeof allPlans);
    });

    if (user) {
      supabase.from("user_api_keys").select("*").eq("user_id", user.id).then(({ data }) => {
        if (data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const loaded = (data as any[]).map((k) => ({
            id: k.id,
            engine: k.engine,
            api_key_encrypted: k.api_key_encrypted ? "••••••••" : "",
            model_id: k.model_id || "",
            label: k.label || "",
            is_default: k.is_default ?? false,
          }));
          setApiKeys(loaded);
        }
      });

      // Load storage config
      supabase.from("user_storage_configs").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
        if (data) {
          setStorageConfigId(data.id);
          setStorageProvider(data.provider as "r2" | "b2");
          setStorageActive(data.is_active ?? false);
          setStorageTestResult(data.last_test_result);
          if (data.provider === "r2") {
            setR2AccountId(data.r2_account_id || "");
            setR2AccessKey(data.r2_access_key ? "••••••••" : "");
            setR2SecretKey(data.r2_secret_key_encrypted ? "••••••••" : "");
            setR2BucketName(data.r2_bucket_name || "");
            setR2Endpoint(data.r2_endpoint || "");
          } else {
            setB2KeyId(data.b2_key_id ? "••••••••" : "");
            setB2AppKey(data.b2_app_key_encrypted ? "••••••••" : "");
            setB2BucketName(data.b2_bucket_name || "");
            setB2BucketId(data.b2_bucket_id || "");
            setB2Endpoint((data as Record<string, unknown>).b2_endpoint as string || "");
          }
        }
      });
    }
  }, [user, supabase]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
    setSavingProfile(false);
    if (error) { toast.error("Profil güncellenemedi."); return; }
    toast.success("Profil güncellendi.");
    await refreshProfile();
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) { toast.error("Şifreler eşleşmiyor."); return; }
    if (newPassword.length < 8) { toast.error("Şifre en az 8 karakter olmalı."); return; }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Şifre değiştirildi.");
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
  };

  const handleSaveApiKeys = async () => {
    if (!user) return;
    setSavingKeys(true);
    try {
      for (const key of apiKeys) {
        // Skip masked (unchanged) keys
        const isNew = key._isNew;
        const isMasked = key.api_key_encrypted.startsWith("••");
        const payload: Record<string, unknown> = {
          engine: key.engine,
          model_id: key.model_id || null,
          label: key.label || null,
          is_default: key.is_default,
          updated_at: new Date().toISOString(),
        };
        if (!isMasked) {
          payload.api_key_encrypted = key.api_key_encrypted;
        }

        if (key.id && !isNew) {
          // Update existing
          await supabase.from("user_api_keys").update(payload as any).eq("id", key.id);
        } else if (key.api_key_encrypted && !isMasked) {
          // Insert new
          payload.user_id = user.id;
          payload.api_key_encrypted = key.api_key_encrypted;
          const { data } = await supabase.from("user_api_keys").insert(payload as any).select("id").single();
          if (data) {
            setApiKeys((prev) => prev.map((k) => k === key ? { ...k, id: data.id, _isNew: false } : k));
          }
        }
      }
      toast.success("API anahtarları kaydedildi.");
    } catch {
      toast.error("Kaydetme başarısız.");
    }
    setSavingKeys(false);
  };

  const handleAddKey = (engine: string) => {
    setApiKeys((prev) => [...prev, {
      engine,
      api_key_encrypted: "",
      model_id: "",
      label: "",
      is_default: !prev.some((k) => k.engine === engine),
      _isNew: true,
    }]);
  };

  const handleRemoveKey = async (index: number) => {
    const key = apiKeys[index];
    if (key.id && !key._isNew) {
      await supabase.from("user_api_keys").delete().eq("id", key.id);
    }
    setApiKeys((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // If removed key was default, make first remaining key of same engine default
      const sameEngine = next.filter((k) => k.engine === key.engine);
      if (sameEngine.length > 0 && !sameEngine.some((k) => k.is_default)) {
        sameEngine[0].is_default = true;
      }
      return [...next];
    });
    toast.success("Anahtar silindi.");
  };

  const handleSetDefault = (index: number) => {
    setApiKeys((prev) => prev.map((k, i) => ({
      ...k,
      is_default: k.engine === prev[index].engine ? i === index : k.is_default,
    })));
  };

  const updateKey = (index: number, field: keyof ApiKeyEntry, value: string | boolean) => {
    setApiKeys((prev) => prev.map((k, i) => i === index ? { ...k, [field]: value } : k));
  };

  const handleTestStorage = async () => {
    setTestingStorage(true);
    setTestMessage(null);
    try {
      // Build body with current form values
      const body: Record<string, string> = { provider: storageProvider };
      if (storageProvider === "r2") {
        body.r2_account_id = r2AccountId;
        body.r2_access_key = r2AccessKey;
        body.r2_secret_key = r2SecretKey;
        body.r2_bucket_name = r2BucketName;
        body.r2_endpoint = r2Endpoint;
      } else {
        body.b2_key_id = b2KeyId;
        body.b2_app_key = b2AppKey;
        body.b2_bucket_name = b2BucketName;
        body.b2_bucket_id = b2BucketId;
        body.b2_endpoint = b2Endpoint;
      }

      let result;
      if (storageConfigId) {
        // If saved config exists, use test-custom which merges masked values from DB
        result = await api.testCustomStorageConnection(body);
      } else {
        // No saved config, test with provided values directly
        result = await api.testCustomStorageConnection(body);
      }

      setStorageTestResult(result.ok ? "success" : "failed");
      setTestMessage(result.message);

      if (result.ok) {
        toast.success(result.message);
        // Update DB if config exists
        if (storageConfigId) {
          await supabase.from("user_storage_configs").update({
            last_test_result: "success",
          }).eq("id", storageConfigId);
        }
      } else {
        toast.error(result.message);
        if (storageConfigId) {
          await supabase.from("user_storage_configs").update({
            last_test_result: "failed",
          }).eq("id", storageConfigId);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Test başarısız";
      setStorageTestResult("failed");
      setTestMessage(msg);
      toast.error(msg);
    } finally {
      setTestingStorage(false);
    }
  };

  const handleSaveStorage = async () => {
    if (!user) return;
    setSavingStorage(true);
    try {
      // Build typed payload
      const base = {
        user_id: user.id,
        provider: storageProvider as "r2" | "b2",
        is_active: true as const,
        updated_at: new Date().toISOString(),
        r2_account_id: null as string | null,
        r2_access_key: null as string | null,
        r2_secret_key_encrypted: null as string | null,
        r2_bucket_name: null as string | null,
        r2_endpoint: null as string | null,
        b2_key_id: null as string | null,
        b2_app_key_encrypted: null as string | null,
        b2_bucket_name: null as string | null,
        b2_bucket_id: null as string | null,
        b2_endpoint: null as string | null,
      };
      if (storageProvider === "r2") {
        base.r2_account_id = r2AccountId || null;
        base.r2_access_key = r2AccessKey.startsWith("••") ? null : (r2AccessKey || null);
        base.r2_secret_key_encrypted = r2SecretKey.startsWith("••") ? null : (r2SecretKey || null);
        base.r2_bucket_name = r2BucketName || null;
        base.r2_endpoint = r2Endpoint || null;
      } else {
        base.b2_key_id = b2KeyId.startsWith("••") ? null : (b2KeyId || null);
        base.b2_app_key_encrypted = b2AppKey.startsWith("••") ? null : (b2AppKey || null);
        base.b2_bucket_name = b2BucketName || null;
        base.b2_bucket_id = b2BucketId || null;
        base.b2_endpoint = b2Endpoint || null;
      }

      if (storageConfigId) {
        // For update, omit null secret fields to avoid overwriting
        const updatePayload = { ...base };
        if (storageProvider === "r2") {
          if (!updatePayload.r2_access_key) delete (updatePayload as Record<string, unknown>).r2_access_key;
          if (!updatePayload.r2_secret_key_encrypted) delete (updatePayload as Record<string, unknown>).r2_secret_key_encrypted;
        } else {
          if (!updatePayload.b2_key_id) delete (updatePayload as Record<string, unknown>).b2_key_id;
          if (!updatePayload.b2_app_key_encrypted) delete (updatePayload as Record<string, unknown>).b2_app_key_encrypted;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await supabase.from("user_storage_configs").update(updatePayload as any).eq("id", storageConfigId);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await supabase.from("user_storage_configs").insert(base as any).select("id").single();
        if (data) setStorageConfigId(data.id);
      }
      setStorageActive(true);
      toast.success("Depolama yapılandırması kaydedildi.");
    } catch {
      toast.error("Kaydetme başarısız.");
    } finally {
      setSavingStorage(false);
    }
  };

  const handleDeleteStorage = async () => {
    if (!storageConfigId) return;
    setDeletingStorage(true);
    try {
      await supabase.from("user_storage_configs").delete().eq("id", storageConfigId);
      setStorageConfigId(null);
      setStorageActive(false);
      setR2AccountId(""); setR2AccessKey(""); setR2SecretKey(""); setR2BucketName(""); setR2Endpoint("");
      setB2KeyId(""); setB2AppKey(""); setB2BucketName(""); setB2BucketId(""); setB2Endpoint("");
      toast.success("Depolama yapılandırması silindi.");
    } catch {
      toast.error("Silme başarısız.");
    } finally {
      setDeletingStorage(false);
    }
  };

  const handleSavePreferences = async () => {
    if (!user) return;
    setSavingPrefs(true);
    await supabase.from("profiles").update({
      email_notifications: emailNotifications,
      export_notifications: exportNotifications,
      locale: language,
    }).eq("id", user.id);
    setSavingPrefs(false);
    toast.success("Tercihler kaydedildi.");
    await refreshProfile();
  };

  if (loading && !user) {
    return (
      <div className="flex h-[calc(100vh-3rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-[calc(100vh-3rem)] items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Kullanici bilgisi yuklenemedi.</p>
      </div>
    );
  }

  const storageUsed = profile?.storage_used_bytes || 0;
  const storageMax = (plan?.storage_gb || 5) * 1024 * 1024 * 1024;
  const linesUsed = profile?.lines_used_this_month || 0;
  const lineLimit = plan?.lines_per_month || 1000;
  const dailyUsed = profile?.daily_jobs_used || 0;
  const dailyLimit = plan?.daily_job_limit || 3;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ayarlar</h1>
        <p className="text-muted-foreground">Hesap, API anahtarları ve abonelik ayarlarınızı yönetin</p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="profile" className="gap-2"><User className="h-4 w-4" />Profil</TabsTrigger>
          <TabsTrigger value="api-keys" className="gap-2"><Key className="h-4 w-4" />API Anahtarları</TabsTrigger>
          <TabsTrigger value="subscription" className="gap-2"><CreditCard className="h-4 w-4" />Abonelik</TabsTrigger>
          <TabsTrigger value="storage" className="gap-2"><HardDrive className="h-4 w-4" />Depolama</TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2"><Settings className="h-4 w-4" />Tercihler</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profil Bilgileri</CardTitle>
              <CardDescription>Hesap bilgilerinizi güncelleyin</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Ad Soyad</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Adınız Soyadınız" />
              </div>
              <div className="space-y-2">
                <Label>E-posta</Label>
                <Input type="email" value={email} disabled />
              </div>
              <Button onClick={handleSaveProfile} disabled={savingProfile}>
                {savingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Kaydet
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Güvenlik</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Yeni Şifre</Label>
                  <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Şifre Tekrar</Label>
                  <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                </div>
              </div>
              <Button variant="outline" onClick={handleChangePassword} disabled={changingPassword || !newPassword}>
                {changingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Şifreyi Değiştir
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Keys Tab */}
        <TabsContent value="api-keys" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5 text-primary" />Çeviri API Anahtarları</CardTitle>
              <CardDescription>Her motor için birden fazla anahtar ekleyebilir ve model seçebilirsiniz. Varsayılan anahtar çevirilerde otomatik kullanılır.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* Engine sections */}
              {ENGINE_CONFIG.map((eng) => {
                const engineKeys = apiKeys.map((k, i) => ({ ...k, _idx: i })).filter((k) => k.engine === eng.id);
                return (
                  <div key={eng.id} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${eng.color}`}>
                          <Key className="h-4 w-4" />
                        </div>
                        <div>
                          <Label className="text-sm font-semibold">{eng.name}</Label>
                          <p className="text-xs text-muted-foreground">{eng.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <a href={eng.docsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                          Anahtar Al<ExternalLink className="h-3 w-3" />
                        </a>
                        <Button variant="outline" size="sm" onClick={() => handleAddKey(eng.id)}>
                          <Plus className="mr-1 h-3 w-3" />Ekle
                        </Button>
                      </div>
                    </div>

                    {engineKeys.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-center">
                        <p className="text-xs text-muted-foreground">Henüz anahtar eklenmedi</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {engineKeys.map((key) => (
                          <div key={key._idx} className="rounded-lg border p-3 space-y-3">
                            <div className="flex items-center gap-2">
                              <Input
                                type="password"
                                placeholder={eng.placeholder}
                                value={key.api_key_encrypted}
                                onChange={(e) => updateKey(key._idx, "api_key_encrypted", e.target.value)}
                                className="flex-1"
                              />
                              <Button
                                variant={key.is_default ? "default" : "outline"}
                                size="icon"
                                className="h-9 w-9 shrink-0"
                                title={key.is_default ? "Varsayılan" : "Varsayılan yap"}
                                onClick={() => handleSetDefault(key._idx)}
                              >
                                <Star className={`h-3.5 w-3.5 ${key.is_default ? "fill-current" : ""}`} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
                                title="Sil"
                                onClick={() => handleRemoveKey(key._idx)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs text-muted-foreground mb-1 block">Etiket (opsiyonel)</Label>
                                <Input
                                  placeholder="Örn: Kişisel, İş..."
                                  value={key.label}
                                  onChange={(e) => updateKey(key._idx, "label", e.target.value)}
                                  className="h-8 text-xs"
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground mb-1 block">Model</Label>
                                {eng.id === "deepl" ? (
                                  <Input value="DeepL Pro" disabled className="h-8 text-xs" />
                                ) : (
                                  <div className="flex gap-1">
                                    <Select
                                      value={eng.models.some((m) => m.id === key.model_id) ? key.model_id : (eng.allowCustomModel ? "_custom" : eng.models[0]?.id || "")}
                                      onValueChange={(v) => {
                                        if (v === "_custom") {
                                          updateKey(key._idx, "model_id", "");
                                        } else {
                                          updateKey(key._idx, "model_id", v);
                                        }
                                      }}
                                    >
                                      <SelectTrigger className="h-8 text-xs flex-1">
                                        <SelectValue placeholder="Model seçin" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {eng.models.map((m) => (
                                          <SelectItem key={m.id} value={m.id}>
                                            <span className="text-xs">{m.label}</span>
                                          </SelectItem>
                                        ))}
                                        {eng.allowCustomModel && (
                                          <SelectItem value="_custom">
                                            <span className="text-xs">Özel model gir...</span>
                                          </SelectItem>
                                        )}
                                      </SelectContent>
                                    </Select>
                                    {eng.allowCustomModel && !eng.models.some((m) => m.id === key.model_id) && (
                                      <Input
                                        placeholder="model-id girin"
                                        value={key.model_id}
                                        onChange={(e) => updateKey(key._idx, "model_id", e.target.value)}
                                        className="h-8 text-xs w-[140px]"
                                      />
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {eng.id !== ENGINE_CONFIG[ENGINE_CONFIG.length - 1].id && <Separator />}
                  </div>
                );
              })}

              <Button onClick={handleSaveApiKeys} disabled={savingKeys} className="w-full">
                {savingKeys ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Tüm Anahtarları Kaydet
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscription Tab */}
        <TabsContent value="subscription" className="mt-6 space-y-6">
          <Card>
            <CardHeader><CardTitle>Mevcut Kullanım</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Çeviri Kotası</span>
                  <span>{linesUsed.toLocaleString()} / {lineLimit.toLocaleString()} satır</span>
                </div>
                <Progress value={lineLimit > 0 ? (linesUsed / lineLimit) * 100 : 0} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Depolama</span>
                  <span>{formatBytes(storageUsed)} / {formatBytes(storageMax)}</span>
                </div>
                <Progress value={storageMax > 0 ? (storageUsed / storageMax) * 100 : 0} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Günlük Yükleme</span>
                  <span>{dailyUsed} / {dailyLimit}</span>
                </div>
                <Progress value={dailyLimit > 0 ? (dailyUsed / dailyLimit) * 100 : 0} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            {allPlans.map((p) => {
              const isCurrent = p.id === profile?.plan_id;
              return (
                <Card key={p.id} className={`relative ${isCurrent ? "border-primary" : ""}`}>
                  {isCurrent && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge variant="outline" className="bg-background"><CheckCircle2 className="mr-1 h-3 w-3" />Mevcut Plan</Badge>
                    </div>
                  )}
                  <CardHeader className="pt-6">
                    <CardTitle>{p.name}</CardTitle>
                    <CardDescription className="text-2xl font-bold text-foreground">
                      {p.price_monthly === 0 ? "Ücretsiz" : `₺${p.price_monthly}/ay`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />{p.lines_per_month.toLocaleString()} satır/ay</li>
                      <li className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />{p.storage_gb} GB depolama</li>
                      <li className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />{p.daily_job_limit} günlük yükleme</li>
                      <li className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />{p.retention_days} gün saklama</li>
                      <li className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />{p.max_export_resolution} çözünürlük</li>
                      <li className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />{p.watermark_required ? "Filigran zorunlu" : "Filigran yok"}</li>
                    </ul>
                    <Button className="mt-6 w-full" variant={isCurrent ? "outline" : "default"} disabled={isCurrent}>
                      {isCurrent ? "Mevcut Plan" : "Yükselt"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Storage Tab */}
        <TabsContent value="storage" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Cloud className="h-5 w-5 text-primary" />Kendi Depolama Alanınız</CardTitle>
              <CardDescription>
                Dışa aktarılan videolarınızı kendi bulut depolama alanınıza yüklemek için yapılandırın.
                Desteklenen sağlayıcılar: Cloudflare R2, Backblaze B2
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {storageActive && storageConfigId && (
                <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 p-3">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm">Depolama yapılandırması aktif ({storageProvider.toUpperCase()})</span>
                  {storageTestResult && (
                    <Badge variant={storageTestResult === "success" ? "secondary" : "destructive"} className="ml-auto text-xs">
                      {storageTestResult === "success" ? "Test başarılı" : "Test başarısız"}
                    </Badge>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Sağlayıcı</Label>
                <Select value={storageProvider} onValueChange={(v) => setStorageProvider(v as "r2" | "b2")}>
                  <SelectTrigger className="w-[250px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="r2">Cloudflare R2</SelectItem>
                    <SelectItem value="b2">Backblaze B2</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {storageProvider === "r2" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Account ID</Label>
                    <Input value={r2AccountId} onChange={(e) => setR2AccountId(e.target.value)} placeholder="Cloudflare Account ID" />
                  </div>
                  <div className="space-y-2">
                    <Label>Access Key</Label>
                    <Input type="password" value={r2AccessKey} onChange={(e) => setR2AccessKey(e.target.value)} placeholder="R2 Access Key ID" />
                  </div>
                  <div className="space-y-2">
                    <Label>Secret Key</Label>
                    <Input type="password" value={r2SecretKey} onChange={(e) => setR2SecretKey(e.target.value)} placeholder="R2 Secret Access Key" />
                  </div>
                  <div className="space-y-2">
                    <Label>Bucket Adı</Label>
                    <Input value={r2BucketName} onChange={(e) => setR2BucketName(e.target.value)} placeholder="my-bucket" />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Endpoint URL</Label>
                    <Input value={r2Endpoint} onChange={(e) => setR2Endpoint(e.target.value)} placeholder="https://<account_id>.r2.cloudflarestorage.com" />
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Application Key ID</Label>
                    <Input type="password" value={b2KeyId} onChange={(e) => setB2KeyId(e.target.value)} placeholder="B2 Key ID" />
                  </div>
                  <div className="space-y-2">
                    <Label>Application Key</Label>
                    <Input type="password" value={b2AppKey} onChange={(e) => setB2AppKey(e.target.value)} placeholder="B2 Application Key" />
                  </div>
                  <div className="space-y-2">
                    <Label>Bucket Adı</Label>
                    <Input value={b2BucketName} onChange={(e) => setB2BucketName(e.target.value)} placeholder="my-bucket" />
                  </div>
                  <div className="space-y-2">
                    <Label>Bucket ID</Label>
                    <Input value={b2BucketId} onChange={(e) => setB2BucketId(e.target.value)} placeholder="B2 Bucket ID" />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>S3 Endpoint</Label>
                    <Input value={b2Endpoint} onChange={(e) => setB2Endpoint(e.target.value)} placeholder="s3.us-west-004.backblazeb2.com" />
                    <p className="text-xs text-muted-foreground">Backblaze B2 panelinden bucket S3 endpoint adresini girin</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
                <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  Depolama yapılandırmanız aktif olduğunda, dışa aktarma sırasında videoyu kendi depolamanıza yükleme seçeneği sunulur.
                  Yükleme tamamlandığında sistem depolamasındaki dosya otomatik silinir.
                </p>
              </div>

              {/* Test result message */}
              {testMessage && (
                <div className={`flex items-center gap-2 rounded-lg border p-3 ${
                  storageTestResult === "success"
                    ? "border-green-500/30 bg-green-500/5"
                    : "border-red-500/30 bg-red-500/5"
                }`}>
                  {storageTestResult === "success" ? (
                    <Wifi className="h-4 w-4 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                  )}
                  <span className={`text-sm ${storageTestResult === "success" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {testMessage}
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={handleSaveStorage} disabled={savingStorage}>
                  {savingStorage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {storageConfigId ? "Güncelle" : "Kaydet"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTestStorage}
                  disabled={testingStorage}
                >
                  {testingStorage ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : storageTestResult === "success" ? (
                    <Wifi className="mr-2 h-4 w-4 text-green-500" />
                  ) : storageTestResult === "failed" ? (
                    <WifiOff className="mr-2 h-4 w-4 text-red-500" />
                  ) : (
                    <Wifi className="mr-2 h-4 w-4" />
                  )}
                  Bağlantıyı Test Et
                </Button>
                {storageConfigId && (
                  <Button variant="destructive" onClick={handleDeleteStorage} disabled={deletingStorage}>
                    {deletingStorage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Yapılandırmayı Sil
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />Dil ve Bölge</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Arayüz Dili</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tr">Türkçe</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Bildirimler</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>E-posta Bildirimleri</Label>
                  <p className="text-xs text-muted-foreground">Önemli güncellemeler ve duyurular</p>
                </div>
                <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Dışa Aktarma Bildirimleri</Label>
                  <p className="text-xs text-muted-foreground">Video dışa aktarma tamamlandığında bildir</p>
                </div>
                <Switch checked={exportNotifications} onCheckedChange={setExportNotifications} />
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSavePreferences} disabled={savingPrefs}>
            {savingPrefs ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Tercihleri Kaydet
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
