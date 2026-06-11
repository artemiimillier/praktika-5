# MVP «Мультик»: фото → персонаж → раскадровка

Локальный MVP двух первых этапов пайплайна: загрузка фото ребёнка → 4 стилизованных персонажа (узнаваемость лица — ключевой критерий) → выбор → лист персонажа (model sheet: ракурсы + эмоции).

## Запуск

```bash
node mvp/server.js          # порт 3000 (или PORT=3777, если 3000 занят)
```

Открыть http://localhost:3777 (или свой порт). Ключ kie.ai сервер сам берёт из `.env` в корне (переменная с `KIE` в имени).

## Как устроено

- **Без зависимостей**: чистый Node ≥18 (`http` + глобальный `fetch`), статичный фронт в `public/index.html`.
- **API kie.ai**: модель `google/nano-banana-edit` ($0.02/картинка, до 10 референсов).
  - `POST /api/v1/jobs/createTask` → taskId; `GET /api/v1/jobs/recordInfo?taskId=` → поллинг (`waiting|queuing|generating|success|fail`, ссылки в `resultJson.resultUrls`).
  - Загрузка фото: `POST https://kieai.redpandaai.co/api/file-base64-upload` → публичный `downloadUrl`.
  - ⚠️ Ссылки на результаты живут ~24 часа — качай сразу.
- **Стили, промпты, цены, модели** — всё в `config.js`, не в коде. Апгрейд качества: поменять модель на `nano-banana-pro` ($0.09, до 8 рефов, поле `image_input` вместо `image_urls` — потребует правку `server.js`).
- **Стоимость**: сервер считает успешные генерации × цену модели, фронт показывает бейдж; `GET /api/usage`.

## Эндпоинты сервера

| Метод | Путь | Что делает |
|---|---|---|
| POST | `/api/upload` | `{dataUrl, fileName}` → публичный URL фото |
| POST | `/api/characters` | `{imageUrl}` → 4 задачи генерации персонажей |
| POST | `/api/regenerate` | `{imageUrl, styleKey}` → перегенерация одного стиля |
| POST | `/api/storyboard` | `{characterUrl, sourceUrl}` → model sheet 16:9 (2 референса: персонаж + оригинал фото) |
| GET | `/api/task/:id` | статус задачи + ссылки |
| GET | `/api/usage` | потрачено: генерации и $ |

## Экономика (kie.ai, 1 кредит = $0.005)

- Полный проход юзера: 4 персонажа + 1 раскадровка = 5 × $0.02 = **$0.10**.
- nano-banana-pro для финального качества: ~$0.45/проход.

Примеры результатов — в `samples/`.
