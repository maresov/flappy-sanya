# Игры про друзей

Хаб мини-игр с шутками про друзей. Три canvas-игры, общий лобби с авторизацией по PIN-коду, лидерборд через Supabase.

## Игры

| Игра | Описание | Управление |
|------|----------|------------|
| **Flappy Саня** | Flappy Bird на графике курса USD/RUB. Саня летит сквозь реальные данные ЦБ (2022–2026), потолок — 118₽ | Тап / Пробел — прыжок |
| **Гуси vs Дима** | Уворачивайся от гусей. Гуси летят с разными траекториями, скорость растёт | Drag / Стрелки — движение |
| **Бардак Виталика** | Лови падающую посуду тапом. 10 пропусков — конец | Тап по посуде |

## Структура

```
index.html                        # Хаб: логин, каталог игр, профиль, лидерборд
games/
  flappy-sanya/index.html         # Flappy Bird + курс доллара (1765 строк)
  goose-dima/index.html           # Dodge-em с гусями (1329 строк)
  bardak-vitalik/index.html       # Tap-to-catch посуда (1013 строк)
shared/
  hub-sdk.js                      # SDK: авторизация, очки, лидерборд (Supabase)
  hub-styles.css                  # Общие стили хаба (тёмная тема)
  supabase-config.js              # URL и anon key Supabase
  schema.sql                      # DDL: таблицы players/scores, view leaderboard
  polyfills.js                    # roundRect polyfill для старых браузеров
test-supabase.html                # Страница автотестов для Supabase
```

## Запуск

Проект — статический HTML, серверная часть не нужна. Любой HTTP-сервер:

```bash
# Python
python3 -m http.server 3000

# Node
npx serve -p 3000

# Или просто открыть index.html в браузере
# (Supabase-фичи не будут работать без HTTP-сервера из-за CORS)
```

Открыть `http://localhost:3000` — появится экран логина.

## Supabase

Бэкенд — [Supabase](https://supabase.com) (PostgreSQL + REST API). Используется для:
- Хранение игроков и PIN-кодов
- Сохранение и чтение очков
- Лидерборд (view `leaderboard` — лучший результат на игрока)

### Настройка своего Supabase

1. Создать проект на [supabase.com](https://supabase.com)
2. Выполнить `shared/schema.sql` в SQL Editor (добавить колонку `pin TEXT` в таблицу `players` вручную — в схеме она пропущена)
3. Заменить URL и anon key в `shared/supabase-config.js`

### Переменные

Все конфиги в `shared/supabase-config.js`:

```js
window.SUPABASE_CONFIG = {
  url: 'https://your-project.supabase.co',
  anonKey: 'your-anon-key'
};
```

Без Supabase всё работает, но лидерборд и сохранение очков отключены.

## Архитектура

- **Нет сборки** — чистый HTML/CSS/JS, zero dependencies (кроме Supabase CDN)
- **Каждая игра** — самодостаточный HTML с inline JS, рисует всё на `<canvas>`
- **Общий SDK** (`hub-sdk.js`) подключается через `<script>` и экспортирует `window.GameHub`
- **Авторизация** — по никнейму + 4-значный PIN (генерируется при регистрации)
- **Адаптивность** — все игры адаптируются под portrait/landscape через `resizeCanvas()`
