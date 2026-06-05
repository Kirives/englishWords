import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, type AnswerResponse, type TrainingQuestion } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function TrainingSession() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const [question, setQuestion] = useState<TrainingQuestion | null>(null);
  const [finishedMessage, setFinishedMessage] = useState("");
  const [answer, setAnswer] = useState<AnswerResponse | null>(null);
  const [processed, setProcessed] = useState(0);
  const [optionsRevealed, setOptionsRevealed] = useState(false);

  const loadNext = useCallback(async () => {
    setAnswer(null);
    setOptionsRevealed(false);
    try {
      const next = await api.getNextQuestion(sessionId);
      if ("finished" in next && next.finished) { setQuestion(null); setFinishedMessage(next.message); return; }
      setFinishedMessage(""); setQuestion(next);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Не удалось получить вопрос"); }
  }, [sessionId]);

  useEffect(() => { void loadNext(); }, [loadNext]);

  const choose = async (selectedOptionId: string) => {
    if (!question || answer) return;
    if (question.hideOptionsUntilReveal && !optionsRevealed) return;
    try { const result = await api.answerQuestion(sessionId, { wordId: question.wordId, questionType: question.questionType, selectedOptionId }); setAnswer(result); setProcessed((v) => v + 1); } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка ответа"); }
  };

  const skip = async () => {
    if (!question || answer) return;
    try { await api.skipQuestion(sessionId, { wordId: question.wordId, questionType: question.questionType }); setProcessed((v) => v + 1); await loadNext(); } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка пропуска"); }
  };

  const finish = async () => {
    try { await api.finishTraining(sessionId); navigate("/"); } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка завершения"); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-3"><div><h1 className="text-lg font-semibold tracking-tight">Тренировка</h1><p className="text-xs text-muted-foreground">Обработано в этой сессии: {processed}</p></div><Button variant="outline" size="sm" onClick={finish}>Завершить</Button></div>
      {finishedMessage ? <Card className="border-border/50"><CardContent className="py-10 text-center"><p className="text-sm font-medium">{finishedMessage}</p><Button className="mt-4" onClick={() => navigate("/")}>На главную</Button></CardContent></Card> : question ? (
        <Card className="border-border/50">
          <CardHeader><CardDescription className="text-xs">{question.questionType === "RU_TO_EN" ? "Выберите английское слово" : "Выберите русский перевод"}</CardDescription><CardTitle className="text-xl leading-relaxed">{question.prompt}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {question.hideOptionsUntilReveal && !optionsRevealed && !answer && <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm"><p className="font-medium">Варианты скрыты</p><p className="mt-1 text-xs text-muted-foreground">Попробуйте вспомнить ответ без подсказок, затем откройте варианты.</p><Button className="mt-3 h-9 text-sm" onClick={() => setOptionsRevealed(true)}>Показать варианты</Button></div>}
            <div className="grid gap-2">
              {question.options.map((option) => {
                const isCorrect = answer?.correctOptionId === option.id;
                const hidden = question.hideOptionsUntilReveal && !optionsRevealed && !answer;
                return <Button key={option.id} variant={answer ? (isCorrect ? "default" : "outline") : "outline"} className={`min-h-11 justify-start whitespace-normal text-left transition ${hidden ? "pointer-events-none select-none blur-sm opacity-60" : ""}`} disabled={Boolean(answer) || hidden} onClick={() => choose(option.id)}>{option.text}</Button>;
              })}
            </div>
            {answer && <div className={`rounded-md p-3 text-sm ${answer.isCorrect ? "bg-green-500/10 text-green-700" : "bg-destructive/10 text-destructive"}`}>{answer.isCorrect ? "Правильно" : `Неправильно. Правильный ответ: ${answer.correctText}`}</div>}
            <div className="flex gap-2"><Button variant="outline" onClick={skip} disabled={Boolean(answer)}>Пропустить</Button>{answer && <Button onClick={loadNext}>Следующий вопрос</Button>}</div>
          </CardContent>
        </Card>
      ) : <div className="text-sm text-muted-foreground">Загрузка вопроса...</div>}
    </div>
  );
}
