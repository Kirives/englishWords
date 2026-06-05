import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Layers, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, type ModeStats, type StatsResponse, type TrainingMode } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const modeCards: Array<{ key: keyof StatsResponse; mode: TrainingMode; title: string; description: string; icon: typeof BookOpen }> = [
  { key: "inProgress", mode: "in_progress", title: "Слова в обучении", description: "Только слова со статусом in_progress", icon: BookOpen },
  { key: "notStarted", mode: "not_started", title: "Новые слова", description: "Слова, которые ещё не были начаты", icon: Sparkles },
  { key: "all", mode: "all", title: "Все слова", description: "Все активные новые слова и слова в обучении", icon: Layers },
];

const emptyStats: StatsResponse = {
  inProgress: { total: 0, currentCycle: 0, remainingInCycle: 0 },
  notStarted: { total: 0, currentCycle: 0, remainingInCycle: 0 },
  all: { total: 0, currentCycle: 0, remainingInCycle: 0 },
};

function StatLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function ModeCard({ title, description, mode, icon: Icon, stats }: { title: string; description: string; mode: TrainingMode; icon: typeof BookOpen; stats: ModeStats }) {
  const navigate = useNavigate();
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
          <div className="min-w-0"><CardTitle className="text-base">{title}</CardTitle><CardDescription className="text-xs">{description}</CardDescription></div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <StatLine label="Доступно слов" value={stats.total} />
          <StatLine label="Текущий круг" value={stats.currentCycle} />
          <StatLine label="Осталось в круге" value={stats.remainingInCycle} />
        </div>
        <Button className="w-full h-9 text-sm" disabled={stats.total === 0} onClick={() => navigate(`/training/${mode}/start`)}>Начать тренировку</Button>
      </CardContent>
    </Card>
  );
}

export default function Index() {
  const [stats, setStats] = useState<StatsResponse>(emptyStats);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await api.getStats());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить статистику");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStats(); }, [loadStats]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Тренировка английских слов</h1>
          <p className="text-xs text-muted-foreground">Слова проходят равномерными кругами, а счётчики не смешиваются между режимами.</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadStats} disabled={loading}>{loading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Обновить</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {modeCards.map((card) => <ModeCard key={card.mode} {...card} stats={stats[card.key]} />)}
      </div>
    </div>
  );
}
