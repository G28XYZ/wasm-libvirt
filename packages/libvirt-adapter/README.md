## Быстрый старт

Требуется Node.js 20+ и системная библиотека libvirt. После публикации пакета
установите его в TypeScript-проект:

```sh
npm install @wasm-libvirt/adapter
```

```ts
import { createLibvirtClient } from "@wasm-libvirt/adapter";

const client = await createLibvirtClient({
  uri: "qemu:///system",
  defaultTimeoutMs: 5_000,
});

try {
  const domains = await client.listDomains();
  console.log(domains);

  const domain = await client.getDomain({ name: "my-vm" });
  await client.startDomain({ uuid: domain.uuid });
} finally {
  await client.close();
}
```

Для локальной проверки без гипервизора используйте URI `test:///default`.

| Метод | Назначение |
| --- | --- |
| `health()` | Проверить соединение с libvirt. |
| `listDomains()` | Получить список доменов. |
| `getDomain(selector)` | Найти домен по `{ name }` или `{ uuid }`. |
| `getDomainXml(selector)` | Получить XML домена. |
| `defineDomain(xml)` | Создать или обновить persistent-домен из XML. |
| `startDomain(selector)` | Запустить выключенный домен. |
| `rebootDomain(selector)` | Перезагрузить работающий домен. |
| `shutdownDomain(selector)` | Запросить мягкое выключение. |
| `destroyDomain(selector)` | Принудительно остановить домен. |
| `undefineDomain(selector)` | Удалить persistent-определение без удаления storage. |
| `close()` | Закрыть клиент; вызывайте в `finally`. |

Все операции, кроме `close()`, принимают необязательный второй аргумент:
`{ timeoutMs, signal }`. Типичные коды `LibvirtAdapterError`: `NOT_FOUND`,
`CONFLICT`, `INVALID_ARGUMENT`, `INVALID_DEFINITION`, `TIMEOUT`, `CANCELLED`.

## Публикация пакета

В корне workspace задайте версию, войдите в npm и выполните dry-run:

```sh
npm --prefix packages/libvirt-adapter version 0.1.0
npm login
npm run release:dry-run
```

Если проверка успешна, публикация выполняется командой:

```sh
npm run release:publish
```

`release:check` запускает сборку и integration-тесты, затем проверяет состав
будущего tarball. Скрипты не позволяют публиковать служебную версию `0.0.0`.
