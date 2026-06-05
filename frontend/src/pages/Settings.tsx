import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type TrainingDirectionMode, type TrainingSettings } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const defaults: TrainingSettings = {
  maxFrequencyRank: 10000,
  includeUnknownFrequency: false,
  ruToEnOptionsCount: 4,
  enToRuOptionsCount: 4,
  trainingDirectionMode: "mixed",
  hideOptionsUntilReveal: false,
  autoStartWordOnTraining: false,
};

export default function Settings() {
  const [settings, setSettings] = useState<TrainingSettings>(defaults);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.getSettings().then(setSettings).catch((e) => toast.error(e.message)).finally(() => setLoading(false)); }, []);

  const update = <K extends keyof TrainingSettings>(key: K, value: TrainingSettings[K]) => setSettings((prev) => ({ ...prev, [key]: value }));
  const save = async () => {
    try { setSettings(await api.updateSettings(settings)); toast.success("Настройки сохранены"); } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка сохранения"); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div><h1 className="text-lg font-semibold tracking-tight">Настройки</h1><p className="text-xs text-muted-foreground">Применяются к новым тренировкам. Уже созданные сессии используют snapshot.</p></div>
      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-base">Глобальные настройки тренировок</CardTitle><CardDescription className="text-xs">Ограничения частотности и количество вариантов ответа.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Максимальный частотный ранг</Label><Input type="number" value={settings.maxFrequencyRank} onChange={(e) => update("maxFrequencyRank", Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Режим типов вопросов</Label><Select value={settings.trainingDirectionMode} onValueChange={(v: TrainingDirectionMode) => update("trainingDirectionMode", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mixed">Смешанный</SelectItem><SelectItem value="ru_to_en_only">Русский → английский</SelectItem><SelectItem value="en_to_ru_only">Английский → русский</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Вариантов RU → EN</Label><Input type="number" min={2} max={8} value={settings.ruToEnOptionsCount} onChange={(e) => update("ruToEnOptionsCount", Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Вариантов EN → RU</Label><Input type="number" min={2} max={8} value={settings.enToRuOptionsCount} onChange={(e) => update("enToRuOptionsCount", Number(e.target.value))} /></div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/50 p-3"><div><p className="text-sm font-medium">Включать слова с неизвестной частотой</p><p className="text-xs text-muted-foreground">frequencyRank = null попадёт в тренировку</p></div><Switch checked={settings.includeUnknownFrequency} onCheckedChange={(v) => update("includeUnknownFrequency", v)} /></div>
          <div className="flex items-center justify-between rounded-md border border-border/50 p-3"><div><p className="text-sm font-medium">Скрывать варианты до нажатия “Показать варианты”</p><p className="text-xs text-muted-foreground">Сначала попробуйте вспомнить ответ сами, затем откройте варианты.</p></div><Switch checked={settings.hideOptionsUntilReveal} onCheckedChange={(v) => update("hideOptionsUntilReveal", v)} /></div>
          <div className="flex items-center justify-between rounded-md border border-border/50 p-3"><div><p className="text-sm font-medium">Автоматически начинать новое слово</p><p className="text-xs text-muted-foreground">В MVP рекомендуется выключено</p></div><Switch checked={settings.autoStartWordOnTraining} onCheckedChange={(v) => update("autoStartWordOnTraining", v)} /></div>
          <Button className="h-9 text-sm" onClick={save} disabled={loading}>Сохранить</Button>
        </CardContent>
      </Card>
    </div>
  );
}
