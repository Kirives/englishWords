import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, type AnswerResponse, type TrainingFinished, type TrainingQuestion } from "@/lib/api";
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
  const [translationVisible, setTranslationVisible] = useState(false);
  const [translationText, setTranslationText] = useState<string | null>(null);

  const isFinishedResponse = (value: TrainingQuestion | TrainingFinished): value is TrainingFinished => {
    return "finished" in value && value.finished === true;
  };

  const loadNext = useCallback(async () => {
    setAnswer(null);
    setOptionsRevealed(false);
    setTranslationVisible(false);
    setTranslationText(null);
    try {
      const next = await api.getNextQuestion(sessionId);
      if (isFinishedResponse(next)) { setQuestion(null); setFinishedMessage(next.message); return; }
      setFinishedMessage("");
      setTranslationText(next.ruTranslation || null);
      setQuestion(next);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Не удалось получить вопрос"); }
  }, [sessionId]);

  useEffect(() => { void loadNext(); }, [loadNext]);

  useEffect(() => {
    if (!answer || !question?.autoAdvanceAfterAnswer) return;
    const timeoutId = window.setTimeout(() => {
      void loadNext();
    }, 900);
    return () => window.clearTimeout(timeoutId);
  }, [answer, question, loadNext]);

  const choose = async (selectedOptionId: string) => {
    if (!question || answer) return;
    if (question.hideOptionsUntilReveal && !optionsRevealed) return;
    try {
      const selectedOption = question.options.find((option) => option.id === selectedOptionId);
      const result = question.questionType === "CONTEXT_CLOZE"
        ? await api.answerQuestion(sessionId, {
            wordId: question.wordId,
            questionType: question.questionType,
            contextExampleId: question.contextExampleId,
            selectedOptionWordId: selectedOption?.wordId || selectedOption?.id,
            selectedOptionText: selectedOption?.text,
            hintTranslationShown: translationVisible,
          })
        : await api.answerQuestion(sessionId, { wordId: question.wordId, questionType: question.questionType, selectedOptionId });
      setAnswer(result);
      if (result.ruTranslation) setTranslationText(result.ruTranslation);
      setProcessed((v) => v + 1);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка ответа"); }
  };

  const skip = async () => {
    if (!question || answer) return;
    try {
      await api.skipQuestion(sessionId, {
        wordId: question.wordId,
        questionType: question.questionType,
        contextExampleId: question.contextExampleId,
        hintTranslationShown: translationVisible,
      });
      setProcessed((v) => v + 1);
      await loadNext();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка пропуска"); }
  };

  const showTranslation = async () => {
    if (!question?.contextExampleId) return;
    if (translationText) {
      setTranslationVisible(true);
      return;
    }
    try {
      const response = await api.getContextTranslation(question.contextExampleId);
      setTranslationText(response.ruTranslation);
      setTranslationVisible(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось получить перевод");
    }
  };

  const finish = async () => {
    try { await api.finishTraining(sessionId); navigate("/"); } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка завершения"); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-3"><div><h1 className="text-lg font-semibold tracking-tight">Тренировка</h1><p className="text-xs text-muted-foreground">Обработано в этой сессии: {processed}</p></div><Button variant="outline" size="sm" onClick={finish}>Завершить</Button></div>
      {finishedMessage ? <Card className="border-border/50"><CardContent className="py-10 text-center"><p className="text-sm font-medium">{finishedMessage}</p><Button className="mt-4" onClick={() => navigate("/")}>На главную</Button></CardContent></Card> : question ? (
        <Card className="border-border/50">
          <CardHeader><CardDescription className="text-xs">{question.questionType === "RU_TO_EN" ? "Выберите английское слово" : question.questionType === "EN_TO_RU" ? "Выберите русский перевод" : "Подберите слово для пропуска"}</CardDescription><CardTitle className="text-xl leading-relaxed">{question.prompt}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <div className="grid gap-2">
              {question.options.map((option) => {
                const isCorrect = answer?.correctOptionId === option.id;
                const hidden = question.hideOptionsUntilReveal && !optionsRevealed && !answer;
                return <Button key={option.id} variant={answer ? (isCorrect ? "default" : "outline") : "outline"} className={`min-h-11 justify-start whitespace-normal text-left transition ${hidden ? "pointer-events-none select-none blur-sm opacity-60" : ""}`} disabled={Boolean(answer) || hidden} onClick={() => choose(option.id)}>{option.text}</Button>;
              })}
              </div>
              {question.hideOptionsUntilReveal && !optionsRevealed && !answer && <div className="absolute inset-0 flex items-center justify-center rounded-md border border-primary/20 bg-background/85 backdrop-blur-sm"><div className="max-w-sm text-center text-sm"><p className="font-medium">Варианты скрыты</p><p className="mt-1 text-xs text-muted-foreground">Попробуйте вспомнить ответ без подсказок, затем откройте варианты.</p><Button className="mt-3 h-9 text-sm" onClick={() => setOptionsRevealed(true)}>Показать варианты</Button></div></div>}
            </div>
            {question.questionType === "CONTEXT_CLOZE" && question.translationAvailable && !translationVisible && !answer && <Button variant="outline" onClick={showTranslation}>Показать перевод</Button>}
            {translationVisible && translationText && <div className="rounded-md border border-border/50 bg-muted/40 p-3 text-sm">{translationText}</div>}
            {answer && <div className={`rounded-md p-3 text-sm ${answer.isCorrect ? "bg-green-500/10 text-green-700" : "bg-destructive/10 text-destructive"}`}>{answer.isCorrect ? "Правильно" : `Неправильно. Правильный ответ: ${answer.correctAnswerText || answer.correctText}`}{answer.fullSentence ? <div className="mt-2 text-foreground">{answer.fullSentence}</div> : null}{answer.ruTranslation ? <div className="mt-2 text-muted-foreground">{answer.ruTranslation}</div> : null}</div>}
            <div className="flex gap-2"><Button variant="outline" onClick={skip} disabled={Boolean(answer)}>Пропустить</Button>{answer && !question.autoAdvanceAfterAnswer && <Button onClick={loadNext}>Следующий вопрос</Button>}{answer && question.autoAdvanceAfterAnswer && <div className="flex items-center text-xs text-muted-foreground">Переход к следующему вопросу…</div>}</div>
          </CardContent>
        </Card>
      ) : <div className="text-sm text-muted-foreground">Загрузка вопроса...</div>}
    </div>
  );
}
