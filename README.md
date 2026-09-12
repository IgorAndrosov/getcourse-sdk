# gc-sdk

Playwright-библиотека для автоматизации админки GetCourse. Сессия живёт, пока открыт клиент: методы ходят уже авторизованными.

Репозиторий: [IgorAndrosov/getcourse-sdk](https://github.com/IgorAndrosov/getcourse-sdk). Node.js >= 18. Пакет ESM (`import`).

## Установка

```bash
npm install github:IgorAndrosov/getcourse-sdk
npx playwright install chromium
```

Импорт в коде — `gc-sdk` (имя пакета), не имя репозитория:

```js
import { GetCourseClient } from "gc-sdk";
```

Вторая команда — один раз: скачивает Chromium для Playwright. Без неё клиент не стартует.

Локально из клона:

```bash
git clone https://github.com/IgorAndrosov/getcourse-sdk.git
cd getcourse-sdk
npm install
npx playwright install chromium
```

## Клиент

```js
import { GetCourseClient, withClient } from "gc-sdk";

const gc = new GetCourseClient({
  login: "admin@example.com",
  password: "secret",
  baseUrl: "https://your-school.getcourse.ru",
  headless: true,
  timeoutMs: 30_000,
});

await gc.start();
const groups = await gc.getUserGroups();
await gc.close();
```

| Опция | Тип | По умолчанию | Описание |
|---|---|---|---|
| `login` | `string` | — | Логин админки школы |
| `password` | `string` | — | Пароль |
| `baseUrl` | `string` | — | URL школы **без** хвоста `/` |
| `headless` | `boolean` | `true` | Headless Chromium |
| `timeoutMs` | `number` | `30000` | Таймаут действий Playwright |

`start()` можно не вызывать: любой метод сам поднимет браузер.

Короткий вариант с авто-`close`:

```js
await withClient({ login, password, baseUrl }, async (gc) => {
  return gc.getUserGroups();
});
```

После `start()` доступен `gc.page` — текущая Playwright `Page`.

Нужен аккаунт с доступом к соответствующим страницам админки. Если GetCourse требует 2FA, автоматизация остановится на `LoginError`. 2FA требуется отключить для аккаунта.

## Авторизация

Любой метод страницы сам:

1. открывает браузер при необходимости;
2. если видит страницу входа — логинится через `/cms/system/login`;
3. повторяет переход на целевой URL.

### `login()`

```js
const result = await gc.login();
```

| Поле | Тип | Описание |
|---|---|---|
| `success` | `boolean` | Вход выполнен |
| `twoFactorRequired` | `boolean` | Редирект на `/pl/2fa` |
| `message` | `string` | Текст результата |
| `url` | `string` | Итоговый URL |

2FA во время автоматизации → `LoginError`.

## Методы

### `getUserGroups()` → `Promise<string[]>`

Названия групп с `/pl/user/group/index`. Дерево прокручивается, пока не исчезнут счётчики «Загрузка...».

```js
const groups = await gc.getUserGroups();
```

### `getUserId({ email } | { phone })` → `Promise<string>`

Поиск на `/pl/user/user/index` по **ровно одному** полю. Id из `href` первого ряда (`.../update/id/{id}`).

```js
const id = await gc.getUserId({ email: "user@example.com" });
const id2 = await gc.getUserId({ phone: "+79001234567" });
```

Нет результатов — `UserNotFoundError`. Оба поля или ни одного — обычный `Error`.

### `createUser({ email, type, firstName, lastName, sendInvitationEmail, groupName })`

Страница `/pl/user/user/create`. Обязателен только `email`.

- `type` — точный label селекта, обычно `ученик` или `сотрудник`. Не передан — не трогаем.
- `firstName` / `lastName` — пустые не заполняем.
- `sendInvitationEmail` — `true`/`false` ставит/снимает «Отправлять стартовое письмо». Не передан — чекбокс как есть.
- `groupName` — точное имя в Select2. Не передан — группу не выбираем.

```js
const created = await gc.createUser({
  email: "user@example.com",
  type: "ученик",
  firstName: "Иван",
  lastName: "Иванов",
  sendInvitationEmail: false,
  groupName: "Тест",
});
// { success: true, userId: "123", email: "user@example.com", message: "Пользователь создан" }
```

Email занят — `UserExistsError`. Группы нет в списке — `GroupNotFoundError`.

### `addUserToGroup({ userId, groupName })`

`/user/control/user/update/id/{userId}/part/groups`, «Все группы», чекбокс по **точному** названию (текст папок не учитывается).

Повторный клик в GetCourse **снимает** группу, поэтому:

- галочка уже стоит → Save не жмём, `alreadyInGroup: true`;
- нет → `check()` и сохранение.

```js
await gc.addUserToGroup({ userId: "123456", groupName: "Тест" });
```

Группы нет в дереве — `GroupNotFoundError`.

### `removeUserFromGroup({ userId, groupName })`

Та же страница, **без** «Все группы»: поиск среди выбранных (`ul.group-tree-select.only-selected`).

- галочка есть → `uncheck()` и Save, `removed: true`;
- нет в выбранных → Save не жмём, `removed: false`.

```js
await gc.removeUserFromGroup({ userId: "123456", groupName: "Тест" });
```

### `setUserCustomField({ userId, fieldName, value, clear })`

Карточка `/user/control/user/update/id/{id}`, «Дополнительные поля» → «Показать все поля», поле по точному `span.label-value`.

Пишет в input/textarea, native select, radio и checkbox. Checkbox пока одно значение: ставим эту галку, остальные не снимаем.

Очистка: `value: ""` или `clear: true` (у radio/checkbox снимает все выбранные).

```js
await gc.setUserCustomField({ userId: "123456", fieldName: "utm_source", value: "telegram" });
await gc.setUserCustomField({ userId: "123456", fieldName: "utm_source", clear: true });
```

Поля нет, либо в select/radio/checkbox нет такого значения — `CustomFieldNotFoundError`.

### `setDealCustomField({ dealId, fieldName, value, clear })`

`/sales/control/deal/update/id/{id}`, поле в `#dealAdditionalFields` по точному названию. Те же типы контролов, что у пользователя. Save — кнопка «Сохранить» в шапке.

```js
await gc.setDealCustomField({ dealId: "123", fieldName: "Комментарий", value: "текст" });
await gc.setDealCustomField({ dealId: "123", fieldName: "Квалифицированный лид", value: "Да" });
await gc.setDealCustomField({ dealId: "123", fieldName: "Источник", value: "Сайт" });
await gc.setDealCustomField({ dealId: "123", fieldName: "Комментарий", clear: true });
```

## Ошибки

Все наследуют `GetCourseError`.

| Класс | Когда |
|---|---|
| `LoginError` | Не удалось войти или сессия сорвалась на 2FA |
| `UserNotFoundError` | Пользователь не найден / id не разобрать |
| `UserExistsError` | Создание: пользователь с таким e-mail уже есть |
| `GroupNotFoundError` | Нет группы с таким названием |
| `CustomFieldNotFoundError` | Нет доп. поля или нет такого значения в select/radio/checkbox |

```js
import {
  GetCourseClient,
  LoginError,
  UserNotFoundError,
  UserExistsError,
  GroupNotFoundError,
  CustomFieldNotFoundError,
} from "gc-sdk";
```

## Разработка в этом репозитории

`playground/` — стенд для отладки SDK на живой школе. В npm-пакет не входит, в git едут скрипты и `config.example.js`. Файл с паролем (`playground/config.js`) в git не попадает.

1. Скопируйте `playground/config.example.js` → `playground/config.js`.
2. Заполните `login`, `password`, `baseUrl`.
3. Запустите скрипт.

В примере: `headless: false`, `keepOpen: true` — видимый браузер, не закрывается до Ctrl+C. На `GetCourseClient` у потребителя это не влияет (`headless` по умолчанию `true`).

| Команда | Что делает |
|---|---|
| `npm run login` | Только вход |
| `npm run groups` | Список групп |
| `npm run user -- --email=user@example.com` | Поиск id по email |
| `npm run user -- --phone=+79001234567` | Поиск id по телефону |
| `npm run create-user -- --email=user@example.com --type=ученик --firstName=Иван --lastName=Иванов --no-invite --group="Тест"` | Создать пользователя |
| `npm run add-to-group -- --userId=123456 --group="Тест"` | Добавить в группу |
| `npm run remove-from-group -- --userId=123456 --group="Тест"` | Удалить из группы |
| `npm run set-field -- --userId=123456 --field=utm_source --value=telegram` | Записать доп. поле |
| `npm run set-field -- --userId=123456 --field=utm_source --clear` | Очистить доп. поле |
| `npm run set-deal-field -- --dealId=123 --field="Комментарий" --value=текст` | Записать доп. поле заказа |
| `npm run set-deal-field -- --dealId=123 --field="Комментарий" --clear` | Очистить доп. поле заказа |

В `config.js` вместо флагов: `searchEmail` / `searchPhone` / `userId` / `groupName` / `fieldName` / `fieldValue` / `dealId` / `dealFieldName` / `dealFieldValue` / `createEmail` / `createType` / `createFirstName` / `createLastName` / `sendInvitationEmail` / `createGroupName`.
