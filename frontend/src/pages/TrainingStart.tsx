import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, type ModeStats, type StatsResponse, type TrainingDirectionMode, type TrainingMode, type TrainingSettingsSnapshot } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const labels: Record<TrainingMode, string> = { in_progress: "Слова в обучении", not_started: "Новые слова", all: "Все слова" };
const statsKey: Record<TrainingMode, keyof StatsResponse> = { in_progress: "inProgress", not_started: "notStarted", all: "all" };

export default function TrainingStart() {
  const params = useParams();
  const navigate = useNavigate();
  const mode = params.mode as TrainingMode;
  const [stats, setStats] = useState<ModeStats>({ total: 0, currentCycle: 0, remainingInCycle: 0 });
  const [override, setOverride] = useState(false);
  const [settings, setSettings] = useState<TrainingSettingsSnapshot>({
    maxFrequencyRank: 10000,
    includeUnknownFrequency: false,
    ruToEnOptionsCount: 4,
    enToRuOptionsCount: 4,
    trainingDirectionMode: "mixed",
    hideOptionsUntilReveal: false,
  });
  const valid = useMemo(() => ["in_progress", "not_started", "all"].includes(mode), [mode]);

  useEffect(() => {
    if (!valid) return;
    Promise.all([api.getStats(), api.getSettings()]).then(([s, set]) => {
      setStats(s[statsKey[mode]]);
      setSettings({
        maxFrequencyRank: set.maxFrequencyRank,
        includeUnknownFrequency: set.includeUnknownFrequency,
        ruToEnOptionsCount: set.ruToEnOptionsCount,
        enToRuOptionsCount: set.enToRuOptionsCount,
        trainingDirectionMode: set.trainingDirectionMode,
        hideOptionsUntilReveal: set.hideOptionsUntilReveal,
      });
    }).catch((e) => toast.error(e.message));
  }, [mode, valid]);

  const update = <K extends keyof TrainingSettingsSnapshot>(key: K, value: TrainingSettingsSnapshot[K]) => setSettings((prev) => ({ ...prev, [key]: value }));
  const start = async () => {
    try { const session = await api.createTraining(mode, override ? settings : undefined); navigate(`/training/${session.sessionId}`); } catch (e) { toast.error(e instanceof Error ? e.message : "Не удалось начать тренировку"); }
  };

  if (!valid) return <div className="text-sm text-muted-foreground">Недопустимый режим тренировки.</div>;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div><h1 className="text-lg font-semibold tracking-tight">Запуск тренировки</h1><p className="text-xs text-muted-foreground">Режим: {labels[mode]}</p></div>
      <Card className="border-border/50"><CardHeader><CardTitle className="text-base">Состояние круга</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-3 text-sm"><div className="rounded-md bg-muted/50 p-3">Доступно: <b>{stats.total}</b></div><div className="rounded-md bg-muted/50 p-3">Круг: <b>{stats.currentCycle}</b></div><div className="rounded-md bg-muted/50 p-3">Осталось: <b>{stats.remainingInCycle}</b></div></CardContent></Card>
      <Card className="border-border/50"><CardHeader><CardTitle className="text-base">Настройки</CardTitle><CardDescription className="text-xs">Можно использовать глобальные настройки или переопределить только для этой сессии.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border border-border/50 p-3"><Label>Использовать настройки только для этой тренировки</Label><Switch checked={override} onCheckedChange={setOverride} /></div>
        <fieldset disabled={!override} className="grid gap-4 sm:grid-cols-2 disabled:opacity-60">
          <div className="space-y-1.5"><Label>Макс. частотный ранг</Label><Input type="number" value={settings.maxFrequencyRank} onChange={(e) => update("maxFrequencyRank", Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Режим вопросов</Label><Select value={settings.trainingDirectionMode} onValueChange={(v: TrainingDirectionMode) => update("trainingDirectionMode", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mixed">Смешанный</SelectItem><SelectItem value="ru_to_en_only">Русский → английский</SelectItem><SelectItem value="en_to_ru_only">Английский → русский</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Вариантов RU → EN</Label><Input type="number" min={2} max={8} value={settings.ruToEnOptionsCount} onChange={(e) => update("ruToEnOptionsCount", Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Вариантов EN → RU</Label><Input type="number" min={2} max={8} value={settings.enToRuOptionsCount} onChange={(e) => update("enToRuOptionsCount", Number(e.target.value))} /></div>
        </fieldset>
        <div className="flex items-center justify-between rounded-md border border-border/50 p-3"><Label>Включать неизвестную частоту</Label><Switch disabled={!override} checked={settings.includeUnknownFrequency} onCheckedChange={(v) => update("includeUnknownFrequency", v)} /></div>
        <div className="flex items-center justify-between rounded-md border border-border/50 p-3"><div><Label>Скрывать варианты до показа</Label><p className="text-xs text-muted-foreground">Перед выбором нужно нажать “Показать варианты”.</p></div><Switch disabled={!override} checked={settings.hideOptionsUntilReveal} onCheckedChange={(v) => update("hideOptionsUntilReveal", v)} /></div>
        <Button className="h-9 text-sm" onClick={start} disabled={stats.total === 0}>Начать тренировку</Button>
      </CardContent></Card>
    </div>
  );
}
