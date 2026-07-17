# ts-wasm-libvirt

TypeScript-адаптер для управления libvirt. Публичный пакет:
[ts-wasm-libvirt на npm](https://www.npmjs.com/package/ts-wasm-libvirt).

```sh
npm install ts-wasm-libvirt
```

```ts
import { createLibvirtClient } from "ts-wasm-libvirt";

const client = await createLibvirtClient({ uri: "qemu:///system" });
try {
  console.log(await client.listDomains());
} finally {
  await client.close();
}
```

Полная документация API и публикации: [packages/libvirt-adapter/README.md](packages/libvirt-adapter/README.md).

Для разработки:

```sh
npm run check
```

Перед публикацией обновите все publishable-пакеты одной командой:

```sh
npm run version:bump -- patch
# или: npm run version:bump -- 0.2.0
```
