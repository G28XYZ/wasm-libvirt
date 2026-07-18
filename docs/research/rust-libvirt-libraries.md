# Библиотеки Rust для libvirt

Дата проверки: 2026-07-16.

## Краткий вывод

- Для обычного native-приложения или backend-сервиса берите [`virt`](https://crates.io/crates/virt). Это официальный high-level binding проекта libvirt; нижний FFI-слой — [`virt-sys`](https://crates.io/crates/virt-sys).
- Для браузерного WebAssembly готовой production-библиотеки не найдено. Браузер не может напрямую открыть Unix-сокет libvirt, поэтому практичная архитектура — небольшой native backend на `virt`, а из WASM обращаться к нему по HTTP/WebSocket.
- [`libvirt-pure`](https://crates.io/crates/libvirt-pure) интересен как основа для собственного pure-Rust RPC-клиента, но версия `0.1.1` пока ранняя и фактически предоставляет только Unix-транспорт.
- [`libvirt-rpc`](https://crates.io/crates/libvirt-rpc) тоже реализует протокол без C, но остался на экосистеме Tokio/Futures 0.1 и не выпускался с 2018 года. Для нового проекта его брать не стоит.
- Крейты с похожими именами [`libvirt`](https://crates.io/crates/libvirt) и [`rust-libvirt`](https://crates.io/crates/rust-libvirt) — старые/минимальные альтернативы, а не текущий официальный binding.

## Сравнение

| Crate | Уровень | Последний релиз при проверке | Зависимость от C libvirt | Async | Пригодность для browser WASM | Рекомендация |
|---|---|---:|---|---|---|---|
| [`virt`](https://docs.rs/crate/virt/latest) | Безопаснее и удобнее сырого FFI, близкое отображение C API | 0.4.3, 2025-08-21 | Да | Нет, API синхронный | Нет | Основной выбор для native/backend |
| [`virt-sys`](https://docs.rs/crate/virt-sys/latest) | Низкоуровневый `unsafe` FFI | 0.3.1, 2025-08-21 | Да | Нет | Нет | Только если в `virt` нет нужного вызова |
| [`libvirt-pure`](https://docs.rs/crate/libvirt-pure/latest/source/) | Pure-Rust клиент RPC/XDR | 0.1.1, 2025-12-13 | Нет | Tokio 1 | Нет в текущем виде | Прототип или основа форка |
| [`libvirt-rpc`](https://docs.rs/crate/libvirt-rpc/latest) | Pure-Rust клиент RPC/XDR | 0.1.12, 2018-05-18 | Нет | Tokio/Futures 0.1 | Нет | Не использовать в новом проекте |
| [`libvirt`](https://docs.rs/libvirt/latest/libvirt/) | Старый high-level FFI binding | 0.1.0 | Да | Нет | Нет | Не выбирать вместо `virt` |
| [`rust-libvirt`](https://docs.rs/crate/rust-libvirt/latest/source/) | Минимальный FFI binding | 0.1.0 | Да | Нет | Нет | Не выбирать вместо `virt` |

Даты релизов взяты со страниц версий docs.rs; для `libvirt-rpc` дата подтверждается историей опубликованного пакета и репозитория.

## 1. `virt`: рекомендуемый native binding

`virt` — Rust binding к нативной C-библиотеке libvirt. Сам libvirt перечисляет Rust binding в своей официальной таблице загрузок и ведёт его в репозитории `libvirt/libvirt-rust`: [официальная страница загрузок](https://libvirt.org/downloads.html), [основной GitLab-репозиторий](https://gitlab.com/libvirt/libvirt-rust), [read-only зеркало GitHub](https://github.com/libvirt/libvirt-rust).

Что есть:

- соединения и домены;
- сети, интерфейсы и network filters;
- storage pools/volumes;
- node devices, secrets, snapshots и streams;
- события;
- feature `qemu` для специальных вызовов `libvirt-qemu`, включая monitor command.

Перечень модулей и примеры API видны в [rustdoc `virt`](https://docs.rs/virt/latest/virt/). Репозиторий прямо говорит, что API стабилен, но покрывает не весь C API; там же есть инструмент для поиска отсутствующих методов: [README](https://github.com/libvirt/libvirt-rust#readme).

Сборка требует установленной системной библиотеки и development-файлов:

- Debian/Ubuntu: `libvirt-dev`;
- Fedora/RHEL: `libvirt-devel`;
- поиск библиотеки выполняет `pkg-config` через `virt-sys`.

Опубликованные bindings уже включены в `virt-sys`; feature `bindgen_regenerate` нужен главным образом сопровождающим. Это уменьшает обычные требования к сборке, но линковка с `libvirt` всё равно обязательна. Источник: [`virt-sys` metadata](https://docs.rs/crate/virt-sys/latest) и [README проекта](https://github.com/libvirt/libvirt-rust#important-considerations).

Ограничения:

- вызовы синхронные; в async-сервисе потенциально блокирующие операции следует изолировать, например через `tokio::task::spawn_blocking`;
- присутствует FFI и системная runtime-зависимость;
- прямой target `wasm32-unknown-unknown` невозможен, поскольку в браузере нет нативной C-библиотеки libvirt и Unix/TCP socket API, ожидаемого libvirt.

Лицензия проекта: LGPL-2.1, см. [репозиторий](https://gitlab.com/libvirt/libvirt-rust).

### `virt-sys`

`virt-sys` входит в тот же официальный проект и экспортирует почти прямые объявления C API. Он нужен напрямую только когда:

- high-level `virt` ещё не обернул новый метод;
- требуется нестандартная комбинация указателей/callbacks;
- разрабатывается собственная безопасная обёртка.

Цена — ручная работа с `unsafe`, указателями, временем жизни объектов и ошибками C. Для прикладного кода начинать с него не следует.

## 2. `libvirt-pure`: новый pure-Rust RPC-клиент

[`jimyag/libvirt-rs`](https://github.com/jimyag/libvirt-rs) реализует wire protocol libvirt без C-библиотеки. Опубликованный пакет называется `libvirt-pure`; рядом опубликованы codegen/XDR-компоненты. В README заявлены генерация 453+ RPC-методов из `.x`-описаний, XDR через Serde и async I/O на Tokio: [исходники опубликованного crate](https://docs.rs/crate/libvirt-pure/0.1.1/source/README.md).

Плюсы:

- нет линковки с `libvirt.so`;
- типы и RPC-методы генерируются из протокольных файлов;
- современный async/await и Tokio 1;
- лицензия пакета `MIT OR Apache-2.0`, см. [Cargo metadata/репозиторий](https://github.com/jimyag/libvirt-rs/blob/main/Cargo.toml).

Но опубликованную `0.1.1` нельзя считать готовой заменой `virt`:

- в `src/transport/mod.rs` экспортирован только `UnixTransport`; TCP/TLS упомянуты в комментарии, но не реализованы;
- публичный `Client::connect` принимает `qemu:///system`, `qemu:///session` или путь к Unix-сокету, а не произвольный сетевой/WASM transport;
- `Connection::from_transport` приватный, поэтому подключить собственный WebSocket transport без форка нельзя;
- I/O loop выполняет `send`, затем сразу `recv`, хотя инфраструктура pending requests выглядит рассчитанной на конкурентные запросы;
- на момент проверки репозиторий имел всего несколько коммитов и не относился к официальной организации libvirt.

Эти ограничения проверены непосредственно в опубликованных исходниках: [`connection.rs`](https://docs.rs/crate/libvirt-pure/0.1.1/source/src/connection.rs), [`transport`](https://docs.rs/crate/libvirt-pure/0.1.1/source/src/transport/), [`lib.rs`](https://docs.rs/crate/libvirt-pure/0.1.1/source/src/lib.rs).

Вердикт: хороший кандидат для эксперимента с protocol/codegen/XDR, но для production его сначала нужно протестировать на реальном libvirtd, расширить транспорт, обработку событий/streams/auth и конкурентность.

## 3. `libvirt-rpc`: исторический pure-Rust клиент

[`polachok/libvirt-rpc`](https://github.com/polachok/libvirt-rpc) также говорит с libvirtd по RPC без C binding. В crate есть сгенерированные remote protocol types, доменные операции, storage pool/volume operations и события: [rustdoc](https://docs.rs/libvirt-rpc/latest/libvirt_rpc/all.html).

Главная проблема — возраст стека:

- `futures 0.1`;
- `tokio-core`, `tokio-io`, `tokio-proto`, `tokio-service` и `tokio-uds` поколения 0.1;
- последний релиз `0.1.12` опубликован в мае 2018 года;
- документация самого crate помечена как TBD.

Точный список зависимостей виден на [странице пакета docs.rs](https://docs.rs/crate/libvirt-rpc/latest). Лицензирование автор описывает осторожно как LGPL из-за включённых XDR-описаний: [README](https://github.com/polachok/libvirt-rpc#license).

Вердикт: полезен как историческая реализация протокола и источник идей, но перенос на современный async Rust практически равен существенной модернизации/форку.

## 4. Старые crates с похожими именами

### `libvirt` 0.1.0

[`libvirt`](https://docs.rs/crate/libvirt/latest/source/README.md) — WIP binding, который сам предупреждает, что не гарантирует стабильность и реализует только часть часто используемых функций. Он требует `libvirt` и development packages. API и пакет замерли на `0.1.0`; официальный актуальный binding теперь называется `virt`.

### `rust-libvirt` 0.1.0

[`rust-libvirt`](https://docs.rs/crate/rust-libvirt/latest/source/) описан как FFI bindings и также остался на `0.1.0`. Это не тот проект, на который ссылается официальный сайт libvirt.

Отдельно существует старый [`libvirt-sys` 1.2.18`](https://docs.rs/libvirt-sys/latest/libvirt_sys/). Его не следует путать с актуальным официальным `virt-sys`.

## Что выбрать для `wasm-libvirt`

Репозиторий на момент исследования пуст, поэтому назначение выводится только из имени. Выбор зависит от того, где будет выполняться WASM.

### Если это браузерный UI

Рекомендуемая схема:

```text
Browser WASM
    │ HTTP / WebSocket (ваш ограниченный API)
    ▼
Rust backend using `virt`
    │ libvirt C API / Unix socket / supported remote URI
    ▼
libvirtd / virtqemud
```

Почему так:

- browser WASM не имеет прямого доступа к Unix-сокету `/var/run/libvirt/libvirt-sock`;
- libvirt RPC не является WebSocket-протоколом;
- не стоит публиковать libvirt TCP endpoint прямо в браузер/Интернет;
- backend может централизовать аутентификацию, authorization, аудит и allowlist операций.

Для backend начать с:

```toml
[dependencies]
virt = "0.4.3"
```

Системный образ должен содержать runtime/development package libvirt в зависимости от способа сборки и доставки.

### Если это WASI/server-side WASM

`virt` всё равно проблематичен из-за C ABI и динамической библиотеки. `libvirt-pure` ближе по архитектуре, но его текущий Unix/Tokio transport и поддержка сокетов зависят от WASI runtime. Разумный первый spike:

1. проверить, собираются ли `libvirt-xdr` и сгенерированные типы отдельно под нужный WASM target;
2. вынести transport trait в публичный API;
3. реализовать транспорт поверх возможностей конкретного runtime или host functions;
4. прогнать contract/integration tests против `test:///default` и отдельного libvirtd;
5. только после этого решать, форкать ли `libvirt-pure` или держать native sidecar.

### Если цель проекта — именно реализация libvirt RPC в WASM

Наиболее полезные исходные материалы:

- [официальное описание RPC framing/XDR](https://libvirt.org/kbase/internals/rpc.html);
- [протокольные `.x` файлы в libvirt](https://gitlab.com/libvirt/libvirt/-/tree/master/src/remote);
- codegen/XDR из [`libvirt-pure`](https://github.com/jimyag/libvirt-rs/tree/main/crates);
- старая, но более обширная реализация [`libvirt-rpc`](https://github.com/polachok/libvirt-rpc).

При этом сетевой мост всё равно понадобится для браузера: WebSocket endpoint должен завершаться доверенным proxy, который преобразует сообщения в libvirt RPC или, предпочтительнее, предоставляет более узкий прикладной API.

## Итоговая рекомендация

1. Для быстрого и надёжного результата: `virt` на native backend + browser WASM frontend.
2. Для исследования pure-Rust/WASI: короткий spike на `libvirt-pure`, не принимая его API и transport за production-ready.
3. Не начинать новый проект на `libvirt-rpc`, `libvirt` или `rust-libvirt`.
4. Если `virt` не оборачивает один конкретный C-вызов, использовать `virt-sys` локально за собственной безопасной абстракцией, а не переводить весь код на сырой FFI.

## Основные первичные источники

- [Официальная страница libvirt: Rust bindings](https://libvirt.org/downloads.html)
- [Официальный репозиторий `libvirt-rust`](https://gitlab.com/libvirt/libvirt-rust)
- [`virt` на docs.rs](https://docs.rs/crate/virt/latest)
- [`virt-sys` на docs.rs](https://docs.rs/crate/virt-sys/latest)
- [Исходники `libvirt-pure` 0.1.1](https://docs.rs/crate/libvirt-pure/0.1.1/source/)
- [Репозиторий `libvirt-pure`](https://github.com/jimyag/libvirt-rs)
- [`libvirt-rpc` на docs.rs](https://docs.rs/crate/libvirt-rpc/latest)
- [Официальная документация протокола libvirt RPC](https://libvirt.org/kbase/internals/rpc.html)
