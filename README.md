# wasm-libvirt

TypeScript-адаптер для управления libvirt. Публичный пакет:
[wasm-libvirt на npm](https://www.npmjs.com/package/wasm-libvirt).

```sh
npm install wasm-libvirt
```

```ts
import { createLibvirtClient } from "wasm-libvirt";

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
