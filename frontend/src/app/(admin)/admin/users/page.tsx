"use client";

import { useState } from "react";
import {
  Search,
  MoreHorizontal,
  UserCheck,
  Ban,
  Trash2,
  Mail,
  Edit,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface User {
  id: number;
  name: string;
  email: string;
  plan: string;
  status: string;
  projects: number;
  lines: number;
  joined: string;
}

const initialUsers: User[] = [
  { id: 1, name: "Ahmet Yılmaz", email: "ahmet@example.com", plan: "Pro", status: "active", projects: 12, lines: 8420, joined: "2025-11-15" },
  { id: 2, name: "Elif Demir", email: "elif@example.com", plan: "Free", status: "active", projects: 3, lines: 890, joined: "2026-01-02" },
  { id: 3, name: "Mehmet Kaya", email: "mehmet@example.com", plan: "Team", status: "active", projects: 28, lines: 45200, joined: "2025-09-20" },
  { id: 4, name: "Zeynep Çelik", email: "zeynep@example.com", plan: "Pro", status: "suspended", projects: 7, lines: 3100, joined: "2025-12-10" },
  { id: 5, name: "Can Öztürk", email: "can@example.com", plan: "Free", status: "active", projects: 1, lines: 150, joined: "2026-02-01" },
  { id: 6, name: "Selin Arslan", email: "selin@example.com", plan: "Pro", status: "active", projects: 15, lines: 12300, joined: "2025-10-05" },
  { id: 7, name: "Burak Koç", email: "burak@example.com", plan: "Free", status: "active", projects: 2, lines: 420, joined: "2026-01-18" },
  { id: 8, name: "Ayşe Yıldız", email: "ayse@example.com", plan: "Team", status: "active", projects: 34, lines: 67800, joined: "2025-08-12" },
];

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");

  const [editUser, setEditUser] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPlan, setEditPlan] = useState("");

  const [viewUser, setViewUser] = useState<User | null>(null);
  const [suspendUser, setSuspendUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);

  const filtered = initialUsers.filter((u) => {
    const matchSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || u.status === statusFilter;
    const matchPlan = planFilter === "all" || u.plan.toLowerCase() === planFilter;
    return matchSearch && matchStatus && matchPlan;
  });

  const openEdit = (user: User) => {
    setEditName(user.name);
    setEditEmail(user.email);
    setEditPlan(user.plan.toLowerCase());
    setEditUser(user);
  };

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Kullanıcı Yönetimi</h1>
        <p className="text-xs text-muted-foreground">{initialUsers.length} kayıtlı kullanıcı</p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Kullanıcı ara..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tümü</SelectItem>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="suspended">Askıda</SelectItem>
            </SelectContent>
          </Select>
          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger className="w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Planlar</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="team">Team</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr_1fr_70px_70px_100px_80px_50px] gap-3 border-b bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <span>Kullanıcı</span>
            <span>E-posta</span>
            <span>Plan</span>
            <span>Durum</span>
            <span>Proje / Satır</span>
            <span>Katılım</span>
            <span></span>
          </div>
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Kullanıcı bulunamadı</div>
          ) : (
            filtered.map((user) => (
              <div key={user.id} className="grid grid-cols-[1fr_1fr_70px_70px_100px_80px_50px] items-center gap-3 border-b px-4 py-3 text-sm last:border-0 hover:bg-muted/30">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-muted-foreground">{user.email}</span>
                <Badge variant={user.plan === "Team" ? "default" : user.plan === "Pro" ? "secondary" : "outline"} className="w-fit text-[10px]">
                  {user.plan}
                </Badge>
                <Badge variant={user.status === "active" ? "outline" : "destructive"} className="w-fit text-[10px]">
                  {user.status === "active" ? "Aktif" : "Askıda"}
                </Badge>
                <span className="text-xs text-muted-foreground">{user.projects} / {user.lines.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground">{user.joined}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setViewUser(user)}>
                      <Eye className="mr-2 h-3.5 w-3.5" />
                      Detay Görüntüle
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openEdit(user)}>
                      <Edit className="mr-2 h-3.5 w-3.5" />
                      Düzenle
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSuspendUser(user)}>
                      <Ban className="mr-2 h-3.5 w-3.5" />
                      {user.status === "active" ? "Askıya Al" : "Aktif Et"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => setDeleteUser(user)}>
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Sil
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* View User Dialog */}
      <Dialog open={!!viewUser} onOpenChange={() => setViewUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kullanıcı Detayı</DialogTitle>
            <DialogDescription>{viewUser?.email}</DialogDescription>
          </DialogHeader>
          {viewUser && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Ad Soyad</p>
                  <p className="font-medium">{viewUser.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">E-posta</p>
                  <p className="font-medium">{viewUser.email}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Plan</p>
                  <Badge variant="secondary">{viewUser.plan}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Durum</p>
                  <Badge variant={viewUser.status === "active" ? "outline" : "destructive"}>
                    {viewUser.status === "active" ? "Aktif" : "Askıda"}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Projeler</p>
                  <p className="font-medium">{viewUser.projects}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Çevrilen Satır</p>
                  <p className="font-medium">{viewUser.lines.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Katılım Tarihi</p>
                  <p className="font-medium">{viewUser.joined}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kullanıcı Düzenle</DialogTitle>
            <DialogDescription>Kullanıcı bilgilerini güncelleyin</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Ad Soyad</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">E-posta</Label>
              <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Plan</Label>
              <Select value={editPlan} onValueChange={setEditPlan}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>İptal</Button>
            <Button onClick={() => setEditUser(null)}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend Confirm */}
      <AlertDialog open={!!suspendUser} onOpenChange={() => setSuspendUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspendUser?.status === "active" ? "Kullanıcıyı Askıya Al" : "Kullanıcıyı Aktif Et"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{suspendUser?.name}</strong> kullanıcısını {suspendUser?.status === "active" ? "askıya almak" : "aktif etmek"} istediğinize emin misiniz?
              {suspendUser?.status === "active" && " Kullanıcı sisteme giriş yapamayacak."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={() => setSuspendUser(null)}>
              {suspendUser?.status === "active" ? "Askıya Al" : "Aktif Et"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteUser} onOpenChange={() => setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kullanıcıyı Sil</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteUser?.name}</strong> kullanıcısını kalıcı olarak silmek istediğinize emin misiniz?
              Bu işlem geri alınamaz. Kullanıcının tüm projeleri ve dosyaları silinecektir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => setDeleteUser(null)}>
              Kalıcı Olarak Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
