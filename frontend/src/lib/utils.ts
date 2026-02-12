import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "Az önce";
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
  return `${Math.floor(diff / 86400)} gün önce`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}s ${m}dk ${s}sn`;
  if (m > 0) return `${m}dk ${s}sn`;
  return `${s}sn`;
}

export const langNames: Record<string, string> = {
  ja: "Japonca", jpn: "Japonca",
  en: "İngilizce", eng: "İngilizce",
  tr: "Türkçe", tur: "Türkçe",
  ko: "Korece", kor: "Korece",
  zh: "Çince", zho: "Çince", chi: "Çince",
  fr: "Fransızca", fre: "Fransızca", fra: "Fransızca",
  de: "Almanca", ger: "Almanca", deu: "Almanca",
  es: "İspanyolca", spa: "İspanyolca",
  ar: "Arapça", ara: "Arapça",
  ru: "Rusça", rus: "Rusça",
  it: "İtalyanca", ita: "İtalyanca",
  pt: "Portekizce", por: "Portekizce",
  und: "Bilinmeyen",
};

export function getLangLabel(code: string): string {
  return langNames[code] || code.toUpperCase();
}
