import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createLibvirtClient,
  LibvirtAdapterError,
  LibvirtCredentialType,
} from "../dist/index.js";

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

test("a client opens through virt authenticated connection support", async () => {
  let callbackCalls = 0;
  const client = await createLibvirtClient({
    uri: "test:///default",
    auth: {
      credentialTypes: [
        LibvirtCredentialType.AuthName,
        LibvirtCredentialType.Passphrase,
      ],
      callback(credentials) {
        callbackCalls += 1;
        return credentials.map((credential) => credential.defaultResult);
      },
    },
  });

  try {
    assert.equal((await client.health()).alive, true);
    assert.equal(callbackCalls, 0, "the test driver does not request credentials");
  } finally {
    await client.close();
  }
});

test("authenticated connection options are validated before host startup", async () => {
  await assert.rejects(
    createLibvirtClient({
      uri: "test:///default",
      auth: {
        credentialTypes: [LibvirtCredentialType.AuthName, LibvirtCredentialType.AuthName],
        callback: () => [],
      },
    }),
    (error) => error instanceof LibvirtAdapterError && error.code === "INVALID_ARGUMENT",
  );
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

test("a domain selector cannot inject native-host protocol lines", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    await assert.rejects(
      client.getDomain({ name: "test\n2\thealth" }),
      (error) => error instanceof LibvirtAdapterError && error.code === "INVALID_ARGUMENT",
    );
  } finally {
    await client.close();
  }
});

test("a domain selector requires exactly one identifier", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    await assert.rejects(
      client.getDomain({
        name: "test",
        uuid: "6695eb01-f6a4-8304-79aa-97f2502e193f",
      }),
      (error) => error instanceof LibvirtAdapterError && error.code === "INVALID_ARGUMENT",
    );
  } finally {
    await client.close();
  }
});

test("an operation with an already aborted signal is cancelled", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });
  const controller = new AbortController();
  controller.abort();

  try {
    await assert.rejects(
      client.health({ signal: controller.signal }),
      (error) => error instanceof LibvirtAdapterError && error.code === "CANCELLED",
    );
  } finally {
    await client.close();
  }
});

test("an in-flight operation stops waiting when its signal is aborted", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });
  const controller = new AbortController();

  try {
    const operation = client.health({ signal: controller.signal });
    controller.abort();
    await assert.rejects(
      operation,
      (error) => error instanceof LibvirtAdapterError && error.code === "CANCELLED",
    );
  } finally {
    await client.close();
  }
});

test("an operation stops waiting after its timeout", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });
  const backlog = Array.from({ length: 5_000 }, () => client.health());

  try {
    await assert.rejects(
      client.health({ timeoutMs: 1 }),
      (error) => error instanceof LibvirtAdapterError && error.code === "TIMEOUT",
    );
    await Promise.all(backlog);
  } finally {
    await client.close();
  }
});

test("a client applies its default operation timeout", async () => {
  const client = await createLibvirtClient({
    uri: "test:///default",
    defaultTimeoutMs: 1,
  });
  const backlog = Array.from(
    { length: 5_000 },
    () => client.health({ timeoutMs: 10_000 }),
  );

  try {
    await assert.rejects(
      client.health(),
      (error) => error instanceof LibvirtAdapterError && error.code === "TIMEOUT",
    );
    await Promise.all(backlog);
  } finally {
    await client.close();
  }
});

test("domain operations accept cancellation options", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });
  const controller = new AbortController();
  controller.abort();

  try {
    await assert.rejects(
      client.getDomain({ name: "test" }, { signal: controller.signal }),
      (error) => error instanceof LibvirtAdapterError && error.code === "CANCELLED",
    );
  } finally {
    await client.close();
  }
});

test("a client exposes virt connection and node information", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    assert.match(await client.getCapabilities(), /<capabilities>/);
    assert.equal(typeof await client.getConnectionHostname(), "string");
    assert.equal(typeof await client.getLibvirtVersion(), "number");
    assert.equal(typeof await client.getHypervisorVersion(), "number");
    assert.deepEqual(await client.getNodeInfo(), {
      model: "i686",
      memory: "3145728",
      cpus: 16,
      mhz: 1_400,
      nodes: 2,
      sockets: 2,
      cores: 2,
      threads: 2,
    });
  } finally {
    await client.close();
  }
});

test("a client exposes extended virt domain operations", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    const info = await client.getDomainInfo({ name: "test" });
    assert.deepEqual(
      { ...info, cpuTimeNs: undefined },
      {
        state: "running",
        maxMemoryKiB: "8388608",
        memoryKiB: "2097152",
        virtualCpus: 2,
        cpuTimeNs: undefined,
      },
    );
    assert.match(info.cpuTimeNs, /^\d+$/);
    assert.equal(await client.isDomainActive({ name: "test" }), true);
    assert.equal(await client.isDomainPersistent({ name: "test" }), true);
    assert.equal(await client.getDomainOsType({ name: "test" }), "linux");

    assert.equal((await client.suspendDomain({ name: "test" })).state, "paused");
    assert.equal((await client.resumeDomain({ name: "test" })).state, "running");
  } finally {
    await client.close();
  }
});

test("a client lists virt networks, interfaces, storage, and node devices", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    assert.deepEqual(await client.listNetworks(), [
      {
        name: "default",
        uuid: "dd8fe884-6c02-601e-7551-cca97df1c5df",
        active: true,
        persistent: true,
        autostart: false,
      },
    ]);
    assert.deepEqual(await client.listInterfaces(), [
      { name: "eth1", mac: "aa:bb:cc:dd:ee:ff", active: true },
    ]);
    assert.deepEqual(await client.listStoragePools(), [
      {
        name: "default-pool",
        uuid: "dfe224cb-28fb-8dd0-c4b2-64eb3f0f4566",
        active: true,
        persistent: true,
        autostart: false,
        state: 2,
        capacity: "107374182400",
        allocation: "0",
        available: "107374182400",
      },
    ]);
    assert.deepEqual(await client.listStorageVolumes({ name: "default-pool" }), []);
    assert.ok((await client.listNodeDevices()).some((device) => device.name === "computer"));
  } finally {
    await client.close();
  }
});

test("extended selectors reject protocol injection", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    await assert.rejects(
      client.getNetwork({ name: "default\n2\thealth" }),
      (error) => error instanceof LibvirtAdapterError && error.code === "INVALID_ARGUMENT",
    );
    await assert.rejects(
      client.getStoragePool({ name: "default-pool", uuid: "bad" }),
      (error) => error instanceof LibvirtAdapterError && error.code === "INVALID_ARGUMENT",
    );
  } finally {
    await client.close();
  }
});

test("a client manages domain snapshots through virt", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    assert.deepEqual(await client.listDomainSnapshots({ name: "test" }), []);
    assert.deepEqual(
      await client.createDomainSnapshot(
        { name: "test" },
        "<domainsnapshot><name>adapter-test</name></domainsnapshot>",
      ),
      {
        name: "adapter-test",
        current: true,
        hasMetadata: true,
        children: 0,
      },
    );
    assert.equal(
      (await client.getCurrentDomainSnapshot({ name: "test" })).name,
      "adapter-test",
    );
    assert.match(
      await client.getDomainSnapshotXml({ name: "test" }, "adapter-test"),
      /<name>adapter-test<\/name>/,
    );
    await client.createDomainSnapshot(
      { name: "test" },
      "<domainsnapshot><name>adapter-child</name></domainsnapshot>",
    );
    assert.equal(
      (await client.getDomainSnapshotParent({ name: "test" }, "adapter-child")).name,
      "adapter-test",
    );
    await client.deleteDomainSnapshot({ name: "test" }, "adapter-child");
    await client.deleteDomainSnapshot({ name: "test" }, "adapter-test");
    assert.deepEqual(await client.listDomainSnapshots({ name: "test" }), []);
  } finally {
    await client.close();
  }
});

test("a read-only client permits reads and rejects mutations", async () => {
  const client = await createLibvirtClient({ uri: "test:///default", readOnly: true });

  try {
    assert.equal((await client.getDomain({ name: "test" })).state, "running");
    await assert.rejects(
      client.defineDomain("<domain type='test'><name>forbidden</name></domain>"),
      (error) => error instanceof LibvirtAdapterError && error.code === "HOST_ERROR",
    );
  } finally {
    await client.close();
  }
});

test("a client exposes CPU, NUMA, and network connection operations", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    assert.ok((await client.getCpuModels("i686")).includes("qemu32"));
    assert.deepEqual(await client.getCellsFreeMemory(0, 2), ["2097152", "4194304"]);
    assert.deepEqual(await client.getFreePages([4], 0, 2), ["7", "19"]);
    assert.equal(await client.getNetworkBridgeName({ name: "default" }), "virbr0");
    assert.equal(await client.countNodeDevices("scsi_host"), 3);
  } finally {
    await client.close();
  }
});

test("a client exposes domain statistics and typed parameters", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    assert.deepEqual(await client.getDomainBlockInfo({ name: "test" }, "vda"), {
      capacity: "1099506450432",
      allocation: "1099511627776",
      physical: "1099511627776",
    });
    assert.match((await client.getDomainBlockStats({ name: "test" }, "vda")).readBytes, /^\d+$/);
    assert.match((await client.getDomainInterfaceStats({ name: "test" }, "testnet0")).rxBytes, /^\d+$/);
    assert.ok((await client.getDomainMemoryStats({ name: "test" })).length > 0);
    assert.deepEqual(await client.getDomainInterfaceAddresses({ name: "test" }, 0), [
      {
        name: "testnet0",
        hardwareAddress: "aa:bb:cc:dd:ee:ff",
        addresses: [{ type: "0", address: "192.168.122.3", prefix: "24" }],
      },
    ]);
    assert.deepEqual(await client.getDomainNumaParameters({ name: "test" }), {
      nodeSet: "",
      mode: 0,
    });
    assert.equal(
      (await client.getDomainSchedulerParameters({ name: "test" })).schedulerType,
      "fair",
    );
    await assert.rejects(
      client.getDomainJobInfo({ name: "test" }),
      (error) => error instanceof LibvirtAdapterError && error.code === "HOST_ERROR",
    );
    await client.pinDomainVcpu({ name: "test" }, 0, new Uint8Array([1]));
    await client.sendDomainKey({ name: "test" }, 0, 10, [30]);
  } finally {
    await client.close();
  }
});

test("a client creates transient domains and supports definition flags", async () => {
  const transient = await createLibvirtClient({ uri: "test:///default" });
  try {
    const domain = await transient.createTransientDomain(`
      <domain type="test">
        <name>transient-test</name>
        <memory unit="KiB">65536</memory>
        <vcpu>1</vcpu>
        <os><type>hvm</type></os>
      </domain>`);
    assert.equal(domain.name, "transient-test");
    assert.equal(domain.state, "running");
  } finally {
    await transient.close();
  }

  const flagged = await createLibvirtClient({ uri: "test:///default" });
  try {
    assert.equal(
      (await flagged.defineDomain(`
        <domain type="test">
          <name>validated-definition</name>
          <memory unit="KiB">65536</memory>
          <vcpu>1</vcpu>
          <os><type>hvm</type></os>
        </domain>`, { flags: 1 })).name,
      "validated-definition",
    );
  } finally {
    await flagged.close();
  }
});

test("a client clones and resolves storage volumes", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });
  const volumeXml = (name) => `
    <volume>
      <name>${name}</name>
      <capacity unit="bytes">1024</capacity>
      <target><path>/default-pool/${name}</path></target>
    </volume>`;

  try {
    const source = await client.createStorageVolume(
      { name: "default-pool" },
      volumeXml("adapter-source"),
    );
    const clone = await client.cloneStorageVolume(
      { name: "default-pool" },
      volumeXml("adapter-clone"),
      { key: source.key },
    );
    assert.equal(
      (await client.getStorageVolumeByName({ name: "default-pool" }, "adapter-clone")).key,
      clone.key,
    );
    assert.equal((await client.getStoragePoolByVolume({ key: source.key })).name, "default-pool");
    await client.deleteStorageVolume({ key: clone.key });
    await client.deleteStorageVolume({ key: source.key });
  } finally {
    await client.close();
  }
});

test("binary stream methods use virt and report unsupported test-driver operations", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });
  const volumeXml = `
    <volume>
      <name>adapter-stream</name>
      <capacity unit="bytes">1024</capacity>
      <target><path>/default-pool/adapter-stream</path></target>
    </volume>`;

  try {
    const screenshot = await client.screenshotDomain({ name: "test" });
    assert.equal(screenshot.mimeType, "image/png");
    const chunks = [];
    for await (const chunk of screenshot) chunks.push(chunk);
    await screenshot.finish();
    assert.ok(Buffer.concat(chunks).byteLength > 0);

    const volume = await client.createStorageVolume({ name: "default-pool" }, volumeXml);
    await assert.rejects(
      client.uploadStorageVolume({ key: volume.key }, { length: 4 }),
      (error) => error instanceof LibvirtAdapterError && error.code === "HOST_ERROR",
    );
    await client.deleteStorageVolume({ key: volume.key });
  } finally {
    await client.close();
  }
});

test("binary stream options reject protocol injection before opening native streams", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    await assert.rejects(
      client.openDomainConsole({ name: "test" }, { device: "serial0\n2\thealth" }),
      (error) => error instanceof LibvirtAdapterError && error.code === "INVALID_ARGUMENT",
    );
    await assert.rejects(
      client.downloadStorageVolume({ path: "/missing" }, { offset: -1 }),
      (error) => error instanceof LibvirtAdapterError && error.code === "INVALID_ARGUMENT",
    );
    await assert.rejects(
      client.openDomainGraphics({ name: "test" }, { index: -1 }),
      (error) => error instanceof LibvirtAdapterError && error.code === "INVALID_ARGUMENT",
    );
  } finally {
    await client.close();
  }
});

test("second-connection migration validates its destination URI", async () => {
  const client = await createLibvirtClient({ uri: "test:///default" });

  try {
    await assert.rejects(
      client.migrateDomainToConnection({ name: "test" }, "test:///default"),
      (error) => error instanceof LibvirtAdapterError && error.code === "HOST_ERROR",
    );
    await assert.rejects(
      client.migrateDomainToConnection({ name: "test" }, "test:///target\n2\thealth"),
      (error) => error instanceof LibvirtAdapterError && error.code === "INVALID_ARGUMENT",
    );
  } finally {
    await client.close();
  }
});
