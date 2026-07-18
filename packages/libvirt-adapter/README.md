# ts-wasm-libvirt

TypeScript-клиент для libvirt: домены, сети, хранилища, устройства, secrets, snapshots и бинарные потоки. Нативный host-пакет для поддерживаемой ОС и архитектуры устанавливается автоматически как optional dependency.

## Установка и зависимости

Нужны Node.js 20+ и установленная системная библиотека libvirt. Для соединения с локальным QEMU также должен работать демон libvirt, а у пользователя должен быть доступ к его сокету.

Debian/Ubuntu:

```sh
sudo apt install libvirt0 libvirt-daemon-system
npm install ts-wasm-libvirt
```

Для проверки без гипервизора используйте URI `test:///default`. На Linux доступны готовые host-пакеты для `x64` и `arm64`; на macOS — для `arm64`.

Все методы ниже принадлежат `LibvirtClient`, который создаётся функцией `createLibvirtClient`. Во всех примерах предполагается следующий контекст; закрывайте клиент в `finally`.

```ts
import { createLibvirtClient } from "ts-wasm-libvirt";

const client = await createLibvirtClient({ uri: "qemu:///system" });
const domain = { name: "my-vm" };
const network = { name: "default" };
const hostInterface = { name: "eth0" };
const pool = { name: "default-pool" };
const volume = { path: "/var/lib/libvirt/images/my-vm.qcow2" };
const networkFilter = { name: "my-filter" };
const secret = { uuid: "11111111-2222-3333-4444-555555555555" };
const domainXml = "<domain type='kvm'><name>my-vm</name></domain>";
const networkXml = "<network><name>my-network</name></network>";
const interfaceXml = "<interface type='ethernet'><name>eth0</name></interface>";
const poolXml = "<pool type='dir'><name>my-pool</name></pool>";
const volumeXml = "<volume><name>disk.qcow2</name></volume>";
const nodeDeviceXml = "<device><name>my-device</name></device>";
const networkFilterXml = "<filter name='my-filter' chain='root'/>";
const secretXml = "<secret ephemeral='no' private='no'/>";
const snapshotXml = "<domainsnapshot><name>before-update</name></domainsnapshot>";

try {
  // Use one or more methods from this catalogue.
} finally {
  await client.close();
}
```

<details>
<summary><code>createLibvirtClient(options)</code> — создаёт клиент и запускает нативный host process.</summary>

```ts
const client = await createLibvirtClient({
  uri: "qemu:///system",
  defaultTimeoutMs: 5_000,
});
```
</details>

<details>
<summary>Аутентификация и <code>LibvirtCredentialType</code></summary>

```ts
import { LibvirtCredentialType, createLibvirtClient } from "ts-wasm-libvirt";

const client = await createLibvirtClient({
  uri: "qemu+ssh://host/system",
  auth: {
    credentialTypes: [LibvirtCredentialType.AuthName, LibvirtCredentialType.Passphrase],
    callback(credentials) {
      return credentials.map((credential) => credential.defaultResult);
    },
  },
});
```
</details>

## Возможности API

Селекторы выбирают ресурс по одному идентификатору: домен — `{ name }` или `{ uuid }`, сеть — `{ name }` или `{ uuid }`, pool — `{ name }`, `{ uuid }` или `{ path }`, volume — `{ key }` или `{ path }`. Опциональный последний аргумент `options` принимает `timeoutMs` и `signal`; методы с флагами также принимают `flags`.

## Подключение и базовые операции

<details>
<summary><code>health(options?: OperationOptions): Promise<LibvirtHealth></code> — Проверяет состояние соединения.</summary>

```ts
const result = await client.health();
console.log(result);
```
</details>

<details>
<summary><code>listDomains(options?: OperationOptions): Promise<DomainSummary[]></code> — Получает активные и неактивные домены.</summary>

```ts
const result = await client.listDomains();
console.log(result);
```
</details>

<details>
<summary><code>getDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary></code> — Находит один домен.</summary>

```ts
const result = await client.getDomain(domain);
console.log(result);
```
</details>

<details>
<summary><code>getDomainXml(selector: DomainSelector, options?: OperationOptions): Promise<string></code> — Возвращает XML-описание домена от libvirt.</summary>

```ts
const result = await client.getDomainXml(domain);
console.log(result);
```
</details>

<details>
<summary><code>defineDomain(xml: string, options?: FlagOperationOptions): Promise<DomainSummary></code> — Создаёт или обновляет persistent-домен из XML.</summary>

```ts
const result = await client.defineDomain(domainXml);
console.log(result);
```
</details>

<details>
<summary><code>undefineDomain(selector: DomainSelector, options?: FlagOperationOptions): Promise<void></code> — Удаляет persistent-определение домена, но не его storage.</summary>

```ts
await client.undefineDomain(domain);
```
</details>

<details>
<summary><code>startDomain(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainSummary></code> — Запускает неактивный домен.</summary>

```ts
const result = await client.startDomain(domain);
console.log(result);
```
</details>

<details>
<summary><code>shutdownDomain(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainSummary></code> — Запрашивает мягкое выключение гостя.</summary>

```ts
const result = await client.shutdownDomain(domain);
console.log(result);
```
</details>

<details>
<summary><code>destroyDomain(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainSummary></code> — Принудительно останавливает домен.</summary>

```ts
const result = await client.destroyDomain(domain);
console.log(result);
```
</details>

<details>
<summary><code>rebootDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary></code> — Перезагружает активный домен стандартным механизмом libvirt.</summary>

```ts
const result = await client.rebootDomain(domain);
console.log(result);
```
</details>

## Домены: жизненный цикл, устройства и миграция

<details>
<summary><code>getDomainInfo(selector: DomainSelector, options?: OperationOptions): Promise<DomainInfo></code> — Возвращает подробную runtime-информацию домена.</summary>

```ts
const result = await client.getDomainInfo(domain);
console.log(result);
```
</details>

<details>
<summary><code>suspendDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary></code> — Приостанавливает активный домен.</summary>

```ts
const result = await client.suspendDomain(domain);
console.log(result);
```
</details>

<details>
<summary><code>resumeDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary></code> — Возобновляет приостановленный домен.</summary>

```ts
const result = await client.resumeDomain(domain);
console.log(result);
```
</details>

<details>
<summary><code>resetDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary></code> — Выполняет немедленный reset активного домена.</summary>

```ts
const result = await client.resetDomain(domain);
console.log(result);
```
</details>

<details>
<summary><code>getDomainAutostart(selector: DomainSelector, options?: OperationOptions): Promise<boolean></code> — Возвращает признак автоматического запуска домена.</summary>

```ts
const result = await client.getDomainAutostart(domain);
console.log(result);
```
</details>

<details>
<summary><code>setDomainAutostart(selector: DomainSelector, autostart: boolean, options?: OperationOptions): Promise<void></code> — Включает или выключает автоматический запуск домена.</summary>

```ts
await client.setDomainAutostart(domain, true);
```
</details>

<details>
<summary><code>isDomainActive(selector: DomainSelector, options?: OperationOptions): Promise<boolean></code> — Проверяет, активен ли домен.</summary>

```ts
const result = await client.isDomainActive(domain);
console.log(result);
```
</details>

<details>
<summary><code>isDomainPersistent(selector: DomainSelector, options?: OperationOptions): Promise<boolean></code> — Проверяет, имеет ли домен persistent-определение.</summary>

```ts
const result = await client.isDomainPersistent(domain);
console.log(result);
```
</details>

<details>
<summary><code>getDomainOsType(selector: DomainSelector, options?: OperationOptions): Promise<string></code> — Возвращает тип гостевой ОС, например `hvm` или `linux`.</summary>

```ts
const result = await client.getDomainOsType(domain);
console.log(result);
```
</details>

<details>
<summary><code>getDomainHostname(selector: DomainSelector, options?: FlagOperationOptions): Promise<string></code> — Возвращает hostname гостя средствами поддерживающего это driver.</summary>

```ts
const result = await client.getDomainHostname(domain);
console.log(result);
```
</details>

<details>
<summary><code>getDomainMaxMemory(selector: DomainSelector, options?: OperationOptions): Promise<UInt64String></code> — Возвращает максимальную память домена в KiB без потери точности.</summary>

```ts
const result = await client.getDomainMaxMemory(domain);
console.log(result);
```
</details>

<details>
<summary><code>setDomainMemory(selector: DomainSelector, memoryKiB: number | bigint, options?: OperationOptions): Promise<void></code> — Изменяет текущую память домена в KiB.</summary>

```ts
await client.setDomainMemory(domain, 2_097_152);
```
</details>

<details>
<summary><code>setDomainMaxMemory(selector: DomainSelector, memoryKiB: number | bigint, options?: OperationOptions): Promise<void></code> — Изменяет максимальную память домена в KiB.</summary>

```ts
await client.setDomainMaxMemory(domain, 2_097_152);
```
</details>

<details>
<summary><code>getDomainMaxVcpus(selector: DomainSelector, options?: OperationOptions): Promise<number></code> — Возвращает максимально поддерживаемое число vCPU домена.</summary>

```ts
const result = await client.getDomainMaxVcpus(domain);
console.log(result);
```
</details>

<details>
<summary><code>setDomainVcpus(selector: DomainSelector, vcpus: number, options?: OperationOptions): Promise<void></code> — Изменяет число vCPU домена.</summary>

```ts
await client.setDomainVcpus(domain, 2);
```
</details>

<details>
<summary><code>createTransientDomain(xml: string, options?: FlagOperationOptions): Promise<DomainSummary></code> — Создаёт transient-домен из XML без persistent-определения.</summary>

```ts
const result = await client.createTransientDomain(domainXml);
console.log(result);
```
</details>

<details>
<summary><code>isDomainUpdated(selector: DomainSelector, options?: OperationOptions): Promise<boolean></code> — Проверяет, изменилось ли persistent-определение домена.</summary>

```ts
const result = await client.isDomainUpdated(domain);
console.log(result);
```
</details>

<details>
<summary><code>wakeupDomain(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainSummary></code> — Выводит домен из PM suspend через `Domain::pm_wakeup`.</summary>

```ts
const result = await client.wakeupDomain(domain);
console.log(result);
```
</details>

<details>
<summary><code>getDomainVcpusFlags(selector: DomainSelector, options?: FlagOperationOptions): Promise<number></code> — Возвращает число vCPU для указанной маски `virDomainVcpuFlags`.</summary>

```ts
const result = await client.getDomainVcpusFlags(domain);
console.log(result);
```
</details>

<details>
<summary><code>setDomainVcpusFlags(selector: DomainSelector, vcpus: number, options?: FlagOperationOptions): Promise<void></code> — Изменяет число vCPU с указанной маской `virDomainVcpuFlags`.</summary>

```ts
await client.setDomainVcpusFlags(domain, 2);
```
</details>

<details>
<summary><code>getDomainTime(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainTime></code> — Возвращает виртуальные часы домена.</summary>

```ts
const result = await client.getDomainTime(domain);
console.log(result);
```
</details>

<details>
<summary><code>setDomainTime(selector: DomainSelector, time: DomainTime, options?: FlagOperationOptions): Promise<void></code> — Устанавливает виртуальные часы домена.</summary>

```ts
await client.setDomainTime(domain, { seconds: 0n, nanoseconds: 0 });
```
</details>

<details>
<summary><code>getDomainBlockInfo(selector: DomainSelector, disk: string, options?: FlagOperationOptions): Promise<DomainBlockInfo></code> — Возвращает capacity/allocation/physical для block device.</summary>

```ts
const result = await client.getDomainBlockInfo(domain, "vda");
console.log(result);
```
</details>

<details>
<summary><code>getDomainBlockStats(selector: DomainSelector, disk: string, options?: OperationOptions): Promise<DomainBlockStats></code> — Возвращает I/O-счётчики block device.</summary>

```ts
const result = await client.getDomainBlockStats(domain, "vda");
console.log(result);
```
</details>

<details>
<summary><code>resizeDomainBlock(selector: DomainSelector, disk: string, size: number | bigint, options?: FlagOperationOptions): Promise<void></code> — Изменяет логический размер block device в байтах.</summary>

```ts
await client.resizeDomainBlock(domain, "vda", 10_737_418_240n);
```
</details>

<details>
<summary><code>getDomainInterfaceStats(selector: DomainSelector, path: string, options?: OperationOptions): Promise<DomainInterfaceStats></code> — Возвращает сетевые счётчики interface домена.</summary>

```ts
const result = await client.getDomainInterfaceStats(hostInterface, "/var/lib/libvirt/images/my-vm.qcow2");
console.log(result);
```
</details>

<details>
<summary><code>getDomainMemoryStats(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainMemoryStat[]></code> — Возвращает tagged memory statistics домена.</summary>

```ts
const result = await client.getDomainMemoryStats(domain);
console.log(result);
```
</details>

<details>
<summary><code>getDomainInterfaceAddresses(selector: DomainSelector, source: number, options?: FlagOperationOptions): Promise<DomainInterfaceAddress[]></code> — Возвращает адреса гостевых interfaces из выбранного libvirt source.</summary>

```ts
const result = await client.getDomainInterfaceAddresses(hostInterface, 0);
console.log(result);
```
</details>

<details>
<summary><code>getDomainMemoryParameters(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainMemoryParameters></code> — Возвращает typed memory parameters домена.</summary>

```ts
const result = await client.getDomainMemoryParameters(domain);
console.log(result);
```
</details>

<details>
<summary><code>setDomainMemoryParameters(selector: DomainSelector, parameters: DomainMemoryParameters, options?: FlagOperationOptions): Promise<void></code> — Изменяет переданные typed memory parameters домена.</summary>

```ts
await client.setDomainMemoryParameters(domain, { /* typed parameters */ });
```
</details>

<details>
<summary><code>getDomainNumaParameters(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainNumaParameters></code> — Возвращает NUMA policy домена.</summary>

```ts
const result = await client.getDomainNumaParameters(domain);
console.log(result);
```
</details>

<details>
<summary><code>setDomainNumaParameters(selector: DomainSelector, parameters: DomainNumaParameters, options?: FlagOperationOptions): Promise<void></code> — Изменяет переданные NUMA parameters домена.</summary>

```ts
await client.setDomainNumaParameters(domain, { /* typed parameters */ });
```
</details>

<details>
<summary><code>pinDomainVcpu(selector: DomainSelector, vcpu: number, cpuMap: Uint8Array, options?: FlagOperationOptions): Promise<void></code> — Закрепляет один vCPU за bitmap физических CPU.</summary>

```ts
await client.pinDomainVcpu(domain, 0, new Uint8Array([0b0000_0011]));
```
</details>

<details>
<summary><code>pinDomainEmulator(selector: DomainSelector, cpuMap: Uint8Array, options?: FlagOperationOptions): Promise<void></code> — Закрепляет emulator thread домена за bitmap физических CPU.</summary>

```ts
await client.pinDomainEmulator(domain, new Uint8Array([0b0000_0011]));
```
</details>

<details>
<summary><code>sendDomainKey(selector: DomainSelector, codeSet: number, holdTimeMs: number, keycodes: readonly number[], options?: FlagOperationOptions): Promise<void></code> — Отправляет гостю последовательность keycodes.</summary>

```ts
await client.sendDomainKey(domain, 0, 100, [30]);
```
</details>

<details>
<summary><code>getDomainSchedulerParameters(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainSchedulerParameters></code> — Возвращает scheduler type и typed scheduler parameters домена.</summary>

```ts
const result = await client.getDomainSchedulerParameters(domain);
console.log(result);
```
</details>

<details>
<summary><code>setDomainSchedulerParameters(selector: DomainSelector, parameters: DomainSchedulerParameters, options?: FlagOperationOptions): Promise<void></code> — Изменяет переданные scheduler parameters домена.</summary>

```ts
await client.setDomainSchedulerParameters(domain, { /* typed parameters */ });
```
</details>

<details>
<summary><code>getDomainJobInfo(selector: DomainSelector, options?: OperationOptions): Promise<DomainJobStats></code> — Возвращает legacy job information текущей длительной операции.</summary>

```ts
const result = await client.getDomainJobInfo(domain);
console.log(result);
```
</details>

<details>
<summary><code>getDomainJobStats(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainJobStats></code> — Возвращает typed job statistics текущей длительной операции.</summary>

```ts
const result = await client.getDomainJobStats(domain);
console.log(result);
```
</details>

<details>
<summary><code>attachDomainDevice(selector: DomainSelector, xml: string, options?: FlagOperationOptions): Promise<DomainSummary></code> — Подключает устройство, описанное XML, к домену.</summary>

```ts
const result = await client.attachDomainDevice(domain, domainXml);
console.log(result);
```
</details>

<details>
<summary><code>detachDomainDevice(selector: DomainSelector, xml: string, options?: FlagOperationOptions): Promise<DomainSummary></code> — Отключает устройство, описанное XML, от домена.</summary>

```ts
const result = await client.detachDomainDevice(domain, domainXml);
console.log(result);
```
</details>

<details>
<summary><code>updateDomainDevice(selector: DomainSelector, xml: string, options?: FlagOperationOptions): Promise<DomainSummary></code> — Обновляет существующее устройство домена из XML.</summary>

```ts
const result = await client.updateDomainDevice(domain, domainXml);
console.log(result);
```
</details>

<details>
<summary><code>managedSaveDomain(selector: DomainSelector, options?: FlagOperationOptions): Promise<void></code> — Сохраняет runtime-состояние домена в managed save image.</summary>

```ts
await client.managedSaveDomain(domain);
```
</details>

<details>
<summary><code>hasDomainManagedSave(selector: DomainSelector, options?: FlagOperationOptions): Promise<boolean></code> — Проверяет наличие managed save image домена.</summary>

```ts
const result = await client.hasDomainManagedSave(domain);
console.log(result);
```
</details>

<details>
<summary><code>removeDomainManagedSave(selector: DomainSelector, options?: FlagOperationOptions): Promise<void></code> — Удаляет managed save image домена.</summary>

```ts
await client.removeDomainManagedSave(domain);
```
</details>

<details>
<summary><code>coreDumpDomain(selector: DomainSelector, path: string, format?: number, options?: FlagOperationOptions): Promise<void></code> — Записывает core dump домена в файл native host.</summary>

```ts
await client.coreDumpDomain(domain, "/var/lib/libvirt/images/my-vm.qcow2");
```
</details>

<details>
<summary><code>getDomainMetadata(selector: DomainSelector, kind: number, options?: DomainMetadataOptions): Promise<string></code> — Возвращает metadata выбранного типа и namespace.</summary>

```ts
const result = await client.getDomainMetadata(domain, 0);
console.log(result);
```
</details>

<details>
<summary><code>setDomainMetadata(selector: DomainSelector, kind: number, metadata: string | null, options?: SetDomainMetadataOptions): Promise<void></code> — Устанавливает или удаляет metadata выбранного типа и namespace.</summary>

```ts
await client.setDomainMetadata(domain, 0, "<metadata/>");
```
</details>

<details>
<summary><code>renameDomain(selector: DomainSelector, newName: string, options?: FlagOperationOptions): Promise<DomainSummary></code> — Переименовывает persistent-домен.</summary>

```ts
const result = await client.renameDomain(domain, "renamed-vm");
console.log(result);
```
</details>

<details>
<summary><code>setDomainUserPassword(selector: DomainSelector, user: string, password: string, options?: FlagOperationOptions): Promise<void></code> — Устанавливает пароль пользователя внутри гостя через guest agent/driver.</summary>

```ts
await client.setDomainUserPassword(domain, "guest-user", "secret");
```
</details>

<details>
<summary><code>qemuMonitorCommand(selector: DomainSelector, command: string, options?: FlagOperationOptions): Promise<string></code> — Выполняет QEMU monitor command и возвращает сырой ответ.</summary>

```ts
const result = await client.qemuMonitorCommand(domain, "query-status");
console.log(result);
```
</details>

<details>
<summary><code>qemuAgentCommand(selector: DomainSelector, command: string, timeout?: number, options?: FlagOperationOptions): Promise<string></code> — Выполняет QEMU guest agent command и возвращает сырой ответ.</summary>

```ts
const result = await client.qemuAgentCommand(domain, "query-status");
console.log(result);
```
</details>

<details>
<summary><code>restoreDomain(path: string, xml?: string, options?: FlagOperationOptions): Promise<void></code> — Восстанавливает домен из save image на файловой системе native host.</summary>

```ts
await client.restoreDomain("/var/lib/libvirt/images/my-vm.qcow2");
```
</details>

<details>
<summary><code>getDomainSaveImageXml(path: string, options?: FlagOperationOptions): Promise<string></code> — Возвращает XML определения, сохранённого в domain save image.</summary>

```ts
const result = await client.getDomainSaveImageXml("/var/lib/libvirt/images/my-vm.qcow2");
console.log(result);
```
</details>

<details>
<summary><code>setDomainSaveImageXml(path: string, xml: string, options?: FlagOperationOptions): Promise<void></code> — Заменяет XML определения в domain save image.</summary>

```ts
await client.setDomainSaveImageXml("/var/lib/libvirt/images/my-vm.qcow2", domainXml);
```
</details>

<details>
<summary><code>migrateDomainToUri(selector: DomainSelector, destinationUri: string, options?: DomainMigrationOptions): Promise<void></code> — Мигрирует домен непосредственно в destination URI.</summary>

```ts
await client.migrateDomainToUri(domain, "qemu+ssh://destination/system");
```
</details>

<details>
<summary><code>migrateDomainToConnection(selector: DomainSelector, destinationUri: string, options?: DomainMigrationOptions): Promise<DomainSummary></code> — Открывает второй `virt::Connect` в native host и мигрирует домен в него.</summary>

```ts
const result = await client.migrateDomainToConnection(domain, "qemu+ssh://destination/system");
console.log(result);
```
</details>

<details>
<summary><code>screenshotDomain(selector: DomainSelector, options?: DomainScreenshotOptions): Promise<LibvirtBinaryStream></code> — Снимает экран домена и возвращает read-only бинарный поток изображения.</summary>

```ts
const stream = await client.screenshotDomain(domain);
// Read: for await (const chunk of stream) { /* Buffer */ }
// Write: stream.write(data); stream.end();
await stream.finish();
```
</details>

<details>
<summary><code>openDomainConsole(selector: DomainSelector, options?: DomainStreamOptions): Promise<LibvirtBinaryStream></code> — Открывает двунаправленную console домена через `Domain::open_console`.</summary>

```ts
const stream = await client.openDomainConsole(domain);
// Read: for await (const chunk of stream) { /* Buffer */ }
// Write: stream.write(data); stream.end();
await stream.finish();
```
</details>

<details>
<summary><code>openDomainChannel(selector: DomainSelector, options?: DomainStreamOptions): Promise<LibvirtBinaryStream></code> — Открывает двунаправленный guest channel через `Domain::open_channel`.</summary>

```ts
const stream = await client.openDomainChannel(domain);
// Read: for await (const chunk of stream) { /* Buffer */ }
// Write: stream.write(data); stream.end();
await stream.finish();
```
</details>

<details>
<summary><code>openDomainGraphics(selector: DomainSelector, options?: DomainGraphicsOptions): Promise<LibvirtBinaryStream></code> — Открывает graphics socket домена как двунаправленный поток Node.js.</summary>

```ts
const stream = await client.openDomainGraphics(domain);
// Read: for await (const chunk of stream) { /* Buffer */ }
// Write: stream.write(data); stream.end();
await stream.finish();
```
</details>

## Соединение, compute node и CPU

<details>
<summary><code>getCapabilities(options?: OperationOptions): Promise<string></code> — Возвращает XML capabilities текущего libvirt connection.</summary>

```ts
const result = await client.getCapabilities();
console.log(result);
```
</details>

<details>
<summary><code>getConnectionHostname(options?: OperationOptions): Promise<string></code> — Возвращает hostname compute node.</summary>

```ts
const result = await client.getConnectionHostname();
console.log(result);
```
</details>

<details>
<summary><code>getLibvirtVersion(options?: OperationOptions): Promise<number></code> — Возвращает числовую версию системной библиотеки libvirt.</summary>

```ts
const result = await client.getLibvirtVersion();
console.log(result);
```
</details>

<details>
<summary><code>getHypervisorVersion(options?: OperationOptions): Promise<number></code> — Возвращает числовую версию hypervisor driver.</summary>

```ts
const result = await client.getHypervisorVersion();
console.log(result);
```
</details>

<details>
<summary><code>getSystemInfo(options?: FlagOperationOptions): Promise<string></code> — Возвращает XML или driver-specific system information.</summary>

```ts
const result = await client.getSystemInfo();
console.log(result);
```
</details>

<details>
<summary><code>isConnectionSecure(options?: OperationOptions): Promise<boolean></code> — Проверяет, считается ли transport соединения безопасным.</summary>

```ts
const result = await client.isConnectionSecure();
console.log(result);
```
</details>

<details>
<summary><code>isConnectionEncrypted(options?: OperationOptions): Promise<boolean></code> — Проверяет, зашифрован ли transport соединения.</summary>

```ts
const result = await client.isConnectionEncrypted();
console.log(result);
```
</details>

<details>
<summary><code>getFreeMemory(options?: OperationOptions): Promise<UInt64String></code> — Возвращает свободную память compute node в байтах.</summary>

```ts
const result = await client.getFreeMemory();
console.log(result);
```
</details>

<details>
<summary><code>getMaxVcpus(domainType?: string, options?: OperationOptions): Promise<number></code> — Возвращает максимальное число vCPU для указанного domain type.</summary>

```ts
const result = await client.getMaxVcpus();
console.log(result);
```
</details>

<details>
<summary><code>getNodeInfo(options?: OperationOptions): Promise<NodeInfo></code> — Возвращает topology и память compute node.</summary>

```ts
const result = await client.getNodeInfo();
console.log(result);
```
</details>

<details>
<summary><code>getCpuModels(architecture: string, options?: FlagOperationOptions): Promise<string[]></code> — Возвращает CPU models, поддерживаемые указанной архитектурой.</summary>

```ts
const result = await client.getCpuModels("x86_64");
console.log(result);
```
</details>

<details>
<summary><code>compareCpu(xml: string, options?: FlagOperationOptions): Promise<number></code> — Сравнивает CPU XML с CPU compute node и возвращает код libvirt.</summary>

```ts
const result = await client.compareCpu(domainXml);
console.log(result);
```
</details>

<details>
<summary><code>baselineCpu(xmlCpus: readonly string[], options?: FlagOperationOptions): Promise<string></code> — Формирует общий baseline CPU XML из нескольких CPU definitions.</summary>

```ts
const result = await client.baselineCpu([domainXml]);
console.log(result);
```
</details>

<details>
<summary><code>getDomainCapabilities(options?: DomainCapabilitiesOptions): Promise<string></code> — Возвращает domain capabilities XML для заданных фильтров.</summary>

```ts
const result = await client.getDomainCapabilities();
console.log(result);
```
</details>

<details>
<summary><code>domainXmlFromNative(format: string, config: string, options?: FlagOperationOptions): Promise<string></code> — Преобразует native hypervisor config в domain XML.</summary>

```ts
const result = await client.domainXmlFromNative("qemu", "native configuration");
console.log(result);
```
</details>

<details>
<summary><code>domainXmlToNative(format: string, xml: string, options?: FlagOperationOptions): Promise<string></code> — Преобразует domain XML в native hypervisor config.</summary>

```ts
const result = await client.domainXmlToNative("qemu", domainXml);
console.log(result);
```
</details>

<details>
<summary><code>setConnectionKeepalive(interval: number, count: number, options?: OperationOptions): Promise<number></code> — Настраивает keepalive interval и допустимое число пропусков.</summary>

```ts
const result = await client.setConnectionKeepalive(5, 3);
console.log(result);
```
</details>

<details>
<summary><code>getCellsFreeMemory(startCell: number, maxCells: number, options?: OperationOptions): Promise<UInt64String[]></code> — Возвращает свободную память последовательности NUMA cells.</summary>

```ts
const result = await client.getCellsFreeMemory(0, 2);
console.log(result);
```
</details>

<details>
<summary><code>getFreePages(pageSizesKiB: readonly number[], startCell: number, cellCount: number, options?: FlagOperationOptions): Promise<UInt64String[]></code> — Возвращает количество свободных pages заданных размеров по NUMA cells.</summary>

```ts
const result = await client.getFreePages([4], 0, 2);
console.log(result);
```
</details>

<details>
<summary><code>findStoragePoolSources(kind: string, spec?: string, options?: FlagOperationOptions): Promise<string></code> — Возвращает XML найденных storage pool sources указанного типа.</summary>

```ts
const result = await client.findStoragePoolSources(0);
console.log(result);
```
</details>

## Сети

<details>
<summary><code>listNetworks(options?: OperationOptions): Promise<NetworkSummary[]></code> — Возвращает активные и неактивные libvirt networks.</summary>

```ts
const result = await client.listNetworks();
console.log(result);
```
</details>

<details>
<summary><code>getNetwork(selector: NetworkSelector, options?: OperationOptions): Promise<NetworkSummary></code> — Находит одну network по имени или UUID.</summary>

```ts
const result = await client.getNetwork(network);
console.log(result);
```
</details>

<details>
<summary><code>getNetworkXml(selector: NetworkSelector, options?: FlagOperationOptions): Promise<string></code> — Возвращает XML выбранной network.</summary>

```ts
const result = await client.getNetworkXml(network);
console.log(result);
```
</details>

<details>
<summary><code>defineNetwork(xml: string, options?: OperationOptions): Promise<NetworkSummary></code> — Создаёт persistent network definition из XML.</summary>

```ts
const result = await client.defineNetwork(networkXml);
console.log(result);
```
</details>

<details>
<summary><code>createNetwork(xml: string, options?: OperationOptions): Promise<NetworkSummary></code> — Создаёт и запускает transient network из XML.</summary>

```ts
const result = await client.createNetwork(networkXml);
console.log(result);
```
</details>

<details>
<summary><code>startNetwork(selector: NetworkSelector, options?: OperationOptions): Promise<NetworkSummary></code> — Запускает определённую неактивную network.</summary>

```ts
const result = await client.startNetwork(network);
console.log(result);
```
</details>

<details>
<summary><code>destroyNetwork(selector: NetworkSelector, options?: OperationOptions): Promise<void></code> — Немедленно останавливает активную network.</summary>

```ts
await client.destroyNetwork(network);
```
</details>

<details>
<summary><code>undefineNetwork(selector: NetworkSelector, options?: OperationOptions): Promise<void></code> — Удаляет persistent network definition.</summary>

```ts
await client.undefineNetwork(network);
```
</details>

<details>
<summary><code>setNetworkAutostart(selector: NetworkSelector, autostart: boolean, options?: OperationOptions): Promise<void></code> — Включает или выключает autostart network.</summary>

```ts
await client.setNetworkAutostart(network, true);
```
</details>

<details>
<summary><code>getNetworkBridgeName(selector: NetworkSelector, options?: OperationOptions): Promise<string></code> — Возвращает имя bridge, связанного с network.</summary>

```ts
const result = await client.getNetworkBridgeName(network);
console.log(result);
```
</details>

<details>
<summary><code>updateNetwork(selector: NetworkSelector, xml: string, options: NetworkUpdateOptions): Promise<void></code> — Обновляет выбранную секцию network XML.</summary>

```ts
await client.updateNetwork(network, networkXml, { command: 0, section: 0 });
```
</details>

## Интерфейсы хоста

<details>
<summary><code>listInterfaces(options?: OperationOptions): Promise<InterfaceSummary[]></code> — Возвращает активные и неактивные host interfaces.</summary>

```ts
const result = await client.listInterfaces();
console.log(result);
```
</details>

<details>
<summary><code>getInterface(selector: InterfaceSelector, options?: OperationOptions): Promise<InterfaceSummary></code> — Находит host interface по имени или MAC-адресу.</summary>

```ts
const result = await client.getInterface(hostInterface);
console.log(result);
```
</details>

<details>
<summary><code>getInterfaceXml(selector: InterfaceSelector, options?: FlagOperationOptions): Promise<string></code> — Возвращает XML выбранного host interface.</summary>

```ts
const result = await client.getInterfaceXml(hostInterface);
console.log(result);
```
</details>

<details>
<summary><code>defineInterface(xml: string, options?: FlagOperationOptions): Promise<InterfaceSummary></code> — Создаёт persistent host interface definition из XML.</summary>

```ts
const result = await client.defineInterface(interfaceXml);
console.log(result);
```
</details>

<details>
<summary><code>startInterface(selector: InterfaceSelector, options?: FlagOperationOptions): Promise<InterfaceSummary></code> — Активирует определённый host interface.</summary>

```ts
const result = await client.startInterface(hostInterface);
console.log(result);
```
</details>

<details>
<summary><code>destroyInterface(selector: InterfaceSelector, options?: FlagOperationOptions): Promise<InterfaceSummary></code> — Деактивирует host interface.</summary>

```ts
const result = await client.destroyInterface(hostInterface);
console.log(result);
```
</details>

<details>
<summary><code>undefineInterface(selector: InterfaceSelector, options?: OperationOptions): Promise<void></code> — Удаляет persistent host interface definition.</summary>

```ts
await client.undefineInterface(hostInterface);
```
</details>

## Storage pools и volumes

<details>
<summary><code>listStoragePools(options?: OperationOptions): Promise<StoragePoolSummary[]></code> — Возвращает активные и неактивные storage pools.</summary>

```ts
const result = await client.listStoragePools();
console.log(result);
```
</details>

<details>
<summary><code>getStoragePool(selector: StoragePoolSelector, options?: OperationOptions): Promise<StoragePoolSummary></code> — Находит storage pool по имени, UUID или target path.</summary>

```ts
const result = await client.getStoragePool(pool);
console.log(result);
```
</details>

<details>
<summary><code>getStoragePoolXml(selector: StoragePoolSelector, options?: FlagOperationOptions): Promise<string></code> — Возвращает XML выбранного storage pool.</summary>

```ts
const result = await client.getStoragePoolXml(pool);
console.log(result);
```
</details>

<details>
<summary><code>defineStoragePool(xml: string, options?: FlagOperationOptions): Promise<StoragePoolSummary></code> — Создаёт persistent storage pool definition из XML.</summary>

```ts
const result = await client.defineStoragePool(poolXml);
console.log(result);
```
</details>

<details>
<summary><code>createStoragePool(xml: string, options?: FlagOperationOptions): Promise<StoragePoolSummary></code> — Создаёт и запускает transient storage pool из XML.</summary>

```ts
const result = await client.createStoragePool(poolXml);
console.log(result);
```
</details>

<details>
<summary><code>startStoragePool(selector: StoragePoolSelector, options?: FlagOperationOptions): Promise<StoragePoolSummary></code> — Запускает определённый storage pool.</summary>

```ts
const result = await client.startStoragePool(pool);
console.log(result);
```
</details>

<details>
<summary><code>buildStoragePool(selector: StoragePoolSelector, options?: FlagOperationOptions): Promise<StoragePoolSummary></code> — Создаёт backing storage для pool.</summary>

```ts
const result = await client.buildStoragePool(pool);
console.log(result);
```
</details>

<details>
<summary><code>refreshStoragePool(selector: StoragePoolSelector, options?: FlagOperationOptions): Promise<StoragePoolSummary></code> — Перечитывает список volumes и состояние storage pool.</summary>

```ts
const result = await client.refreshStoragePool(pool);
console.log(result);
```
</details>

<details>
<summary><code>destroyStoragePool(selector: StoragePoolSelector, options?: OperationOptions): Promise<void></code> — Останавливает активный storage pool без удаления данных.</summary>

```ts
await client.destroyStoragePool(pool);
```
</details>

<details>
<summary><code>deleteStoragePool(selector: StoragePoolSelector, options?: FlagOperationOptions): Promise<void></code> — Удаляет backing storage pool согласно flags.</summary>

```ts
await client.deleteStoragePool(pool);
```
</details>

<details>
<summary><code>undefineStoragePool(selector: StoragePoolSelector, options?: OperationOptions): Promise<void></code> — Удаляет persistent storage pool definition.</summary>

```ts
await client.undefineStoragePool(pool);
```
</details>

<details>
<summary><code>setStoragePoolAutostart(selector: StoragePoolSelector, autostart: boolean, options?: OperationOptions): Promise<void></code> — Включает или выключает autostart storage pool.</summary>

```ts
await client.setStoragePoolAutostart(pool, true);
```
</details>

<details>
<summary><code>listStorageVolumes(selector: StoragePoolSelector, options?: OperationOptions): Promise<StorageVolumeSummary[]></code> — Возвращает volumes выбранного storage pool.</summary>

```ts
const result = await client.listStorageVolumes(volume);
console.log(result);
```
</details>

<details>
<summary><code>getStoragePoolByVolume(selector: StorageVolumeSelector, options?: OperationOptions): Promise<StoragePoolSummary></code> — Находит storage pool, которому принадлежит volume.</summary>

```ts
const result = await client.getStoragePoolByVolume(volume);
console.log(result);
```
</details>

<details>
<summary><code>getStorageVolume(selector: StorageVolumeSelector, options?: OperationOptions): Promise<StorageVolumeSummary></code> — Находит storage volume по глобальному key или path.</summary>

```ts
const result = await client.getStorageVolume(volume);
console.log(result);
```
</details>

<details>
<summary><code>getStorageVolumeXml(selector: StorageVolumeSelector, options?: FlagOperationOptions): Promise<string></code> — Возвращает XML выбранного storage volume.</summary>

```ts
const result = await client.getStorageVolumeXml(volume);
console.log(result);
```
</details>

<details>
<summary><code>createStorageVolume(pool: StoragePoolSelector, xml: string, options?: FlagOperationOptions): Promise<StorageVolumeSummary></code> — Создаёт storage volume из XML внутри выбранного pool.</summary>

```ts
const result = await client.createStorageVolume(pool, volumeXml);
console.log(result);
```
</details>

<details>
<summary><code>deleteStorageVolume(selector: StorageVolumeSelector, options?: FlagOperationOptions): Promise<void></code> — Удаляет storage volume согласно flags.</summary>

```ts
await client.deleteStorageVolume(volume);
```
</details>

<details>
<summary><code>wipeStorageVolume(selector: StorageVolumeSelector, options?: FlagOperationOptions): Promise<void></code> — Перезаписывает содержимое volume стандартным wipe algorithm.</summary>

```ts
await client.wipeStorageVolume(volume);
```
</details>

<details>
<summary><code>resizeStorageVolume(selector: StorageVolumeSelector, capacity: number | bigint, options?: FlagOperationOptions): Promise<void></code> — Изменяет логическую ёмкость storage volume в байтах.</summary>

```ts
await client.resizeStorageVolume(volume, 10_737_418_240n);
```
</details>

<details>
<summary><code>getStorageVolumeByName(pool: StoragePoolSelector, name: string, options?: OperationOptions): Promise<StorageVolumeSummary></code> — Находит volume по имени внутри выбранного pool.</summary>

```ts
const result = await client.getStorageVolumeByName(pool, "resource-name");
console.log(result);
```
</details>

<details>
<summary><code>cloneStorageVolume(pool: StoragePoolSelector, xml: string, source: StorageVolumeSelector, options?: FlagOperationOptions): Promise<StorageVolumeSummary></code> — Клонирует source volume в новый volume, описанный XML.</summary>

```ts
const result = await client.cloneStorageVolume(pool, volumeXml, volume);
console.log(result);
```
</details>

<details>
<summary><code>wipeStorageVolumePattern(selector: StorageVolumeSelector, algorithm: number, options?: FlagOperationOptions): Promise<void></code> — Перезаписывает volume выбранным `virStorageVolWipeAlgorithm`.</summary>

```ts
await client.wipeStorageVolumePattern(volume, 0);
```
</details>

<details>
<summary><code>downloadStorageVolume(selector: StorageVolumeSelector, options?: StorageVolumeTransferOptions): Promise<LibvirtBinaryStream></code> — Загружает диапазон volume из libvirt в read-only поток Node.js.</summary>

```ts
const stream = await client.downloadStorageVolume(volume);
// Read: for await (const chunk of stream) { /* Buffer */ }
// Write: stream.write(data); stream.end();
await stream.finish();
```
</details>

<details>
<summary><code>uploadStorageVolume(selector: StorageVolumeSelector, options?: StorageVolumeTransferOptions): Promise<LibvirtBinaryStream></code> — Создаёт writable-поток для загрузки данных в volume через libvirt.</summary>

```ts
const stream = await client.uploadStorageVolume(volume);
// Read: for await (const chunk of stream) { /* Buffer */ }
// Write: stream.write(data); stream.end();
await stream.finish();
```
</details>

## Устройства хоста

<details>
<summary><code>listNodeDevices(options?: OperationOptions): Promise<NodeDeviceSummary[]></code> — Возвращает node devices compute node.</summary>

```ts
const result = await client.listNodeDevices();
console.log(result);
```
</details>

<details>
<summary><code>getNodeDevice(name: string, options?: OperationOptions): Promise<NodeDeviceSummary></code> — Находит node device по уникальному имени.</summary>

```ts
const result = await client.getNodeDevice("resource-name");
console.log(result);
```
</details>

<details>
<summary><code>getNodeDeviceXml(name: string, options?: FlagOperationOptions): Promise<string></code> — Возвращает XML выбранного node device.</summary>

```ts
const result = await client.getNodeDeviceXml("resource-name");
console.log(result);
```
</details>

<details>
<summary><code>createNodeDevice(xml: string, options?: FlagOperationOptions): Promise<NodeDeviceSummary></code> — Создаёт node device из XML.</summary>

```ts
const result = await client.createNodeDevice(nodeDeviceXml);
console.log(result);
```
</details>

<details>
<summary><code>destroyNodeDevice(name: string, options?: OperationOptions): Promise<void></code> — Уничтожает созданный node device.</summary>

```ts
await client.destroyNodeDevice("resource-name");
```
</details>

<details>
<summary><code>detachNodeDevice(name: string, options?: OperationOptions): Promise<NodeDeviceSummary></code> — Отсоединяет node device от host driver.</summary>

```ts
const result = await client.detachNodeDevice("resource-name");
console.log(result);
```
</details>

<details>
<summary><code>resetNodeDevice(name: string, options?: OperationOptions): Promise<NodeDeviceSummary></code> — Сбрасывает node device.</summary>

```ts
const result = await client.resetNodeDevice("resource-name");
console.log(result);
```
</details>

<details>
<summary><code>reattachNodeDevice(name: string, options?: OperationOptions): Promise<NodeDeviceSummary></code> — Повторно присоединяет node device к host driver.</summary>

```ts
const result = await client.reattachNodeDevice("resource-name");
console.log(result);
```
</details>

<details>
<summary><code>getScsiHostNodeDevice(wwnn: string, wwpn: string, options?: FlagOperationOptions): Promise<NodeDeviceSummary></code> — Находит SCSI host device по WWNN и WWPN.</summary>

```ts
const result = await client.getScsiHostNodeDevice("50014380242b9751", "50014380242b9752");
console.log(result);
```
</details>

<details>
<summary><code>detachNodeDeviceFlags(name: string, driver?: string, options?: FlagOperationOptions): Promise<NodeDeviceSummary></code> — Отсоединяет node device с явным driver и flags.</summary>

```ts
const result = await client.detachNodeDeviceFlags("resource-name");
console.log(result);
```
</details>

<details>
<summary><code>countNodeDevices(capability?: string, options?: FlagOperationOptions): Promise<number></code> — Считает node devices, необязательно фильтруя по capability.</summary>

```ts
const result = await client.countNodeDevices();
console.log(result);
```
</details>

## Network filters

<details>
<summary><code>listNetworkFilters(options?: OperationOptions): Promise<NetworkFilterSummary[]></code> — Возвращает все network filters.</summary>

```ts
const result = await client.listNetworkFilters();
console.log(result);
```
</details>

<details>
<summary><code>getNetworkFilter(selector: NetworkFilterSelector, options?: OperationOptions): Promise<NetworkFilterSummary></code> — Находит network filter по имени или UUID.</summary>

```ts
const result = await client.getNetworkFilter(networkFilter);
console.log(result);
```
</details>

<details>
<summary><code>getNetworkFilterXml(selector: NetworkFilterSelector, options?: FlagOperationOptions): Promise<string></code> — Возвращает XML выбранного network filter.</summary>

```ts
const result = await client.getNetworkFilterXml(networkFilter);
console.log(result);
```
</details>

<details>
<summary><code>defineNetworkFilter(xml: string, options?: OperationOptions): Promise<NetworkFilterSummary></code> — Создаёт или обновляет network filter из XML.</summary>

```ts
const result = await client.defineNetworkFilter(networkFilterXml);
console.log(result);
```
</details>

<details>
<summary><code>undefineNetworkFilter(selector: NetworkFilterSelector, options?: OperationOptions): Promise<void></code> — Удаляет persistent network filter.</summary>

```ts
await client.undefineNetworkFilter(networkFilter);
```
</details>

## Secrets

<details>
<summary><code>listSecrets(options?: OperationOptions): Promise<SecretSummary[]></code> — Возвращает metadata всех secrets без их значений.</summary>

```ts
const result = await client.listSecrets();
console.log(result);
```
</details>

<details>
<summary><code>getSecret(selector: SecretSelector, options?: OperationOptions): Promise<SecretSummary></code> — Находит secret по UUID либо usage type/ID.</summary>

```ts
const result = await client.getSecret(secret);
console.log(result);
```
</details>

<details>
<summary><code>getSecretXml(selector: SecretSelector, options?: FlagOperationOptions): Promise<string></code> — Возвращает XML metadata выбранного secret.</summary>

```ts
const result = await client.getSecretXml(secret);
console.log(result);
```
</details>

<details>
<summary><code>defineSecret(xml: string, options?: FlagOperationOptions): Promise<SecretSummary></code> — Создаёт или обновляет secret definition из XML.</summary>

```ts
const result = await client.defineSecret(secretXml);
console.log(result);
```
</details>

<details>
<summary><code>getSecretValue(selector: SecretSelector, options?: FlagOperationOptions): Promise<Uint8Array></code> — Возвращает бинарное значение secret; не логируйте результат.</summary>

```ts
const result = await client.getSecretValue(secret);
console.log(result);
```
</details>

<details>
<summary><code>setSecretValue(selector: SecretSelector, value: Uint8Array, options?: FlagOperationOptions): Promise<void></code> — Устанавливает бинарное значение secret.</summary>

```ts
await client.setSecretValue(secret, new Uint8Array([1, 2, 3]));
```
</details>

<details>
<summary><code>undefineSecret(selector: SecretSelector, options?: OperationOptions): Promise<void></code> — Удаляет secret definition и его значение.</summary>

```ts
await client.undefineSecret(secret);
```
</details>

## Снимки доменов и закрытие

<details>
<summary><code>listDomainSnapshots(domain: DomainSelector, options?: FlagOperationOptions): Promise<DomainSnapshotSummary[]></code> — Возвращает snapshots выбранного домена.</summary>

```ts
const result = await client.listDomainSnapshots(domain);
console.log(result);
```
</details>

<details>
<summary><code>getDomainSnapshot(domain: DomainSelector, name: string, options?: FlagOperationOptions): Promise<DomainSnapshotSummary></code> — Находит snapshot домена по имени.</summary>

```ts
const result = await client.getDomainSnapshot(domain, "resource-name");
console.log(result);
```
</details>

<details>
<summary><code>getDomainSnapshotXml(domain: DomainSelector, name: string, options?: FlagOperationOptions): Promise<string></code> — Возвращает XML выбранного snapshot.</summary>

```ts
const result = await client.getDomainSnapshotXml(domain, "resource-name");
console.log(result);
```
</details>

<details>
<summary><code>createDomainSnapshot(domain: DomainSelector, xml: string, options?: FlagOperationOptions): Promise<DomainSnapshotSummary></code> — Создаёт snapshot домена из XML.</summary>

```ts
const result = await client.createDomainSnapshot(domain, snapshotXml);
console.log(result);
```
</details>

<details>
<summary><code>getCurrentDomainSnapshot(domain: DomainSelector, options?: FlagOperationOptions): Promise<DomainSnapshotSummary></code> — Возвращает текущий snapshot домена.</summary>

```ts
const result = await client.getCurrentDomainSnapshot(domain);
console.log(result);
```
</details>

<details>
<summary><code>revertDomainSnapshot(domain: DomainSelector, name: string, options?: FlagOperationOptions): Promise<DomainSnapshotSummary></code> — Возвращает домен к состоянию выбранного snapshot.</summary>

```ts
const result = await client.revertDomainSnapshot(domain, "resource-name");
console.log(result);
```
</details>

<details>
<summary><code>deleteDomainSnapshot(domain: DomainSelector, name: string, options?: FlagOperationOptions): Promise<void></code> — Удаляет snapshot согласно flags.</summary>

```ts
await client.deleteDomainSnapshot(domain, "resource-name");
```
</details>

<details>
<summary><code>listDomainSnapshotChildren(domain: DomainSelector, name: string, options?: FlagOperationOptions): Promise<DomainSnapshotSummary[]></code> — Возвращает непосредственные дочерние snapshots.</summary>

```ts
const result = await client.listDomainSnapshotChildren(domain, "resource-name");
console.log(result);
```
</details>

<details>
<summary><code>getDomainSnapshotParent(domain: DomainSelector, name: string, options?: FlagOperationOptions): Promise<DomainSnapshotSummary></code> — Возвращает родительский snapshot.</summary>

```ts
const result = await client.getDomainSnapshotParent(domain, "resource-name");
console.log(result);
```
</details>

<details>
<summary><code>close(): Promise<void></code> — Закрывает соединение и native host. Метод идемпотентен.</summary>

```ts
await client.close();
```
</details>

## Ошибки и потоки

<details>
<summary><code>LibvirtAdapterError</code> — ошибка операции с машинно-читаемым полем <code>code</code>.</summary>

```ts
import { LibvirtAdapterError } from "ts-wasm-libvirt";

try {
  await client.getDomain({ name: "missing-vm" });
} catch (error) {
  if (error instanceof LibvirtAdapterError && error.code === "NOT_FOUND") {
    console.log("Домен не найден");
  }
}
```

Коды: `INITIALIZATION_FAILED`, `HOST_ERROR`, `INVALID_ARGUMENT`, `NOT_FOUND`, `CONFLICT`, `INVALID_DEFINITION`, `CANCELLED`, `TIMEOUT`.
</details>

<details>
<summary><code>LibvirtBinaryStream.finish()</code> — подтверждает успешное окончание работы потока.</summary>

```ts
const stream = await client.uploadStorageVolume(volume, { length: 4 });
stream.end(Buffer.from([1, 2, 3, 4]));
await stream.finish();
```
</details>

<details>
<summary><code>LibvirtBinaryStream.abort()</code> — немедленно прерывает поток.</summary>

```ts
const stream = await client.openDomainConsole(domain);
// On cancellation or error:
await stream.abort();
```
</details>

Значения libvirt `u64`, которые не всегда точны в JavaScript, возвращаются как десятичные строки `UInt64String`; соответствующие входные параметры принимают `number | bigint`.
