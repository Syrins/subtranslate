"use client";

import { useState } from "react";
import { Languages, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Engine {
  id: string;
  name: string;
  model: string;
  cost: string;
  status: "operational" | "degraded" | "down";
  docsUrl: string;
}

const engines: Engine[] = [
  { id: "openai", name: "OpenAI GPT-4", model: "gpt-4-turbo", cost: "$0.002/satır", status: "operational", docsUrl: "https://platform.openai.com/docs" },
  { id: "deepl", name: "DeepL Pro", model: "deepl-v2", cost: "$0.001/satır", status: "operational", docsUrl: "https://www.deepl.com/docs-api" },
  { id: "gemini", name: "Google Gemini", model: "gemini-1.5-pro", cost: "$0.0005/satır", status: "degraded", docsUrl: "https://ai.google.dev/docs" },
];

export default function AdminEnginesPage() {
  const [openaiEnabled, setOpenaiEnabled] = useState(true);
  const [deeplEnabled, setDeeplEnabled] = useState(true);
  const [geminiEnabled, setGeminiEnabled] = useState(true);
  const [openaiRate, setOpenaiRate] = useState([100]);
  const [deeplRate, setDeeplRate] = useState([200]);
  const [geminiRate, setGeminiRate] = useState([150]);
  const [testEngine, setTestEngine] = useState<Engine | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const enabledMap: Record<string, { enabled: boolean; set: (v: boolean) => void }> = {
    openai: { enabled: openaiEnabled, set: setOpenaiEnabled },
    deepl: { enabled: deeplEnabled, set: setDeeplEnabled },
    gemini: { enabled: geminiEnabled, set: setGeminiEnabled },
  };

  const rateMap: Record<string, { value: number[]; set: (v: number[]) => void }> = {
    openai: { value: openaiRate, set: setOpenaiRate },
    deepl: { value: deeplRate, set: setDeeplRate },
    gemini: { value: geminiRate, set: setGeminiRate },
  };

  const handleTest = (engine: Engine) => {
    setTestEngine(engine);
    setTestResult(null);
    setTesting(true);
    setTimeout(() => {
      setTesting(false);
      setTestResult(engine.status === "operational" ? "Bağlantı başarılı! Yanıt süresi: 245ms" : "Bağlantı kuruldu ancak yanıt süresi yüksek: 1.2s");
    }, 1500);
  };

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Çeviri Motorları</h1>
        <p className="text-xs text-muted-foreground">AI çeviri motorlarını yapılandırın ve yönetin</p>
      </div>

      <div className="space-y-4">
        {engines.map((engine) => {
          const { enabled, set: setEnabled } = enabledMap[engine.id];
          const { value: rate, set: setRate } = rateMap[engine.id];

          return (
            <Card key={engine.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Languages className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{engine.name}</h3>
                        <Badge
                          variant={engine.status === "operational" ? "outline" : engine.status === "degraded" ? "secondary" : "destructive"}
                          className="text-[10px]"
                        >
                          {engine.status === "operational" ? "Çalışıyor" : engine.status === "degraded" ? "Yavaş" : "Kapalı"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Model: {engine.model} • Maliyet: {engine.cost}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href={engine.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Docs
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <Switch checked={enabled} onCheckedChange={setEnabled} />
                  </div>
                </div>

                {enabled && (
                  <div className="mt-4 space-y-4 border-t pt-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-xs">API Anahtarı</Label>
                        <Input type="password" placeholder="sk-..." className="h-9" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <Label className="text-xs">Rate Limit (istek/dk)</Label>
                          <span className="text-xs text-muted-foreground">{rate[0]}</span>
                        </div>
                        <Slider value={rate} onValueChange={setRate} min={10} max={500} step={10} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm">Kaydet</Button>
                      <Button variant="outline" size="sm" onClick={() => handleTest(engine)}>
                        Bağlantıyı Test Et
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Test Result Dialog */}
      <Dialog open={!!testEngine} onOpenChange={() => setTestEngine(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bağlantı Testi — {testEngine?.name}</DialogTitle>
            <DialogDescription>API bağlantısı test ediliyor</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {testing ? (
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm text-muted-foreground">Test ediliyor...</span>
              </div>
            ) : testResult ? (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-sm">{testResult}</p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestEngine(null)}>Kapat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
