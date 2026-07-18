# TypeScript-адаптер для libvirt на Rust/WASM

Статус: готово к реализации через обязательный feasibility gate  
Предлагаемая triage-метка: `ready-for-agent`  
Дата: 2026-07-17

## Problem Statement

Разработчику TypeScript-приложения нужен устанавливаемый пакет, через который можно управлять виртуальными машинами libvirt без самостоятельной работы с C ABI, указателями, системными заголовками и нативным интерфейсом Rust crate `virt`.

Пакет должен устанавливаться как обычная зависимость, предоставлять типизированный асинхронный interface и скрывать за ним загрузку Rust/WASM, преобразование типов, управление соединением, освобождение ресурсов и нормализацию ошибок libvirt.

Изначальное техническое намерение — скомпилировать Rust implementation в WebAssembly и использовать `virt` для доступа к libvirt. Между этими требованиями есть принципиальное ограничение: `virt` является FFI binding к системной C-библиотеке libvirt, а не pure-Rust implementation. Обычный browser-WASM не может загрузить `libvirt.so` или открыть Unix-сокет libvirt. В Node.js/WASI системная библиотека также не становится доступной WebAssembly-модулю автоматически.

Поэтому спецификация должна сохранить простой TypeScript interface и использование `virt`, но отделить WASM implementation от нативного host adapter. Прямая сборка `virt` внутрь автономного WASM-артефакта не считается подтверждённой и должна быть проверена первым техническим spike до основной реализации.

## Solution

Создать npm-пакет для server-side TypeScript/Node.js с одним глубоким module: небольшим публичным TypeScript interface и скрытой многоуровневой implementation.

Публичный module предоставляет создание клиента, управление соединением и минимальный набор операций жизненного цикла доменов. Он автоматически загружает поставляемый Rust/WASM-артефакт, преобразует TypeScript-данные в стабильные transport-типы и возвращает типизированные результаты и ошибки.

Доступ к libvirt выполняет нативный host adapter на Rust с crate `virt`. WASM module вызывает его через узкий набор импортируемых host-функций. Для потребителя это остаётся одной npm-зависимостью, однако дистрибутив содержит два внутренних артефакта:

1. переносимый WASM module для состояния, валидации, преобразований и orchestration;
2. платформенный native host adapter, который динамически связывается с системной libvirt и выполняет фактические вызовы через `virt`.

Если feasibility spike докажет, что `virt` можно надёжно собрать и запустить внутри целевого WASI runtime без отдельного native host adapter, implementation может быть упрощена. Публичный TypeScript interface и тестовый seam при этом не меняются.

Первая версия предназначена для Node.js на Linux. Browser runtime не поддерживается. Потребитель должен установить совместимую системную libvirt и иметь права на выбранный connection URI.

## User Stories

1. As a TypeScript developer, I want to install the adapter as a package dependency, so that I can add libvirt support without maintaining a Rust workspace in my application.
2. As a TypeScript developer, I want the package to include TypeScript declarations, so that invalid calls are rejected during compilation.
3. As a TypeScript developer, I want the package to load its WASM artifact automatically, so that I do not need to calculate package-relative filesystem paths.
4. As a TypeScript developer, I want initialization to be asynchronous and explicit, so that loading and linking failures can be handled predictably.
5. As a TypeScript developer, I want to connect using a libvirt connection URI, so that I can select system, session, test, or explicitly enabled remote connections.
6. As a TypeScript developer, I want sensible connection defaults, so that a local QEMU system connection requires minimal configuration.
7. As a TypeScript developer, I want to close a client explicitly, so that native libvirt references and connection resources are released deterministically.
8. As a TypeScript developer, I want closing an already closed client to be safe, so that cleanup logic can be idempotent.
9. As a TypeScript developer, I want calls after close to fail with a stable typed error, so that lifecycle mistakes are easy to diagnose.
10. As a TypeScript developer, I want to list active and inactive domains, so that I can build inventory and management views.
11. As a TypeScript developer, I want to look up a domain by UUID, so that renaming does not break identity-based workflows.
12. As a TypeScript developer, I want to look up a domain by name, so that human-oriented workflows remain convenient.
13. As a TypeScript developer, I want missing domains to return a stable not-found error, so that absence is distinguishable from connection failure.
14. As a TypeScript developer, I want domain results to use plain serializable data, so that they can be logged, cached, and returned from application endpoints.
15. As a TypeScript developer, I want memory and other 64-bit quantities represented without precision loss, so that large values remain correct in JavaScript.
16. As a TypeScript developer, I want to read a domain's XML definition, so that I can inspect its complete libvirt configuration.
17. As a TypeScript developer, I want to define a persistent domain from XML, so that I can provision a virtual machine.
18. As a TypeScript developer, I want invalid domain XML to produce a validation-oriented error, so that I can report actionable feedback.
19. As a TypeScript developer, I want to undefine a persistent domain, so that I can remove its libvirt definition without conflating that with storage deletion.
20. As a TypeScript developer, I want to start a defined domain, so that I can activate a virtual machine.
21. As a TypeScript developer, I want to request a graceful shutdown, so that the guest can stop without forced power loss.
22. As a TypeScript developer, I want to reboot a running domain, so that I can perform routine lifecycle management.
23. As a TypeScript developer, I want an explicitly named force-destroy operation, so that destructive power-off semantics cannot be confused with graceful shutdown.
24. As a TypeScript developer, I want lifecycle conflicts to have stable error codes, so that I can handle already-running or already-stopped domains without parsing messages.
25. As a TypeScript developer, I want calls to return promises, so that the adapter composes naturally with server-side TypeScript.
26. As a TypeScript developer, I want independent clients to support different connection URIs, so that one process can manage more than one libvirt endpoint.
27. As a TypeScript developer, I want concurrent read operations to be safe, so that inventory requests do not need application-level locking.
28. As a TypeScript developer, I want mutations for the same domain to be ordered, so that overlapping start, shutdown, and destroy calls do not race unpredictably.
29. As a TypeScript developer, I want cancellation and timeout options on potentially long operations, so that application requests cannot wait forever.
30. As a TypeScript developer, I want libvirt error details preserved in a structured cause field, so that operations teams can troubleshoot failures.
31. As a TypeScript developer, I want credentials and secret URI fields excluded from errors and logs, so that diagnostics do not leak sensitive data.
32. As a TypeScript developer, I want to provide a logger or disable logging, so that the package follows my application's observability policy.
33. As a package consumer, I want imports to have no connection or filesystem side effects, so that merely loading the dependency is safe.
34. As a package consumer, I want failed initialization to leave no native resources behind, so that retries do not leak handles.
35. As a package consumer, I want the package to report unsupported platforms before attempting libvirt calls, so that deployment failures are clear.
36. As a package consumer, I want an actionable error when system libvirt is absent or incompatible, so that I know which runtime prerequisite is missing.
37. As a package consumer, I want platform support documented, so that CI and production images can be selected deliberately.
38. As a package consumer, I want semantic versioning for the public TypeScript interface, so that dependency upgrades are predictable.
39. As a package consumer, I want a package provenance and checksum strategy for native and WASM artifacts, so that installation does not execute unverified downloads.
40. As a security reviewer, I want remote libvirt URIs disabled unless explicitly allowed, so that the default configuration does not expand network access.
41. As a security reviewer, I want the adapter to expose libvirt operations rather than arbitrary native calls, so that the interface can be audited.
42. As a security reviewer, I want forceful and destructive actions to be explicit, so that accidental data or availability loss is less likely.
43. As an operator, I want a health check that verifies initialization and connection state without mutating domains, so that deployments can be monitored safely.
44. As an operator, I want stable machine-readable error codes, so that alerts do not depend on version-specific libvirt text.
45. As a maintainer, I want generated WASM bindings hidden behind handwritten TypeScript types, so that toolchain-generated churn does not leak to consumers.
46. As a maintainer, I want all native references owned inside the adapter, so that callers cannot violate libvirt reference-counting rules.
47. As a maintainer, I want a fake host adapter for tests, so that error and lifecycle behavior can be tested without a hypervisor.
48. As a maintainer, I want integration tests against libvirt's test driver, so that real `virt` behavior is verified without starting production VMs.
49. As a maintainer, I want package-install tests from the packed tarball, so that missing WASM, declarations, or native artifacts are caught before publishing.
50. As a maintainer, I want the public interface to remain unchanged if the internal WASM/native split changes, so that architecture can evolve without breaking consumers.

## Implementation Decisions

- The external seam is the public TypeScript interface of the installed package. Callers do not import generated WASM bindings, Rust-shaped types, raw pointers, numeric libvirt constants, or native host functions.
- The package is a deep module: connection lifecycle, WASM loading, native artifact selection, libvirt reference ownership, string conversion, flag mapping, error normalization, timeouts, logging, and cleanup remain inside its implementation.
- The initial supported runtime is server-side Node.js on Linux. The minimum Node.js version must be one that is still supported when implementation starts and must be pinned in package metadata and CI. Browser runtimes, Deno, Bun, edge runtimes, and generic WASI hosts are not implied by the npm package interface.
- The first implementation phase is a mandatory feasibility gate. It must produce a minimal vertical slice that loads the packaged artifacts, opens `test:///default`, lists domains, closes the connection, and runs through the public TypeScript seam.
- The feasibility gate must compare two implementations behind the same internal seam: direct `virt` inside the selected WASI runtime, and WASM plus native host adapter. Direct WASM is accepted only if system libvirt discovery, linking, sockets, callbacks, cleanup, packaging, and CI are reproducible without consumer-specific embedding code.
- Unless the direct-WASM option passes every gate, the production architecture uses a native Rust host adapter compiled with `virt` and a separate Rust/WASM module. The npm package remains one logical dependency even though it contains platform-specific and portable artifacts.
- The native host adapter is not a general FFI bridge. It exposes only the operations required by the public TypeScript interface and converts all native libvirt objects into owned transport data before returning across the seam.
- The WASM module owns validation, operation orchestration, stable state transitions, transport DTO conversion, and error-code mapping where practical. The native host adapter owns `virt` calls, C string conversion, callbacks, libvirt reference lifetimes, and translation of raw libvirt errors.
- Generated bindings are implementation details. The handwritten TypeScript interface is the compatibility contract and follows semantic versioning independently from wasm-bindgen or other binding-generator output.
- Package imports are side-effect free. Loading artifacts, selecting a platform adapter, reading environment configuration, and opening libvirt occur only during explicit asynchronous initialization.
- Initialization accepts a connection URI, optional default timeout, optional logger, and an explicit remote-URI policy. It returns a client instance or a structured initialization error.
- The default connection URI is `qemu:///system`. `qemu:///session` and `test:///default` are supported. Network transports and credential-bearing URIs require explicit opt-in.
- A client has the observable lifecycle `initializing`, `ready`, `closing`, `closed`, or `failed`. Only `ready` accepts operations. Close is idempotent; a terminal initialization failure cannot be reused as a client.
- The MVP domain interface includes health/status, list domains, lookup by UUID or name, get XML, define XML, undefine, start, graceful shutdown, reboot, and force destroy.
- Domain identity is UUID-first. Names are mutable display identifiers. Returned domain data includes UUID, name, optional runtime ID, normalized state, persistence, autostart, virtual CPU count, and memory values when available.
- All 64-bit integers cross the WASM/native seam as decimal strings. The public TypeScript interface exposes them as decimal strings in the first version to avoid JavaScript precision loss and serialization ambiguity. A future major version may add opt-in `bigint` conveniences.
- XML is accepted and returned as UTF-8 strings. The adapter rejects embedded NUL bytes before FFI. Schema-level validation remains libvirt's responsibility, and validation failures are mapped to a stable invalid-definition error.
- Domain lifecycle methods return fresh normalized domain state when libvirt can provide it cheaply; commands that are only requests, such as graceful shutdown, report acceptance rather than claiming the asynchronous guest transition has completed.
- Force destroy is deliberately distinct from shutdown. Undefine does not delete storage volumes. Method names and documentation must preserve these semantic differences.
- Read operations may run concurrently. Mutations for the same domain are serialized inside a client. The implementation does not promise ordering across different client instances.
- Each operation accepts an optional timeout and cancellation signal at the TypeScript seam. Cancellation means the caller stops waiting; the interface must not claim a native operation was rolled back unless libvirt confirms rollback semantics.
- The error interface is a discriminated, stable model with at least initialization, unsupported-platform, missing-runtime-dependency, connection, authentication, invalid-argument, invalid-definition, not-found, conflict, timeout, cancelled, unsupported-operation, closed-client, and internal-libvirt categories.
- Errors preserve a sanitized libvirt message, numeric libvirt code/domain/level when available, operation name, and optional cause. Connection URIs and messages are redacted before leaving the module if they may contain credentials.
- Logging is disabled by default except for fatal initialization diagnostics returned as errors. A consumer-provided logger receives structured events; the module never writes arbitrary diagnostics directly to stdout or stderr.
- Distribution initially targets Linux x86_64 and Linux aarch64. Unsupported platforms fail during initialization with an actionable error. Adding a platform requires the same package-install and integration test matrix as existing platforms.
- The native host adapter dynamically uses the system libvirt library rather than silently downloading executables during install. Required libvirt runtime packages and permission configuration are documented as deployment prerequisites.
- Published artifacts are built in CI from a tagged source revision. The package includes the WASM artifact, TypeScript/JavaScript wrapper, declarations, and platform native artifacts or deterministic optional platform packages. Installation performs no network download beyond normal registry package resolution.
- The package is ESM-first. CommonJS support is not part of the initial contract unless a real consumer requirement appears.
- The package exposes no global singleton. Multiple explicit clients may coexist. Each client owns its connection and must be closed independently.
- The implementation must account for the LGPL-2.1 license of `virt`/`libvirt-rust` and the license of system libvirt. Release documentation must state linking and redistribution obligations applicable to the selected packaging model.
- No telemetry is collected by default. The package does not transmit domain XML, URIs, names, UUIDs, errors, or usage data to third parties.

## Testing Decisions

- The primary test seam is the public TypeScript interface imported from a packed npm artifact. Tests must observe returned data, errors, resource lifecycle, and package behavior rather than internal Rust functions or generated bindings.
- A good test describes external behavior: given installed package, runtime prerequisites, connection configuration, and libvirt state, it verifies an observable result or stable error. It must not assert private module layout, generated symbol names, exact FFI call counts, or internal serialization bytes unless those bytes are a published compatibility contract.
- The highest-value contract suite runs unchanged against two internal adapters: an in-memory fake host adapter and the real `virt` host adapter using libvirt's `test:///default` driver. This makes the internal seam real while keeping the external TypeScript seam authoritative.
- The feasibility test is a vertical slice through package installation, TypeScript import, artifact loading, WASM initialization, native host selection, `virt` connection, domain listing, and cleanup. The feature cannot proceed past the gate if this test is not reproducible in clean Linux CI.
- Package tests run `npm pack`, install the generated tarball in a clean fixture project, compile a strict TypeScript consumer, and execute a minimal workflow. Tests must fail if exports, declaration maps, WASM files, native artifacts, package metadata, or runtime path resolution are missing.
- Interface contract tests cover initialization success and failure, side-effect-free import, default and explicit connection URIs, multiple clients, idempotent close, calls after close, and cleanup after partial initialization.
- Domain query tests cover active/inactive listing, UUID and name lookup, not-found behavior, normalized state, nullable runtime IDs, and lossless 64-bit values.
- Domain mutation tests cover define/get XML, start, accepted graceful shutdown, reboot, force destroy, undefine, and conflict errors for invalid current states.
- Destructive-semantics tests prove that shutdown and force destroy are distinguishable and that undefine does not claim to delete storage.
- Concurrency tests cover concurrent reads, serialization of same-domain mutations, isolation between clients, and deterministic close behavior while operations are in flight.
- Timeout and cancellation tests verify the caller-facing result and resource cleanup without assuming an underlying libvirt operation can always be interrupted or rolled back.
- Error contract tests verify stable categories and fields while allowing libvirt's human-readable text to vary by version. Redaction tests ensure credentials, secrets, and full sensitive URIs are absent from errors and logs.
- Artifact-selection tests cover supported Linux architectures, unsupported platforms, missing native adapter, missing or incompatible system libvirt, corrupt WASM, and checksum/provenance mismatch where applicable.
- Real integration tests use `test:///default` by default. A separate opt-in suite may run against an isolated qemu session daemon in CI; it must never target a developer's or CI host's production `qemu:///system` implicitly.
- Memory/resource tests repeatedly initialize, query, and close clients and check for leaked native references, file descriptors, background tasks, and unbounded WASM memory growth.
- Compatibility tests run against the oldest and newest supported Node.js and libvirt versions. Package releases are blocked if either end of the documented matrix fails.
- There is no prior implementation or testing convention in the repository. This specification establishes the public TypeScript seam and packed-package integration test as the project's prior art for subsequent modules.

## Out of Scope

- Direct use from web browsers.
- Exposing the libvirt daemon directly over WebSocket or an unauthenticated network listener.
- A pure TypeScript reimplementation of the libvirt RPC/XDR protocol.
- Replacing `virt` with `libvirt-pure` in the initial implementation.
- Hypervisor installation, libvirt daemon installation, socket permissions, polkit configuration, TLS certificate provisioning, or SASL account management.
- A general-purpose wrapper for every libvirt C function in the first release.
- Network, interface, network-filter, storage-pool, storage-volume, secret, node-device, snapshot, checkpoint, migration, stream, console, graphics, guest-agent, and QEMU monitor interfaces in the MVP.
- Domain XML builders or a complete typed model of libvirt XML. The MVP accepts and returns XML strings.
- Deleting disk images or storage volumes as a side effect of undefining a domain.
- Automatic retries of mutating operations whose idempotency cannot be guaranteed.
- Distributed locking or ordering mutations across multiple processes or client instances.
- CommonJS, Deno, Bun, edge runtimes, Windows, and macOS in the first release.
- Runtime artifact downloads from GitHub or arbitrary URLs during package installation.
- Bundling a private libvirt daemon or silently opening remote network access.
- A stable low-level WASM or native host interface for third-party callers; both remain private implementation details.

## Further Notes

- Feasibility gate пройден 2026-07-17. Команда `npm run prototype:feasibility` подтвердила: portable Rust core собирается в `wasm32-unknown-unknown`; прямое добавление `virt` ломает сборку `virt-sys` для этого target; native host на `virt` успешно открывает и закрывает `test:///default`. Валидированная architecture — WASM core плюс native host adapter.
- Первые production tracer bullets также реализованы через публичный TypeScript seam: клиент загружает WASM contract, запускает packaged native host, проверяет health, получает нормализованный список доменов и XML домена, определяет и удаляет постоянное определение домена, ищет, запускает, перезагружает, мягко выключает и принудительно останавливает домен по UUID или имени. Селекторы проверяются до построчного транспорта, а все операции поддерживают `timeoutMs` и `AbortSignal`; клиент применяет `defaultTimeoutMs`. Адаптер возвращает стабильные `INVALID_ARGUMENT`, `INVALID_DEFINITION`, `NOT_FOUND`, `CONFLICT`, `CANCELLED` и `TIMEOUT`, затем закрывается. `npm run check` собирает оба Rust artifact, компилирует TypeScript и выполняет integration tests.
- The project started without application code, a domain glossary, ADRs, package metadata, git metadata, a remote repository, or issue-tracker configuration. The feasibility scaffold now supplies the first package and Rust modules. Terms introduced here form the initial domain vocabulary: TypeScript adapter, client, WASM module, native host adapter, domain, connection URI, and public TypeScript seam.
- The supporting library research is recorded in [`../research/rust-libvirt-libraries.md`](../research/rust-libvirt-libraries.md). It identifies official `virt`/`virt-sys` as the preferred native binding and explains why neither is directly browser-WASM compatible.
- The native host adapter is an architectural consequence of combining two requirements: WebAssembly packaging and use of the C-backed `virt` crate. It is not intended as permanent complexity if the feasibility gate proves a simpler deployment.
- If “single autonomous WASM file with no native host code” is a non-negotiable product requirement, use of `virt` must be reconsidered. That combination is not marked ready for full implementation until a working spike demonstrates libvirt linking, socket access, callbacks, and packaging in the exact target runtime.
- The selected test seam matches the intended consumer experience: install the npm package, import its TypeScript interface, initialize it, perform domain operations, and close it. Architecture changes below that seam must not require consumer changes.
- The `ready-for-agent` label should be applied when this spec is published. The first assigned work item is the feasibility gate, not the full domain surface.
