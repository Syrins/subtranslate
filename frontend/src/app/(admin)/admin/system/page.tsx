"use client";

import { useState } from "react";
import {
  Shield,
  FileVideo,
  Mail,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function AdminSystemPage() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [emailVerification, setEmailVerification] = useState(true);
  const [maxUploadSize, setMaxUploadSize] = useState([2048]);
  const [maxExportRes, setMaxExportRes] = useState("4k");
  const [smtpHost, setSmtpHost] = useState("smtp.example.com");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [dbUrl, setDbUrl] = useState("");
  const [redisUrl, setRedisUrl] = useState("");

  const [confirmMaintenance, setConfirmMaintenance] = useState(false);
  const [smtpTestOpen, setSmtpTestOpen] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<string | null>(null);
  const [smtpTesting, setSmtpTesting] = useState(false);

  const handleMaintenanceToggle = (value: boolean) => {
    if (value) {
      setConfirmMaintenance(true);
    } else {
      setMaintenanceMode(false);
    }
  };

  const handleSmtpTest = () => {
    setSmtpTestOpen(true);
    setSmtpTestResult(null);
    setSmtpTesting(true);
    setTimeout(() => {
      setSmtpTesting(false);
      setSmtpTestResult("Test e-postası başarıyla gönderildi!");
    }, 2000);
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Sistem Ayarları</h1>
        <p className="text-xs text-muted-foreground">Genel sistem yapılandırması</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* General */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4 text-primary" />
              Genel Ayarlar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Bakım Modu</Label>
                <p className="text-xs text-muted-foreground">Siteyi bakım moduna al</p>
              </div>
              <Switch checked={maintenanceMode} onCheckedChange={handleMaintenanceToggle} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Kayıt Açık</Label>
                <p className="text-xs text-muted-foreground">Yeni kullanıcı kaydına izin ver</p>
              </div>
              <Switch checked={registrationOpen} onCheckedChange={setRegistrationOpen} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">E-posta Doğrulama</Label>
                <p className="text-xs text-muted-foreground">Kayıtta e-posta doğrulama zorunlu</p>
              </div>
              <Switch checked={emailVerification} onCheckedChange={setEmailVerification} />
            </div>
            <Button size="sm">Kaydet</Button>
          </CardContent>
        </Card>

        {/* File & Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileVideo className="h-4 w-4 text-primary" />
              Dosya & Export Ayarları
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-sm">Maks. Yükleme Boyutu</Label>
                <span className="text-sm font-medium">{maxUploadSize[0]} MB</span>
              </div>
              <Slider value={maxUploadSize} onValueChange={setMaxUploadSize} min={100} max={10240} step={100} />
              <p className="text-[11px] text-muted-foreground">Kullanıcıların yükleyebileceği maksimum dosya boyutu</p>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label className="text-sm">Maks. Export Çözünürlüğü</Label>
              <Select value={maxExportRes} onValueChange={setMaxExportRes}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="720p">720p</SelectItem>
                  <SelectItem value="1080p">1080p</SelectItem>
                  <SelectItem value="1440p">1440p</SelectItem>
                  <SelectItem value="4k">4K</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm">Kaydet</Button>
          </CardContent>
        </Card>

        {/* SMTP */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-primary" />
              SMTP Ayarları
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">SMTP Host</Label>
                <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Port</Label>
                <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className="h-9" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Kullanıcı Adı</Label>
                <Input placeholder="user@example.com" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Şifre</Label>
                <Input type="password" placeholder="••••••••" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} className="h-9" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm">Kaydet</Button>
              <Button variant="outline" size="sm" onClick={handleSmtpTest}>Test Gönder</Button>
            </div>
          </CardContent>
        </Card>

        {/* Database & Storage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Database className="h-4 w-4 text-primary" />
              Veritabanı & Depolama
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Veritabanı URL</Label>
              <Input type="password" placeholder="postgresql://..." value={dbUrl} onChange={(e) => setDbUrl(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Redis URL</Label>
              <Input type="password" placeholder="redis://..." value={redisUrl} onChange={(e) => setRedisUrl(e.target.value)} className="h-9" />
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label className="text-xs">Dosya Saklama Süresi (gün)</Label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg border p-2 text-center">
                  <p className="font-semibold">7</p>
                  <p className="text-muted-foreground">Free</p>
                </div>
                <div className="rounded-lg border p-2 text-center">
                  <p className="font-semibold">30</p>
                  <p className="text-muted-foreground">Pro</p>
                </div>
                <div className="rounded-lg border p-2 text-center">
                  <p className="font-semibold">90</p>
                  <p className="text-muted-foreground">Team</p>
                </div>
              </div>
            </div>
            <Button size="sm">Kaydet</Button>
          </CardContent>
        </Card>
      </div>

      {/* Maintenance Confirm */}
      <AlertDialog open={confirmMaintenance} onOpenChange={setConfirmMaintenance}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bakım Modunu Etkinleştir</AlertDialogTitle>
            <AlertDialogDescription>
              Bakım modunu etkinleştirmek istediğinize emin misiniz?
              Tüm kullanıcılar sisteme erişemeyecek ve devam eden işler duraklatılacaktır.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { setMaintenanceMode(true); setConfirmMaintenance(false); }}>
              Bakım Modunu Aç
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* SMTP Test Dialog */}
      <Dialog open={smtpTestOpen} onOpenChange={setSmtpTestOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>SMTP Test</DialogTitle>
            <DialogDescription>E-posta gönderim testi</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {smtpTesting ? (
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm text-muted-foreground">Test e-postası gönderiliyor...</span>
              </div>
            ) : smtpTestResult ? (
              <div className="rounded-lg border bg-green-500/10 p-3">
                <p className="text-sm text-green-600">{smtpTestResult}</p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSmtpTestOpen(false)}>Kapat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
