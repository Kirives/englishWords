import { useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { api, type ImportReport } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function ImportWords() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  const handleImport = async () => {
    if (!file) return toast.error("Выберите JSON-файл");
    setLoading(true);
    try {
      const payload = JSON.parse(await file.text());
      const result = await api.importWords(payload);
      setReport(result);
      toast.success("Импорт завершён");
    } catch (error) {
      toast.error(error instanceof SyntaxError ? "Файл должен быть валидным JSON" : error instanceof Error ? error.message : "Ошибка импорта");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div><h1 className="text-lg font-semibold tracking-tight">Импорт JSON</h1><p className="text-xs text-muted-foreground">Повторный импорт работает как merge и не сбрасывает счётчики.</p></div>
      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-base">Загрузить слова</CardTitle><CardDescription className="text-xs">Поддерживается массив слов или объект с полем exampleWords.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Input type="file" accept="application/json,.json" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          <Button className="h-9 text-sm" onClick={handleImport} disabled={loading || !file}><Upload className="mr-2 h-4 w-4" />{loading ? "Импорт..." : "Импортировать"}</Button>
        </CardContent>
      </Card>
      {report && (
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-base">Результат импорта</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md bg-muted/50 p-3">Добавлено: <b>{report.created}</b></div>
              <div className="rounded-md bg-muted/50 p-3">Обновлено: <b>{report.updated}</b></div>
              <div className="rounded-md bg-muted/50 p-3">Пропущено: <b>{report.skipped}</b></div>
              <div className="rounded-md bg-muted/50 p-3">Дубли в файле: <b>{report.duplicatesInFile}</b></div>
              <div className="rounded-md bg-muted/50 p-3 sm:col-span-2">Изменили статус: <b>{report.statusChanged}</b></div>
            </div>
            {report.errors.length > 0 && <div className="space-y-2"><p className="font-medium">Ошибки</p><div className="max-h-56 overflow-auto rounded-md border border-border/50">{report.errors.map((error, index) => <div key={index} className="border-b border-border/50 px-3 py-2 text-xs last:border-0">Строка {error.row}: {error.word || "<пусто>"} — {error.reason}</div>)}</div></div>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
