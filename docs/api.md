# API

- Интерактивная документация (Swagger UI): `http://localhost:8000/docs` (в Docker: `http://localhost:8080/docs`)
- Схема OpenAPI 3: [`openapi.json`](openapi.json), также `GET /openapi.json`
- Базовый путь: `/api/v1`
- Аутентификация:
  - пользователи: `Authorization: Bearer <JWT>` (токен из `POST /auth/login`, срок жизни 12 ч);
  - внешние системы (HR, LMS): `X-API-Key: <ключ>` (демо-ключ: `demo-integration-key`).

## Формат ошибок

Все ошибки отдаются в одном формате:

```json
{ "error": { "code": "choice_unavailable", "message": "Такой вариант ответа недоступен", "details": null } }
```

| HTTP | code | Когда |
|---|---|---|
| 401 | `unauthorized`, `invalid_credentials`, `invalid_api_key` | Нет или неверный токен, пароль, ключ |
| 403 | `forbidden` | Метод только для тренера |
| 404 | `not_found`, `scenario_not_found`, `attempt_not_found` | Нет объекта или он чужой |
| 409 | `choice_unavailable`, `attempt_not_active`, `attempt_not_finished`, `version_conflict`, `employee_conflict` | Действие некорректно в текущем состоянии |
| 422 | `validation_error`, `invalid_scenario`, `invalid_yaml`, `unknown_brigade` | Некорректные данные, `details` — список ошибок |
| 429 | `too_many_attempts` | Больше 5 неудачных входов за минуту |
| 500 | `internal_error` | Внутренняя ошибка, подробности только в логе сервера |

## Методы

### Аутентификация
| Метод | Путь | Описание |
|---|---|---|
| POST | `/auth/login` | `{login, password}` → `{access_token, user}` |
| GET | `/auth/me` | Текущий пользователь |

### Сценарии
| Метод | Путь | Кто | Описание |
|---|---|---|---|
| GET | `/scenarios` | все | Каталог + мои попытки, лучший исход, незавершённая попытка |
| GET | `/scenarios/{id}` | все | Вводная, источники, стартовые шкалы. Граф решений не отдаётся |
| GET | `/scenarios/{id}/graph?version=` | тренер | Полный граф сценария (JSON) |
| POST | `/scenarios/validate` | тренер | `{content}` YAML/JSON → `{valid, errors, scenario}` |
| POST | `/scenarios` | тренер | Публикация нового сценария или новой версии (версия должна быть больше текущей) |

### Прохождение
| Метод | Путь | Описание |
|---|---|---|
| POST | `/attempts` | `{scenario_id}` → начать; незавершённая попытка того же сценария закрывается |
| GET | `/attempts/{id}` | Текущее состояние (можно продолжить после перезагрузки) |
| POST | `/attempts/{id}/decisions` | `{choice_id}` или `{timeout: true}` → следующий узел, изменения шкал; на финале — награды |
| GET | `/attempts/{id}/debrief` | Разбор: каждое решение, обратная связь, лучшие варианты, ролевая модель, компетенции |
| GET | `/attempts?limit=` | История моих прохождений |

Пример узла в ответе (оценки вариантов не отдаются до разбора):

```json
{
  "id": 42, "status": "active", "loyalty": 70, "safety": 75, "step": 1,
  "hud": [{ "name": "minutes_to_station", "label": "До Твери, мин", "value": 7 }],
  "node": {
    "id": "assess", "speaker": "passenger", "speaker_name": "Сосед с места 12D",
    "text": "Пассажир в сознании, говорит, что «давит в груди»…",
    "choices": [{ "id": "comfort_only", "text": "Усадить удобнее…" }, { "id": "announce_medics", "text": "…" }],
    "timer": 25, "deadline_ms": 1790000000000
  },
  "server_time_ms": 1789999975000,
  "last": { "delta": { "loyalty": 10, "safety": 15 }, "timed_out": false, "interrupted": false }
}
```

### Визуальный редактор (тренер)
| Метод | Путь | Описание |
|---|---|---|
| GET | `/editor/dictionaries` | Компетенции, категории, классы вагонов, шаги ролевой модели — для форм |
| POST | `/editor/parse` | `{content}` YAML/JSON → `{data}` без проверки (импорт в редактор) |
| POST | `/editor/validate` | `{content}` → `{valid, issues: [{node_id, message}], scenario}` — ошибки привязаны к узлам |
| POST | `/editor/yaml` | `{content}` → `{yaml}` — выгрузка черновика в YAML для репозитория |
| POST | `/editor/preview` | `{content, state, choice_id \| timeout}` → следующий шаг тестового прогона черновика в режиме автора (видны качество и обратная связь). `state: null` — начать сначала |

### Профиль, рейтинг, уведомления, аналитика
| Метод | Путь | Кто | Описание |
|---|---|---|---|
| GET | `/profile` | все | Уровень, XP, активные и сгорающие баллы, серия дней, достижения с прогрессом, челленджи, компетенции |
| GET | `/leaderboard?scope=brigade\|depot\|company` | все | Рейтинг по баллам за 30 дней |
| GET | `/notifications` | все | Уведомления и счётчик непрочитанных |
| POST | `/notifications/read` | все | `{ids}` или `{ids: null}` — отметить прочитанными |
| GET | `/analytics/me` | все | Статистика, компетенции, ролевая модель, категории, XP по дням, выводы, рекомендации |
| GET | `/analytics/team` | тренер | Бригады × компетенции, сотрудники, самые сложные решения |
| GET | `/analytics/users/{id}` | тренер | Аналитика конкретного сотрудника |

### Интеграция HR / LMS (`X-API-Key`)
| Метод | Путь | Описание |
|---|---|---|
| GET | `/integration/org-units` | Справочник депо и бригад |
| GET | `/integration/employees` | Сотрудники: уровень, XP, баллы, мастерство по компетенциям |
| PUT | `/integration/employees/{external_id}` | Создать или обновить сотрудника из HR (идемпотентно по внешнему id) |
| GET | `/integration/results?since=&limit=` | Результаты прохождений для LMS |
| GET | `/integration/events?since=&limit=` | Журнал решений в формате xAPI statements (actor / verb / object / result) |

## Примеры

```bash
# Вход
TOKEN=$(curl -s -X POST localhost:8000/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"login":"demo","password":"vsm2026"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# Начать сценарий и ответить
curl -s -X POST localhost:8000/api/v1/attempts -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"scenario_id":"vape-smoking"}'
curl -s -X POST localhost:8000/api/v1/attempts/1/decisions -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"choice_id":"private_rule"}'

# HR: завести сотрудника
curl -s -X PUT localhost:8000/api/v1/integration/employees/HR-777 -H 'X-API-Key: demo-integration-key' \
  -H 'Content-Type: application/json' \
  -d '{"display_name":"Иван П.","employee_code":"SYN-7777","brigade_id":2,"initial_password":"change-me-please"}'

# LMS: забрать результаты за период
curl -s 'localhost:8000/api/v1/integration/results?since=2026-09-01T00:00:00Z' -H 'X-API-Key: demo-integration-key'
```
