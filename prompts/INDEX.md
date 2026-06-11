# Промпты - индекс

Библиотека готовых промптов. **Перед тем как писать промпт с нуля - проверь здесь.** Возможно, готовое уже есть.

## Как пользоваться

1. Найди в таблице задачу, которая совпадает с твоей.
2. Открой файл по ссылке - там промпт целиком.
3. Скопируй в чат Клоду. Подставь свои значения в квадратные скобки `[...]`.
4. Выполняй шаги по подсказкам Клода.

## Таблица - если тебе надо, возьми

### Setup (настройка окружения)

| Задача | Промпт |
|---|---|
| Настроить голосовой ввод (Wispr Flow / дикt) + быстрые скриншоты | [`setup/01-voice-screenshot.md`](./setup/01-voice-screenshot.md) |
| Звуковые хуки (уведомление при завершении задачи) | [`setup/02-hooks.md`](./setup/02-hooks.md) |
| Защита от опасных команд (`rm -rf`, утечка `.env` и т.д.) | [`setup/03-security.md`](./setup/03-security.md) |
| Интервью и заполнение `.business/` (fallback если AUTOPILOT не сработал) | [`setup/04-business-interview.md`](./setup/04-business-interview.md) |
| Сгенерировать `CLAUDE.md` под свой проект | [`setup/05-claude-md-generation.md`](./setup/05-claude-md-generation.md) |
| Создать папку `plans/` с правилами | [`setup/06-plans-folder.md`](./setup/06-plans-folder.md) |
| Тест-цикл (проверить что всё работает) | [`setup/07-test-cycle.md`](./setup/07-test-cycle.md) |
| Установить скилы (Bulletproof / Skill Creator / Frontend Design / PDF) с аудитом | [`setup/08-skills-install.md`](./setup/08-skills-install.md) |
| Подключить Playwright MCP (браузерная автоматизация) | [`setup/09-playwright.md`](./setup/09-playwright.md) |

### Launch (запуск в продакшн)

| Задача | Промпт |
|---|---|
| Залить код на GitHub | [`launch/01-github.md`](./launch/01-github.md) |
| Задеплоить проект (Vercel / Amvera / Railway / свой сервер) | [`launch/02-deploy.md`](./launch/02-deploy.md) |
| Подключить приём платежей (Stripe / YooKassa / CloudPayments) | [`launch/03-payments.md`](./launch/03-payments.md) |

### Methodology (методологические приёмы)

| Задача | Промпт |
|---|---|
| Критика плана через 3 параллельных субагента | [`methodology/plan-critique.md`](./methodology/plan-critique.md) |
| «10 причин обосраться» - стресс-тест перед важным шагом | [`methodology/10-reasons.md`](./methodology/10-reasons.md) |
| Импорт существующего кода в `.business/` | [`methodology/import-existing-project.md`](./methodology/import-existing-project.md) |
| Планирование недели | [`methodology/weekly-planning.md`](./methodology/weekly-planning.md) |

## Правило

> «Прежде чем писать промпт с нуля - загляни в этот INDEX.»

Это инвариант из `CLAUDE.md`. Клод сам это делает - но ты тоже помни.
