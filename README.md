# English Words

Простое приложение для тренировки английских слов.

## Архитектура

- `frontend/` — React + Vite + Tailwind UI.
- `backend/` — Node.js + Express API.
- PostgreSQL — пользователи, слова, настройки, сессии тренировок, попытки и независимые счётчики повторений.

Все пользовательские данные изолированы по `userId`. Авторизация реализована через JWT, как в `mindful-habits`.

## Запуск в Docker

```bash
docker compose up --build
```

После старта:

- frontend: `http://localhost:8090`
- backend API: `http://localhost:3020/api`
- postgres: `localhost:5433`

## Переменные окружения

Настраиваются в корневом `.env`:

- `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_EXTERNAL_PORT`
- `BACKEND_PORT`, `FRONTEND_PORT`
- `JWT_SECRET`
- `AI_SETTINGS_ENCRYPTION_SECRET`
- `CORS_ORIGIN`
- `VITE_API_BASE_URL`

## Автодеплой на сервер

Workflow: `.github/workflows/deploy.yml`

При `push` в `main` выполняется деплой по SSH:

```bash
cd "/habbit/englishWords"
git fetch --all
git reset --hard origin/main
docker compose up -d --build
docker image prune -f
```

### Что нужно настроить

- GitHub secret `SSH_PRIVATE_KEY`.
- На сервере путь `/habbit/englishWords` с клонированным репозиторием или доступом к `git@github.com:Kirives/englishWords.git`.
- Docker + Docker Compose plugin на сервере.

## Основные функции MVP

- Импорт JSON в форматах `[...]` и `{ "exampleWords": [...] }`.
- Merge по `userId + wordNormalized` без сброса статистики.
- Настройки тренировок и переопределение настроек на одну тренировку.
- Режимы: слова в обучении, новые слова, все слова.
- Два типа вопросов: русский → английский и английский → русский.
- Независимые счётчики повторений по каждому режиму.
