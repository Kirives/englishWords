import { useEffect, useMemo, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, type AiProviderSettings, type ContextGenerationJob } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface Props {
  aiSettings: AiProviderSettings | null;
  disabled?: boolean;
}

const defaults = {
  wordScope: "missing_contexts",
  generationMode: "generate_missing",
  sentencesPerWord: 10,
  simple: 4,
  medium: 3,
  hard: 3,
  maxWordsPerJob: 50,
  wordsPerBatch: 5,
  useFrequencyFilter: true,
};

export function EnrichContextExamplesDialog({ aiSettings, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaults);
  const [creating, setCreating] = useState(false);
  const [job, setJob] = useState<ContextGenerationJob | null>(null);

  useEffect(() => {
    if (aiSettings) {
      setForm((prev) => ({ ...prev, wordsPerBatch: aiSettings.wordsPerBatch || prev.wordsPerBatch }));
    }
  }, [aiSettings]);

  useEffect(() => {
    if (!job || !open) return undefined;
    if (["completed", "failed", "cancelled"].includes(job.status)) return undefined;

    const timerId = window.setInterval(async () => {
      try {
        setJob(await api.getContextGenerationJob(job.jobId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось обновить статус job");
      }
    }, 2000);

    return () => window.clearInterval(timerId);
  }, [job, open]);

  const estimatedExamples = useMemo(() => form.sentencesPerWord * form.maxWordsPerJob, [form]);
  const estimatedRequests = useMemo(() => Math.ceil(form.maxWordsPerJob / Math.max(1, form.wordsPerBatch)), [form]);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const run = async () => {
    setCreating(true);
    try {
      const created = await api.createContextEnrichmentJob({
        wordScope: form.wordScope,
        generationMode: form.generationMode,
        sentencesPerWord: form.sentencesPerWord,
        difficultyDistribution: {
          simple: form.simple,
          medium: form.medium,
          hard: form.hard,
        },
        maxWordsPerJob: form.maxWordsPerJob,
        wordsPerBatch: form.wordsPerBatch,
        useFrequencyFilter: form.useFrequencyFilter,
      });
      setJob({
        jobId: created.jobId,
        status: created.status,
        targetWordsCount: created.targetWordsCount,
        processedWordsCount: 0,
        generatedExamplesCount: 0,
        validExamplesCount: 0,
        invalidExamplesCount: 0,
        failedWordsCount: 0,
        errorDetails: [],
      });
      toast.success("Задача обогащения запущена");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось запустить обогащение");
    } finally {
      setCreating(false);
    }
  };

  const cancel = async () => {
    if (!job) return;
    try {
      await api.cancelContextGenerationJob(job.jobId);
      setJob(await api.getContextGenerationJob(job.jobId));
      toast.success("Задача отменена");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отменить задачу");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Sparkles className="mr-2 h-4 w-4" />
          Обогатить предложениями
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Обогатить предложениями</DialogTitle>
          <DialogDescription>
            Генерация AI-контекстов для слов пользователя с сохранением в локальный банк предложений.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Какие слова обогатить</Label>
            <Select value={form.wordScope} onValueChange={(value) => update("wordScope", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все активные слова</SelectItem>
                <SelectItem value="in_progress">Только слова в обучении</SelectItem>
                <SelectItem value="not_started">Только новые слова</SelectItem>
                <SelectItem value="missing_contexts">Только слова без AI-предложений</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Режим генерации</Label>
            <Select value={form.generationMode} onValueChange={(value) => update("generationMode", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="generate_missing">Сгенерировать недостающие предложения</SelectItem>
                <SelectItem value="regenerate">Обновить предложения</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Количество предложений на слово</Label>
            <Input type="number" min={1} max={30} value={form.sentencesPerWord} onChange={(e) => update("sentencesPerWord", Number(e.target.value))} />
          </div>

          <div className="space-y-1.5">
            <Label>Максимум слов за запуск</Label>
            <Input type="number" min={1} max={500} value={form.maxWordsPerJob} onChange={(e) => update("maxWordsPerJob", Number(e.target.value))} />
          </div>

          <div className="space-y-1.5">
            <Label>Размер пачки</Label>
            <Input type="number" min={1} max={10} value={form.wordsPerBatch} onChange={(e) => update("wordsPerBatch", Number(e.target.value))} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>Simple</Label><Input type="number" min={0} max={20} value={form.simple} onChange={(e) => update("simple", Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Medium</Label><Input type="number" min={0} max={20} value={form.medium} onChange={(e) => update("medium", Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Hard</Label><Input type="number" min={0} max={20} value={form.hard} onChange={(e) => update("hard", Number(e.target.value))} /></div>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border/50 p-3">
          <div>
            <p className="text-sm font-medium">Только слова, подходящие под текущий фильтр частоты</p>
            <p className="text-xs text-muted-foreground">Используются текущие глобальные настройки частотности.</p>
          </div>
          <Switch checked={form.useFrequencyFilter} onCheckedChange={(value) => update("useFrequencyFilter", value)} />
        </div>

        <div className="grid gap-2 rounded-md bg-muted/50 p-3 text-sm sm:grid-cols-3">
          <div>Будет создано предложений: <b>до {estimatedExamples}</b></div>
          <div>Запросов к AI: <b>примерно {estimatedRequests}</b></div>
          <div>Модель: <b>{aiSettings?.modelName || "—"}</b></div>
        </div>

        {job && (
          <div className="space-y-2 rounded-md border border-border/50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">Статус job</span>
              <span>{job.status}</span>
            </div>
            <div>Обработано слов: <b>{job.processedWordsCount}</b> / {job.targetWordsCount}</div>
            <div>Создано предложений: <b>{job.generatedExamplesCount}</b></div>
            <div>Валидных: <b>{job.validExamplesCount}</b>, отклонено: <b>{job.invalidExamplesCount}</b>, с ошибкой слов: <b>{job.failedWordsCount}</b></div>
            {job.errorMessage && <div className="text-destructive">{job.errorMessage}</div>}
            {job.errorDetails && job.errorDetails.length > 0 && (
              <div className="max-h-40 overflow-auto rounded-md bg-muted px-3 py-2 text-xs">
                {job.errorDetails.map((item, index) => (
                  <div key={`${item.word}-${index}`}>{item.word}: {item.reason}</div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={run} disabled={creating}>
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Запустить
          </Button>
          {job && ["pending", "running"].includes(job.status) && (
            <Button variant="outline" onClick={cancel}>Отменить</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}