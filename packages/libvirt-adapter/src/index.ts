import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { Duplex } from "node:stream";

/** Параметры создания клиента libvirt. */
export interface CreateLibvirtClientOptions {
  /**
   * Таймаут по умолчанию для операций в миллисекундах.
   * Переопределяется `OperationOptions.timeoutMs` конкретного вызова.
   */
  defaultTimeoutMs?: number;
  /**
   * URI соединения libvirt, например `qemu:///system` или `test:///default`.
   * По умолчанию используется `qemu:///system`.
   */
  uri?: string;
  /** Открывает соединение через `Connect::open_read_only`. */
  readOnly?: boolean;
  /** Использует `Connect::open_auth` и получает credentials через callback. */
  auth?: LibvirtAuthenticationOptions;
}

/** Тип credential из `virConnectCredentialType`. */
export enum LibvirtCredentialType {
  /** Имя пользователя, известное удалённой системе. */
  Username = 1,
  /** Имя учётной записи для аутентификации. */
  AuthName = 2,
  /** Язык, предпочитаемый auth mechanism. */
  Language = 3,
  /** Client nonce для challenge-response mechanism. */
  Cnonce = 4,
  /** Пароль или passphrase без фиксированной схемы отображения. */
  Passphrase = 5,
  /** Интерактивный ответ, который разрешено отображать. */
  EchoPrompt = 6,
  /** Секретный интерактивный ответ без отображения. */
  NoEchoPrompt = 7,
  /** Realm аутентификации. */
  Realm = 8,
  /** Результат внешнего механизма аутентификации. */
  External = 9,
}

/** Один запрос credential, полученный callback-функцией `virt::ConnectAuth`. */
export interface LibvirtCredential {
  /** Числовой `virConnectCredentialType`. */
  type: number;
  /** Текст приглашения от auth driver. */
  prompt: string;
  /** Дополнительный challenge от auth driver. */
  challenge: string;
  /** Значение по умолчанию, предложенное auth driver. */
  defaultResult: string;
}

/** Настройки аутентифицированного соединения libvirt. */
export interface LibvirtAuthenticationOptions {
  /**
   * Непустой список принимаемых `LibvirtCredentialType`.
   * Обычно это `AuthName` и `Passphrase`.
   */
  credentialTypes: readonly number[];
  /**
   * Возвращает результат для каждого credential в том же порядке.
   * `null` или `undefined` означает отсутствие ответа на конкретный запрос.
   * Callback может быть синхронным или асинхронным.
   */
  callback(
    credentials: readonly LibvirtCredential[],
  ): readonly (string | null | undefined)[] | Promise<readonly (string | null | undefined)[]>;
}

/** Дополнительные параметры одного асинхронного вызова. */
export interface OperationOptions {
  /**
   * Сигнал отмены ожидания результата.
   * Отмена не означает откат уже отправленной в libvirt операции.
   */
  signal?: AbortSignal;
  /**
   * Положительный таймаут ожидания в миллисекундах.
   * Имеет приоритет над `CreateLibvirtClientOptions.defaultTimeoutMs`.
   */
  timeoutMs?: number;
}

/** Параметры операции, принимающей libvirt flags. */
export interface FlagOperationOptions extends OperationOptions {
  /** Беззнаковая 32-битная маска флагов libvirt. */
  flags?: number;
}

/** Точное JSON-представление беззнакового 64-битного значения. */
export type UInt64String = string;

/** Состояние открытого соединения с libvirt. */
export interface LibvirtHealth {
  /** Всегда `"ready"` для успешно созданного клиента. */
  state: "ready";
  /** Возвращает `true`, когда libvirt считает соединение живым. */
  alive: boolean;
  /** Тип гипервизора, например `"QEMU"` или `"TEST"`. */
  hypervisor: string;
  /** Канонический URI фактически открытого соединения. */
  uri: string;
}

/** Нормализованное состояние домена libvirt. */
export type DomainState =
  | "running"
  | "blocked"
  | "paused"
  | "shutdown"
  | "shutoff"
  | "crashed"
  | "suspended"
  | "unknown";

/** Краткое сериализуемое представление домена. */
export interface DomainSummary {
  /** Runtime ID работающего домена; `null` для неактивного домена. */
  id: number | null;
  /** Имя домена, уникальное в пределах соединения. */
  name: string;
  /** Текущее нормализованное состояние домена. */
  state: DomainState;
  /** Неизменяемый UUID домена. */
  uuid: string;
}

/** Подробная runtime-информация, соответствующая `virt::domain::DomainInfo`. */
export interface DomainInfo {
  /** Нормализованное runtime-состояние домена. */
  state: DomainState;
  /** Максимально разрешённая память домена в KiB. */
  maxMemoryKiB: UInt64String;
  /** Текущая память домена в KiB. */
  memoryKiB: UInt64String;
  /** Число виртуальных CPU домена. */
  virtualCpus: number;
  /** Накопленное CPU-время домена в наносекундах. */
  cpuTimeNs: UInt64String;
}

/** Часы домена в формате `virt::Domain::get_time`. */
export interface DomainTime {
  /** Секунды Unix-времени; строка сохраняет точность Rust `i64`. */
  seconds: string;
  /** Дополнительная наносекундная часть времени. */
  nanoseconds: number;
}

/** Размеры одного block device домена. */
export interface DomainBlockInfo {
  /** Логическая ёмкость устройства в байтах. */
  capacity: UInt64String;
  /** Выделенное хостом пространство в байтах. */
  allocation: UInt64String;
  /** Физический размер backing storage в байтах. */
  physical: UInt64String;
}

/** Счётчики ввода-вывода одного block device домена. */
export interface DomainBlockStats {
  /** Количество операций чтения. */
  readRequests: string;
  /** Количество прочитанных байтов. */
  readBytes: string;
  /** Количество операций записи. */
  writeRequests: string;
  /** Количество записанных байтов. */
  writeBytes: string;
  /** Количество ошибок ввода-вывода. */
  errors: string;
}

/** Счётчики сетевого интерфейса домена. */
export interface DomainInterfaceStats {
  /** Полученные байты. */
  rxBytes: string;
  /** Полученные пакеты. */
  rxPackets: string;
  /** Ошибки приёма. */
  rxErrors: string;
  /** Отброшенные входящие пакеты. */
  rxDropped: string;
  /** Переданные байты. */
  txBytes: string;
  /** Переданные пакеты. */
  txPackets: string;
  /** Ошибки передачи. */
  txErrors: string;
  /** Отброшенные исходящие пакеты. */
  txDropped: string;
}

/** Один tagged memory counter домена. */
export interface DomainMemoryStat {
  /** Числовой `virDomainMemoryStatTags`. */
  tag: number;
  /** Значение счётчика без потери точности Rust `u64`. */
  value: UInt64String;
}

/** Адреса одного сетевого интерфейса гостя. */
export interface DomainInterfaceAddress {
  /** Target-имя интерфейса. */
  name: string;
  /** MAC-адрес либо пустая строка, если он неизвестен. */
  hardwareAddress: string;
  /** IP-адреса интерфейса с типом и длиной префикса. */
  addresses: Array<{ type: string; address: string; prefix: string }>;
}

/** Typed memory parameters домена. */
export interface DomainMemoryParameters {
  /** Жёсткий предел памяти в KiB. */
  hardLimit?: UInt64String | null;
  /** Мягкий предел памяти в KiB. */
  softLimit?: UInt64String | null;
  /** Минимально гарантированная память в KiB. */
  minimumGuarantee?: UInt64String | null;
  /** Совокупный жёсткий предел memory и swap в KiB. */
  swapHardLimit?: UInt64String | null;
}

/** NUMA policy домена. */
export interface DomainNumaParameters {
  /** Строковое представление набора NUMA nodes. */
  nodeSet?: string | null;
  /** Числовой режим `virDomainNumatuneMemMode`. */
  mode?: number | null;
}

/** Period/quota одной scheduler bandwidth-группы. */
export interface DomainSchedulerBandwidth {
  /** Период планировщика в микросекундах. */
  period?: UInt64String | null;
  /** Quota планировщика; строка сохраняет signed 64-bit значение. */
  quota?: string | null;
}

/** Нормализованные scheduler parameters домена. */
export interface DomainSchedulerParameters {
  /** Имя scheduler, возвращённое libvirt. */
  schedulerType: string;
  /** Относительная доля CPU. */
  cpuShares?: UInt64String | null;
  /** Bandwidth всех vCPU. */
  vcpu?: DomainSchedulerBandwidth;
  /** Bandwidth emulator thread. */
  emulator?: DomainSchedulerBandwidth;
  /** Глобальная bandwidth domain process. */
  global?: DomainSchedulerBandwidth;
  /** Bandwidth I/O threads. */
  ioThread?: DomainSchedulerBandwidth;
  /** Scheduler weight для поддерживающих его drivers. */
  weight?: number | null;
  /** Scheduler cap для поддерживающих его drivers. */
  cap?: number | null;
  /** Scheduler reservation без потери signed 64-bit точности. */
  reservation?: string | null;
  /** Scheduler limit без потери signed 64-bit точности. */
  limit?: string | null;
  /** Scheduler shares для поддерживающих его drivers. */
  shares?: number | null;
}

/** Job statistics домена с driver-specific полями. */
export interface DomainJobStats {
  /** Числовой `virDomainJobType`. */
  type: number;
  /** Дополнительные typed parameters, возвращённые конкретным driver. */
  [name: string]: number | string | boolean | undefined;
}

/** Фильтры запроса domain capabilities. */
export interface DomainCapabilitiesOptions extends FlagOperationOptions {
  /** Путь к emulator binary. */
  emulator?: string;
  /** Архитектура гостя. */
  architecture?: string;
  /** Machine type гостя. */
  machine?: string;
  /** Тип виртуализации, например `kvm` или `qemu`. */
  virtualizationType?: string;
}

/** Параметры изменения отдельной секции network XML. */
export interface NetworkUpdateOptions extends FlagOperationOptions {
  /** Числовая команда `virNetworkUpdateCommand`. */
  command: number;
  /** Числовая секция `virNetworkUpdateSection`. */
  section: number;
  /** Индекс элемента внутри выбранной секции. */
  index?: number;
}

/** Параметры чтения metadata домена. */
export interface DomainMetadataOptions extends FlagOperationOptions {
  /** Namespace URI для element metadata. */
  uri?: string;
}

/** Параметры записи metadata домена. */
export interface SetDomainMetadataOptions extends DomainMetadataOptions {
  /** Namespace key/prefix для element metadata. */
  key?: string;
}

/** Параметры миграции домена. */
export interface DomainMigrationOptions extends FlagOperationOptions {
  /** Driver-specific URI канала миграции. */
  migrationUri?: string;
  /** XML назначения, заменяющий исходное определение домена. */
  destinationXml?: string;
  /** Имя домена на destination host. */
  destinationName?: string;
  /** Ограничение пропускной способности в единицах libvirt driver. */
  bandwidth?: number | bigint;
}

/** Параметры создания снимка экрана через `Domain::screenshot`. */
export interface DomainScreenshotOptions extends FlagOperationOptions {
  /** Номер экрана гостя. По умолчанию `0`. */
  screen?: number;
}

/** Параметры открытия console или channel домена через `virt::Stream`. */
export interface DomainStreamOptions extends FlagOperationOptions {
  /** Имя console/channel из XML домена; отсутствие выбирает устройство по умолчанию. */
  device?: string;
}

/** Параметры graphics-соединения, открываемого через `Domain::open_graphics_fd`. */
export interface DomainGraphicsOptions extends FlagOperationOptions {
  /** Индекс graphics-устройства домена. По умолчанию `0`. */
  index?: number;
}

/** Параметры потоковой передачи storage volume. */
export interface StorageVolumeTransferOptions extends FlagOperationOptions {
  /** Смещение от начала volume в байтах. По умолчанию `0`. */
  offset?: number | bigint;
  /** Число передаваемых байтов; `0` означает диапазон, определяемый libvirt. */
  length?: number | bigint;
}

/**
 * Двунаправленный бинарный поток Node.js, связанный с `virt::Stream`.
 *
 * Поток поддерживает стандартные `pipe`, async iterator, backpressure и события
 * Node.js. Доступные направления явно указаны в `canRead` и `canWrite`.
 */
export interface LibvirtBinaryStream extends Duplex {
  /** Уникальный идентификатор потока внутри одного клиента. */
  readonly id: number;
  /** `true`, если из потока можно читать данные libvirt. */
  readonly canRead: boolean;
  /** `true`, если в поток можно записывать данные для libvirt. */
  readonly canWrite: boolean;
  /** MIME-тип данных, возвращаемый `Domain::screenshot`; иначе `undefined`. */
  readonly mimeType: string | undefined;
  /**
   * Завершает writable-сторону и ожидает `Stream::finish` в native host.
   * Для read-only потока ожидает естественного EOF от libvirt.
   */
  finish(): Promise<void>;
  /** Немедленно вызывает `Stream::abort` и освобождает обе стороны потока. */
  abort(): Promise<void>;
}

/** Информация о compute node из `virt::connect::NodeInfo`. */
export interface NodeInfo {
  /** Модель CPU compute node. */
  model: string;
  /** Общая память compute node в KiB. */
  memory: UInt64String;
  /** Число активных CPU. */
  cpus: number;
  /** Номинальная частота CPU в MHz. */
  mhz: number;
  /** Число NUMA nodes. */
  nodes: number;
  /** Число CPU sockets на node. */
  sockets: number;
  /** Число cores на socket. */
  cores: number;
  /** Число threads на core. */
  threads: number;
}

/** Выбор сети libvirt по имени или UUID. */
export type NetworkSelector = { name: string } | { uuid: string };

/** Сериализуемое представление сети libvirt. */
export interface NetworkSummary {
  /** Имя сети. */
  name: string;
  /** Неизменяемый UUID сети. */
  uuid: string;
  /** Признак запущенной сети. */
  active: boolean;
  /** Признак persistent-определения. */
  persistent: boolean;
  /** Признак автоматического запуска. */
  autostart: boolean;
}

/** Выбор host interface по имени или MAC-адресу. */
export type InterfaceSelector = { name: string } | { mac: string };

/** Сериализуемое представление host interface. */
export interface InterfaceSummary {
  /** Имя host interface. */
  name: string;
  /** MAC-адрес host interface. */
  mac: string;
  /** Признак активного interface. */
  active: boolean;
}

/** Выбор storage pool по имени, UUID или target path. */
export type StoragePoolSelector = { name: string } | { uuid: string } | { path: string };

/** Сериализуемое представление storage pool. */
export interface StoragePoolSummary {
  /** Имя storage pool. */
  name: string;
  /** Неизменяемый UUID storage pool. */
  uuid: string;
  /** Признак активного pool. */
  active: boolean;
  /** Признак persistent-определения pool. */
  persistent: boolean;
  /** Признак автоматического запуска pool. */
  autostart: boolean;
  /** Числовой `virStoragePoolState`. */
  state: number;
  /** Полная ёмкость pool в байтах. */
  capacity: UInt64String;
  /** Выделенное пространство pool в байтах. */
  allocation: UInt64String;
  /** Доступное пространство pool в байтах. */
  available: UInt64String;
}

/** Выбор storage volume по глобальному key или path. */
export type StorageVolumeSelector = { key: string } | { path: string };

/** Сериализуемое представление storage volume. */
export interface StorageVolumeSummary {
  /** Имя volume внутри pool. */
  name: string;
  /** Глобальный libvirt key volume. */
  key: string;
  /** Локальный target path volume. */
  path: string;
  /** Числовой `virStorageVolType`. */
  kind: number;
  /** Логическая ёмкость volume в байтах. */
  capacity: UInt64String;
  /** Фактически выделенное пространство в байтах. */
  allocation: UInt64String;
}

/** Сериализуемое представление node device. */
export interface NodeDeviceSummary {
  /** Уникальное имя node device. */
  name: string;
  /** Имя родительского устройства либо `null`. */
  parent: string | null;
  /** Capabilities, объявленные node device. */
  capabilities: string[];
}

/** Выбор network filter по имени или UUID. */
export type NetworkFilterSelector = { name: string } | { uuid: string };

/** Сериализуемое представление network filter. */
export interface NetworkFilterSummary {
  /** Имя network filter. */
  name: string;
  /** Неизменяемый UUID network filter. */
  uuid: string;
}

/** Выбор secret по UUID либо паре usage type/ID. */
export type SecretSelector =
  | { uuid: string }
  | { usage: { type: number; id: string } };

/** Сериализуемое представление libvirt secret без secret value. */
export interface SecretSummary {
  /** Неизменяемый UUID secret. */
  uuid: string;
  /** Числовой `virSecretUsageType`. */
  usageType: number;
  /** Driver-specific идентификатор использования secret. */
  usageId: string;
}

/** Краткое представление snapshot домена. */
export interface DomainSnapshotSummary {
  /** Имя snapshot. */
  name: string;
  /** Признак текущего snapshot. */
  current: boolean;
  /** Признак наличия persistent metadata. */
  hasMetadata: boolean;
  /** Число непосредственных дочерних snapshots. */
  children: number;
}

/** Выбор домена по UUID. Не комбинируется с `DomainByName`. */
export interface DomainByUuid {
  /** UUID домена в строковом представлении. */
  uuid: string;
}

/** Выбор домена по имени. Не комбинируется с `DomainByUuid`. */
export interface DomainByName {
  /** Имя домена. */
  name: string;
}

/**
 * Способ выбрать домен. Передавайте ровно одно поле: `{ name }` или `{ uuid }`.
 * Пустые значения, NUL, табуляции и переводы строк отклоняются как
 * `INVALID_ARGUMENT`.
 */
export type DomainSelector = DomainByUuid | DomainByName;

/** Асинхронный клиент для управления одним соединением libvirt. */
export interface LibvirtClient {
  /**
   * Проверяет состояние соединения.
   * @param options Таймаут и сигнал отмены.
   * @returns Сводку о соединении.
   */
  health(options?: OperationOptions): Promise<LibvirtHealth>;
  /**
   * Получает активные и неактивные домены.
   * @param options Таймаут и сигнал отмены.
   * @returns Нормализованный список доменов.
   */
  listDomains(options?: OperationOptions): Promise<DomainSummary[]>;
  /**
   * Находит один домен.
   * @param selector Ровно один идентификатор: имя или UUID.
   * @param options Таймаут и сигнал отмены.
   * @returns Нормализованное состояние домена.
   * @throws `NOT_FOUND`, если домен отсутствует.
   */
  getDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary>;
  /**
   * Возвращает XML-описание домена от libvirt.
   * @param selector Ровно один идентификатор: имя или UUID.
   * @param options Таймаут и сигнал отмены.
   * @returns XML в UTF-8 строке.
   */
  getDomainXml(selector: DomainSelector, options?: OperationOptions): Promise<string>;
  /**
   * Создаёт или обновляет persistent-домен из XML.
   * @param xml XML-описание домена без NUL-байтов.
   * @param options Таймаут и сигнал отмены.
   * @returns Нормализованное состояние определённого домена.
   * @throws `INVALID_DEFINITION` для XML, отклонённого libvirt.
   */
  defineDomain(xml: string, options?: FlagOperationOptions): Promise<DomainSummary>;
  /**
   * Удаляет persistent-определение домена, но не его storage.
   * @param selector Ровно один идентификатор: имя или UUID.
   * @param options Таймаут и сигнал отмены.
   */
  undefineDomain(selector: DomainSelector, options?: FlagOperationOptions): Promise<void>;
  /**
   * Запускает неактивный домен.
   * @param selector Ровно один идентификатор: имя или UUID.
   * @param options Таймаут и сигнал отмены.
   * @returns Состояние домена после запуска.
   * @throws `CONFLICT`, если домен уже активен.
   */
  startDomain(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainSummary>;
  /**
   * Запрашивает мягкое выключение гостя.
   * @param selector Ровно один идентификатор: имя или UUID.
   * @param options Таймаут и сигнал отмены.
   * @returns Состояние, прочитанное сразу после принятия запроса libvirt.
   * @throws `CONFLICT`, если домен неактивен.
   */
  shutdownDomain(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainSummary>;
  /**
   * Принудительно останавливает домен.
   * @param selector Ровно один идентификатор: имя или UUID.
   * @param options Таймаут и сигнал отмены.
   * @returns Состояние домена после остановки.
   * @throws `CONFLICT`, если домен неактивен.
   */
  destroyDomain(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainSummary>;
  /**
   * Перезагружает активный домен стандартным механизмом libvirt.
   * @param selector Ровно один идентификатор: имя или UUID.
   * @param options Таймаут и сигнал отмены.
   * @returns Состояние домена после принятия запроса.
   * @throws `CONFLICT`, если домен неактивен.
   */
  rebootDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary>;
  /** Возвращает подробную runtime-информацию домена. */
  getDomainInfo(selector: DomainSelector, options?: OperationOptions): Promise<DomainInfo>;
  /** Приостанавливает активный домен. */
  suspendDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary>;
  /** Возобновляет приостановленный домен. */
  resumeDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary>;
  /** Выполняет немедленный reset активного домена. */
  resetDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary>;
  /** Возвращает признак автоматического запуска домена. */
  getDomainAutostart(selector: DomainSelector, options?: OperationOptions): Promise<boolean>;
  /** Включает или выключает автоматический запуск домена. */
  setDomainAutostart(selector: DomainSelector, autostart: boolean, options?: OperationOptions): Promise<void>;
  /** Проверяет, активен ли домен. */
  isDomainActive(selector: DomainSelector, options?: OperationOptions): Promise<boolean>;
  /** Проверяет, имеет ли домен persistent-определение. */
  isDomainPersistent(selector: DomainSelector, options?: OperationOptions): Promise<boolean>;
  /** Возвращает тип гостевой ОС, например `hvm` или `linux`. */
  getDomainOsType(selector: DomainSelector, options?: OperationOptions): Promise<string>;
  /** Возвращает hostname гостя средствами поддерживающего это driver. */
  getDomainHostname(selector: DomainSelector, options?: FlagOperationOptions): Promise<string>;
  /** Возвращает максимальную память домена в KiB без потери точности. */
  getDomainMaxMemory(selector: DomainSelector, options?: OperationOptions): Promise<UInt64String>;
  /** Изменяет текущую память домена в KiB. */
  setDomainMemory(selector: DomainSelector, memoryKiB: number | bigint, options?: OperationOptions): Promise<void>;
  /** Изменяет максимальную память домена в KiB. */
  setDomainMaxMemory(selector: DomainSelector, memoryKiB: number | bigint, options?: OperationOptions): Promise<void>;
  /** Возвращает максимально поддерживаемое число vCPU домена. */
  getDomainMaxVcpus(selector: DomainSelector, options?: OperationOptions): Promise<number>;
  /** Изменяет число vCPU домена. */
  setDomainVcpus(selector: DomainSelector, vcpus: number, options?: OperationOptions): Promise<void>;
  /** Создаёт transient-домен из XML без persistent-определения. */
  createTransientDomain(xml: string, options?: FlagOperationOptions): Promise<DomainSummary>;
  /** Проверяет, изменилось ли persistent-определение домена. */
  isDomainUpdated(selector: DomainSelector, options?: OperationOptions): Promise<boolean>;
  /** Выводит домен из PM suspend через `Domain::pm_wakeup`. */
  wakeupDomain(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainSummary>;
  /** Возвращает число vCPU для указанной маски `virDomainVcpuFlags`. */
  getDomainVcpusFlags(selector: DomainSelector, options?: FlagOperationOptions): Promise<number>;
  /** Изменяет число vCPU с указанной маской `virDomainVcpuFlags`. */
  setDomainVcpusFlags(selector: DomainSelector, vcpus: number, options?: FlagOperationOptions): Promise<void>;
  /** Возвращает виртуальные часы домена. */
  getDomainTime(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainTime>;
  /** Устанавливает виртуальные часы домена. */
  setDomainTime(selector: DomainSelector, time: DomainTime, options?: FlagOperationOptions): Promise<void>;
  /** Возвращает capacity/allocation/physical для block device. */
  getDomainBlockInfo(selector: DomainSelector, disk: string, options?: FlagOperationOptions): Promise<DomainBlockInfo>;
  /** Возвращает I/O-счётчики block device. */
  getDomainBlockStats(selector: DomainSelector, disk: string, options?: OperationOptions): Promise<DomainBlockStats>;
  /** Изменяет логический размер block device в байтах. */
  resizeDomainBlock(selector: DomainSelector, disk: string, size: number | bigint, options?: FlagOperationOptions): Promise<void>;
  /** Возвращает сетевые счётчики interface домена. */
  getDomainInterfaceStats(selector: DomainSelector, path: string, options?: OperationOptions): Promise<DomainInterfaceStats>;
  /** Возвращает tagged memory statistics домена. */
  getDomainMemoryStats(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainMemoryStat[]>;
  /** Возвращает адреса гостевых interfaces из выбранного libvirt source. */
  getDomainInterfaceAddresses(selector: DomainSelector, source: number, options?: FlagOperationOptions): Promise<DomainInterfaceAddress[]>;
  /** Возвращает typed memory parameters домена. */
  getDomainMemoryParameters(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainMemoryParameters>;
  /** Изменяет переданные typed memory parameters домена. */
  setDomainMemoryParameters(selector: DomainSelector, parameters: DomainMemoryParameters, options?: FlagOperationOptions): Promise<void>;
  /** Возвращает NUMA policy домена. */
  getDomainNumaParameters(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainNumaParameters>;
  /** Изменяет переданные NUMA parameters домена. */
  setDomainNumaParameters(selector: DomainSelector, parameters: DomainNumaParameters, options?: FlagOperationOptions): Promise<void>;
  /** Закрепляет один vCPU за bitmap физических CPU. */
  pinDomainVcpu(selector: DomainSelector, vcpu: number, cpuMap: Uint8Array, options?: FlagOperationOptions): Promise<void>;
  /** Закрепляет emulator thread домена за bitmap физических CPU. */
  pinDomainEmulator(selector: DomainSelector, cpuMap: Uint8Array, options?: FlagOperationOptions): Promise<void>;
  /** Отправляет гостю последовательность keycodes. */
  sendDomainKey(selector: DomainSelector, codeSet: number, holdTimeMs: number, keycodes: readonly number[], options?: FlagOperationOptions): Promise<void>;
  /** Возвращает scheduler type и typed scheduler parameters домена. */
  getDomainSchedulerParameters(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainSchedulerParameters>;
  /** Изменяет переданные scheduler parameters домена. */
  setDomainSchedulerParameters(selector: DomainSelector, parameters: DomainSchedulerParameters, options?: FlagOperationOptions): Promise<void>;
  /** Возвращает legacy job information текущей длительной операции. */
  getDomainJobInfo(selector: DomainSelector, options?: OperationOptions): Promise<DomainJobStats>;
  /** Возвращает typed job statistics текущей длительной операции. */
  getDomainJobStats(selector: DomainSelector, options?: FlagOperationOptions): Promise<DomainJobStats>;
  /** Подключает устройство, описанное XML, к домену. */
  attachDomainDevice(selector: DomainSelector, xml: string, options?: FlagOperationOptions): Promise<DomainSummary>;
  /** Отключает устройство, описанное XML, от домена. */
  detachDomainDevice(selector: DomainSelector, xml: string, options?: FlagOperationOptions): Promise<DomainSummary>;
  /** Обновляет существующее устройство домена из XML. */
  updateDomainDevice(selector: DomainSelector, xml: string, options?: FlagOperationOptions): Promise<DomainSummary>;
  /** Сохраняет runtime-состояние домена в managed save image. */
  managedSaveDomain(selector: DomainSelector, options?: FlagOperationOptions): Promise<void>;
  /** Проверяет наличие managed save image домена. */
  hasDomainManagedSave(selector: DomainSelector, options?: FlagOperationOptions): Promise<boolean>;
  /** Удаляет managed save image домена. */
  removeDomainManagedSave(selector: DomainSelector, options?: FlagOperationOptions): Promise<void>;
  /** Записывает core dump домена в файл native host. */
  coreDumpDomain(selector: DomainSelector, path: string, format?: number, options?: FlagOperationOptions): Promise<void>;
  /** Возвращает metadata выбранного типа и namespace. */
  getDomainMetadata(selector: DomainSelector, kind: number, options?: DomainMetadataOptions): Promise<string>;
  /** Устанавливает или удаляет metadata выбранного типа и namespace. */
  setDomainMetadata(selector: DomainSelector, kind: number, metadata: string | null, options?: SetDomainMetadataOptions): Promise<void>;
  /** Переименовывает persistent-домен. */
  renameDomain(selector: DomainSelector, newName: string, options?: FlagOperationOptions): Promise<DomainSummary>;
  /** Устанавливает пароль пользователя внутри гостя через guest agent/driver. */
  setDomainUserPassword(selector: DomainSelector, user: string, password: string, options?: FlagOperationOptions): Promise<void>;
  /** Выполняет QEMU monitor command и возвращает сырой ответ. */
  qemuMonitorCommand(selector: DomainSelector, command: string, options?: FlagOperationOptions): Promise<string>;
  /** Выполняет QEMU guest agent command и возвращает сырой ответ. */
  qemuAgentCommand(selector: DomainSelector, command: string, timeout?: number, options?: FlagOperationOptions): Promise<string>;
  /** Восстанавливает домен из save image на файловой системе native host. */
  restoreDomain(path: string, xml?: string, options?: FlagOperationOptions): Promise<void>;
  /** Возвращает XML определения, сохранённого в domain save image. */
  getDomainSaveImageXml(path: string, options?: FlagOperationOptions): Promise<string>;
  /** Заменяет XML определения в domain save image. */
  setDomainSaveImageXml(path: string, xml: string, options?: FlagOperationOptions): Promise<void>;
  /** Мигрирует домен непосредственно в destination URI. */
  migrateDomainToUri(selector: DomainSelector, destinationUri: string, options?: DomainMigrationOptions): Promise<void>;
  /**
   * Открывает второй `virt::Connect` в native host и мигрирует домен в него.
   * @param selector Исходный домен по имени или UUID.
   * @param destinationUri URI второго соединения libvirt.
   * @param options Имя/URI миграции, bandwidth, flags, таймаут и отмена.
   * @returns Представление домена, полученное от destination connection.
   */
  migrateDomainToConnection(selector: DomainSelector, destinationUri: string, options?: DomainMigrationOptions): Promise<DomainSummary>;
  /**
   * Снимает экран домена и возвращает read-only бинарный поток изображения.
   * @param selector Домен по имени или UUID.
   * @param options Номер экрана, flags, таймаут открытия и сигнал отмены.
   */
  screenshotDomain(selector: DomainSelector, options?: DomainScreenshotOptions): Promise<LibvirtBinaryStream>;
  /**
   * Открывает двунаправленную console домена через `Domain::open_console`.
   * @param selector Домен по имени или UUID.
   * @param options Имя устройства, flags, таймаут открытия и сигнал отмены.
   */
  openDomainConsole(selector: DomainSelector, options?: DomainStreamOptions): Promise<LibvirtBinaryStream>;
  /**
   * Открывает двунаправленный guest channel через `Domain::open_channel`.
   * @param selector Домен по имени или UUID.
   * @param options Имя channel, flags, таймаут открытия и сигнал отмены.
   */
  openDomainChannel(selector: DomainSelector, options?: DomainStreamOptions): Promise<LibvirtBinaryStream>;
  /**
   * Открывает graphics socket домена как двунаправленный поток Node.js.
   * Native file descriptor остаётся внутри Rust host и автоматически закрывается.
   * @param selector Домен по имени или UUID.
   * @param options Индекс graphics-устройства, flags, таймаут и отмена открытия.
   */
  openDomainGraphics(selector: DomainSelector, options?: DomainGraphicsOptions): Promise<LibvirtBinaryStream>;

  /** Возвращает XML capabilities текущего libvirt connection. */
  getCapabilities(options?: OperationOptions): Promise<string>;
  /** Возвращает hostname compute node. */
  getConnectionHostname(options?: OperationOptions): Promise<string>;
  /** Возвращает числовую версию системной библиотеки libvirt. */
  getLibvirtVersion(options?: OperationOptions): Promise<number>;
  /** Возвращает числовую версию hypervisor driver. */
  getHypervisorVersion(options?: OperationOptions): Promise<number>;
  /** Возвращает XML или driver-specific system information. */
  getSystemInfo(options?: FlagOperationOptions): Promise<string>;
  /** Проверяет, считается ли transport соединения безопасным. */
  isConnectionSecure(options?: OperationOptions): Promise<boolean>;
  /** Проверяет, зашифрован ли transport соединения. */
  isConnectionEncrypted(options?: OperationOptions): Promise<boolean>;
  /** Возвращает свободную память compute node в байтах. */
  getFreeMemory(options?: OperationOptions): Promise<UInt64String>;
  /** Возвращает максимальное число vCPU для указанного domain type. */
  getMaxVcpus(domainType?: string, options?: OperationOptions): Promise<number>;
  /** Возвращает topology и память compute node. */
  getNodeInfo(options?: OperationOptions): Promise<NodeInfo>;
  /** Возвращает CPU models, поддерживаемые указанной архитектурой. */
  getCpuModels(architecture: string, options?: FlagOperationOptions): Promise<string[]>;
  /** Сравнивает CPU XML с CPU compute node и возвращает код libvirt. */
  compareCpu(xml: string, options?: FlagOperationOptions): Promise<number>;
  /** Формирует общий baseline CPU XML из нескольких CPU definitions. */
  baselineCpu(xmlCpus: readonly string[], options?: FlagOperationOptions): Promise<string>;
  /** Возвращает domain capabilities XML для заданных фильтров. */
  getDomainCapabilities(options?: DomainCapabilitiesOptions): Promise<string>;
  /** Преобразует native hypervisor config в domain XML. */
  domainXmlFromNative(format: string, config: string, options?: FlagOperationOptions): Promise<string>;
  /** Преобразует domain XML в native hypervisor config. */
  domainXmlToNative(format: string, xml: string, options?: FlagOperationOptions): Promise<string>;
  /** Настраивает keepalive interval и допустимое число пропусков. */
  setConnectionKeepalive(interval: number, count: number, options?: OperationOptions): Promise<number>;
  /** Возвращает свободную память последовательности NUMA cells. */
  getCellsFreeMemory(startCell: number, maxCells: number, options?: OperationOptions): Promise<UInt64String[]>;
  /** Возвращает количество свободных pages заданных размеров по NUMA cells. */
  getFreePages(pageSizesKiB: readonly number[], startCell: number, cellCount: number, options?: FlagOperationOptions): Promise<UInt64String[]>;
  /** Возвращает XML найденных storage pool sources указанного типа. */
  findStoragePoolSources(kind: string, spec?: string, options?: FlagOperationOptions): Promise<string>;

  /** Возвращает активные и неактивные libvirt networks. */
  listNetworks(options?: OperationOptions): Promise<NetworkSummary[]>;
  /** Находит одну network по имени или UUID. */
  getNetwork(selector: NetworkSelector, options?: OperationOptions): Promise<NetworkSummary>;
  /** Возвращает XML выбранной network. */
  getNetworkXml(selector: NetworkSelector, options?: FlagOperationOptions): Promise<string>;
  /** Создаёт persistent network definition из XML. */
  defineNetwork(xml: string, options?: OperationOptions): Promise<NetworkSummary>;
  /** Создаёт и запускает transient network из XML. */
  createNetwork(xml: string, options?: OperationOptions): Promise<NetworkSummary>;
  /** Запускает определённую неактивную network. */
  startNetwork(selector: NetworkSelector, options?: OperationOptions): Promise<NetworkSummary>;
  /** Немедленно останавливает активную network. */
  destroyNetwork(selector: NetworkSelector, options?: OperationOptions): Promise<void>;
  /** Удаляет persistent network definition. */
  undefineNetwork(selector: NetworkSelector, options?: OperationOptions): Promise<void>;
  /** Включает или выключает autostart network. */
  setNetworkAutostart(selector: NetworkSelector, autostart: boolean, options?: OperationOptions): Promise<void>;
  /** Возвращает имя bridge, связанного с network. */
  getNetworkBridgeName(selector: NetworkSelector, options?: OperationOptions): Promise<string>;
  /** Обновляет выбранную секцию network XML. */
  updateNetwork(selector: NetworkSelector, xml: string, options: NetworkUpdateOptions): Promise<void>;

  /** Возвращает активные и неактивные host interfaces. */
  listInterfaces(options?: OperationOptions): Promise<InterfaceSummary[]>;
  /** Находит host interface по имени или MAC-адресу. */
  getInterface(selector: InterfaceSelector, options?: OperationOptions): Promise<InterfaceSummary>;
  /** Возвращает XML выбранного host interface. */
  getInterfaceXml(selector: InterfaceSelector, options?: FlagOperationOptions): Promise<string>;
  /** Создаёт persistent host interface definition из XML. */
  defineInterface(xml: string, options?: FlagOperationOptions): Promise<InterfaceSummary>;
  /** Активирует определённый host interface. */
  startInterface(selector: InterfaceSelector, options?: FlagOperationOptions): Promise<InterfaceSummary>;
  /** Деактивирует host interface. */
  destroyInterface(selector: InterfaceSelector, options?: FlagOperationOptions): Promise<InterfaceSummary>;
  /** Удаляет persistent host interface definition. */
  undefineInterface(selector: InterfaceSelector, options?: OperationOptions): Promise<void>;

  /** Возвращает активные и неактивные storage pools. */
  listStoragePools(options?: OperationOptions): Promise<StoragePoolSummary[]>;
  /** Находит storage pool по имени, UUID или target path. */
  getStoragePool(selector: StoragePoolSelector, options?: OperationOptions): Promise<StoragePoolSummary>;
  /** Возвращает XML выбранного storage pool. */
  getStoragePoolXml(selector: StoragePoolSelector, options?: FlagOperationOptions): Promise<string>;
  /** Создаёт persistent storage pool definition из XML. */
  defineStoragePool(xml: string, options?: FlagOperationOptions): Promise<StoragePoolSummary>;
  /** Создаёт и запускает transient storage pool из XML. */
  createStoragePool(xml: string, options?: FlagOperationOptions): Promise<StoragePoolSummary>;
  /** Запускает определённый storage pool. */
  startStoragePool(selector: StoragePoolSelector, options?: FlagOperationOptions): Promise<StoragePoolSummary>;
  /** Создаёт backing storage для pool. */
  buildStoragePool(selector: StoragePoolSelector, options?: FlagOperationOptions): Promise<StoragePoolSummary>;
  /** Перечитывает список volumes и состояние storage pool. */
  refreshStoragePool(selector: StoragePoolSelector, options?: FlagOperationOptions): Promise<StoragePoolSummary>;
  /** Останавливает активный storage pool без удаления данных. */
  destroyStoragePool(selector: StoragePoolSelector, options?: OperationOptions): Promise<void>;
  /** Удаляет backing storage pool согласно flags. */
  deleteStoragePool(selector: StoragePoolSelector, options?: FlagOperationOptions): Promise<void>;
  /** Удаляет persistent storage pool definition. */
  undefineStoragePool(selector: StoragePoolSelector, options?: OperationOptions): Promise<void>;
  /** Включает или выключает autostart storage pool. */
  setStoragePoolAutostart(selector: StoragePoolSelector, autostart: boolean, options?: OperationOptions): Promise<void>;
  /** Возвращает volumes выбранного storage pool. */
  listStorageVolumes(selector: StoragePoolSelector, options?: OperationOptions): Promise<StorageVolumeSummary[]>;
  /** Находит storage pool, которому принадлежит volume. */
  getStoragePoolByVolume(selector: StorageVolumeSelector, options?: OperationOptions): Promise<StoragePoolSummary>;

  /** Находит storage volume по глобальному key или path. */
  getStorageVolume(selector: StorageVolumeSelector, options?: OperationOptions): Promise<StorageVolumeSummary>;
  /** Возвращает XML выбранного storage volume. */
  getStorageVolumeXml(selector: StorageVolumeSelector, options?: FlagOperationOptions): Promise<string>;
  /** Создаёт storage volume из XML внутри выбранного pool. */
  createStorageVolume(pool: StoragePoolSelector, xml: string, options?: FlagOperationOptions): Promise<StorageVolumeSummary>;
  /** Удаляет storage volume согласно flags. */
  deleteStorageVolume(selector: StorageVolumeSelector, options?: FlagOperationOptions): Promise<void>;
  /** Перезаписывает содержимое volume стандартным wipe algorithm. */
  wipeStorageVolume(selector: StorageVolumeSelector, options?: FlagOperationOptions): Promise<void>;
  /** Изменяет логическую ёмкость storage volume в байтах. */
  resizeStorageVolume(selector: StorageVolumeSelector, capacity: number | bigint, options?: FlagOperationOptions): Promise<void>;
  /** Находит volume по имени внутри выбранного pool. */
  getStorageVolumeByName(pool: StoragePoolSelector, name: string, options?: OperationOptions): Promise<StorageVolumeSummary>;
  /** Клонирует source volume в новый volume, описанный XML. */
  cloneStorageVolume(pool: StoragePoolSelector, xml: string, source: StorageVolumeSelector, options?: FlagOperationOptions): Promise<StorageVolumeSummary>;
  /** Перезаписывает volume выбранным `virStorageVolWipeAlgorithm`. */
  wipeStorageVolumePattern(selector: StorageVolumeSelector, algorithm: number, options?: FlagOperationOptions): Promise<void>;
  /**
   * Загружает диапазон volume из libvirt в read-only поток Node.js.
   * @param selector Volume по key или path.
   * @param options Offset, length, flags, таймаут открытия и сигнал отмены.
   */
  downloadStorageVolume(selector: StorageVolumeSelector, options?: StorageVolumeTransferOptions): Promise<LibvirtBinaryStream>;
  /**
   * Создаёт writable-поток для загрузки данных в volume через libvirt.
   * После записи обязательно вызовите `end()` или `finish()`.
   * @param selector Volume по key или path.
   * @param options Offset, length, flags, таймаут открытия и сигнал отмены.
   */
  uploadStorageVolume(selector: StorageVolumeSelector, options?: StorageVolumeTransferOptions): Promise<LibvirtBinaryStream>;

  /** Возвращает node devices compute node. */
  listNodeDevices(options?: OperationOptions): Promise<NodeDeviceSummary[]>;
  /** Находит node device по уникальному имени. */
  getNodeDevice(name: string, options?: OperationOptions): Promise<NodeDeviceSummary>;
  /** Возвращает XML выбранного node device. */
  getNodeDeviceXml(name: string, options?: FlagOperationOptions): Promise<string>;
  /** Создаёт node device из XML. */
  createNodeDevice(xml: string, options?: FlagOperationOptions): Promise<NodeDeviceSummary>;
  /** Уничтожает созданный node device. */
  destroyNodeDevice(name: string, options?: OperationOptions): Promise<void>;
  /** Отсоединяет node device от host driver. */
  detachNodeDevice(name: string, options?: OperationOptions): Promise<NodeDeviceSummary>;
  /** Сбрасывает node device. */
  resetNodeDevice(name: string, options?: OperationOptions): Promise<NodeDeviceSummary>;
  /** Повторно присоединяет node device к host driver. */
  reattachNodeDevice(name: string, options?: OperationOptions): Promise<NodeDeviceSummary>;
  /** Находит SCSI host device по WWNN и WWPN. */
  getScsiHostNodeDevice(wwnn: string, wwpn: string, options?: FlagOperationOptions): Promise<NodeDeviceSummary>;
  /** Отсоединяет node device с явным driver и flags. */
  detachNodeDeviceFlags(name: string, driver?: string, options?: FlagOperationOptions): Promise<NodeDeviceSummary>;
  /** Считает node devices, необязательно фильтруя по capability. */
  countNodeDevices(capability?: string, options?: FlagOperationOptions): Promise<number>;

  /** Возвращает все network filters. */
  listNetworkFilters(options?: OperationOptions): Promise<NetworkFilterSummary[]>;
  /** Находит network filter по имени или UUID. */
  getNetworkFilter(selector: NetworkFilterSelector, options?: OperationOptions): Promise<NetworkFilterSummary>;
  /** Возвращает XML выбранного network filter. */
  getNetworkFilterXml(selector: NetworkFilterSelector, options?: FlagOperationOptions): Promise<string>;
  /** Создаёт или обновляет network filter из XML. */
  defineNetworkFilter(xml: string, options?: OperationOptions): Promise<NetworkFilterSummary>;
  /** Удаляет persistent network filter. */
  undefineNetworkFilter(selector: NetworkFilterSelector, options?: OperationOptions): Promise<void>;

  /** Возвращает metadata всех secrets без их значений. */
  listSecrets(options?: OperationOptions): Promise<SecretSummary[]>;
  /** Находит secret по UUID либо usage type/ID. */
  getSecret(selector: SecretSelector, options?: OperationOptions): Promise<SecretSummary>;
  /** Возвращает XML metadata выбранного secret. */
  getSecretXml(selector: SecretSelector, options?: FlagOperationOptions): Promise<string>;
  /** Создаёт или обновляет secret definition из XML. */
  defineSecret(xml: string, options?: FlagOperationOptions): Promise<SecretSummary>;
  /** Возвращает бинарное значение secret; не логируйте результат. */
  getSecretValue(selector: SecretSelector, options?: FlagOperationOptions): Promise<Uint8Array>;
  /** Устанавливает бинарное значение secret. */
  setSecretValue(selector: SecretSelector, value: Uint8Array, options?: FlagOperationOptions): Promise<void>;
  /** Удаляет secret definition и его значение. */
  undefineSecret(selector: SecretSelector, options?: OperationOptions): Promise<void>;

  /** Возвращает snapshots выбранного домена. */
  listDomainSnapshots(domain: DomainSelector, options?: FlagOperationOptions): Promise<DomainSnapshotSummary[]>;
  /** Находит snapshot домена по имени. */
  getDomainSnapshot(domain: DomainSelector, name: string, options?: FlagOperationOptions): Promise<DomainSnapshotSummary>;
  /** Возвращает XML выбранного snapshot. */
  getDomainSnapshotXml(domain: DomainSelector, name: string, options?: FlagOperationOptions): Promise<string>;
  /** Создаёт snapshot домена из XML. */
  createDomainSnapshot(domain: DomainSelector, xml: string, options?: FlagOperationOptions): Promise<DomainSnapshotSummary>;
  /** Возвращает текущий snapshot домена. */
  getCurrentDomainSnapshot(domain: DomainSelector, options?: FlagOperationOptions): Promise<DomainSnapshotSummary>;
  /** Возвращает домен к состоянию выбранного snapshot. */
  revertDomainSnapshot(domain: DomainSelector, name: string, options?: FlagOperationOptions): Promise<DomainSnapshotSummary>;
  /** Удаляет snapshot согласно flags. */
  deleteDomainSnapshot(domain: DomainSelector, name: string, options?: FlagOperationOptions): Promise<void>;
  /** Возвращает непосредственные дочерние snapshots. */
  listDomainSnapshotChildren(domain: DomainSelector, name: string, options?: FlagOperationOptions): Promise<DomainSnapshotSummary[]>;
  /** Возвращает родительский snapshot. */
  getDomainSnapshotParent(domain: DomainSelector, name: string, options?: FlagOperationOptions): Promise<DomainSnapshotSummary>;
  /**
   * Закрывает соединение и native host. Метод идемпотентен.
   * @returns Promise, завершающийся после закрытия клиента.
   */
  close(): Promise<void>;
}

/** Стабильные машинно-читаемые категории ошибок адаптера. */
export type LibvirtAdapterErrorCode =
  | "INITIALIZATION_FAILED"
  | "HOST_ERROR"
  | "INVALID_ARGUMENT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_DEFINITION"
  | "CANCELLED"
  | "TIMEOUT"
  | "CLOSED_CLIENT";

/** Ошибка адаптера с машинно-читаемым кодом в поле `code`. */
export class LibvirtAdapterError extends Error {
  /** Стабильная категория ошибки, пригодная для ветвления в приложении. */
  readonly code: LibvirtAdapterErrorCode;

  /**
   * @param code Стабильная категория ошибки.
   * @param message Диагностическое сообщение.
   * @param options Стандартный `ErrorOptions`, например исходная причина ошибки.
   */
  constructor(code: LibvirtAdapterErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LibvirtAdapterError";
    this.code = code;
  }
}

/**
 * Загружает WASM-контракт, запускает native host и открывает соединение libvirt.
 * @param options URI, auth callback, read-only режим и default timeout клиента.
 * @returns Готовый к операциям клиент.
 * @throws `INITIALIZATION_FAILED`, если для текущей платформы нет host-пакета,
 * не удалось запустить host или открыть URI.
 */
export async function createLibvirtClient(
  options: CreateLibvirtClientOptions = {},
): Promise<LibvirtClient> {
  const uri = normalizeUri(options.uri ?? "qemu:///system");
  const defaultTimeoutMs = validateTimeout(options.defaultTimeoutMs);
  const auth = validateAuthentication(options.auth);
  await loadWasmContract();
  const hostPath = await resolveNativeHostPath();

  return HostClient.start(uri, defaultTimeoutMs, hostPath, options.readOnly === true, auth);
}

class HostClient implements LibvirtClient {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #binary: BinaryTransport;
  readonly #defaultTimeoutMs: number | undefined;
  readonly #lines: ReadlineInterface;
  readonly #pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();
  #nextId = 1;
  #closed = false;

  private constructor(
    child: ChildProcessWithoutNullStreams,
    lines: ReadlineInterface,
    binary: BinaryTransport,
    defaultTimeoutMs: number | undefined,
  ) {
    this.#child = child;
    this.#lines = lines;
    this.#binary = binary;
    this.#defaultTimeoutMs = defaultTimeoutMs;

    lines.on("line", (line) => this.#handleLine(line));
    child.once("exit", (code, signal) => {
      if (this.#closed) return;
      this.#closed = true;
      const error = new LibvirtAdapterError(
        "HOST_ERROR",
        `native host exited unexpectedly (code=${code}, signal=${signal})`,
      );
      for (const pending of this.#pending.values()) pending.reject(error);
      this.#pending.clear();
      this.#binary.close(error);
    });
  }

  static async start(
    uri: string,
    defaultTimeoutMs: number | undefined,
    hostPath: string,
    readOnly: boolean,
    auth: LibvirtAuthenticationOptions | undefined,
  ): Promise<HostClient> {
    const hostArguments = ["--uri", uri, "--binary-fd"];
    if (readOnly) hostArguments.push("--read-only");
    if (auth !== undefined) {
      hostArguments.push("--auth-types", auth.credentialTypes.join(","));
    }
    const child = spawn(hostPath, hostArguments, {
      stdio: ["pipe", "pipe", "pipe", "pipe", "pipe"],
    });
    const binaryPipe = child.stdio[3] as Duplex | null;
    const authPipe = child.stdio[4] as Duplex | null;
    if (binaryPipe === null) {
      child.kill();
      throw new LibvirtAdapterError(
        "INITIALIZATION_FAILED",
        "native host binary transport is unavailable",
      );
    }
    if (auth !== undefined && authPipe === null) {
      child.kill();
      throw new LibvirtAdapterError(
        "INITIALIZATION_FAILED",
        "native host authentication callback transport is unavailable",
      );
    }
    const lines = createInterface({ input: child.stdout });
    const binary = new BinaryTransport(binaryPipe, defaultTimeoutMs);
    const authentication = auth === undefined
      ? undefined
      : new AuthTransport(
          authPipe as Duplex,
          (credentials) => auth.callback(credentials),
        );
    if (auth === undefined) authPipe?.destroy();
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    try {
      const ready = await waitForReady(child, lines, () => stderr);
      if (ready.type !== "ready") throw new Error("native host returned an invalid greeting");
      if (authentication?.failure !== undefined) throw authentication.failure;
      authentication?.close();
      return new HostClient(child, lines, binary, defaultTimeoutMs);
    } catch (error) {
      child.kill();
      lines.close();
      binary.close();
      authentication?.close();
      throw new LibvirtAdapterError(
        "INITIALIZATION_FAILED",
        "failed to initialize native libvirt host",
        { cause: authentication?.failure ?? error },
      );
    }
  }

  async health(options?: OperationOptions): Promise<LibvirtHealth> {
    return (await this.#request("health", undefined, options)) as LibvirtHealth;
  }

  async listDomains(options?: OperationOptions): Promise<DomainSummary[]> {
    return (await this.#request("list-domains", undefined, options)) as DomainSummary[];
  }

  async getDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary> {
    const validated = validateDomainSelector(selector);
    if (validated.kind === "uuid") {
      return (await this.#request("get-domain-by-uuid", validated.value, options)) as DomainSummary;
    }

    return (await this.#request("get-domain-by-name", validated.value, options)) as DomainSummary;
  }

  async getDomainXml(selector: DomainSelector, options?: OperationOptions): Promise<string> {
    const validated = validateDomainSelector(selector);
    if (validated.kind === "uuid") {
      return (await this.#request("get-domain-xml-by-uuid", validated.value, options)) as string;
    }

    return (await this.#request("get-domain-xml-by-name", validated.value, options)) as string;
  }

  async defineDomain(xml: string, options: FlagOperationOptions = {}): Promise<DomainSummary> {
    if (xml.includes("\0")) {
      throw new LibvirtAdapterError(
        "INVALID_ARGUMENT",
        "domain XML must not contain NUL bytes",
      );
    }

    const encodedXml = Buffer.from(xml, "utf8").toString("hex");
    const flags = validateFlags(options.flags);
    if (flags !== 0) {
      return (await this.#request("domain.define-flags", [encodedXml, String(flags)], options)) as DomainSummary;
    }
    return (await this.#request("define-domain", encodedXml, options)) as DomainSummary;
  }

  async undefineDomain(selector: DomainSelector, options: FlagOperationOptions = {}): Promise<void> {
    const validated = validateDomainSelector(selector);
    const flags = validateFlags(options.flags);
    if (flags !== 0) {
      await this.#request("domain.undefine-flags", [validated.kind, validated.value, String(flags)], options);
      return;
    }
    if (validated.kind === "uuid") {
      await this.#request("undefine-domain-by-uuid", validated.value, options);
      return;
    }

    await this.#request("undefine-domain-by-name", validated.value, options);
  }

  async startDomain(selector: DomainSelector, options: FlagOperationOptions = {}): Promise<DomainSummary> {
    const validated = validateDomainSelector(selector);
    const flags = validateFlags(options.flags);
    if (flags !== 0) {
      return (await this.#request("domain.start-flags", [validated.kind, validated.value, String(flags)], options)) as DomainSummary;
    }
    if (validated.kind === "uuid") {
      return (await this.#request("start-domain-by-uuid", validated.value, options)) as DomainSummary;
    }

    return (await this.#request("start-domain-by-name", validated.value, options)) as DomainSummary;
  }

  async shutdownDomain(selector: DomainSelector, options: FlagOperationOptions = {}): Promise<DomainSummary> {
    const validated = validateDomainSelector(selector);
    const flags = validateFlags(options.flags);
    if (flags !== 0) {
      return (await this.#request("domain.shutdown-flags", [validated.kind, validated.value, String(flags)], options)) as DomainSummary;
    }
    if (validated.kind === "uuid") {
      return (await this.#request("shutdown-domain-by-uuid", validated.value, options)) as DomainSummary;
    }

    return (await this.#request("shutdown-domain-by-name", validated.value, options)) as DomainSummary;
  }

  async destroyDomain(selector: DomainSelector, options: FlagOperationOptions = {}): Promise<DomainSummary> {
    const validated = validateDomainSelector(selector);
    const flags = validateFlags(options.flags);
    if (flags !== 0) {
      return (await this.#request("domain.destroy-flags", [validated.kind, validated.value, String(flags)], options)) as DomainSummary;
    }
    if (validated.kind === "uuid") {
      return (await this.#request("destroy-domain-by-uuid", validated.value, options)) as DomainSummary;
    }

    return (await this.#request("destroy-domain-by-name", validated.value, options)) as DomainSummary;
  }

  async rebootDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary> {
    const validated = validateDomainSelector(selector);
    if (validated.kind === "uuid") {
      return (await this.#request("reboot-domain-by-uuid", validated.value, options)) as DomainSummary;
    }

    return (await this.#request("reboot-domain-by-name", validated.value, options)) as DomainSummary;
  }

  async getDomainInfo(selector: DomainSelector, options?: OperationOptions): Promise<DomainInfo> {
    return (await this.#request("domain.info", selectorArguments(selector), options)) as DomainInfo;
  }

  async suspendDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary> {
    return (await this.#request("domain.suspend", selectorArguments(selector), options)) as DomainSummary;
  }

  async resumeDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary> {
    return (await this.#request("domain.resume", selectorArguments(selector), options)) as DomainSummary;
  }

  async resetDomain(selector: DomainSelector, options?: OperationOptions): Promise<DomainSummary> {
    return (await this.#request("domain.reset", selectorArguments(selector), options)) as DomainSummary;
  }

  async getDomainAutostart(selector: DomainSelector, options?: OperationOptions): Promise<boolean> {
    return (await this.#request("domain.autostart", selectorArguments(selector), options)) as boolean;
  }

  async setDomainAutostart(selector: DomainSelector, autostart: boolean, options?: OperationOptions): Promise<void> {
    await this.#request(
      "domain.set-autostart",
      [...selectorArguments(selector), String(autostart)],
      options,
    );
  }

  async isDomainActive(selector: DomainSelector, options?: OperationOptions): Promise<boolean> {
    return (await this.#request("domain.active", selectorArguments(selector), options)) as boolean;
  }

  async isDomainPersistent(selector: DomainSelector, options?: OperationOptions): Promise<boolean> {
    return (await this.#request("domain.persistent", selectorArguments(selector), options)) as boolean;
  }

  async getDomainOsType(selector: DomainSelector, options?: OperationOptions): Promise<string> {
    return (await this.#request("domain.os-type", selectorArguments(selector), options)) as string;
  }

  async getDomainHostname(selector: DomainSelector, options: FlagOperationOptions = {}): Promise<string> {
    return (await this.#request(
      "domain.hostname",
      [...selectorArguments(selector), String(validateFlags(options.flags))],
      options,
    )) as string;
  }

  async getDomainMaxMemory(selector: DomainSelector, options?: OperationOptions): Promise<UInt64String> {
    return (await this.#request("domain.max-memory", selectorArguments(selector), options)) as UInt64String;
  }

  async setDomainMemory(selector: DomainSelector, memoryKiB: number | bigint, options?: OperationOptions): Promise<void> {
    await this.#request(
      "domain.set-memory",
      [...selectorArguments(selector), encodeUInt64(memoryKiB, "memoryKiB")],
      options,
    );
  }

  async setDomainMaxMemory(selector: DomainSelector, memoryKiB: number | bigint, options?: OperationOptions): Promise<void> {
    await this.#request(
      "domain.set-max-memory",
      [...selectorArguments(selector), encodeUInt64(memoryKiB, "memoryKiB")],
      options,
    );
  }

  async getDomainMaxVcpus(selector: DomainSelector, options?: OperationOptions): Promise<number> {
    return (await this.#request("domain.max-vcpus", selectorArguments(selector), options)) as number;
  }

  async setDomainVcpus(selector: DomainSelector, vcpus: number, options?: OperationOptions): Promise<void> {
    await this.#request(
      "domain.set-vcpus",
      [...selectorArguments(selector), String(validateUnsigned(vcpus, "vcpus", 0xffff_ffff))],
      options,
    );
  }

  async createTransientDomain(xml: string, options: FlagOperationOptions = {}): Promise<DomainSummary> {
    return (await this.#request("domain.create-xml", [encodeXml(xml), String(validateFlags(options.flags))], options)) as DomainSummary;
  }

  async isDomainUpdated(selector: DomainSelector, options?: OperationOptions): Promise<boolean> {
    return (await this.#request("domain.updated", selectorArguments(selector), options)) as boolean;
  }

  async wakeupDomain(selector: DomainSelector, options: FlagOperationOptions = {}): Promise<DomainSummary> {
    return (await this.#request("domain.wakeup", [...selectorArguments(selector), String(validateFlags(options.flags))], options)) as DomainSummary;
  }

  async getDomainVcpusFlags(selector: DomainSelector, options: FlagOperationOptions = {}): Promise<number> {
    return (await this.#request("domain.vcpus-flags", [...selectorArguments(selector), String(validateFlags(options.flags))], options)) as number;
  }

  async setDomainVcpusFlags(selector: DomainSelector, vcpus: number, options: FlagOperationOptions = {}): Promise<void> {
    await this.#request("domain.set-vcpus-flags", [...selectorArguments(selector), String(validateUnsigned(vcpus, "vcpus", 0xffff_ffff)), String(validateFlags(options.flags))], options);
  }

  async getDomainTime(selector: DomainSelector, options: FlagOperationOptions = {}): Promise<DomainTime> {
    return (await this.#request("domain.time", [...selectorArguments(selector), String(validateFlags(options.flags))], options)) as DomainTime;
  }

  async setDomainTime(selector: DomainSelector, time: DomainTime, options: FlagOperationOptions = {}): Promise<void> {
    if (typeof time !== "object" || time === null || !/^-?\d+$/.test(time.seconds)) {
      throw new LibvirtAdapterError("INVALID_ARGUMENT", "domain time seconds must be a signed integer string");
    }
    const seconds = BigInt(time.seconds);
    if (seconds < -0x8000_0000_0000_0000n || seconds > 0x7fff_ffff_ffff_ffffn) {
      throw new LibvirtAdapterError("INVALID_ARGUMENT", "domain time seconds must fit in i64");
    }
    const nanoseconds = validateUnsigned(time.nanoseconds, "nanoseconds", 999_999_999);
    await this.#request("domain.set-time", [...selectorArguments(selector), seconds.toString(), String(nanoseconds), String(validateFlags(options.flags))], options);
  }

  async getDomainBlockInfo(selector: DomainSelector, disk: string, options: FlagOperationOptions = {}): Promise<DomainBlockInfo> {
    return (await this.#request("domain.block-info", [...selectorArguments(selector), validateProtocolString(disk, "disk"), String(validateFlags(options.flags))], options)) as DomainBlockInfo;
  }

  async getDomainBlockStats(selector: DomainSelector, disk: string, options?: OperationOptions): Promise<DomainBlockStats> {
    return (await this.#request("domain.block-stats", [...selectorArguments(selector), validateProtocolString(disk, "disk")], options)) as DomainBlockStats;
  }

  async resizeDomainBlock(selector: DomainSelector, disk: string, size: number | bigint, options: FlagOperationOptions = {}): Promise<void> {
    await this.#request("domain.block-resize", [...selectorArguments(selector), validateProtocolString(disk, "disk"), encodeUInt64(size, "size"), String(validateFlags(options.flags))], options);
  }

  async getDomainInterfaceStats(selector: DomainSelector, path: string, options?: OperationOptions): Promise<DomainInterfaceStats> {
    return (await this.#request("domain.interface-stats", [...selectorArguments(selector), validateProtocolString(path, "interface path")], options)) as DomainInterfaceStats;
  }

  async getDomainMemoryStats(selector: DomainSelector, options: FlagOperationOptions = {}): Promise<DomainMemoryStat[]> {
    return (await this.#request("domain.memory-stats", [...selectorArguments(selector), String(validateFlags(options.flags))], options)) as DomainMemoryStat[];
  }

  async getDomainInterfaceAddresses(selector: DomainSelector, source: number, options: FlagOperationOptions = {}): Promise<DomainInterfaceAddress[]> {
    return (await this.#request("domain.interface-addresses", [...selectorArguments(selector), String(validateUnsigned(source, "interface address source", 0xffff_ffff)), String(validateFlags(options.flags))], options)) as DomainInterfaceAddress[];
  }

  async getDomainMemoryParameters(selector: DomainSelector, options: FlagOperationOptions = {}): Promise<DomainMemoryParameters> {
    return (await this.#request("domain.memory-parameters", [...selectorArguments(selector), String(validateFlags(options.flags))], options)) as DomainMemoryParameters;
  }

  async setDomainMemoryParameters(selector: DomainSelector, parameters: DomainMemoryParameters, options: FlagOperationOptions = {}): Promise<void> {
    if (typeof parameters !== "object" || parameters === null) {
      throw new LibvirtAdapterError("INVALID_ARGUMENT", "memory parameters must be an object");
    }
    await this.#request("domain.set-memory-parameters", [
      ...selectorArguments(selector),
      validateOptionalUInt64String(parameters.hardLimit, "hardLimit"),
      validateOptionalUInt64String(parameters.softLimit, "softLimit"),
      validateOptionalUInt64String(parameters.minimumGuarantee, "minimumGuarantee"),
      validateOptionalUInt64String(parameters.swapHardLimit, "swapHardLimit"),
      String(validateFlags(options.flags)),
    ], options);
  }

  async getDomainNumaParameters(selector: DomainSelector, options: FlagOperationOptions = {}): Promise<DomainNumaParameters> {
    return (await this.#request("domain.numa-parameters", [...selectorArguments(selector), String(validateFlags(options.flags))], options)) as DomainNumaParameters;
  }

  async setDomainNumaParameters(selector: DomainSelector, parameters: DomainNumaParameters, options: FlagOperationOptions = {}): Promise<void> {
    if (typeof parameters !== "object" || parameters === null) {
      throw new LibvirtAdapterError("INVALID_ARGUMENT", "NUMA parameters must be an object");
    }
    const mode = parameters.mode === undefined || parameters.mode === null
      ? ""
      : String(validateSignedInteger(parameters.mode, "NUMA mode"));
    await this.#request("domain.set-numa-parameters", [
      ...selectorArguments(selector),
      parameters.nodeSet === undefined || parameters.nodeSet === null
        ? ""
        : validateProtocolString(parameters.nodeSet, "NUMA nodeSet", true),
      mode,
      String(validateFlags(options.flags)),
    ], options);
  }

  async pinDomainVcpu(selector: DomainSelector, vcpu: number, cpuMap: Uint8Array, options: FlagOperationOptions = {}): Promise<void> {
    await this.#request("domain.pin-vcpu", [...selectorArguments(selector), String(validateUnsigned(vcpu, "vcpu", 0xffff_ffff)), encodeBytes(cpuMap, "cpuMap"), String(validateFlags(options.flags))], options);
  }

  async pinDomainEmulator(selector: DomainSelector, cpuMap: Uint8Array, options: FlagOperationOptions = {}): Promise<void> {
    await this.#request("domain.pin-emulator", [...selectorArguments(selector), encodeBytes(cpuMap, "cpuMap"), String(validateFlags(options.flags))], options);
  }

  async sendDomainKey(selector: DomainSelector, codeSet: number, holdTimeMs: number, keycodes: readonly number[], options: FlagOperationOptions = {}): Promise<void> {
    if (!Array.isArray(keycodes) || keycodes.length === 0) {
      throw new LibvirtAdapterError("INVALID_ARGUMENT", "keycodes must be a non-empty array");
    }
    const encodedKeycodes = keycodes.map((value) => validateUnsigned(value, "keycode", 0xffff_ffff));
    await this.#request("domain.send-key", [...selectorArguments(selector), String(validateUnsigned(codeSet, "key code set", 0xffff_ffff)), String(validateUnsigned(holdTimeMs, "holdTimeMs", 0xffff_ffff)), encodedKeycodes.join(","), String(validateFlags(options.flags))], options);
  }

  async getDomainSchedulerParameters(selector: DomainSelector, options: FlagOperationOptions = {}): Promise<DomainSchedulerParameters> {
    return (await this.#request("domain.scheduler", [...selectorArguments(selector), String(validateFlags(options.flags))], options)) as DomainSchedulerParameters;
  }

  async setDomainSchedulerParameters(selector: DomainSelector, parameters: DomainSchedulerParameters, options: FlagOperationOptions = {}): Promise<void> {
    if (typeof parameters !== "object" || parameters === null) {
      throw new LibvirtAdapterError("INVALID_ARGUMENT", "scheduler parameters must be an object");
    }
    const optionalU32 = (value: number | null | undefined, label: string) =>
      value === undefined || value === null ? "" : String(validateUnsigned(value, label, 0xffff_ffff));
    const optionalI32 = (value: number | null | undefined, label: string) =>
      value === undefined || value === null ? "" : String(validateSignedInteger(value, label));
    await this.#request("domain.set-scheduler", [
      ...selectorArguments(selector),
      validateProtocolString(parameters.schedulerType, "schedulerType"),
      validateOptionalUInt64String(parameters.cpuShares, "cpuShares"),
      validateOptionalUInt64String(parameters.vcpu?.period, "vcpu.period"),
      validateOptionalInt64String(parameters.vcpu?.quota, "vcpu.quota"),
      validateOptionalUInt64String(parameters.emulator?.period, "emulator.period"),
      validateOptionalInt64String(parameters.emulator?.quota, "emulator.quota"),
      validateOptionalUInt64String(parameters.global?.period, "global.period"),
      validateOptionalInt64String(parameters.global?.quota, "global.quota"),
      validateOptionalUInt64String(parameters.ioThread?.period, "ioThread.period"),
      validateOptionalInt64String(parameters.ioThread?.quota, "ioThread.quota"),
      optionalU32(parameters.weight, "weight"),
      optionalU32(parameters.cap, "cap"),
      validateOptionalInt64String(parameters.reservation, "reservation"),
      validateOptionalInt64String(parameters.limit, "limit"),
      optionalI32(parameters.shares, "shares"),
      String(validateFlags(options.flags)),
    ], options);
  }

  async getDomainJobInfo(selector: DomainSelector, options?: OperationOptions): Promise<DomainJobStats> {
    return (await this.#request("domain.job-info", selectorArguments(selector), options)) as DomainJobStats;
  }

  async getDomainJobStats(selector: DomainSelector, options: FlagOperationOptions = {}): Promise<DomainJobStats> {
    return (await this.#request("domain.job-stats", [...selectorArguments(selector), String(validateFlags(options.flags))], options)) as DomainJobStats;
  }

  async attachDomainDevice(selector: DomainSelector, xml: string, options: FlagOperationOptions = {}): Promise<DomainSummary> {
    return (await this.#request("domain.attach-device", [...selectorArguments(selector), encodeXml(xml), String(validateFlags(options.flags))], options)) as DomainSummary;
  }

  async detachDomainDevice(selector: DomainSelector, xml: string, options: FlagOperationOptions = {}): Promise<DomainSummary> {
    return (await this.#request("domain.detach-device", [...selectorArguments(selector), encodeXml(xml), String(validateFlags(options.flags))], options)) as DomainSummary;
  }

  async updateDomainDevice(selector: DomainSelector, xml: string, options: FlagOperationOptions = {}): Promise<DomainSummary> {
    return (await this.#request("domain.update-device", [...selectorArguments(selector), encodeXml(xml), String(validateFlags(options.flags))], options)) as DomainSummary;
  }

  async managedSaveDomain(selector: DomainSelector, options: FlagOperationOptions = {}): Promise<void> {
    await this.#request("domain.managed-save", [...selectorArguments(selector), String(validateFlags(options.flags))], options);
  }

  async hasDomainManagedSave(selector: DomainSelector, options: FlagOperationOptions = {}): Promise<boolean> {
    return (await this.#request("domain.has-managed-save", [...selectorArguments(selector), String(validateFlags(options.flags))], options)) as boolean;
  }

  async removeDomainManagedSave(selector: DomainSelector, options: FlagOperationOptions = {}): Promise<void> {
    await this.#request("domain.remove-managed-save", [...selectorArguments(selector), String(validateFlags(options.flags))], options);
  }

  async coreDumpDomain(selector: DomainSelector, path: string, format = 0, options: FlagOperationOptions = {}): Promise<void> {
    await this.#request("domain.core-dump", [...selectorArguments(selector), validateProtocolString(path, "core dump path"), String(validateUnsigned(format, "core dump format", 0xffff_ffff)), String(validateFlags(options.flags))], options);
  }

  async getDomainMetadata(selector: DomainSelector, kind: number, options: DomainMetadataOptions = {}): Promise<string> {
    return (await this.#request("domain.metadata", [...selectorArguments(selector), String(validateSignedInteger(kind, "metadata kind")), validateOptionalProtocolString(options.uri, "metadata uri"), String(validateFlags(options.flags))], options)) as string;
  }

  async setDomainMetadata(selector: DomainSelector, kind: number, metadata: string | null, options: SetDomainMetadataOptions = {}): Promise<void> {
    const encodedMetadata = metadata === null ? "" : encodeXml(metadata);
    await this.#request("domain.set-metadata", [...selectorArguments(selector), String(validateSignedInteger(kind, "metadata kind")), encodedMetadata, validateOptionalProtocolString(options.key, "metadata key"), validateOptionalProtocolString(options.uri, "metadata uri"), String(validateFlags(options.flags))], options);
  }

  async renameDomain(selector: DomainSelector, newName: string, options: FlagOperationOptions = {}): Promise<DomainSummary> {
    return (await this.#request("domain.rename", [...selectorArguments(selector), validateProtocolString(newName, "new domain name"), String(validateFlags(options.flags))], options)) as DomainSummary;
  }

  async setDomainUserPassword(selector: DomainSelector, user: string, password: string, options: FlagOperationOptions = {}): Promise<void> {
    await this.#request("domain.set-user-password", [...selectorArguments(selector), validateProtocolString(user, "user"), validateProtocolString(password, "password", true), String(validateFlags(options.flags))], options);
  }

  async qemuMonitorCommand(selector: DomainSelector, command: string, options: FlagOperationOptions = {}): Promise<string> {
    return (await this.#request("domain.qemu-monitor", [...selectorArguments(selector), encodeXml(command), String(validateFlags(options.flags))], options)) as string;
  }

  async qemuAgentCommand(selector: DomainSelector, command: string, timeout = 0, options: FlagOperationOptions = {}): Promise<string> {
    return (await this.#request("domain.qemu-agent", [...selectorArguments(selector), encodeXml(command), String(validateSignedInteger(timeout, "QEMU agent timeout")), String(validateFlags(options.flags))], options)) as string;
  }

  async restoreDomain(path: string, xml?: string, options: FlagOperationOptions = {}): Promise<void> {
    await this.#request("domain.restore", [validateProtocolString(path, "save image path"), xml === undefined ? "" : encodeXml(xml), String(validateFlags(options.flags))], options);
  }

  async getDomainSaveImageXml(path: string, options: FlagOperationOptions = {}): Promise<string> {
    return (await this.#request("domain.save-image-xml", [validateProtocolString(path, "save image path"), String(validateFlags(options.flags))], options)) as string;
  }

  async setDomainSaveImageXml(path: string, xml: string, options: FlagOperationOptions = {}): Promise<void> {
    await this.#request("domain.set-save-image-xml", [validateProtocolString(path, "save image path"), encodeXml(xml), String(validateFlags(options.flags))], options);
  }

  async migrateDomainToUri(selector: DomainSelector, destinationUri: string, options: DomainMigrationOptions = {}): Promise<void> {
    await this.#request("domain.migrate-uri", [
      ...selectorArguments(selector),
      validateProtocolString(destinationUri, "destination URI"),
      validateOptionalProtocolString(options.migrationUri, "migration URI"),
      options.destinationXml === undefined ? "" : encodeXml(options.destinationXml),
      validateOptionalProtocolString(options.destinationName, "destination name"),
      encodeUInt64(options.bandwidth ?? 0, "migration bandwidth"),
      String(validateFlags(options.flags)),
    ], options);
  }

  async migrateDomainToConnection(
    selector: DomainSelector,
    destinationUri: string,
    options: DomainMigrationOptions = {},
  ): Promise<DomainSummary> {
    return (await this.#request("domain.migrate-connect", [
      ...selectorArguments(selector),
      validateProtocolString(destinationUri, "destination connection URI"),
      validateOptionalProtocolString(options.destinationName, "destination domain name"),
      validateOptionalProtocolString(options.migrationUri, "migration URI"),
      encodeUInt64(options.bandwidth ?? 0, "migration bandwidth"),
      String(validateFlags(options.flags)),
    ], options)) as DomainSummary;
  }

  async screenshotDomain(
    selector: DomainSelector,
    options: DomainScreenshotOptions = {},
  ): Promise<LibvirtBinaryStream> {
    return this.#binary.open(
      BINARY_OPEN_SCREENSHOT,
      [
        ...selectorArguments(selector),
        String(validateUnsigned(options.screen ?? 0, "screen", 0xffff_ffff)),
        String(validateFlags(options.flags)),
      ],
      { readable: true, writable: false },
      options,
    );
  }

  async openDomainConsole(
    selector: DomainSelector,
    options: DomainStreamOptions = {},
  ): Promise<LibvirtBinaryStream> {
    return this.#openDomainStream(BINARY_OPEN_CONSOLE, selector, options);
  }

  async openDomainChannel(
    selector: DomainSelector,
    options: DomainStreamOptions = {},
  ): Promise<LibvirtBinaryStream> {
    return this.#openDomainStream(BINARY_OPEN_CHANNEL, selector, options);
  }

  async openDomainGraphics(
    selector: DomainSelector,
    options: DomainGraphicsOptions = {},
  ): Promise<LibvirtBinaryStream> {
    return this.#binary.open(
      BINARY_OPEN_GRAPHICS,
      [
        ...selectorArguments(selector),
        String(validateUnsigned(options.index ?? 0, "graphics index", 0xffff_ffff)),
        String(validateFlags(options.flags)),
      ],
      { readable: true, writable: true },
      options,
    );
  }

  async getCapabilities(options?: OperationOptions): Promise<string> {
    return (await this.#request("connect.capabilities", undefined, options)) as string;
  }

  async getConnectionHostname(options?: OperationOptions): Promise<string> {
    return (await this.#request("connect.hostname", undefined, options)) as string;
  }

  async getLibvirtVersion(options?: OperationOptions): Promise<number> {
    return (await this.#request("connect.lib-version", undefined, options)) as number;
  }

  async getHypervisorVersion(options?: OperationOptions): Promise<number> {
    return (await this.#request("connect.hypervisor-version", undefined, options)) as number;
  }

  async getSystemInfo(options: FlagOperationOptions = {}): Promise<string> {
    return (await this.#request("connect.sys-info", [String(validateFlags(options.flags))], options)) as string;
  }

  async isConnectionSecure(options?: OperationOptions): Promise<boolean> {
    return (await this.#request("connect.secure", undefined, options)) as boolean;
  }

  async isConnectionEncrypted(options?: OperationOptions): Promise<boolean> {
    return (await this.#request("connect.encrypted", undefined, options)) as boolean;
  }

  async getFreeMemory(options?: OperationOptions): Promise<UInt64String> {
    return (await this.#request("connect.free-memory", undefined, options)) as UInt64String;
  }

  async getMaxVcpus(domainType = "", options?: OperationOptions): Promise<number> {
    return (await this.#request("connect.max-vcpus", [validateProtocolString(domainType, "domainType", true)], options)) as number;
  }

  async getNodeInfo(options?: OperationOptions): Promise<NodeInfo> {
    return (await this.#request("connect.node-info", undefined, options)) as NodeInfo;
  }

  async getCpuModels(architecture: string, options: FlagOperationOptions = {}): Promise<string[]> {
    return (await this.#request("connect.cpu-models", [validateProtocolString(architecture, "architecture"), String(validateFlags(options.flags))], options)) as string[];
  }

  async compareCpu(xml: string, options: FlagOperationOptions = {}): Promise<number> {
    return (await this.#request("connect.compare-cpu", [encodeXml(xml), String(validateFlags(options.flags))], options)) as number;
  }

  async baselineCpu(xmlCpus: readonly string[], options: FlagOperationOptions = {}): Promise<string> {
    if (!Array.isArray(xmlCpus) || xmlCpus.length === 0) {
      throw new LibvirtAdapterError("INVALID_ARGUMENT", "xmlCpus must be a non-empty array");
    }
    return (await this.#request("connect.baseline-cpu", [...xmlCpus.map(encodeXml), String(validateFlags(options.flags))], options)) as string;
  }

  async getDomainCapabilities(options: DomainCapabilitiesOptions = {}): Promise<string> {
    return (await this.#request("connect.domain-capabilities", [
      validateOptionalProtocolString(options.emulator, "emulator"),
      validateOptionalProtocolString(options.architecture, "architecture"),
      validateOptionalProtocolString(options.machine, "machine"),
      validateOptionalProtocolString(options.virtualizationType, "virtualizationType"),
      String(validateFlags(options.flags)),
    ], options)) as string;
  }

  async domainXmlFromNative(format: string, config: string, options: FlagOperationOptions = {}): Promise<string> {
    return (await this.#request("connect.xml-from-native", [validateProtocolString(format, "native format"), encodeXml(config), String(validateFlags(options.flags))], options)) as string;
  }

  async domainXmlToNative(format: string, xml: string, options: FlagOperationOptions = {}): Promise<string> {
    return (await this.#request("connect.xml-to-native", [validateProtocolString(format, "native format"), encodeXml(xml), String(validateFlags(options.flags))], options)) as string;
  }

  async setConnectionKeepalive(interval: number, count: number, options?: OperationOptions): Promise<number> {
    return (await this.#request("connect.keepalive", [String(validateSignedInteger(interval, "keepalive interval")), String(validateUnsigned(count, "keepalive count", 0xffff_ffff))], options)) as number;
  }

  async getCellsFreeMemory(startCell: number, maxCells: number, options?: OperationOptions): Promise<UInt64String[]> {
    return (await this.#request("connect.cells-free-memory", [String(validateUnsigned(startCell, "startCell", 0x7fff_ffff)), String(validatePositiveUnsigned(maxCells, "maxCells", 0x7fff_ffff))], options)) as UInt64String[];
  }

  async getFreePages(pageSizesKiB: readonly number[], startCell: number, cellCount: number, options: FlagOperationOptions = {}): Promise<UInt64String[]> {
    if (!Array.isArray(pageSizesKiB) || pageSizesKiB.length === 0) {
      throw new LibvirtAdapterError("INVALID_ARGUMENT", "pageSizesKiB must be a non-empty array");
    }
    const pages = pageSizesKiB.map((value) => validateUnsigned(value, "page size", 0xffff_ffff));
    return (await this.#request("connect.free-pages", [pages.join(","), String(validateUnsigned(startCell, "startCell", 0xffff_ffff)), String(validateUnsigned(cellCount, "cellCount", 0xffff_ffff)), String(validateFlags(options.flags))], options)) as UInt64String[];
  }

  async findStoragePoolSources(kind: string, spec?: string, options: FlagOperationOptions = {}): Promise<string> {
    return (await this.#request("connect.storage-pool-sources", [validateProtocolString(kind, "storage pool kind"), spec === undefined ? "" : encodeXml(spec), String(validateFlags(options.flags))], options)) as string;
  }

  async listNetworks(options?: OperationOptions): Promise<NetworkSummary[]> {
    return (await this.#request("network.list", undefined, options)) as NetworkSummary[];
  }

  async getNetwork(selector: NetworkSelector, options?: OperationOptions): Promise<NetworkSummary> {
    return (await this.#request("network.get", networkSelectorArguments(selector), options)) as NetworkSummary;
  }

  async getNetworkXml(selector: NetworkSelector, options: FlagOperationOptions = {}): Promise<string> {
    return (await this.#request("network.xml", [...networkSelectorArguments(selector), String(validateFlags(options.flags))], options)) as string;
  }

  async defineNetwork(xml: string, options?: OperationOptions): Promise<NetworkSummary> {
    return (await this.#request("network.define", [encodeXml(xml)], options)) as NetworkSummary;
  }

  async createNetwork(xml: string, options?: OperationOptions): Promise<NetworkSummary> {
    return (await this.#request("network.create-xml", [encodeXml(xml)], options)) as NetworkSummary;
  }

  async startNetwork(selector: NetworkSelector, options?: OperationOptions): Promise<NetworkSummary> {
    return (await this.#request("network.start", networkSelectorArguments(selector), options)) as NetworkSummary;
  }

  async destroyNetwork(selector: NetworkSelector, options?: OperationOptions): Promise<void> {
    await this.#request("network.destroy", networkSelectorArguments(selector), options);
  }

  async undefineNetwork(selector: NetworkSelector, options?: OperationOptions): Promise<void> {
    await this.#request("network.undefine", networkSelectorArguments(selector), options);
  }

  async setNetworkAutostart(selector: NetworkSelector, autostart: boolean, options?: OperationOptions): Promise<void> {
    await this.#request("network.set-autostart", [...networkSelectorArguments(selector), String(autostart)], options);
  }

  async getNetworkBridgeName(selector: NetworkSelector, options?: OperationOptions): Promise<string> {
    return (await this.#request("network.bridge-name", networkSelectorArguments(selector), options)) as string;
  }

  async updateNetwork(selector: NetworkSelector, xml: string, options: NetworkUpdateOptions): Promise<void> {
    if (typeof options !== "object" || options === null) {
      throw new LibvirtAdapterError("INVALID_ARGUMENT", "network update options are required");
    }
    await this.#request("network.update", [
      ...networkSelectorArguments(selector),
      String(validateUnsigned(options.command, "network update command", 0xffff_ffff)),
      String(validateUnsigned(options.section, "network update section", 0xffff_ffff)),
      String(validateSignedInteger(options.index ?? -1, "network update index")),
      encodeXml(xml),
      String(validateFlags(options.flags)),
    ], options);
  }

  async listInterfaces(options?: OperationOptions): Promise<InterfaceSummary[]> {
    return (await this.#request("interface.list", undefined, options)) as InterfaceSummary[];
  }

  async getInterface(selector: InterfaceSelector, options?: OperationOptions): Promise<InterfaceSummary> {
    return (await this.#request("interface.get", interfaceSelectorArguments(selector), options)) as InterfaceSummary;
  }

  async getInterfaceXml(selector: InterfaceSelector, options: FlagOperationOptions = {}): Promise<string> {
    return (await this.#request("interface.xml", [...interfaceSelectorArguments(selector), String(validateFlags(options.flags))], options)) as string;
  }

  async defineInterface(xml: string, options: FlagOperationOptions = {}): Promise<InterfaceSummary> {
    return (await this.#request("interface.define", [encodeXml(xml), String(validateFlags(options.flags))], options)) as InterfaceSummary;
  }

  async startInterface(selector: InterfaceSelector, options: FlagOperationOptions = {}): Promise<InterfaceSummary> {
    return (await this.#request("interface.start", [...interfaceSelectorArguments(selector), String(validateFlags(options.flags))], options)) as InterfaceSummary;
  }

  async destroyInterface(selector: InterfaceSelector, options: FlagOperationOptions = {}): Promise<InterfaceSummary> {
    return (await this.#request("interface.destroy", [...interfaceSelectorArguments(selector), String(validateFlags(options.flags))], options)) as InterfaceSummary;
  }

  async undefineInterface(selector: InterfaceSelector, options?: OperationOptions): Promise<void> {
    await this.#request("interface.undefine", interfaceSelectorArguments(selector), options);
  }

  async listStoragePools(options?: OperationOptions): Promise<StoragePoolSummary[]> {
    return (await this.#request("storage-pool.list", undefined, options)) as StoragePoolSummary[];
  }

  async getStoragePool(selector: StoragePoolSelector, options?: OperationOptions): Promise<StoragePoolSummary> {
    return (await this.#request("storage-pool.get", storagePoolSelectorArguments(selector), options)) as StoragePoolSummary;
  }

  async getStoragePoolXml(selector: StoragePoolSelector, options: FlagOperationOptions = {}): Promise<string> {
    return (await this.#request("storage-pool.xml", [...storagePoolSelectorArguments(selector), String(validateFlags(options.flags))], options)) as string;
  }

  async defineStoragePool(xml: string, options: FlagOperationOptions = {}): Promise<StoragePoolSummary> {
    return (await this.#request("storage-pool.define", [encodeXml(xml), String(validateFlags(options.flags))], options)) as StoragePoolSummary;
  }

  async createStoragePool(xml: string, options: FlagOperationOptions = {}): Promise<StoragePoolSummary> {
    return (await this.#request("storage-pool.create-xml", [encodeXml(xml), String(validateFlags(options.flags))], options)) as StoragePoolSummary;
  }

  async startStoragePool(selector: StoragePoolSelector, options: FlagOperationOptions = {}): Promise<StoragePoolSummary> {
    return (await this.#request("storage-pool.start", [...storagePoolSelectorArguments(selector), String(validateFlags(options.flags))], options)) as StoragePoolSummary;
  }

  async buildStoragePool(selector: StoragePoolSelector, options: FlagOperationOptions = {}): Promise<StoragePoolSummary> {
    return (await this.#request("storage-pool.build", [...storagePoolSelectorArguments(selector), String(validateFlags(options.flags))], options)) as StoragePoolSummary;
  }

  async refreshStoragePool(selector: StoragePoolSelector, options: FlagOperationOptions = {}): Promise<StoragePoolSummary> {
    return (await this.#request("storage-pool.refresh", [...storagePoolSelectorArguments(selector), String(validateFlags(options.flags))], options)) as StoragePoolSummary;
  }

  async destroyStoragePool(selector: StoragePoolSelector, options?: OperationOptions): Promise<void> {
    await this.#request("storage-pool.destroy", storagePoolSelectorArguments(selector), options);
  }

  async deleteStoragePool(selector: StoragePoolSelector, options: FlagOperationOptions = {}): Promise<void> {
    await this.#request("storage-pool.delete", [...storagePoolSelectorArguments(selector), String(validateFlags(options.flags))], options);
  }

  async undefineStoragePool(selector: StoragePoolSelector, options?: OperationOptions): Promise<void> {
    await this.#request("storage-pool.undefine", storagePoolSelectorArguments(selector), options);
  }

  async setStoragePoolAutostart(selector: StoragePoolSelector, autostart: boolean, options?: OperationOptions): Promise<void> {
    await this.#request("storage-pool.set-autostart", [...storagePoolSelectorArguments(selector), String(autostart)], options);
  }

  async listStorageVolumes(selector: StoragePoolSelector, options?: OperationOptions): Promise<StorageVolumeSummary[]> {
    return (await this.#request("storage-pool.volumes", storagePoolSelectorArguments(selector), options)) as StorageVolumeSummary[];
  }

  async getStoragePoolByVolume(selector: StorageVolumeSelector, options?: OperationOptions): Promise<StoragePoolSummary> {
    return (await this.#request("storage-pool.by-volume", storageVolumeSelectorArguments(selector), options)) as StoragePoolSummary;
  }

  async getStorageVolume(selector: StorageVolumeSelector, options?: OperationOptions): Promise<StorageVolumeSummary> {
    return (await this.#request("storage-vol.get", storageVolumeSelectorArguments(selector), options)) as StorageVolumeSummary;
  }

  async getStorageVolumeXml(selector: StorageVolumeSelector, options: FlagOperationOptions = {}): Promise<string> {
    return (await this.#request("storage-vol.xml", [...storageVolumeSelectorArguments(selector), String(validateFlags(options.flags))], options)) as string;
  }

  async createStorageVolume(pool: StoragePoolSelector, xml: string, options: FlagOperationOptions = {}): Promise<StorageVolumeSummary> {
    return (await this.#request("storage-vol.create", [...storagePoolSelectorArguments(pool), encodeXml(xml), String(validateFlags(options.flags))], options)) as StorageVolumeSummary;
  }

  async deleteStorageVolume(selector: StorageVolumeSelector, options: FlagOperationOptions = {}): Promise<void> {
    await this.#request("storage-vol.delete", [...storageVolumeSelectorArguments(selector), String(validateFlags(options.flags))], options);
  }

  async wipeStorageVolume(selector: StorageVolumeSelector, options: FlagOperationOptions = {}): Promise<void> {
    await this.#request("storage-vol.wipe", [...storageVolumeSelectorArguments(selector), String(validateFlags(options.flags))], options);
  }

  async resizeStorageVolume(selector: StorageVolumeSelector, capacity: number | bigint, options: FlagOperationOptions = {}): Promise<void> {
    await this.#request("storage-vol.resize", [...storageVolumeSelectorArguments(selector), encodeUInt64(capacity, "capacity"), String(validateFlags(options.flags))], options);
  }

  async getStorageVolumeByName(pool: StoragePoolSelector, name: string, options?: OperationOptions): Promise<StorageVolumeSummary> {
    return (await this.#request("storage-vol.by-name", [...storagePoolSelectorArguments(pool), validateProtocolString(name, "storage volume name")], options)) as StorageVolumeSummary;
  }

  async cloneStorageVolume(pool: StoragePoolSelector, xml: string, source: StorageVolumeSelector, options: FlagOperationOptions = {}): Promise<StorageVolumeSummary> {
    return (await this.#request("storage-vol.clone", [...storagePoolSelectorArguments(pool), encodeXml(xml), ...storageVolumeSelectorArguments(source), String(validateFlags(options.flags))], options)) as StorageVolumeSummary;
  }

  async wipeStorageVolumePattern(selector: StorageVolumeSelector, algorithm: number, options: FlagOperationOptions = {}): Promise<void> {
    await this.#request("storage-vol.wipe-pattern", [...storageVolumeSelectorArguments(selector), String(validateUnsigned(algorithm, "wipe algorithm", 0xffff_ffff)), String(validateFlags(options.flags))], options);
  }

  async downloadStorageVolume(
    selector: StorageVolumeSelector,
    options: StorageVolumeTransferOptions = {},
  ): Promise<LibvirtBinaryStream> {
    return this.#openStorageVolumeStream(
      BINARY_OPEN_VOLUME_DOWNLOAD,
      selector,
      options,
      { readable: true, writable: false },
    );
  }

  async uploadStorageVolume(
    selector: StorageVolumeSelector,
    options: StorageVolumeTransferOptions = {},
  ): Promise<LibvirtBinaryStream> {
    return this.#openStorageVolumeStream(
      BINARY_OPEN_VOLUME_UPLOAD,
      selector,
      options,
      { readable: false, writable: true },
    );
  }

  async listNodeDevices(options?: OperationOptions): Promise<NodeDeviceSummary[]> {
    return (await this.#request("node-device.list", undefined, options)) as NodeDeviceSummary[];
  }

  async getNodeDevice(name: string, options?: OperationOptions): Promise<NodeDeviceSummary> {
    return (await this.#request("node-device.get", [validateProtocolString(name, "node device name")], options)) as NodeDeviceSummary;
  }

  async getNodeDeviceXml(name: string, options: FlagOperationOptions = {}): Promise<string> {
    return (await this.#request("node-device.xml", [validateProtocolString(name, "node device name"), String(validateFlags(options.flags))], options)) as string;
  }

  async createNodeDevice(xml: string, options: FlagOperationOptions = {}): Promise<NodeDeviceSummary> {
    return (await this.#request("node-device.create", [encodeXml(xml), String(validateFlags(options.flags))], options)) as NodeDeviceSummary;
  }

  async destroyNodeDevice(name: string, options?: OperationOptions): Promise<void> {
    await this.#request("node-device.destroy", [validateProtocolString(name, "node device name")], options);
  }

  async detachNodeDevice(name: string, options?: OperationOptions): Promise<NodeDeviceSummary> {
    return (await this.#request("node-device.detach", [validateProtocolString(name, "node device name")], options)) as NodeDeviceSummary;
  }

  async resetNodeDevice(name: string, options?: OperationOptions): Promise<NodeDeviceSummary> {
    return (await this.#request("node-device.reset", [validateProtocolString(name, "node device name")], options)) as NodeDeviceSummary;
  }

  async reattachNodeDevice(name: string, options?: OperationOptions): Promise<NodeDeviceSummary> {
    return (await this.#request("node-device.reattach", [validateProtocolString(name, "node device name")], options)) as NodeDeviceSummary;
  }

  async getScsiHostNodeDevice(wwnn: string, wwpn: string, options: FlagOperationOptions = {}): Promise<NodeDeviceSummary> {
    return (await this.#request("node-device.scsi-host", [validateProtocolString(wwnn, "WWNN"), validateProtocolString(wwpn, "WWPN"), String(validateFlags(options.flags))], options)) as NodeDeviceSummary;
  }

  async detachNodeDeviceFlags(name: string, driver?: string, options: FlagOperationOptions = {}): Promise<NodeDeviceSummary> {
    return (await this.#request("node-device.detach-flags", [validateProtocolString(name, "node device name"), validateOptionalProtocolString(driver, "node device driver"), String(validateFlags(options.flags))], options)) as NodeDeviceSummary;
  }

  async countNodeDevices(capability?: string, options: FlagOperationOptions = {}): Promise<number> {
    return (await this.#request("node-device.count", [validateOptionalProtocolString(capability, "node device capability"), String(validateFlags(options.flags))], options)) as number;
  }

  async listNetworkFilters(options?: OperationOptions): Promise<NetworkFilterSummary[]> {
    return (await this.#request("nwfilter.list", undefined, options)) as NetworkFilterSummary[];
  }

  async getNetworkFilter(selector: NetworkFilterSelector, options?: OperationOptions): Promise<NetworkFilterSummary> {
    return (await this.#request("nwfilter.get", networkFilterSelectorArguments(selector), options)) as NetworkFilterSummary;
  }

  async getNetworkFilterXml(selector: NetworkFilterSelector, options: FlagOperationOptions = {}): Promise<string> {
    return (await this.#request("nwfilter.xml", [...networkFilterSelectorArguments(selector), String(validateFlags(options.flags))], options)) as string;
  }

  async defineNetworkFilter(xml: string, options?: OperationOptions): Promise<NetworkFilterSummary> {
    return (await this.#request("nwfilter.define", [encodeXml(xml)], options)) as NetworkFilterSummary;
  }

  async undefineNetworkFilter(selector: NetworkFilterSelector, options?: OperationOptions): Promise<void> {
    await this.#request("nwfilter.undefine", networkFilterSelectorArguments(selector), options);
  }

  async listSecrets(options?: OperationOptions): Promise<SecretSummary[]> {
    return (await this.#request("secret.list", undefined, options)) as SecretSummary[];
  }

  async getSecret(selector: SecretSelector, options?: OperationOptions): Promise<SecretSummary> {
    return (await this.#request("secret.get", secretSelectorArguments(selector), options)) as SecretSummary;
  }

  async getSecretXml(selector: SecretSelector, options: FlagOperationOptions = {}): Promise<string> {
    return (await this.#request("secret.xml", [...secretSelectorArguments(selector), String(validateFlags(options.flags))], options)) as string;
  }

  async defineSecret(xml: string, options: FlagOperationOptions = {}): Promise<SecretSummary> {
    return (await this.#request("secret.define", [encodeXml(xml), String(validateFlags(options.flags))], options)) as SecretSummary;
  }

  async getSecretValue(selector: SecretSelector, options: FlagOperationOptions = {}): Promise<Uint8Array> {
    const encoded = (await this.#request("secret.value", [...secretSelectorArguments(selector), String(validateFlags(options.flags))], options)) as string;
    return Uint8Array.from(Buffer.from(encoded, "hex"));
  }

  async setSecretValue(selector: SecretSelector, value: Uint8Array, options: FlagOperationOptions = {}): Promise<void> {
    if (!(value instanceof Uint8Array)) {
      throw new LibvirtAdapterError("INVALID_ARGUMENT", "secret value must be a Uint8Array");
    }
    await this.#request(
      "secret.set-value",
      [...secretSelectorArguments(selector), Buffer.from(value).toString("hex"), String(validateFlags(options.flags))],
      options,
    );
  }

  async undefineSecret(selector: SecretSelector, options?: OperationOptions): Promise<void> {
    await this.#request("secret.undefine", secretSelectorArguments(selector), options);
  }

  async listDomainSnapshots(domain: DomainSelector, options: FlagOperationOptions = {}): Promise<DomainSnapshotSummary[]> {
    return (await this.#request("snapshot.list", [...selectorArguments(domain), String(validateFlags(options.flags))], options)) as DomainSnapshotSummary[];
  }

  async getDomainSnapshot(domain: DomainSelector, name: string, options: FlagOperationOptions = {}): Promise<DomainSnapshotSummary> {
    const flags = validateFlags(options.flags);
    if (flags !== 0) {
      return (await this.#request("snapshot.get-flags", [...snapshotArguments(domain, name), String(flags)], options)) as DomainSnapshotSummary;
    }
    return (await this.#request("snapshot.get", snapshotArguments(domain, name), options)) as DomainSnapshotSummary;
  }

  async getDomainSnapshotXml(domain: DomainSelector, name: string, options: FlagOperationOptions = {}): Promise<string> {
    return (await this.#request("snapshot.xml", [...snapshotArguments(domain, name), String(validateFlags(options.flags))], options)) as string;
  }

  async createDomainSnapshot(domain: DomainSelector, xml: string, options: FlagOperationOptions = {}): Promise<DomainSnapshotSummary> {
    return (await this.#request("snapshot.create", [...selectorArguments(domain), encodeXml(xml), String(validateFlags(options.flags))], options)) as DomainSnapshotSummary;
  }

  async getCurrentDomainSnapshot(domain: DomainSelector, options: FlagOperationOptions = {}): Promise<DomainSnapshotSummary> {
    return (await this.#request("snapshot.current", [...selectorArguments(domain), String(validateFlags(options.flags))], options)) as DomainSnapshotSummary;
  }

  async revertDomainSnapshot(domain: DomainSelector, name: string, options: FlagOperationOptions = {}): Promise<DomainSnapshotSummary> {
    return (await this.#request("snapshot.revert", [...snapshotArguments(domain, name), String(validateFlags(options.flags))], options)) as DomainSnapshotSummary;
  }

  async deleteDomainSnapshot(domain: DomainSelector, name: string, options: FlagOperationOptions = {}): Promise<void> {
    await this.#request("snapshot.delete", [...snapshotArguments(domain, name), String(validateFlags(options.flags))], options);
  }

  async listDomainSnapshotChildren(domain: DomainSelector, name: string, options: FlagOperationOptions = {}): Promise<DomainSnapshotSummary[]> {
    return (await this.#request("snapshot.children", [...snapshotArguments(domain, name), String(validateFlags(options.flags))], options)) as DomainSnapshotSummary[];
  }

  async getDomainSnapshotParent(domain: DomainSelector, name: string, options: FlagOperationOptions = {}): Promise<DomainSnapshotSummary> {
    return (await this.#request("snapshot.parent", [...snapshotArguments(domain, name), String(validateFlags(options.flags))], options)) as DomainSnapshotSummary;
  }

  #openDomainStream(
    kind: number,
    selector: DomainSelector,
    options: DomainStreamOptions,
  ): Promise<LibvirtBinaryStream> {
    const device = options.device === undefined
      ? ""
      : Buffer.from(validateProtocolString(options.device, "stream device"), "utf8").toString("hex");
    return this.#binary.open(
      kind,
      [...selectorArguments(selector), device, String(validateFlags(options.flags))],
      { readable: true, writable: true },
      options,
    );
  }

  #openStorageVolumeStream(
    kind: number,
    selector: StorageVolumeSelector,
    options: StorageVolumeTransferOptions,
    capabilities: StreamCapabilities,
  ): Promise<LibvirtBinaryStream> {
    return this.#binary.open(
      kind,
      [
        ...storageVolumeSelectorArguments(selector),
        encodeUInt64(options.offset ?? 0, "offset"),
        encodeUInt64(options.length ?? 0, "length"),
        String(validateFlags(options.flags)),
      ],
      capabilities,
      options,
    );
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    await this.#request("close", undefined, undefined, false);
    this.#closed = true;
    this.#lines.close();
    this.#binary.close();
  }

  #request(
    operation: string,
    argument?: string | readonly string[],
    options: OperationOptions = {},
    useDefaultTimeout = true,
  ): Promise<unknown> {
    if (this.#closed) {
      return Promise.reject(
        new LibvirtAdapterError("CLOSED_CLIENT", "libvirt client is closed"),
      );
    }

    if (options.signal?.aborted) {
      return Promise.reject(
        new LibvirtAdapterError("CANCELLED", `libvirt operation ${operation} was cancelled`),
      );
    }

    const timeoutMs = validateTimeout(
      options.timeoutMs ?? (useDefaultTimeout ? this.#defaultTimeoutMs : undefined),
    );
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const onAbort = () => {
        if (!this.#pending.delete(id)) return;
        cleanup();
        reject(
          new LibvirtAdapterError(
            "CANCELLED",
            `libvirt operation ${operation} was cancelled`,
          ),
        );
      };
      const onTimeout = () => {
        if (!this.#pending.delete(id)) return;
        cleanup();
        reject(
          new LibvirtAdapterError(
            "TIMEOUT",
            `libvirt operation ${operation} timed out after ${timeoutMs} ms`,
          ),
        );
      };
      const cleanup = () => {
        options.signal?.removeEventListener("abort", onAbort);
        if (timeout !== undefined) clearTimeout(timeout);
      };
      const resolvePending = (value: unknown) => {
        cleanup();
        resolve(value);
      };
      const rejectPending = (error: Error) => {
        cleanup();
        reject(error);
      };

      options.signal?.addEventListener("abort", onAbort, { once: true });
      this.#pending.set(id, { resolve: resolvePending, reject: rejectPending });
      if (timeoutMs !== undefined) timeout = setTimeout(onTimeout, timeoutMs);
      const argumentsList = typeof argument === "string" ? [argument] : argument;
      const request = argumentsList === undefined
        ? `${id}\t${operation}\n`
        : `${id}\t${operation}\t${argumentsList.join("\t")}\n`;
      this.#child.stdin.write(request, (error) => {
        if (!error) return;
        if (!this.#pending.delete(id)) return;
        rejectPending(new LibvirtAdapterError("HOST_ERROR", error.message, { cause: error }));
      });
    });
  }

  #handleLine(line: string): void {
    let response: HostResponse;
    try {
      response = JSON.parse(line) as HostResponse;
    } catch {
      return;
    }

    if (typeof response.id !== "number") return;
    const pending = this.#pending.get(response.id);
    if (!pending) return;
    this.#pending.delete(response.id);

    if (response.ok) {
      pending.resolve(response.result);
    } else {
      const code = response.code === "NOT_FOUND" ||
        response.code === "CONFLICT" ||
        response.code === "INVALID_DEFINITION" ||
        response.code === "INVALID_ARGUMENT"
        ? response.code
        : "HOST_ERROR";
      pending.reject(new LibvirtAdapterError(code, response.error));
    }
  }
}

interface HostResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  code?: string;
  error: string;
}

/** Bridges synchronous `virt::ConnectAuth` requests to an async Node callback. */
class AuthTransport {
  readonly #pipe: Duplex;
  readonly #lines: ReadlineInterface;
  readonly #callback: LibvirtAuthenticationOptions["callback"];
  #queue: Promise<void> = Promise.resolve();
  #closed = false;
  failure: Error | undefined;

  constructor(pipe: Duplex, callback: LibvirtAuthenticationOptions["callback"]) {
    this.#pipe = pipe;
    this.#callback = callback;
    this.#lines = createInterface({ input: pipe });
    this.#lines.on("line", (line) => {
      this.#queue = this.#queue
        .then(() => this.#handleLine(line))
        .catch((error: unknown) => {
          this.failure ??= error instanceof Error ? error : new Error(String(error));
          if (!this.#pipe.destroyed) this.#pipe.destroy();
        });
    });
    pipe.once("error", (error) => {
      this.failure ??= error;
    });
  }

  /** Stops the initialization-only auth channel after `Connect::open_auth`. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#lines.close();
    if (!this.#pipe.destroyed) this.#pipe.destroy();
  }

  async #handleLine(line: string): Promise<void> {
    const fields = line.split("\t");
    const requestId = fields[0];
    if (requestId === undefined || !/^\d+$/.test(requestId) || (fields.length - 1) % 4 !== 0) {
      throw new Error("native host returned an invalid authentication request");
    }
    const credentials: LibvirtCredential[] = [];
    for (let index = 1; index < fields.length; index += 4) {
      const type = Number(fields[index]);
      if (!Number.isSafeInteger(type)) {
        throw new Error("native host returned an invalid credential type");
      }
      credentials.push({
        type,
        prompt: decodeAuthHex(fields[index + 1]),
        challenge: decodeAuthHex(fields[index + 2]),
        defaultResult: decodeAuthHex(fields[index + 3]),
      });
    }

    let results: readonly (string | null | undefined)[];
    try {
      results = await this.#callback(credentials);
      if (!Array.isArray(results) || results.length !== credentials.length) {
        throw new Error("authentication callback must return one result per credential");
      }
    } catch (error) {
      this.failure ??= error instanceof Error ? error : new Error(String(error));
      results = credentials.map(() => undefined);
    }

    const encoded = results.map((result) => {
      if (result === null || result === undefined) return "-";
      if (typeof result !== "string") {
        throw new Error("authentication callback results must be strings, null, or undefined");
      }
      return `+${Buffer.from(result, "utf8").toString("hex")}`;
    });
    await new Promise<void>((resolve, reject) => {
      this.#pipe.write(`${requestId}\t${encoded.join("\t")}\n`, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

/** Decodes one strict UTF-8 hex field from the private auth protocol. */
function decodeAuthHex(value: string): string {
  if (value.length % 2 !== 0 || !/^[\da-f]*$/i.test(value)) {
    throw new Error("native host returned invalid authentication text encoding");
  }
  return Buffer.from(value, "hex").toString("utf8");
}

const BINARY_MAGIC = Buffer.from("VST1", "ascii");
const BINARY_HEADER_SIZE = 16;
const BINARY_MAX_PAYLOAD_SIZE = 16 * 1024 * 1024;
const BINARY_DATA_CHUNK_SIZE = 64 * 1024;

const BINARY_OPEN_SCREENSHOT = 0x01;
const BINARY_OPEN_CONSOLE = 0x02;
const BINARY_OPEN_CHANNEL = 0x03;
const BINARY_OPEN_VOLUME_DOWNLOAD = 0x04;
const BINARY_OPEN_VOLUME_UPLOAD = 0x05;
const BINARY_OPEN_GRAPHICS = 0x06;
const BINARY_INPUT_DATA = 0x10;
const BINARY_INPUT_FINISH = 0x11;
const BINARY_INPUT_ABORT = 0x12;
const BINARY_OUTPUT_READY = 0x80;
const BINARY_OUTPUT_DATA = 0x81;
const BINARY_OUTPUT_END = 0x82;
const BINARY_OUTPUT_ERROR = 0x83;

interface StreamCapabilities {
  readable: boolean;
  writable: boolean;
}

interface BinarySession {
  stream: NativeLibvirtStream;
  ready: boolean;
  resolve(stream: LibvirtBinaryStream): void;
  reject(error: Error): void;
  cleanupOpening(): void;
}

/** Multiplexes all `virt::Stream` instances over the native host binary pipe. */
class BinaryTransport {
  readonly #pipe: Duplex;
  readonly #defaultTimeoutMs: number | undefined;
  readonly #sessions = new Map<number, BinarySession>();
  #buffer: Buffer = Buffer.alloc(0);
  #closed = false;
  #nextId = 1;

  constructor(pipe: Duplex, defaultTimeoutMs: number | undefined) {
    this.#pipe = pipe;
    this.#defaultTimeoutMs = defaultTimeoutMs;
    pipe.on("data", (chunk: Buffer) => this.#handleData(chunk));
    pipe.once("error", (error) => this.close(
      new LibvirtAdapterError("HOST_ERROR", "binary native host transport failed", { cause: error }),
    ));
    pipe.once("close", () => this.close());
  }

  /** Opens one high-level libvirt operation backed by a native `virt::Stream`. */
  open(
    kind: number,
    argumentsList: readonly string[],
    capabilities: StreamCapabilities,
    options: OperationOptions,
  ): Promise<LibvirtBinaryStream> {
    if (this.#closed) {
      return Promise.reject(new LibvirtAdapterError("CLOSED_CLIENT", "libvirt client is closed"));
    }
    if (options.signal?.aborted) {
      return Promise.reject(new LibvirtAdapterError("CANCELLED", "libvirt stream opening was cancelled"));
    }

    const timeoutMs = validateTimeout(options.timeoutMs ?? this.#defaultTimeoutMs);
    const id = this.#nextId++;
    const stream = new NativeLibvirtStream(this, id, capabilities);
    return new Promise((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const cleanupOpening = () => {
        options.signal?.removeEventListener("abort", onAbort);
        if (timeout !== undefined) clearTimeout(timeout);
      };
      const cancel = (error: LibvirtAdapterError) => {
        const session = this.#sessions.get(id);
        if (session === undefined || session.ready) return;
        this.#sessions.delete(id);
        cleanupOpening();
        stream.fail(error);
        void this.send(BINARY_INPUT_ABORT, id).catch(() => undefined);
        reject(error);
      };
      const onAbort = () => cancel(
        new LibvirtAdapterError("CANCELLED", "libvirt stream opening was cancelled"),
      );

      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (timeoutMs !== undefined) {
        timeout = setTimeout(() => cancel(
          new LibvirtAdapterError(
            "TIMEOUT",
            `libvirt stream opening timed out after ${timeoutMs} ms`,
          ),
        ), timeoutMs);
      }
      this.#sessions.set(id, { stream, ready: false, resolve, reject, cleanupOpening });
      void this.send(kind, id, Buffer.from(argumentsList.join("\t"), "utf8")).catch((error) => {
        cancel(new LibvirtAdapterError("HOST_ERROR", "failed to open libvirt stream", {
          cause: error,
        }));
      });
    });
  }

  /** Writes one framed command or data fragment to the native host. */
  send(kind: number, id: number, payload: Uint8Array = new Uint8Array()): Promise<void> {
    if (this.#closed) {
      return Promise.reject(new LibvirtAdapterError("CLOSED_CLIENT", "libvirt client is closed"));
    }
    if (payload.byteLength > BINARY_MAX_PAYLOAD_SIZE) {
      return Promise.reject(new LibvirtAdapterError(
        "INVALID_ARGUMENT",
        "binary stream frame exceeds 16 MiB",
      ));
    }
    const body = Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
    const frame = Buffer.allocUnsafe(BINARY_HEADER_SIZE + body.byteLength);
    BINARY_MAGIC.copy(frame, 0);
    frame[4] = kind;
    frame.fill(0, 5, 8);
    frame.writeUInt32BE(id, 8);
    frame.writeUInt32BE(body.byteLength, 12);
    body.copy(frame, BINARY_HEADER_SIZE);
    return new Promise((resolve, reject) => {
      this.#pipe.write(frame, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  /** Removes a local stream and asks native host to abort its `virt::Stream`. */
  async abort(id: number): Promise<void> {
    this.#sessions.delete(id);
    if (!this.#closed) await this.send(BINARY_INPUT_ABORT, id);
  }

  /** Pauses the shared native pipe when a Node readable applies backpressure. */
  pause(): void {
    this.#pipe.pause();
  }

  /** Resumes parsing frames after the consuming Node readable requests data. */
  resume(): void {
    this.#pipe.resume();
  }

  /** Closes the binary seam and fails every still-open stream. */
  close(error?: Error): void {
    if (this.#closed) return;
    this.#closed = true;
    const closeError = error ?? new LibvirtAdapterError(
      "CLOSED_CLIENT",
      "libvirt binary transport is closed",
    );
    for (const session of this.#sessions.values()) {
      session.cleanupOpening();
      if (!session.ready) session.reject(closeError);
      if (error === undefined && session.ready) session.stream.complete();
      else session.stream.fail(closeError);
    }
    this.#sessions.clear();
    if (!this.#pipe.destroyed) this.#pipe.destroy();
  }

  #handleData(chunk: Buffer): void {
    this.#buffer = this.#buffer.length === 0 ? chunk : Buffer.concat([this.#buffer, chunk]);
    while (this.#buffer.length >= BINARY_HEADER_SIZE) {
      if (!this.#buffer.subarray(0, 4).equals(BINARY_MAGIC)) {
        this.close(new LibvirtAdapterError("HOST_ERROR", "invalid binary stream frame magic"));
        return;
      }
      const length = this.#buffer.readUInt32BE(12);
      if (length > BINARY_MAX_PAYLOAD_SIZE) {
        this.close(new LibvirtAdapterError("HOST_ERROR", "binary stream frame exceeds 16 MiB"));
        return;
      }
      const frameSize = BINARY_HEADER_SIZE + length;
      if (this.#buffer.length < frameSize) return;
      const kind = this.#buffer[4];
      const id = this.#buffer.readUInt32BE(8);
      const payload = Buffer.from(this.#buffer.subarray(BINARY_HEADER_SIZE, frameSize));
      this.#buffer = this.#buffer.subarray(frameSize);
      this.#handleFrame(kind, id, payload);
    }
  }

  #handleFrame(kind: number, id: number, payload: Buffer): void {
    const session = this.#sessions.get(id);
    if (session === undefined) {
      if (id === 0 && kind === BINARY_OUTPUT_ERROR) {
        this.close(new LibvirtAdapterError("HOST_ERROR", payload.toString("utf8")));
      }
      return;
    }

    if (kind === BINARY_OUTPUT_READY) {
      if (session.ready) return;
      session.ready = true;
      session.cleanupOpening();
      session.stream.markReady(payload.length === 0 ? undefined : payload.toString("utf8"));
      session.resolve(session.stream);
      return;
    }
    if (kind === BINARY_OUTPUT_DATA) {
      session.stream.acceptData(payload);
      return;
    }
    if (kind === BINARY_OUTPUT_END) {
      this.#sessions.delete(id);
      session.stream.complete();
      return;
    }
    if (kind === BINARY_OUTPUT_ERROR) {
      this.#sessions.delete(id);
      session.cleanupOpening();
      const error = new LibvirtAdapterError("HOST_ERROR", payload.toString("utf8"));
      if (!session.ready) session.reject(error);
      session.stream.fail(error);
      return;
    }
    this.close(new LibvirtAdapterError("HOST_ERROR", "unsupported native binary stream frame"));
  }
}

/** Internal Node Duplex implementation; callers use `LibvirtBinaryStream`. */
class NativeLibvirtStream extends Duplex implements LibvirtBinaryStream {
  readonly id: number;
  readonly canRead: boolean;
  readonly canWrite: boolean;
  mimeType: string | undefined;
  readonly #transport: BinaryTransport;
  readonly #completion: Promise<void>;
  #resolveCompletion!: () => void;
  #rejectCompletion!: (error: Error) => void;
  #ready = false;
  #remoteEnded = false;

  constructor(transport: BinaryTransport, id: number, capabilities: StreamCapabilities) {
    super({ allowHalfOpen: true });
    this.#transport = transport;
    this.id = id;
    this.canRead = capabilities.readable;
    this.canWrite = capabilities.writable;
    this.#completion = new Promise((resolve, reject) => {
      this.#resolveCompletion = resolve;
      this.#rejectCompletion = reject;
    });
    void this.#completion.catch(() => undefined);
  }

  /** Records metadata returned by the native stream-opening operation. */
  markReady(mimeType: string | undefined): void {
    this.#ready = true;
    this.mimeType = mimeType;
  }

  /** Pushes one native data frame into the readable side. */
  acceptData(data: Buffer): void {
    if (!this.canRead) {
      this.fail(new LibvirtAdapterError("HOST_ERROR", "native host sent data to a write-only stream"));
      return;
    }
    if (!this.push(data)) this.#transport.pause();
  }

  /** Marks a successful `Stream::finish` or remote EOF. */
  complete(): void {
    if (this.#remoteEnded) return;
    this.#remoteEnded = true;
    if (this.canRead) this.push(null);
    this.#resolveCompletion();
  }

  /** Fails the stream without exposing errors from an opening attempt as unhandled events. */
  fail(error: Error): void {
    if (this.#remoteEnded) return;
    this.#remoteEnded = true;
    this.#rejectCompletion(error);
    if (this.#ready) this.destroy(error);
    else this.destroy();
  }

  /** Requests more frames after Node readable backpressure has cleared. */
  override _read(): void {
    this.#transport.resume();
  }

  /** Sends writable data as bounded binary frames. */
  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    if (!this.canWrite) {
      callback(new LibvirtAdapterError("INVALID_ARGUMENT", "libvirt stream is not writable"));
      return;
    }
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
    void this.#sendData(data).then(() => callback(), callback);
  }

  /** Converts Node writable EOF into native `Stream::finish`. */
  override _final(callback: (error?: Error | null) => void): void {
    void this.#transport.send(BINARY_INPUT_FINISH, this.id).then(() => callback(), callback);
  }

  /** Converts premature Node destruction into native `Stream::abort`. */
  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    if (this.#remoteEnded) {
      callback(error);
      return;
    }
    this.#remoteEnded = true;
    void this.#transport.abort(this.id).then(
      () => {
        if (error) this.#rejectCompletion(error);
        else this.#resolveCompletion();
        callback(error);
      },
      (abortError: Error) => {
        this.#rejectCompletion(abortError);
        callback(abortError);
      },
    );
  }

  async finish(): Promise<void> {
    if (this.canWrite && !this.writableEnded) this.end();
    await this.#completion;
  }

  async abort(): Promise<void> {
    if (this.#remoteEnded) return;
    this.#remoteEnded = true;
    await this.#transport.abort(this.id);
    this.#resolveCompletion();
    this.destroy();
  }

  async #sendData(data: Buffer): Promise<void> {
    for (let offset = 0; offset < data.length; offset += BINARY_DATA_CHUNK_SIZE) {
      await this.#transport.send(
        BINARY_INPUT_DATA,
        this.id,
        data.subarray(offset, offset + BINARY_DATA_CHUNK_SIZE),
      );
    }
  }
}

const HOST_PACKAGES: Readonly<Record<string, string>> = {
  "darwin-arm64": "ts-wasm-libvirt-host-darwin-arm64",
  "linux-arm64": "ts-wasm-libvirt-host-linux-arm64",
  "linux-x64": "ts-wasm-libvirt-host-linux-x64",
};

/**
 * Находит установленный optional dependency с host для текущей платформы.
 * Платформенные пакеты намеренно скрыты от публичного API адаптера.
 */
async function resolveNativeHostPath(): Promise<string> {
  const platform = `${process.platform}-${process.arch}`;
  const packageName = HOST_PACKAGES[platform];
  if (packageName === undefined) {
    throw new LibvirtAdapterError(
      "INITIALIZATION_FAILED",
      `unsupported native host platform: ${platform}`,
    );
  }

  try {
    const runtime = await import(packageName) as { nativeHostPath?: unknown };
    if (typeof runtime.nativeHostPath !== "string" || runtime.nativeHostPath.length === 0) {
      throw new Error("native host package does not export nativeHostPath");
    }
    return runtime.nativeHostPath;
  } catch (error) {
    throw new LibvirtAdapterError(
      "INITIALIZATION_FAILED",
      `native host package ${packageName} is unavailable for ${platform}; reinstall ts-wasm-libvirt`,
      { cause: error },
    );
  }
}

async function loadWasmContract(): Promise<void> {
  const wasmPath = new URL("../wasm/wasm_core_bg.wasm", import.meta.url);
  const bytes = await readFile(wasmPath);
  const instance = await WebAssembly.instantiate(bytes);
  const version = (instance.instance.exports.adapter_contract_version as (() => number) | undefined)?.();

  if (version !== 1) {
    throw new LibvirtAdapterError(
      "INITIALIZATION_FAILED",
      `unsupported WASM contract version: ${String(version)}`,
    );
  }
}

function validateAuthentication(
  auth: LibvirtAuthenticationOptions | undefined,
): LibvirtAuthenticationOptions | undefined {
  if (auth === undefined) return undefined;
  if (typeof auth !== "object" || auth === null) {
    throw new LibvirtAdapterError("INVALID_ARGUMENT", "auth options must be an object");
  }
  if (!Array.isArray(auth.credentialTypes) || auth.credentialTypes.length === 0) {
    throw new LibvirtAdapterError(
      "INVALID_ARGUMENT",
      "auth credentialTypes must be a non-empty array",
    );
  }
  if (typeof auth.callback !== "function") {
    throw new LibvirtAdapterError("INVALID_ARGUMENT", "auth callback must be a function");
  }
  const credentialTypes = auth.credentialTypes.map((type) =>
    validatePositiveUnsigned(type, "auth credential type", 0xffff_ffff)
  );
  if (new Set(credentialTypes).size !== credentialTypes.length) {
    throw new LibvirtAdapterError(
      "INVALID_ARGUMENT",
      "auth credentialTypes must not contain duplicates",
    );
  }
  return {
    credentialTypes,
    callback: (credentials) => auth.callback.call(auth, credentials),
  };
}

function normalizeUri(uri: string): string {
  const normalized = uri.trim();
  if (!normalized || normalized.includes("\0")) {
    throw new LibvirtAdapterError(
      "INITIALIZATION_FAILED",
      "connection URI must be non-empty and contain no NUL bytes",
    );
  }
  return normalized;
}

function validateDomainSelector(
  selector: DomainSelector,
): { kind: "name" | "uuid"; value: string } {
  if (typeof selector !== "object" || selector === null) {
    throw new LibvirtAdapterError("INVALID_ARGUMENT", "domain selector must be an object");
  }

  const hasName = Object.prototype.hasOwnProperty.call(selector, "name");
  const hasUuid = Object.prototype.hasOwnProperty.call(selector, "uuid");
  if (hasName === hasUuid) {
    throw new LibvirtAdapterError(
      "INVALID_ARGUMENT",
      "domain selector must contain exactly one of name or uuid",
    );
  }

  const kind = hasUuid ? "uuid" : "name";
  const value = (selector as unknown as Record<string, unknown>)[kind];
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    /[\0\t\r\n]/.test(value)
  ) {
    throw new LibvirtAdapterError(
      "INVALID_ARGUMENT",
      `domain ${kind} must be a non-empty single-line string`,
    );
  }

  return { kind, value };
}

function selectorArguments(selector: DomainSelector): ["name" | "uuid", string] {
  const validated = validateDomainSelector(selector);
  return [validated.kind, validated.value];
}

function networkSelectorArguments(selector: NetworkSelector): ["name" | "uuid", string] {
  return validateSelector(selector, ["name", "uuid"], "network") as ["name" | "uuid", string];
}

function interfaceSelectorArguments(selector: InterfaceSelector): ["name" | "mac", string] {
  return validateSelector(selector, ["name", "mac"], "interface") as ["name" | "mac", string];
}

function storagePoolSelectorArguments(
  selector: StoragePoolSelector,
): ["name" | "uuid" | "path", string] {
  return validateSelector(selector, ["name", "uuid", "path"], "storage pool") as [
    "name" | "uuid" | "path",
    string,
  ];
}

function storageVolumeSelectorArguments(
  selector: StorageVolumeSelector,
): ["key" | "path", string] {
  return validateSelector(selector, ["key", "path"], "storage volume") as [
    "key" | "path",
    string,
  ];
}

function networkFilterSelectorArguments(
  selector: NetworkFilterSelector,
): ["name" | "uuid", string] {
  return validateSelector(selector, ["name", "uuid"], "network filter") as [
    "name" | "uuid",
    string,
  ];
}

function secretSelectorArguments(selector: SecretSelector): string[] {
  if (typeof selector !== "object" || selector === null) {
    throw new LibvirtAdapterError("INVALID_ARGUMENT", "secret selector must be an object");
  }
  const hasUuid = Object.prototype.hasOwnProperty.call(selector, "uuid");
  const hasUsage = Object.prototype.hasOwnProperty.call(selector, "usage");
  if (hasUuid === hasUsage) {
    throw new LibvirtAdapterError(
      "INVALID_ARGUMENT",
      "secret selector must contain exactly one of uuid or usage",
    );
  }
  if (hasUuid) {
    return ["uuid", validateProtocolString((selector as { uuid: unknown }).uuid, "secret uuid")];
  }
  const usage = (selector as { usage: unknown }).usage;
  if (typeof usage !== "object" || usage === null) {
    throw new LibvirtAdapterError("INVALID_ARGUMENT", "secret usage selector must be an object");
  }
  const record = usage as Record<string, unknown>;
  return [
    "usage",
    String(validateUnsigned(record.type, "secret usage type", 0x7fff_ffff)),
    validateProtocolString(record.id, "secret usage id"),
  ];
}

function snapshotArguments(domain: DomainSelector, name: string): string[] {
  return [...selectorArguments(domain), validateProtocolString(name, "snapshot name")];
}

function validateSelector(
  selector: unknown,
  keys: readonly string[],
  resource: string,
): [string, string] {
  if (typeof selector !== "object" || selector === null) {
    throw new LibvirtAdapterError("INVALID_ARGUMENT", `${resource} selector must be an object`);
  }
  const record = selector as Record<string, unknown>;
  const present = keys.filter((key) => Object.prototype.hasOwnProperty.call(record, key));
  if (present.length !== 1) {
    throw new LibvirtAdapterError(
      "INVALID_ARGUMENT",
      `${resource} selector must contain exactly one of ${keys.join(", ")}`,
    );
  }
  const key = present[0];
  if (key === undefined) {
    throw new LibvirtAdapterError("INVALID_ARGUMENT", `${resource} selector is empty`);
  }
  return [key, validateProtocolString(record[key], `${resource} ${key}`)];
}

function validateProtocolString(
  value: unknown,
  label: string,
  allowEmpty = false,
): string {
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.trim().length === 0) ||
    /[\0\t\r\n]/.test(value)
  ) {
    throw new LibvirtAdapterError(
      "INVALID_ARGUMENT",
      `${label} must be ${allowEmpty ? "a" : "a non-empty"} single-line string`,
    );
  }
  return value;
}

function validateOptionalProtocolString(value: unknown, label: string): string {
  return value === undefined ? "" : validateProtocolString(value, label, true);
}

function encodeXml(xml: string): string {
  if (typeof xml !== "string" || xml.includes("\0")) {
    throw new LibvirtAdapterError("INVALID_ARGUMENT", "XML must be a string without NUL bytes");
  }
  return Buffer.from(xml, "utf8").toString("hex");
}

function encodeBytes(value: Uint8Array, label: string): string {
  if (!(value instanceof Uint8Array) || value.length === 0) {
    throw new LibvirtAdapterError("INVALID_ARGUMENT", `${label} must be a non-empty Uint8Array`);
  }
  return Buffer.from(value).toString("hex");
}

function validateFlags(flags: number | undefined): number {
  return validateUnsigned(flags ?? 0, "flags", 0xffff_ffff);
}

function validateUnsigned(value: unknown, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > maximum
  ) {
    throw new LibvirtAdapterError(
      "INVALID_ARGUMENT",
      `${label} must be an unsigned safe integer no greater than ${maximum}`,
    );
  }
  return value;
}

function validatePositiveUnsigned(value: unknown, label: string, maximum: number): number {
  const normalized = validateUnsigned(value, label, maximum);
  if (normalized === 0) {
    throw new LibvirtAdapterError("INVALID_ARGUMENT", `${label} must be greater than zero`);
  }
  return normalized;
}

function validateSignedInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff) {
    throw new LibvirtAdapterError(
      "INVALID_ARGUMENT",
      `${label} must be a signed 32-bit integer`,
    );
  }
  return value;
}

function encodeUInt64(value: number | bigint, label: string): string {
  const normalized = typeof value === "bigint" ? value : BigInt(validateUnsigned(value, label));
  if (normalized < 0n || normalized > 0xffff_ffff_ffff_ffffn) {
    throw new LibvirtAdapterError(
      "INVALID_ARGUMENT",
      `${label} must be an unsigned 64-bit integer`,
    );
  }
  return normalized.toString();
}

function validateOptionalUInt64String(value: string | null | undefined, label: string): string {
  if (value === undefined || value === null) return "";
  if (!/^\d+$/.test(value)) {
    throw new LibvirtAdapterError("INVALID_ARGUMENT", `${label} must be an unsigned integer string`);
  }
  const normalized = BigInt(value);
  if (normalized > 0xffff_ffff_ffff_ffffn) {
    throw new LibvirtAdapterError("INVALID_ARGUMENT", `${label} must fit in u64`);
  }
  return normalized.toString();
}

function validateOptionalInt64String(value: string | null | undefined, label: string): string {
  if (value === undefined || value === null) return "";
  if (!/^-?\d+$/.test(value)) {
    throw new LibvirtAdapterError("INVALID_ARGUMENT", `${label} must be a signed integer string`);
  }
  const normalized = BigInt(value);
  if (normalized < -0x8000_0000_0000_0000n || normalized > 0x7fff_ffff_ffff_ffffn) {
    throw new LibvirtAdapterError("INVALID_ARGUMENT", `${label} must fit in i64`);
  }
  return normalized.toString();
}

function validateTimeout(timeoutMs: number | undefined): number | undefined {
  if (timeoutMs === undefined) return undefined;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new LibvirtAdapterError(
      "INVALID_ARGUMENT",
      "operation timeoutMs must be a positive finite number",
    );
  }
  return timeoutMs;
}

function waitForReady(
  child: ChildProcessWithoutNullStreams,
  lines: ReadlineInterface,
  readStderr: () => string,
): Promise<{ type: string; uri?: string }> {
  return new Promise((resolve, reject) => {
    const onLine = (line: string) => {
      cleanup();
      try {
        resolve(JSON.parse(line) as { type: string; uri?: string });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(
        new Error(
          readStderr().trim() ||
            `native host exited before ready (code=${code}, signal=${signal})`,
        ),
      );
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      lines.off("line", onLine);
      child.off("exit", onExit);
      child.off("error", onError);
    };

    lines.once("line", onLine);
    child.once("exit", onExit);
    child.once("error", onError);
  });
}
