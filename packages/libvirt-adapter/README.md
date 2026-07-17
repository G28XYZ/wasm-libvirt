## Быстрый старт

Требуется Node.js 20+ и системная библиотека libvirt. После публикации пакета
установите его в TypeScript-проект:

```sh
npm install wasm-libvirt
```

```ts
import { createLibvirtClient } from "wasm-libvirt";

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

Пакет сам устанавливает подходящий native host как optional dependency: сейчас
поддерживаются Linux (`x64`, `arm64`) и macOS Apple Silicon (`arm64`). Не
добавляйте эти пакеты в зависимости приложения вручную.

## Публикация

Все пакеты одной версии публикуются в таком порядке: сначала native host на
каждой поддерживаемой платформе, затем основной пакет. На macOS ARM64 и на
Linux (`x64`, `arm64`) выполните соответственно:

```sh
npm run release:publish:native
```

Когда все три native-пакета опубликованы, один раз выполните:

```sh
npm run release:publish
```

Для проверки вместо публикации используйте `release:dry-run:native` и
`release:dry-run`. Обе команды проверяют состав npm-тарболов; основной тарбол
не должен содержать `wasm-libvirt-host`.

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
