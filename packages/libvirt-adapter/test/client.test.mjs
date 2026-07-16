import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createLibvirtClient, LibvirtAdapterError } from "../dist/index.js";

test("an installed client reports a live libvirt test connection", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    assert.deepEqual(await client.health(), {
      state: "ready",
      alive: true,
      hypervisor: "TEST",
      uri: "test:///default",
    });
  } finally {
    await client.close();
  }
});

test("a client lists normalized domains through the public interface", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    assert.deepEqual(await client.listDomains(), [
      {
        id: 1,
        name: "test",
        state: "running",
        uuid: "6695eb01-f6a4-8304-79aa-97f2502e193f",
      },
    ]);
  } finally {
    await client.close();
  }
});

test("a client gets a domain by UUID", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    assert.deepEqual(
      await client.getDomain({ uuid: "6695eb01-f6a4-8304-79aa-97f2502e193f" }),
      {
        id: 1,
        name: "test",
        state: "running",
        uuid: "6695eb01-f6a4-8304-79aa-97f2502e193f",
      },
    );
  } finally {
    await client.close();
  }
});

test("a client gets a domain by name", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    assert.deepEqual(await client.getDomain({ name: "test" }), {
      id: 1,
      name: "test",
      state: "running",
      uuid: "6695eb01-f6a4-8304-79aa-97f2502e193f",
    });
  } finally {
    await client.close();
  }
});

test("a missing domain produces a stable not-found error", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    await assert.rejects(
      client.getDomain({ name: "missing-domain" }),
      (error) => error instanceof LibvirtAdapterError && error.code === "NOT_FOUND",
    );
  } finally {
    await client.close();
  }
});

test("starting an already running domain produces a stable conflict error", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    await assert.rejects(
      client.startDomain({ name: "test" }),
      (error) => error instanceof LibvirtAdapterError && error.code === "CONFLICT",
    );
  } finally {
    await client.close();
  }
});

test("a client starts an inactive domain and returns its current state", async () => {
  const fixturePath = fileURLToPath(
    new URL("./fixtures/inactive-domain.xml", import.meta.url),
  );
  const client = await createLibvirtClient({ uri: `test://${fixturePath}` });

  try {
    assert.deepEqual(await client.startDomain({ name: "stopped-test" }), {
      id: 1,
      name: "stopped-test",
      state: "running",
      uuid: "11111111-2222-3333-4444-555555555555",
    });
  } finally {
    await client.close();
  }
});

test("a client gracefully shuts down an active domain and returns its current state", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    assert.deepEqual(await client.shutdownDomain({ name: "test" }), {
      id: null,
      name: "test",
      state: "shutoff",
      uuid: "6695eb01-f6a4-8304-79aa-97f2502e193f",
    });
  } finally {
    await client.close();
  }
});

test("a client gracefully shuts down an active domain selected by UUID", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    assert.deepEqual(
      await client.shutdownDomain({ uuid: "6695eb01-f6a4-8304-79aa-97f2502e193f" }),
      {
        id: null,
        name: "test",
        state: "shutoff",
        uuid: "6695eb01-f6a4-8304-79aa-97f2502e193f",
      },
    );
  } finally {
    await client.close();
  }
});

test("shutting down an inactive domain produces a stable conflict error", async () => {
  const fixturePath = fileURLToPath(
    new URL("./fixtures/inactive-domain.xml", import.meta.url),
  );
  const client = await createLibvirtClient({ uri: `test://${fixturePath}` });

  try {
    await assert.rejects(
      client.shutdownDomain({ name: "stopped-test" }),
      (error) => error instanceof LibvirtAdapterError && error.code === "CONFLICT",
    );
  } finally {
    await client.close();
  }
});

test("a client forcibly stops an active domain and returns its current state", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    assert.deepEqual(await client.destroyDomain({ name: "test" }), {
      id: null,
      name: "test",
      state: "shutoff",
      uuid: "6695eb01-f6a4-8304-79aa-97f2502e193f",
    });
  } finally {
    await client.close();
  }
});

test("a client forcibly stops an active domain selected by UUID", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    assert.deepEqual(
      await client.destroyDomain({ uuid: "6695eb01-f6a4-8304-79aa-97f2502e193f" }),
      {
        id: null,
        name: "test",
        state: "shutoff",
        uuid: "6695eb01-f6a4-8304-79aa-97f2502e193f",
      },
    );
  } finally {
    await client.close();
  }
});

test("forcibly stopping an inactive domain produces a stable conflict error", async () => {
  const fixturePath = fileURLToPath(
    new URL("./fixtures/inactive-domain.xml", import.meta.url),
  );
  const client = await createLibvirtClient({ uri: `test://${fixturePath}` });

  try {
    await assert.rejects(
      client.destroyDomain({ name: "stopped-test" }),
      (error) => error instanceof LibvirtAdapterError && error.code === "CONFLICT",
    );
  } finally {
    await client.close();
  }
});

test("a client reboots an active domain and returns its current state", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    assert.deepEqual(await client.rebootDomain({ name: "test" }), {
      id: 1,
      name: "test",
      state: "running",
      uuid: "6695eb01-f6a4-8304-79aa-97f2502e193f",
    });
  } finally {
    await client.close();
  }
});

test("a client reboots an active domain selected by UUID", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    assert.deepEqual(
      await client.rebootDomain({ uuid: "6695eb01-f6a4-8304-79aa-97f2502e193f" }),
      {
        id: 1,
        name: "test",
        state: "running",
        uuid: "6695eb01-f6a4-8304-79aa-97f2502e193f",
      },
    );
  } finally {
    await client.close();
  }
});

test("rebooting an inactive domain produces a stable conflict error", async () => {
  const fixturePath = fileURLToPath(
    new URL("./fixtures/inactive-domain.xml", import.meta.url),
  );
  const client = await createLibvirtClient({ uri: `test://${fixturePath}` });

  try {
    await assert.rejects(
      client.rebootDomain({ name: "stopped-test" }),
      (error) => error instanceof LibvirtAdapterError && error.code === "CONFLICT",
    );
  } finally {
    await client.close();
  }
});

test("a client gets domain XML by name", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    assert.match(
      await client.getDomainXml({ name: "test" }),
      /<uuid>6695eb01-f6a4-8304-79aa-97f2502e193f<\/uuid>/,
    );
  } finally {
    await client.close();
  }
});

test("a client gets domain XML by UUID", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    assert.match(
      await client.getDomainXml({ uuid: "6695eb01-f6a4-8304-79aa-97f2502e193f" }),
      /<name>test<\/name>/,
    );
  } finally {
    await client.close();
  }
});

test("getting XML for a missing domain produces a stable not-found error", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    await assert.rejects(
      client.getDomainXml({ name: "missing-domain" }),
      (error) => error instanceof LibvirtAdapterError && error.code === "NOT_FOUND",
    );
  } finally {
    await client.close();
  }
});

test("a client defines a persistent domain from XML", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });
  const xml = `
<domain type="test">
  <name>defined-test</name>
  <uuid>22222222-3333-4444-5555-666666666666</uuid>
  <memory unit="KiB">65536</memory>
  <vcpu>1</vcpu>
  <os><type>hvm</type></os>
</domain>`;

  try {
    assert.deepEqual(await client.defineDomain(xml), {
      id: null,
      name: "defined-test",
      state: "shutoff",
      uuid: "22222222-3333-4444-5555-666666666666",
    });
  } finally {
    await client.close();
  }
});

test("invalid domain XML produces a stable invalid-definition error", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    await assert.rejects(
      client.defineDomain("<domain>"),
      (error) =>
        error instanceof LibvirtAdapterError && error.code === "INVALID_DEFINITION",
    );
  } finally {
    await client.close();
  }
});

test("domain XML containing a NUL byte produces a stable invalid-argument error", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    await assert.rejects(
      client.defineDomain("<domain>\0</domain>"),
      (error) => error instanceof LibvirtAdapterError && error.code === "INVALID_ARGUMENT",
    );
  } finally {
    await client.close();
  }
});

test("a client undefines an inactive persistent domain", async () => {
  const fixturePath = fileURLToPath(
    new URL("./fixtures/inactive-domain.xml", import.meta.url),
  );
  const client = await createLibvirtClient({ uri: `test://${fixturePath}` });

  try {
    await client.undefineDomain({ name: "stopped-test" });
    await assert.rejects(
      client.getDomain({ name: "stopped-test" }),
      (error) => error instanceof LibvirtAdapterError && error.code === "NOT_FOUND",
    );
  } finally {
    await client.close();
  }
});

test("a client undefines an inactive persistent domain selected by UUID", async () => {
  const fixturePath = fileURLToPath(
    new URL("./fixtures/inactive-domain.xml", import.meta.url),
  );
  const client = await createLibvirtClient({ uri: `test://${fixturePath}` });

  try {
    const uuid = "11111111-2222-3333-4444-555555555555";
    await client.undefineDomain({ uuid });
    await assert.rejects(
      client.getDomain({ uuid }),
      (error) => error instanceof LibvirtAdapterError && error.code === "NOT_FOUND",
    );
  } finally {
    await client.close();
  }
});

test("undefining a missing domain produces a stable not-found error", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    await assert.rejects(
      client.undefineDomain({ name: "missing-domain" }),
      (error) => error instanceof LibvirtAdapterError && error.code === "NOT_FOUND",
    );
  } finally {
    await client.close();
  }
});
