## Быстрый старт

Требуется Node.js 20+ и системная библиотека libvirt.

```sh
npm install ts-wasm-libvirt
```

```ts
import { createLibvirtClient } from "ts-wasm-libvirt";

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

Для URI с аутентификацией передайте callback `Connect::open_auth`. Credentials
передаются по отдельному process pipe и не попадают в аргументы native host:

```ts
import { LibvirtCredentialType } from "ts-wasm-libvirt";

const client = await createLibvirtClient({
  uri: "qemu+ssh://host/system",
  auth: {
    credentialTypes: [
      LibvirtCredentialType.AuthName,
      LibvirtCredentialType.Passphrase,
    ],
    async callback(credentials) {
      const password = await getPassword();
      return credentials.map((credential) => {
        if (credential.type === LibvirtCredentialType.AuthName) return "libvirt-user";
        if (credential.type === LibvirtCredentialType.Passphrase) return password;
        return undefined;
      });
    },
  },
});
```

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

## Расширенный интерфейс virt

- [Чек-лист покрытия virt 0.4.3](../../docs/virt-coverage.md)

Помимо совместимого базового интерфейса клиент напрямую покрывает ресурсы crate
`virt 0.4.3`:

| Ресурс | Методы |
| --- | --- |
| Connection/node | `getCapabilities`, `getConnectionHostname`, `getLibvirtVersion`, `getHypervisorVersion`, `getSystemInfo`, `isConnectionSecure`, `isConnectionEncrypted`, `getFreeMemory`, `getMaxVcpus`, `getNodeInfo` |
| Domain | `getDomainInfo`, `suspendDomain`, `resumeDomain`, `resetDomain`, `getDomainAutostart`, `setDomainAutostart`, `isDomainActive`, `isDomainPersistent`, `getDomainOsType`, `getDomainHostname`, методы memory/vCPU |
| Network | list/get/XML, define/create/start/destroy/undefine, autostart |
| Host interface | list/get/XML, define/start/destroy/undefine |
| Storage pool | list/get/XML, define/create/start/build/refresh/destroy/delete/undefine, autostart, volumes |
| Storage volume | get/XML/create/delete/wipe/resize |
| Node device | list/get/XML/create/destroy/detach/reset/reattach |
| NWFilter | list/get/XML/define/undefine |
| Secret | list/get/XML/define/value/set-value/undefine |
| Domain snapshot | list/get/XML/create/current/revert/delete/children |

## Бинарные потоки

Node.js-адаптер открывает `virt::Stream` через отдельный multiplexed binary IPC
с native host. В публичном интерфейсе поток представлен стандартным Node.js
`Duplex`, поэтому поддерживает `pipe()`, async iterator, `write()`/`end()` и
backpressure без дополнительной WebSocket-зависимости.

```ts
const screenshot = await client.screenshotDomain({ name: "my-vm" });
console.log(screenshot.mimeType);
for await (const chunk of screenshot) {
  // chunk — Buffer с исходными бинарными данными изображения.
}

const consoleStream = await client.openDomainConsole({ name: "my-vm" });
process.stdin.pipe(consoleStream).pipe(process.stdout);

const upload = await client.uploadStorageVolume(
  { path: "/var/lib/libvirt/images/disk.qcow2" },
  { offset: 0, length: 1024n },
);
upload.end(Buffer.alloc(1024));
await upload.finish();
```

Доступны `screenshotDomain`, `openDomainConsole`, `openDomainChannel`,
`openDomainGraphics`, `downloadStorageVolume` и `uploadStorageVolume`. Graphics
file descriptor остаётся внутри native host и наружу не экспортируется.
`finish()` подтверждает
успешное завершение `virt::Stream`, `abort()` немедленно прерывает его. Таймаут
и `AbortSignal` относятся к фазе открытия; после открытия жизненным циклом
управляет сам поток.

Селекторы повторяют идентификаторы соответствующих объектов `virt`: например,
сеть выбирается по `{ name }` или `{ uuid }`, pool — по `{ name }`, `{ uuid }`
или `{ path }`, volume — по `{ key }` или `{ path }`. Методы с libvirt flags
принимают `{ flags, timeoutMs, signal }`.

Значения Rust `u64`, которые могут превышать точный диапазон JavaScript
`number`, возвращаются десятичными строками типа `UInt64String`. Входные
64-битные значения принимают `number | bigint`.

Методы `virt`, завязанные на указатели и ручной reference counting, не
экспортируются: `Drop`/`free` выполняются native host автоматически.
`DomainStatsRecord` в `virt 0.4.3` содержит незавершённый raw pointer, а stream
callbacks сохраняют адрес Rust `Stream`, хотя `finish`/`abort` потребляют и
перемещают объект. Эти интерфейсы не используются до появления безопасного
wrapper в `virt`. Resource event callbacks в высокоуровневом `virt 0.4.3`
отсутствуют.

Все операции, кроме `close()`, принимают необязательный второй аргумент:
`{ timeoutMs, signal }`. Типичные коды `LibvirtAdapterError`: `NOT_FOUND`,
`CONFLICT`, `INVALID_ARGUMENT`, `INVALID_DEFINITION`, `TIMEOUT`, `CANCELLED`.
