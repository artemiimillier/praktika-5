# Multik — Фаза 1: технический план «продукт-раскадровка» (облачные API)

> Отгружаемый продукт без видео: фото ребёнка → RU-сценарий + залоченный персонаж + раскадровка (1 кейфрейм на ~3с кадр) + бесплатное превью с водяным знаком.
> Дата: 2026-06-10. Стек: облачные API. Источник: воркфлоу из 4 агентов (точные API-спеки) + автор плана. Развивает [research-план](2026-06-10-multik-research-i-pipeline.md).

---

## 0. Архитектура (одной картиной)

**Хостинг:** Next.js (веб + просмотр PDF) + один Node-worker + managed Postgres (Render/Railway/Fly). Один фикс-прайс хост, без Redis/очередей.

**Поток на заказ:**
1. Родитель грузит фото ребёнка (+ опц. семья/питомцы/вещи) → **только в свой приватный бакет** (AES-256 at rest, TLS), никогда не публичный CDN.
2. **Интейк/безопасность:** Google Vision `images:annotate` (FACE + SAFE_SEARCH + CROP_HINTS + IMAGE_PROPERTIES) одним вызовом → гейт «лицо есть/фронт/резкое/разрешение» + считаем чистый фронт-кроп сами; **второй независимый проход** AWS Rekognition `DetectModerationLabels` (fail-closed по любому флагу).
3. **Сценарий:** YandexGPT 5 Pro в два прохода — A: свободный RU-сценарий (temp 0.7); B: сценарий → строгий shot-list JSON через `response_format json_schema` (temp 0.3).
4. **Золотой референс:** Gemini API `gemini-3-pro-image-preview`, кроп ребёнка → ОДИН залоченный канонический мульт-герой (2K), гейт ручного апрува.
5. **Библия персонажа:** та же модель, золотой реф + кропы семьи/питомцев/вещей как мульти-референсы (до 5 персонажных + 6 объектных картинок в одном `generateContent`) → пак 5–6 (фронт/профиль/3-4/крупный/в рост/экшн).
6. **Кейфреймы:** на кадр — `generateContent` с промптом + пак из 5 картинок + индексация `image 1..N` + фикс. aspect_ratio/resolution для continuity; 1 стилл на ~3с кадр (2K, опц. 4K на геройских); QA-reroll меняет ОДНУ переменную/кадр.
7. **Доставка:** превью с водяным знаком (бесплатно) через `sharp.composite()` (диагональная плитка); чистые ассеты (платно) — та же композиция с флагом без водяного знака; PDF через `@react-pdf/renderer`; веб-аниматик-галерея в Next.js.

**🔑 Ключевой шов:** все вызовы моделей идут через единый интерфейс **`ModelRouter`** (`generateImage` / `writeScript` / `makeShotList` / `moderate`), чтобы RU-фолбэк (GigaChat, Kandinsky 5, self-host RetinaFace) подключался **конфигом, а не переписыванием кода** — каждый провайдер работает по ОДНОЙ json-схеме и ОДНИМ контрактам промптов. Джобы — в Postgres `render_jobs` через `SELECT ... FOR UPDATE SKIP LOCKED` + reaper зависших; долгие генерации — submit-then-poll. `cost_usd` пишется в строку джоба для юнит-экономики.

---

## 1. Модель данных

- **`users`** (id, email, `parental_consent_at`, consent_ip, created_at) — верифицируемое родительское согласие (COPPA/GDPR-K) = жёсткий гейт до любой обработки.
- **`characters`** (id, owner_user_id, name, kind `['child','family','pet','object']`, status `['draft','locked']`, golden_ref_url, character_bible_json JSONB `{dna_text, anchor, geometry}`, reference_pack_urls TEXT[], source_photo_url (приватный бакет, короткий TTL), …) — **это и есть переиспользуемая библиотека персонажа** (примитив Pixley); залоченные переиспользуются для повторных продаж (след. ДР, брат/сестра).
- **`projects`** (id, owner_user_id, hero_character_id, title, moral_beat, aspect_ratio, resolution_default `['2K','4K']`, status `['intake','scripting','bible','keyframing','delivery','done','failed']`) — один заказ-раскадровка.
- **`project_characters`** (project_id, character_id, role) — M:N: один проект сплетает ребёнка + семью + питомцев + вещи; один сохранённый персонаж в многих проектах.
- **`scripts`** (id, project_id, language='ru', prose_text, shot_list_json JSONB, model_provider, model_version) — оба прохода; провайдер/версия пинятся для воспроизводимости/A-B.
- **`shots`** (id, project_id, shot_index, duration_sec ~3.0, camera ENUM, shot_type ENUM, action, dialogue, characters_in_shot TEXT[], wardrobe, props TEXT[], keyframe_url, keyframe_status `['pending','generated','qa_pass','reroll']`, seed) — денормализовано из shot_list_json для QA-цикла и галереи.
- **`render_jobs`** (id, project_id, character_id?, type `['intake','golden','bible','keyframe','still_watermarked','still_clean','pdf','animatic']`, status `['pending','processing','done','failed']`, input_props JSONB, output_url, watermarked BOOL, model_provider, model_version, cost_usd, attempts, max_attempts, locked_at, error) — Postgres-как-очередь; cost_usd роллапится в COGS на раскадровку.
- **`intake_results`** (id, project_id, source_photo_url, vision_face_json, rekognition_json, passed BOOL, reject_reason, crop_box JSONB) — аудит двухпроходного гейта (fail-closed).
- **`deliverables`** (id, project_id, kind `['preview_web','preview_pdf','final_web','final_pdf','final_animatic']`, url, watermarked BOOL) — бесплатное превью vs платный чистый ассет.

---

## 2. Шаги реализации (фазы со статусом)

### Фаза 0 — Инфраструктура (сквозная, начать первой)

- [ ] **0.1 Шов роутинга моделей + секреты.** Интерфейс `ModelRouter` с 4 методами: `moderate(image)`, `generateImage({prompt, refImages[], aspectRatio, resolution, seed})`, `writeScript({brief})`, `makeShotList({prose, schema})`. Облачные провайдеры за ним; конфиг-переключатель (провайдер на capability) → RU-фолбэк дропается позже **без правки call-site**. Все провайдеры — одна shot_list json-схема и одни строки-контракты промптов.
  - _Done:_ один env/config-флаг меняет провайдера любой capability; stub RU-провайдера компилируется и выбираем; бизнес-код не ссылается на вендорский SDK напрямую.
- [ ] **0.2 Очередь джобов на Postgres + worker.** Все таблицы + `render_jobs`. Worker клеймит через `FOR UPDATE SKIP LOCKED`, инкрементит attempts, пишет cost_usd, reaper сбрасывает зависшие `processing` старше N мин в `pending`. Долгие генерации — submit-then-poll.
  - _Claim SQL:_ `WITH next AS (SELECT id FROM render_jobs WHERE status='pending' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE render_jobs SET status='processing', locked_at=now() FROM next WHERE render_jobs.id=next.id RETURNING *;`
  - _Done:_ два worker'а не дублируют джоб; убитый worker возвращает джоб в `pending`; cost_usd заполнен.

### Фаза 1 — Конвейер раскадровки

- [ ] **1.1 Интейк + двухпроходный гейт безопасности.** Валидация (1 лицо, фронт, резко, лицо достаточно крупное), свой чистый фронт-кроп, модерация fail-closed двумя вендорами. Удалять сырой аплоад сразу после золотого референса.
  - _API:_ Google Vision `images:annotate` (FACE + SAFE_SEARCH + CROP_HINTS + IMAGE_PROPERTIES, base64 inline, sync) → 2-й проход AWS Rekognition `DetectModerationLabels` (MinConfidence 55–60).
  - _Гейты:_ ровно 1 лицо & detectionConfidence ≥0.7; |pan|tilt|roll| ≤20°; blurred/underExposed ∈ {UNLIKELY, VERY_UNLIKELY}; лицо ≥ ~200×200px; reject если adult|violence|racy ≥LIKELY (Vision) ИЛИ любой флаг Rekognition. Паддинг bbox ~25% и re-square для кропа.
  - _Done:_ хорошее фото проходит и даёт квадратный фронт-кроп; мульти-лицо/размытое/мелкое/NSFW отклоняются с конкретной причиной; сырой аплоад удаляем после золотого; строка `intake_results`. **Важно: CSAM не детектит ни один API** — безопасность = согласие + минимизация + удаление, а не скор модерации.
- [ ] **1.2 Сценарий (свободный RU-текст, проход A).** Эмоциональный RU-сценарий с чётким смысловым битом, вплетает имя + семью/питомцев/вещи из проекта. JSON-схемой НЕ ограничивать (плющит прозу).
  - _API:_ YandexGPT 5 Pro — `POST https://llm.api.cloud.yandex.net/v1/chat/completions`, model `gpt://<folder_id>/yandexgpt/latest`, temp 0.7. Auth: `Authorization: Api-Key <key>` + `x-folder-id: <folder_id>`.
  - _Done:_ идиоматичный RU (правильные уменьшительные), явный смысловой бит, каждое имя/питомец/вещь упомянуты ≥1 раза.
- [ ] **1.3 Shot-list JSON (строгий, проход B).** Проза → машинный пошотовый список с принуждённой схемой. Отдельный вызов от 1.2.
  - _API:_ YandexGPT 5 Pro `response_format {type:'json_schema', json_schema:{name:'shot_list', schema:<ниже>}}`, temp 0.3. Та же схема — для dev-бенчмарка Claude/GPT и будущего RU-фолбэка. Валидация + ретрай на ошибке парсинга.
  - **Схема shot_list:** объект с `required: [project_title, aspect_ratio, total_duration_sec, moral_beat, shots]`; `aspect_ratio ∈ ['5:4','4:5','16:9','3:2']`; `shots[]` каждый с `required: [id, duration_sec, shot_type, camera, characters_in_shot, action, dialogue, wardrobe, props, background, emotion]`, где `shot_type ∈ ['wide','medium','close_up','extreme_close_up','full_body','establishing']`, `camera ∈ ['static','pan_left','pan_right','push_in','pull_out','tilt_up','tilt_down','tracking']`.
  - _Done:_ валидный JSON парсится 100% на 10 прогонах; ~3с/кадр; camera & shot_type только из enum; каждый кадр называет своих персонажей; строки зеркалятся в `shots`.
- [ ] **1.4 Золотой референс (залоченный канонический герой).** Апрувленный фронт-кроп → ОДИН канонический мульт-герой на чистом фоне = единый источник истины личности. Ручной апрув до продолжения (это и есть ЛОК).
  - _API:_ Gemini API `gemini-3-pro-image-preview` (google-genai SDK). `generate_content(contents=[prompt, child_crop], config: response_modalities=['TEXT','IMAGE'], image_config(aspect_ratio=<фикс проекта>, image_size='2K'))`. REST: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent`. **Только платный**, ключ с привязанным биллингом.
  - _Done:_ фаундер апрувит одного героя; `characters.status='locked'`, сохранены golden_ref_url + dna_text + anchor (напр. красная куртка).
- [ ] **1.5 Библия персонажа (пак 5–6 картинок).** Из золотого рефа (+ опц. кропы семьи/питомцев/вещей) — пак консистентности: фронт-нейтрал, профиль, 3/4, крупный план лица, в полный рост, экшн/эмоция. **Ради этого идём в direct API** (нужно 5+ рефов, не 2 как у fal).
  - _API:_ Gemini direct — золотой реф + до 5 персонажных + 6 объектных рефов в ОДНОМ `generateContent`; индексировать в промпте `image 1=front, image 2=profile...`. 2K, тот же aspect_ratio. (`fal.ai /edit` — только фолбэк под кейфреймы, его лимит в 2 рефа НЕ потянет этот пак.)
  - _Done:_ 5–6 on-model, консистентных видов в `characters.reference_pack_urls`; похожесть семьи/питомцев/вещей сохранена.
- [ ] **1.6 Генерация кейфреймов (1 стилл/кадр) + QA.** На кадр — один полированный кейфрейм с паком для лока личности; QA-цикл рероллит только худшие, меняя ОДНУ переменную/попытку. Фикс aspect_ratio + resolution (+ seed) на весь список для continuity.
  - _API:_ Gemini direct `gemini-3-pro-image-preview` (промпт + пак 5 картинок + индексация `image 1..N`, '2K', геройские '4K'). **Batch API (~½ цены) для массового async-прохода.** Фолбэк `fal-ai/gemini-3-pro-image-preview/edit` для одно/двух-реф правок (seed для воспроизводимости).
  - _Done:_ у каждого кадра есть qa_pass кейфрейм; тот же герой узнаваемо консистентен по всем кадрам на одном залоченном aspect ratio/resolution.
- [ ] **1.7 Доставка: превью с водяным знаком + чистый PDF/веб.** Сборка раскадровки: бесплатное превью с водяным знаком (гейт конверсии) + платные чистые ассеты; веб-аниматик-галерея + скачиваемый PDF, оба с кейфрейм + подпись (action/dialogue) на кадр.
  - _API:_ водяной знак+стиллы — `sharp.composite()` (диагональная плитка низкой прозрачности, crop-resistant), легче всего для Phase-1 (только стиллы). PDF — `@react-pdf/renderer` v4.5.x (без Chromium): `<Document><Page><View><Image/><Text/></View></Page></Document>`, бледный фикс. водяной знак на страницу. Веб-галерея в Next.js. Remotion `renderStill` только если хочется слайдшоу-аниматик (флаг `watermark:boolean` = переключатель free→paid).
  - _Done:_ бесплатное превью видимо помечено и crop-resistant; платный рендер идентичен минус знак; PDF + веб-галерея рендерят полную раскадровку + RU-сценарий; строки `deliverables` записаны. _(Кейфреймы в JPG/PNG — `<Image>` в react-pdf не ест SVG/webp; локал/base64 предпочтительнее remote fetch.)_

---

## 3. Итоговый выбор API и цены

| Слой | Выбор | Цена |
|---|---|---|
| **Изображения** (золотой реф + пак + кейфреймы) | **Google Gemini API DIRECT** — `gemini-3-pro-image-preview` (Nano Banana Pro) | ~$0.134/img @1K/2K, ~$0.24 @4K; **Batch ~$0.067/$0.12**. Выбран т.к. только direct берёт 5+ рефов для пака (fal `/edit` лимит 2). `fal-ai/.../edit` — фолбэк правок ($0.15/$0.30) |
| **Сценарий + shot-list JSON** | **YandexGPT 5 Pro** — `gpt://<folder_id>/yandexgpt/latest`, OpenAI-совместимый `/v1/chat/completions` + `response_format json_schema` | ~0.80 ₽/1K токенов (~$9/1M), **оплата в ₽ из РФ**. Выбран за принуждённый structured output + нативный RU + RU-биллинг. **GigaChat-2-Max** ($0.65/1M, 1M бесплатно/год, JSON через function-call) — RU-хедж №2. Claude Opus 4.8 ($5/$25 за 1M) — **только dev-бенчмарк, не оплатить из РФ** |
| **Интейк** (валидация+кроп+модерация) | **Google Cloud Vision** `images:annotate` (один sync-вызов) | ~$0 до 1000 фото/мес, далее ~$1.50/1000. Gemini 2.5 Flash JSON-вердикт — опц. advisory-фолбэк |
| **2-й проход модерации** (fail-closed) | **AWS Rekognition** `DetectModerationLabels` | $0.001/img, 5000/мес бесплатно 1-й год. OpenAI omni-moderation **намеренно НЕ** (его класс sexual/minors на картинках — text-only, не тот инструмент) |
| **Доставка / водяной знак** | `sharp.composite()` (стиллы), `@react-pdf/renderer` v4.5.x (PDF, без Chromium, MIT), Remotion (free ≤3 чел) — под опц. аниматик | низкая |

**COGS:** ~**$5.27** за 12-кадровую раскадровку (sync), ~**$2.92** с Batch API на массовых проходах. Разбивка (sync): золотой реф ~3 ген $0.40; библия ~8 ген $1.07; кейфреймы 12 кадров×2 ген $3.22; 2 геройских 4K $0.48; Vision $0.007; Rekognition $0.005; YandexGPT 2 прохода ~6K токенов $0.05; доставка ~$0.03. Внутри research-таргета ($1–5) и ничтожно против цены $25–60 → **>90% gross margin** на раскадровке до видео. Масштаб ~линейный: полная ~40-кадровая ~$12–15 sync / ~$7–8 batch. _Цены вендорские, «могут меняться — сверять live»._

---

## 4. Открытые решения (что надо решить фаундеру)

1. **🚨 Биллинг-гейт (блокирует старт разработки):** реально ли резиденту РФ оплатить Google (Gemini direct + Vision) и AWS (Rekognition) сегодня? Если нет → роутить изображения+интейк через fal.ai (но лимит 2 рефа ломает пак персонажа) или ускорять self-host RU-фолбэк. **Решить до написания кода слоя изображений.**
2. **Длина раскадровки v1:** короткий ~12-кадровый сэмпл (дешевле ~$5, быстрее QA, быстрее валидирует) vs полная ~40-кадровая (~$12–15). _Рекомендация: старт с 12._
3. **Sync vs Batch для кейфреймов:** Batch ~½ цены, но +латентность. Раз продукт — премиум made-to-order (часы, не минуты), Batch скорее default — подтвердить приемлемость сроков.
4. **Маршрут водяного знака:** взять `sharp.composite()` сейчас (без AWS/Lambda для Phase-1 стиллов), Remotion отложить до Phase-2 аниматика — подтвердить, что слайдшоу-MP4 в Phase-1 НЕ нужен.
5. **Политика разрешения:** 2K дефолт всем, 4K только на 1–2 геройских? Подтвердить трейд-офф и какие кадры «геройские».
6. **Согласие/PII:** точный flow верифицируемого родительского согласия (COPPA/GDPR-K) и TTL хранения сырых детских фото до авто-удаления — юр./доверительный гейт до первого реального аплоада. Выбрать провайдера self-host хранилища.
7. **GigaChat vs YandexGPT как PRIMARY сценарист:** рекомендован YandexGPT за принуждённую json-схему, но 1M бесплатных токенов/год у GigaChat соблазнителен на раннем dev — решить, A/B-тестить ли оба за роутером с дня 1 (одна схема делает это однострочным).
8. **UX/цена переиспользования библиотеки:** примитив сохранённого персонажа в модели данных с дня 1 — решить, как повторные покупки (след. ДР, брат/сестра) показываются и тарифицируются, т.к. это меняет M:N-флоу projects/characters.

---

## Итог этапа

**Статус: тех-план Фазы 1 готов целиком, реализация НЕ начата.** План implementation-ready: точные эндпоинты, схема shot-list JSON, модель данных, COGS ~$5/раскадровка, 8 открытых решений. **Блокер №1 — биллинг-гейт (п.4.1):** надо проверить оплату Google/AWS из РФ до старта кода слоя изображений. Следующий шаг после решений: начать с Фазы 0 (роутинг-шов + Postgres-очередь), затем 1.1→1.7 на 12-кадровом сэмпле.
