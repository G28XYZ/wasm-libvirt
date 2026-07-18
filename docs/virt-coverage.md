# Покрытие virt 0.4.3

## Client

- [x] `createLibvirtClient`
- [x] `health`
- [x] `close`
- [x] timeout
- [x] cancellation через `AbortSignal`
- [x] read-only connection
- [x] multiplexed binary IPC transport
- [x] authenticated connection callbacks

## Connect

- [x] `getCapabilities`
- [x] `getConnectionHostname`
- [x] `getLibvirtVersion`
- [x] `getHypervisorVersion`
- [x] `getSystemInfo`
- [x] `isConnectionSecure`
- [x] `isConnectionEncrypted`
- [x] `getFreeMemory`
- [x] `getMaxVcpus`
- [x] `getNodeInfo`
- [x] CPU model list
- [x] CPU compare
- [x] CPU baseline
- [x] domain capabilities
- [x] domain XML native conversion
- [x] connection keepalive
- [x] cell free memory
- [x] free pages

## Domain

- [x] `listDomains`
- [x] `getDomain`
- [x] `getDomainXml`
- [x] `defineDomain`
- [x] `undefineDomain`
- [x] `startDomain`
- [x] `shutdownDomain`
- [x] `destroyDomain`
- [x] `rebootDomain`
- [x] `resetDomain`
- [x] `suspendDomain`
- [x] `resumeDomain`
- [x] `getDomainInfo`
- [x] `getDomainOsType`
- [x] `getDomainHostname`
- [x] `isDomainActive`
- [x] `isDomainPersistent`
- [x] `getDomainAutostart`
- [x] `setDomainAutostart`
- [x] `getDomainMaxMemory`
- [x] `setDomainMemory`
- [x] `setDomainMaxMemory`
- [x] `getDomainMaxVcpus`
- [x] `setDomainVcpus`
- [x] transient domain create
- [x] create/define flags
- [x] shutdown/destroy/undefine flags
- [x] PM wakeup
- [x] managed save
- [x] domain restore
- [x] save-image XML
- [x] core dump
- [x] block info/statistics/resize
- [x] interface statistics/addresses
- [x] memory statistics/parameters
- [x] NUMA parameters
- [x] scheduler parameters
- [x] vCPU flags/pinning
- [x] domain time
- [x] domain metadata
- [x] device attach/detach/update
- [x] rename
- [x] user password
- [x] send key
- [x] QEMU monitor command
- [x] QEMU agent command
- [x] migration to URI
- [x] migration through a second `Connect`
- [x] screenshot stream
- [x] console stream
- [x] channel stream
- [x] graphics file-descriptor transport
- [x] job information/statistics

## Domain snapshot

- [x] `listDomainSnapshots`
- [x] `getDomainSnapshot`
- [x] `getDomainSnapshotXml`
- [x] `createDomainSnapshot`
- [x] `getCurrentDomainSnapshot`
- [x] `revertDomainSnapshot`
- [x] `deleteDomainSnapshot`
- [x] `listDomainSnapshotChildren`
- [x] snapshot parent
- [x] snapshot flags при lookup

## Network

- [x] `listNetworks`
- [x] `getNetwork`
- [x] `getNetworkXml`
- [x] `defineNetwork`
- [x] `createNetwork`
- [x] `startNetwork`
- [x] `destroyNetwork`
- [x] `undefineNetwork`
- [x] `setNetworkAutostart`
- [x] active/persistent/autostart в `NetworkSummary`
- [x] bridge name
- [x] network update

## Host interface

- [x] `listInterfaces`
- [x] `getInterface`
- [x] `getInterfaceXml`
- [x] `defineInterface`
- [x] `startInterface`
- [x] `destroyInterface`
- [x] `undefineInterface`
- [x] active state в `InterfaceSummary`

## Storage pool

- [x] `listStoragePools`
- [x] `getStoragePool`
- [x] `getStoragePoolXml`
- [x] `defineStoragePool`
- [x] `createStoragePool`
- [x] `startStoragePool`
- [x] `buildStoragePool`
- [x] `refreshStoragePool`
- [x] `destroyStoragePool`
- [x] `deleteStoragePool`
- [x] `undefineStoragePool`
- [x] `setStoragePoolAutostart`
- [x] `listStorageVolumes`
- [x] info/active/persistent/autostart в `StoragePoolSummary`
- [x] storage source discovery
- [x] lookup pool by volume

## Storage volume

- [x] `getStorageVolume`
- [x] `getStorageVolumeXml`
- [x] `createStorageVolume`
- [x] `deleteStorageVolume`
- [x] `wipeStorageVolume`
- [x] `resizeStorageVolume`
- [x] info в `StorageVolumeSummary`
- [x] clone volume
- [x] wipe pattern
- [x] upload stream
- [x] download stream
- [x] lookup volume by pool and name

## Node device

- [x] `listNodeDevices`
- [x] `getNodeDevice`
- [x] `getNodeDeviceXml`
- [x] `createNodeDevice`
- [x] `destroyNodeDevice`
- [x] `detachNodeDevice`
- [x] `resetNodeDevice`
- [x] `reattachNodeDevice`
- [x] parent/capabilities в `NodeDeviceSummary`
- [x] SCSI host lookup
- [x] detach with driver/flags
- [x] capability-filtered count

## NWFilter

- [x] `listNetworkFilters`
- [x] `getNetworkFilter`
- [x] `getNetworkFilterXml`
- [x] `defineNetworkFilter`
- [x] `undefineNetworkFilter`

## Secret

- [x] `listSecrets`
- [x] `getSecret`
- [x] `getSecretXml`
- [x] `defineSecret`
- [x] `getSecretValue`
- [x] `setSecretValue`
- [x] `undefineSecret`
- [x] lookup по UUID
- [x] lookup по usage type/ID

## Stream

- [x] stream create
- [x] stream send
- [x] stream receive
- [x] stream finish
- [x] stream abort

## Есть в virt, но нет безопасного Node.js seam

- [ ] `Connect::get_all_domain_stats` (`DomainStatsRecord` содержит `TODO`/raw pointer)
- [ ] `Stream::event_add_callback` (callback хранит указатель на `Stream`)
- [ ] `Stream::event_update_callback`
- [ ] `Stream::event_remove_callback`
- [ ] `event_register_default_impl`
- [ ] `event_run_default_impl`
- [ ] `event_add_handle`/update/remove (native fd и opaque pointer)
- [ ] `event_add_timeout`/update/remove (native callback и opaque pointer)

## Нет в высокоуровневом virt 0.4.3

- [ ] PM suspend
- [ ] domain save
- [ ] interface change begin/commit/rollback
- [ ] domain event callbacks
- [ ] network event callbacks
- [ ] storage event callbacks
- [ ] node device event callbacks
- [ ] secret event callbacks

## Native-only

- [ ] `as_ptr`
- [ ] manual `free`
- [ ] manual reference counting
- [ ] file descriptor operations
- [ ] native callback pointers
