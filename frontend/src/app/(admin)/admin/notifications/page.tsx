"use client";

import { useState } from "react";
import { Bell, Mail, Send } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

export default function AdminNotificationsPage() {
  const [announcementEnabled, setAnnouncementEnabled] = useState(false);
  const [announcementText, setAnnouncementText] = useState("");
  const [announcementType, setAnnouncementType] = useState("info");

  const [newUserNotif, setNewUserNotif] = useState(true);
  const [jobFailNotif, setJobFailNotif] = useState(true);
  const [storageNotif, setStorageNotif] = useState(true);
  const [dailyReport, setDailyReport] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");

  const [previewOpen, setPreviewOpen] = useState(false);

  const typeStyles: Record<string, string> = {
    info: "border-blue-500/30 bg-blue-500/10 text-blue-600",
    warning: "border-yellow-500/30 bg-yellow-500/10 text-yellow-600",
    error: "border-red-500/30 bg-red-500/10 text-red-600",
    success: "border-green-500/30 bg-green-500/10 text-green-600",
  };

  const typeLabels: Record<string, string> = {
    info: "Bilgi",
    warning: "Uyarı",
    error: "Hata",
    success: "Başarılı",
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Bildirimler</h1>
        <p className="text-xs text-muted-foreground">Site duyuruları ve e-posta bildirim ayarları</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Announcement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bell className="h-4 w-4 text-primary" />
              Site Duyurusu
            </CardTitle>
            <CardDescription>Tüm kullanıcılara gösterilecek banner duyurusu</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Duyuru Aktif</Label>
              <Switch checked={announcementEnabled} onCheckedChange={setAnnouncementEnabled} />
            </div>
            {announcementEnabled && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Duyuru Metni</Label>
                  <Textarea
                    placeholder="Sistem bakımı nedeniyle 02:00-04:00 arası hizmet kesintisi yaşanabilir."
                    value={announcementText}
                    onChange={(e) => setAnnouncementText(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Duyuru Tipi</Label>
                  <Select value={announcementType} onValueChange={setAnnouncementType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Bilgi</SelectItem>
                      <SelectItem value="warning">Uyarı</SelectItem>
                      <SelectItem value="error">Hata</SelectItem>
                      <SelectItem value="success">Başarılı</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {announcementText && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Önizleme</Label>
                    <div className={`rounded-lg border p-3 text-sm ${typeStyles[announcementType]}`}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`border-0 text-[10px] ${typeStyles[announcementType]}`}>
                          {typeLabels[announcementType]}
                        </Badge>
                        <span>{announcementText}</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm">Yayınla</Button>
                  {announcementText && (
                    <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                      Tam Önizleme
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Email Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-primary" />
              E-posta Bildirimleri
            </CardTitle>
            <CardDescription>Sistem olayları için e-posta bildirimleri</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Yeni Kullanıcı Kaydı</Label>
                <p className="text-xs text-muted-foreground">Yeni kullanıcı kaydolduğunda bildir</p>
              </div>
              <Switch checked={newUserNotif} onCheckedChange={setNewUserNotif} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">İş Başarısız</Label>
                <p className="text-xs text-muted-foreground">Çeviri veya export işi başarısız olduğunda</p>
              </div>
              <Switch checked={jobFailNotif} onCheckedChange={setJobFailNotif} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Depolama Uyarısı</Label>
                <p className="text-xs text-muted-foreground">Depolama %80&apos;i aştığında</p>
              </div>
              <Switch checked={storageNotif} onCheckedChange={setStorageNotif} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Günlük Rapor</Label>
                <p className="text-xs text-muted-foreground">Her gün sistem özet raporu gönder</p>
              </div>
              <Switch checked={dailyReport} onCheckedChange={setDailyReport} />
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label className="text-xs">Admin E-posta Adresi</Label>
              <Input
                placeholder="admin@subtranslate.com"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="h-9"
              />
            </div>
            <Button size="sm">Kaydet</Button>
          </CardContent>
        </Card>

        {/* Bulk Email */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Send className="h-4 w-4 text-primary" />
              Toplu E-posta Gönder
            </CardTitle>
            <CardDescription>Tüm kullanıcılara veya belirli bir gruba e-posta gönderin</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Hedef Kitle</Label>
                <Select defaultValue="all">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm Kullanıcılar</SelectItem>
                    <SelectItem value="free">Free Plan</SelectItem>
                    <SelectItem value="pro">Pro Plan</SelectItem>
                    <SelectItem value="team">Team Plan</SelectItem>
                    <SelectItem value="active">Aktif Kullanıcılar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Konu</Label>
                <Input placeholder="E-posta konusu..." className="h-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">İçerik</Label>
              <Textarea placeholder="E-posta içeriğini yazın..." rows={5} />
            </div>
            <div className="flex gap-2">
              <Button size="sm">Gönder</Button>
              <Button variant="outline" size="sm">Önizle</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Full Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Duyuru Önizleme</DialogTitle>
            <DialogDescription>Kullanıcıların göreceği duyuru banner&apos;ı</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="overflow-hidden rounded-lg border bg-card">
              <div className={`border-b p-3 text-sm ${typeStyles[announcementType]}`}>
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 shrink-0" />
                  <span className="font-medium">{typeLabels[announcementType]}:</span>
                  <span>{announcementText || "Duyuru metni..."}</span>
                </div>
              </div>
              <div className="bg-muted/30 p-4 text-center text-xs text-muted-foreground">
                — Sayfa içeriği burada görünecek —
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Kapat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
