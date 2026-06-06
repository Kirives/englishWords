import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type TrainingDirectionMode, type TrainingSettings } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

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
  const [aiSettings, setAiSettings] = useState({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    hasApiKey: false,
    apiKeyMasked: "",
    modelName: "gpt-4o-mini",
    temperature: 0.4,
    maxOutputTokens: 8000,
    wordsPerBatch: 5,
    requestTimeoutSec: 240,
    lastCheckStatus: "not_checked",
    lastCheckAt: null as string | null,
    lastCheckError: null as string | null,
    showApiKey: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getSettings(), api.getAiSettings()])
      .then(([training, ai]) => {
        setSettings(training);
        setAiSettings((prev) => ({
          ...prev,
          ...ai,
          apiKey: "",
          showApiKey: false,
        }));
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const update = <K extends keyof TrainingSettings>(key: K, value: TrainingSettings[K]) => setSettings((prev) => ({ ...prev, [key]: value }));
  const save = async () => {
    try { setSettings(await api.updateSettings(settings)); toast.success("Настройки сохранены"); } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка сохранения"); }
  };

  const saveAi = async () => {
    try {
      const updated = await api.updateAiSettings({
        baseUrl: aiSettings.baseUrl,
        apiKey: aiSettings.apiKey || undefined,
        modelName: aiSettings.modelName,
        temperature: aiSettings.temperature,
        maxOutputTokens: aiSettings.maxOutputTokens,
        wordsPerBatch: aiSettings.wordsPerBatch,
        requestTimeoutSec: aiSettings.requestTimeoutSec,
      });
      setAiSettings((prev) => ({ ...prev, ...updated, apiKey: "", showApiKey: false }));
      toast.success("AI-настройки сохранены");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сохранения AI-настроек");
    }
  };

  const testAi = async () => {
    try {
      const result = await api.testAiSettings();
      setAiSettings((prev) => ({ ...prev, lastCheckStatus: result.status, lastCheckError: null }));
      toast.success(result.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка проверки подключения");
    }
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
          <div className="flex items-center justify-between rounded-md border border-border/50 p-3"><div><p className="text-sm font-medium">Автоматически переходить к следующему вопросу</p><p className="text-xs text-muted-foreground">После выбора ответа приложение само покажет следующий вопрос через короткую паузу.</p></div><Switch checked={settings.autoStartWordOnTraining} onCheckedChange={(v) => update("autoStartWordOnTraining", v)} /></div>
          <Button className="h-9 text-sm" onClick={save} disabled={loading}>Сохранить</Button>
        </CardContent>
      </Card>

      <Separator />

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">AI API</CardTitle>
          <CardDescription className="text-xs">OpenAI-совместимый API для генерации контекстных предложений.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label>URL API</Label><Input value={aiSettings.baseUrl} onChange={(e) => setAiSettings((prev) => ({ ...prev, baseUrl: e.target.value }))} placeholder="https://api.openai.com/v1" /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>API ключ</Label><div className="flex gap-2"><Input type={aiSettings.showApiKey ? "text" : "password"} value={aiSettings.apiKey || (!aiSettings.showApiKey ? aiSettings.apiKeyMasked : "")} onChange={(e) => setAiSettings((prev) => ({ ...prev, apiKey: e.target.value }))} placeholder={aiSettings.hasApiKey ? aiSettings.apiKeyMasked : "sk-..."} /><Button type="button" variant="outline" onClick={() => setAiSettings((prev) => ({ ...prev, showApiKey: !prev.showApiKey }))}>{aiSettings.showApiKey ? "Скрыть" : "Показать"}</Button></div></div>
            <div className="space-y-1.5"><Label>Модель</Label><Input value={aiSettings.modelName} onChange={(e) => setAiSettings((prev) => ({ ...prev, modelName: e.target.value }))} placeholder="Например: gpt-4o-mini" /></div>
            <div className="space-y-1.5"><Label>Температура</Label><Input type="number" min={0} max={1} step={0.1} value={aiSettings.temperature} onChange={(e) => setAiSettings((prev) => ({ ...prev, temperature: Number(e.target.value) }))} /></div>
            <div className="space-y-1.5"><Label>Максимум токенов ответа</Label><Input type="number" min={1} value={aiSettings.maxOutputTokens} onChange={(e) => setAiSettings((prev) => ({ ...prev, maxOutputTokens: Number(e.target.value) }))} /></div>
            <div className="space-y-1.5"><Label>Размер пачки слов</Label><Input type="number" min={1} max={10} value={aiSettings.wordsPerBatch} onChange={(e) => setAiSettings((prev) => ({ ...prev, wordsPerBatch: Number(e.target.value) }))} /></div>
            <div className="space-y-1.5"><Label>Таймаут запроса, сек</Label><Input type="number" min={5} max={300} value={aiSettings.requestTimeoutSec} onChange={(e) => setAiSettings((prev) => ({ ...prev, requestTimeoutSec: Number(e.target.value) }))} /></div>
          </div>

          <div className="rounded-md border border-border/50 p-3 text-sm">
            <div>Статус проверки: <b>{aiSettings.lastCheckStatus}</b></div>
            {aiSettings.lastCheckAt && <div className="text-xs text-muted-foreground">Последняя проверка: {new Date(aiSettings.lastCheckAt).toLocaleString()}</div>}
            {aiSettings.lastCheckError && <div className="text-xs text-destructive">{aiSettings.lastCheckError}</div>}
          </div>

          <div className="flex gap-2">
            <Button className="h-9 text-sm" onClick={saveAi}>Сохранить AI настройки</Button>
            <Button className="h-9 text-sm" variant="outline" onClick={testAi}>Проверить подключение</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
