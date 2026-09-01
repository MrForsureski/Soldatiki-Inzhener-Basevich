# Order API

Отдельный сервер заказов для каталога «Солдатики Инженера Басевича».

- хранит данные заказов в PostgreSQL;
- шифрует ФИО, телефон и адрес с AES-256-GCM;
- выдаёт короткоживущий одноразовый токен для VK Mini App;
- принимает `app_payload` через Callback API;
- отправляет заказ покупателю от имени сообщества через `messages.send`;
- не хранит переписку и платёжные данные.

Все секреты задаются только в панели хостинга. Список переменных без значений находится в `.env.example`.
Токены и пароли нельзя добавлять в Git, клиентские `NEXT_PUBLIC_*` переменные или сообщения.

Черновик, который покупатель не подтвердил во ВКонтакте, удаляется через
`DRAFT_RETENTION_HOURS`. После подтверждения срок меняется на `PII_RETENTION_DAYS`.

## Команды

```bash
pnpm --filter @basevich/order-api build
pnpm --filter @basevich/order-api test
pnpm --filter @basevich/order-api migrate
pnpm --filter @basevich/order-api dev
```

Интеграционные тесты с Callback API запускаются только на одноразовой локальной базе:

```bash
TEST_DATABASE_URL=postgresql://localhost:5432/basevich_test \
  pnpm --filter @basevich/order-api test
```

Миграции автоматически запускаются перед production-стартом. Для Amvera в корне репозитория лежит `amvera.yaml`, который собирает `services/order-api/Dockerfile`.

После размещения сервера:

1. проверить `GET /healthz` и `GET /readyz`;
2. указать в VK Callback API адрес `https://<домен-api>/vk/callback`;
3. подтвердить сервер строкой из `VK_CALLBACK_CONFIRMATION_CODE`;
4. включить тип события `app_payload`;
5. только затем задать `NEXT_PUBLIC_ORDER_API_URL` при сборке каталога.

До включения рабочего API нужно опубликовать политику обработки персональных данных и
пройти модерацию VK Mini App. Без модерации разрешение сообщений доступно только тестерам
и администраторам приложения.
