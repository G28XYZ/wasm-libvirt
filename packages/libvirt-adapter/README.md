# `@wasm-libvirt/adapter`

Early vertical slice of the TypeScript adapter described in the project spec.

The current interface initializes the packaged WASM contract, opens a native
`virt` host connection, reports connection health, reads domain summaries and
XML, defines persistent domains, starts, reboots, gracefully shuts down, and
forcibly stops or undefines domains, then closes deterministically. Only Node.js
on Linux and the local development build on macOS are currently being exercised.

```ts
import { createLibvirtClient } from "@wasm-libvirt/adapter";

const client = await createLibvirtClient({ uri: "test:///default" });
console.log(await client.health());
console.log(await client.listDomains());
console.log(await client.getDomain({ name: "test" }));
console.log(await client.getDomainXml({ name: "test" }));
console.log(await client.defineDomain("<domain>...</domain>"));
console.log(await client.startDomain({ uuid: "domain-uuid" }));
console.log(await client.rebootDomain({ name: "test" }));
console.log(await client.shutdownDomain({ name: "test" }));
console.log(await client.destroyDomain({ name: "test" }));
await client.undefineDomain({ name: "test" });
await client.close();
```

Domain operations accept either `{ name }` or `{ uuid }`. Lifecycle operations
return a normalized current domain state; `getDomainXml` returns the XML string
from libvirt. A missing domain rejects with `LibvirtAdapterError` code
`NOT_FOUND`; starting an active domain, or rebooting/stopping an inactive domain,
rejects with code `CONFLICT`. Invalid domain XML rejects with
`INVALID_DEFINITION`; an embedded NUL byte is rejected before FFI with
`INVALID_ARGUMENT`.

`undefineDomain` returns `Promise<void>` and removes only the persistent libvirt
definition. It does not claim to delete domain storage.
