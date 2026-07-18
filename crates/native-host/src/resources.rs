use virt::connect::Connect;
use virt::domain::{
    Domain, JobStats, MemoryParameters, NUMAParameters, SchedBandwidth, SchedulerInfo,
};
use virt::domain_snapshot::DomainSnapshot;
use virt::error::{Error as VirtError, ErrorNumber};
use virt::interface::Interface;
use virt::network::Network;
use virt::nodedev::NodeDevice;
use virt::nwfilter::NWFilter;
use virt::secret::Secret;
use virt::storage_pool::StoragePool;
use virt::storage_vol::StorageVol;

use crate::{domain_state_name, escape_json, write_line};

pub(crate) fn dispatch(
    id: &str,
    operation: &str,
    arguments: &[&str],
    connection: &Connect,
) -> Result<bool, String> {
    let id = parse_id(id)?;
    let result = match operation {
        "connect.capabilities" => string_result(connection.get_capabilities()),
        "connect.hostname" => string_result(connection.get_hostname()),
        "connect.lib-version" => number_result(connection.get_lib_version()),
        "connect.hypervisor-version" => number_result(connection.get_hyp_version()),
        "connect.sys-info" => string_result(connection.get_sys_info(parse_u32(arguments, 0))),
        "connect.secure" => bool_result(connection.is_secure()),
        "connect.encrypted" => bool_result(connection.is_encrypted()),
        "connect.free-memory" => connection
            .get_free_memory()
            .map(|value| json_string(&value.to_string())),
        "connect.max-vcpus" => {
            let domain_type = optional_string(arguments, 0);
            number_result(connection.get_max_vcpus(domain_type))
        }
        "connect.node-info" => connection.get_node_info().map(|info| {
            format!(
                concat!(
                    "{{\"model\":\"{}\",\"memory\":\"{}\",\"cpus\":{},",
                    "\"mhz\":{},\"nodes\":{},\"sockets\":{},",
                    "\"cores\":{},\"threads\":{}}}"
                ),
                escape_json(&info.model),
                info.memory,
                info.cpus,
                info.mhz,
                info.nodes,
                info.sockets,
                info.cores,
                info.threads
            )
        }),
        "connect.cpu-models" => connection
            .get_cpu_models_names(required(arguments, 0), parse_u32(arguments, 1))
            .map(|values| json_strings(&values)),
        "connect.compare-cpu" => {
            let xml = decode_hex_utf8(required(arguments, 0));
            connection
                .compare_cpu(&xml, parse_u32(arguments, 1))
                .map(json_number)
        }
        "connect.baseline-cpu" => {
            let flags_index = arguments.len().saturating_sub(1);
            let xml = arguments[..flags_index]
                .iter()
                .map(|value| decode_hex_utf8(value))
                .collect::<Vec<_>>();
            let refs = xml.iter().map(String::as_str).collect::<Vec<_>>();
            connection
                .baseline_cpu(&refs, parse_u32(arguments, flags_index))
                .map(|value| json_string(&value))
        }
        "connect.domain-capabilities" => connection
            .get_domain_capabilities(
                optional_string(arguments, 0),
                optional_string(arguments, 1),
                optional_string(arguments, 2),
                optional_string(arguments, 3),
                parse_u32(arguments, 4),
            )
            .map(|value| json_string(&value)),
        "connect.xml-from-native" => {
            let config = decode_hex_utf8(required(arguments, 1));
            connection
                .domain_xml_from_native(required(arguments, 0), &config, parse_u32(arguments, 2))
                .map(|value| json_string(&value))
        }
        "connect.xml-to-native" => {
            let xml = decode_hex_utf8(required(arguments, 1));
            connection
                .domain_xml_to_native(required(arguments, 0), &xml, parse_u32(arguments, 2))
                .map(|value| json_string(&value))
        }
        "connect.keepalive" => connection
            .set_keep_alive(parse_i32(arguments, 0), parse_u32(arguments, 1))
            .map(json_number),
        "connect.cells-free-memory" => connection
            .get_cells_free_memory(parse_i32(arguments, 0), parse_i32(arguments, 1))
            .map(|values| json_u64_strings(&values)),
        "connect.free-pages" => connection
            .get_free_pages(
                &parse_u32_list(required(arguments, 0)),
                parse_u32(arguments, 1),
                parse_u32(arguments, 2),
                parse_u32(arguments, 3),
            )
            .map(|values| json_u64_strings(&values)),
        "connect.storage-pool-sources" => {
            let spec = optional_string(arguments, 1).map(decode_hex_utf8);
            connection
                .find_storage_pool_sources(
                    required(arguments, 0),
                    spec.as_deref(),
                    parse_u32(arguments, 2),
                )
                .map(|value| json_string(&value))
        }

        "domain.info" => with_domain(connection, arguments, |domain| {
            domain.get_info().map(|info| {
                format!(
                    concat!(
                        "{{\"state\":\"{}\",\"maxMemoryKiB\":\"{}\",",
                        "\"memoryKiB\":\"{}\",\"virtualCpus\":{},\"cpuTimeNs\":\"{}\"}}"
                    ),
                    domain_state_name(info.state),
                    info.max_mem,
                    info.memory,
                    info.nr_virt_cpu,
                    info.cpu_time
                )
            })
        }),
        "domain.os-type" => with_domain(connection, arguments, |domain| {
            domain.get_os_type().map(|value| json_string(&value))
        }),
        "domain.hostname" => with_domain(connection, arguments, |domain| {
            domain
                .get_hostname(parse_u32(arguments, 2))
                .map(|value| json_string(&value))
        }),
        "domain.active" => with_domain(connection, arguments, |domain| {
            domain.is_active().map(json_bool)
        }),
        "domain.persistent" => with_domain(connection, arguments, |domain| {
            domain.is_persistent().map(json_bool)
        }),
        "domain.autostart" => with_domain(connection, arguments, |domain| {
            domain.get_autostart().map(json_bool)
        }),
        "domain.set-autostart" => with_domain(connection, arguments, |domain| {
            domain
                .set_autostart(parse_bool(arguments, 2))
                .map(|_| "null".to_owned())
        }),
        "domain.suspend" => domain_action(connection, arguments, |domain| domain.suspend()),
        "domain.resume" => domain_action(connection, arguments, |domain| domain.resume()),
        "domain.reset" => domain_action(connection, arguments, |domain| domain.reset()),
        "domain.max-memory" => with_domain(connection, arguments, |domain| {
            domain
                .get_max_memory()
                .map(|value| json_string(&value.to_string()))
        }),
        "domain.max-vcpus" => with_domain(connection, arguments, |domain| {
            domain.get_max_vcpus().map(json_number)
        }),
        "domain.set-memory" => with_domain(connection, arguments, |domain| {
            domain
                .set_memory(parse_u64(arguments, 2))
                .map(|_| "null".to_owned())
        }),
        "domain.set-max-memory" => with_domain(connection, arguments, |domain| {
            domain
                .set_max_memory(parse_u64(arguments, 2))
                .map(|_| "null".to_owned())
        }),
        "domain.set-vcpus" => with_domain(connection, arguments, |domain| {
            domain
                .set_vcpus(parse_u32(arguments, 2))
                .map(|_| "null".to_owned())
        }),
        "domain.create-xml" => {
            let xml = decode_hex_utf8(required(arguments, 0));
            Domain::create_xml(connection, &xml, parse_u32(arguments, 1))
                .and_then(|domain| domain_json(&domain))
        }
        "domain.define-flags" => {
            let xml = decode_hex_utf8(required(arguments, 0));
            Domain::define_xml_flags(connection, &xml, parse_u32(arguments, 1))
                .and_then(|domain| domain_json(&domain))
        }
        "domain.start-flags" => domain_action(connection, arguments, |domain| {
            domain.create_with_flags(parse_u32(arguments, 2))
        }),
        "domain.shutdown-flags" => domain_action(connection, arguments, |domain| {
            domain.shutdown_flags(parse_u32(arguments, 2))
        }),
        "domain.destroy-flags" => domain_action(connection, arguments, |domain| {
            domain.destroy_flags(parse_u32(arguments, 2))
        }),
        "domain.undefine-flags" => with_domain(connection, arguments, |domain| {
            domain
                .undefine_flags(parse_u32(arguments, 2))
                .map(|_| "null".to_owned())
        }),
        "domain.updated" => with_domain(connection, arguments, |domain| {
            domain.is_updated().map(json_bool)
        }),
        "domain.wakeup" => domain_action(connection, arguments, |domain| {
            domain.pm_wakeup(parse_u32(arguments, 2))
        }),
        "domain.vcpus-flags" => with_domain(connection, arguments, |domain| {
            domain
                .get_vcpus_flags(parse_u32(arguments, 2))
                .map(json_number)
        }),
        "domain.set-vcpus-flags" => with_domain(connection, arguments, |domain| {
            domain
                .set_vcpus_flags(parse_u32(arguments, 2), parse_u32(arguments, 3))
                .map(|_| "null".to_owned())
        }),
        "domain.time" => with_domain(connection, arguments, |domain| {
            domain
                .get_time(parse_u32(arguments, 2))
                .map(|(seconds, nseconds)| {
                    format!(
                        "{{\"seconds\":\"{}\",\"nanoseconds\":{}}}",
                        seconds, nseconds
                    )
                })
        }),
        "domain.set-time" => with_domain(connection, arguments, |domain| {
            domain
                .set_time(
                    parse_i64(arguments, 2),
                    parse_i32(arguments, 3),
                    parse_u32(arguments, 4),
                )
                .map(|_| "null".to_owned())
        }),
        "domain.block-info" => with_domain(connection, arguments, |domain| {
            domain
                .get_block_info(required(arguments, 2), parse_u32(arguments, 3))
                .map(|info| {
                    format!(
                        concat!(
                            "{{\"capacity\":\"{}\",\"allocation\":\"{}\",",
                            "\"physical\":\"{}\"}}"
                        ),
                        info.capacity, info.allocation, info.physical
                    )
                })
        }),
        "domain.block-stats" => with_domain(connection, arguments, |domain| {
            domain.get_block_stats(required(arguments, 2)).map(|stats| {
                format!(
                    concat!(
                        "{{\"readRequests\":\"{}\",\"readBytes\":\"{}\",",
                        "\"writeRequests\":\"{}\",\"writeBytes\":\"{}\",",
                        "\"errors\":\"{}\"}}"
                    ),
                    stats.rd_req, stats.rd_bytes, stats.wr_req, stats.wr_bytes, stats.errs
                )
            })
        }),
        "domain.block-resize" => with_domain(connection, arguments, |domain| {
            domain
                .block_resize(
                    required(arguments, 2),
                    parse_u64(arguments, 3),
                    parse_u32(arguments, 4),
                )
                .map(|_| "null".to_owned())
        }),
        "domain.interface-stats" => with_domain(connection, arguments, |domain| {
            domain.interface_stats(required(arguments, 2)).map(|stats| {
                format!(
                    concat!(
                        "{{\"rxBytes\":\"{}\",\"rxPackets\":\"{}\",",
                        "\"rxErrors\":\"{}\",\"rxDropped\":\"{}\",",
                        "\"txBytes\":\"{}\",\"txPackets\":\"{}\",",
                        "\"txErrors\":\"{}\",\"txDropped\":\"{}\"}}"
                    ),
                    stats.rx_bytes,
                    stats.rx_packets,
                    stats.rx_errs,
                    stats.rx_drop,
                    stats.tx_bytes,
                    stats.tx_packets,
                    stats.tx_errs,
                    stats.tx_drop
                )
            })
        }),
        "domain.memory-stats" => with_domain(connection, arguments, |domain| {
            domain.memory_stats(parse_u32(arguments, 2)).map(|stats| {
                json_array(
                    stats
                        .iter()
                        .map(|stat| format!("{{\"tag\":{},\"value\":\"{}\"}}", stat.tag, stat.val))
                        .collect(),
                )
            })
        }),
        "domain.interface-addresses" => with_domain(connection, arguments, |domain| {
            domain
                .interface_addresses(parse_u32(arguments, 2), parse_u32(arguments, 3))
                .map(|interfaces| {
                    json_array(
                        interfaces
                            .iter()
                            .map(|interface| {
                                let addresses = interface
                                    .addrs
                                    .iter()
                                    .map(|address| {
                                        format!(
                                            concat!(
                                                "{{\"type\":\"{}\",\"address\":\"{}\",",
                                                "\"prefix\":\"{}\"}}"
                                            ),
                                            address.typed,
                                            escape_json(&address.addr),
                                            address.prefix
                                        )
                                    })
                                    .collect();
                                format!(
                                    concat!(
                                        "{{\"name\":\"{}\",\"hardwareAddress\":\"{}\",",
                                        "\"addresses\":{}}}"
                                    ),
                                    escape_json(&interface.name),
                                    escape_json(&interface.hwaddr),
                                    json_array(addresses)
                                )
                            })
                            .collect(),
                    )
                })
        }),
        "domain.memory-parameters" => with_domain(connection, arguments, |domain| {
            domain
                .get_memory_parameters(parse_u32(arguments, 2))
                .map(|params| {
                    format!(
                        concat!(
                            "{{\"hardLimit\":{},\"softLimit\":{},",
                            "\"minimumGuarantee\":{},\"swapHardLimit\":{}}}"
                        ),
                        json_optional_u64(params.hard_limit),
                        json_optional_u64(params.soft_limit),
                        json_optional_u64(params.min_guarantee),
                        json_optional_u64(params.swap_hard_limit)
                    )
                })
        }),
        "domain.set-memory-parameters" => with_domain(connection, arguments, |domain| {
            domain
                .set_memory_parameters(
                    MemoryParameters {
                        hard_limit: parse_optional_u64(arguments, 2),
                        soft_limit: parse_optional_u64(arguments, 3),
                        min_guarantee: parse_optional_u64(arguments, 4),
                        swap_hard_limit: parse_optional_u64(arguments, 5),
                    },
                    parse_u32(arguments, 6),
                )
                .map(|_| "null".to_owned())
        }),
        "domain.numa-parameters" => with_domain(connection, arguments, |domain| {
            domain
                .get_numa_parameters(parse_u32(arguments, 2))
                .map(|params| {
                    format!(
                        "{{\"nodeSet\":{},\"mode\":{}}}",
                        json_optional_string(params.node_set.as_deref()),
                        json_optional_i32(params.mode)
                    )
                })
        }),
        "domain.set-numa-parameters" => with_domain(connection, arguments, |domain| {
            domain
                .set_numa_parameters(
                    NUMAParameters {
                        node_set: optional_string(arguments, 2).map(ToOwned::to_owned),
                        mode: parse_optional_i32(arguments, 3),
                    },
                    parse_u32(arguments, 4),
                )
                .map(|_| "null".to_owned())
        }),
        "domain.pin-vcpu" => with_domain(connection, arguments, |domain| {
            let cpumap = decode_hex(required(arguments, 3));
            domain
                .pin_vcpu_flags(parse_u32(arguments, 2), &cpumap, parse_u32(arguments, 4))
                .map(|_| "null".to_owned())
        }),
        "domain.pin-emulator" => with_domain(connection, arguments, |domain| {
            let cpumap = decode_hex(required(arguments, 2));
            domain
                .pin_emulator(&cpumap, parse_u32(arguments, 3))
                .map(|_| "null".to_owned())
        }),
        "domain.send-key" => with_domain(connection, arguments, |domain| {
            let mut keycodes = parse_u32_list(required(arguments, 4));
            domain
                .send_key(
                    parse_u32(arguments, 2),
                    parse_u32(arguments, 3),
                    keycodes.as_mut_ptr(),
                    keycodes.len() as i32,
                    parse_u32(arguments, 5),
                )
                .map(|_| "null".to_owned())
        }),
        "domain.scheduler" => with_domain(connection, arguments, |domain| {
            let flags = parse_u32(arguments, 2);
            if flags == 0 {
                domain.get_scheduler_parameters()
            } else {
                domain.get_scheduler_parameters_flags(flags)
            }
            .map(|info| scheduler_json(&info))
        }),
        "domain.set-scheduler" => with_domain(connection, arguments, |domain| {
            let info = SchedulerInfo {
                scheduler_type: required(arguments, 2).to_owned(),
                cpu_shares: parse_optional_u64(arguments, 3),
                vcpu_bw: SchedBandwidth {
                    period: parse_optional_u64(arguments, 4),
                    quota: parse_optional_i64(arguments, 5),
                },
                emulator_bw: SchedBandwidth {
                    period: parse_optional_u64(arguments, 6),
                    quota: parse_optional_i64(arguments, 7),
                },
                global_bw: SchedBandwidth {
                    period: parse_optional_u64(arguments, 8),
                    quota: parse_optional_i64(arguments, 9),
                },
                iothread_bw: SchedBandwidth {
                    period: parse_optional_u64(arguments, 10),
                    quota: parse_optional_i64(arguments, 11),
                },
                weight: parse_optional_u32(arguments, 12),
                cap: parse_optional_u32(arguments, 13),
                reservation: parse_optional_i64(arguments, 14),
                limit: parse_optional_i64(arguments, 15),
                shares: parse_optional_i32(arguments, 16),
            };
            let flags = parse_u32(arguments, 17);
            if flags == 0 {
                domain.set_scheduler_parameters(&info)
            } else {
                domain.set_scheduler_parameters_flags(&info, flags)
            }
            .map(|_| "null".to_owned())
        }),
        "domain.job-info" => with_domain(connection, arguments, |domain| {
            domain.get_job_info().map(|stats| job_stats_json(&stats))
        }),
        "domain.job-stats" => with_domain(connection, arguments, |domain| {
            domain
                .get_job_stats(parse_u32(arguments, 2))
                .map(|stats| job_stats_json(&stats))
        }),
        "domain.attach-device" => domain_xml_action(connection, arguments, |domain, xml, flags| {
            domain.attach_device_flags(xml, flags)
        }),
        "domain.detach-device" => domain_xml_action(connection, arguments, |domain, xml, flags| {
            domain.detach_device_flags(xml, flags)
        }),
        "domain.update-device" => domain_xml_action(connection, arguments, |domain, xml, flags| {
            domain.update_device_flags(xml, flags)
        }),
        "domain.managed-save" => with_domain(connection, arguments, |domain| {
            domain
                .managed_save(parse_u32(arguments, 2))
                .map(|_| "null".to_owned())
        }),
        "domain.has-managed-save" => with_domain(connection, arguments, |domain| {
            domain
                .has_managed_save(parse_u32(arguments, 2))
                .map(json_bool)
        }),
        "domain.remove-managed-save" => with_domain(connection, arguments, |domain| {
            domain
                .managed_save_remove(parse_u32(arguments, 2))
                .map(|_| "null".to_owned())
        }),
        "domain.core-dump" => with_domain(connection, arguments, |domain| {
            domain
                .core_dump_with_format(
                    required(arguments, 2),
                    parse_u32(arguments, 3),
                    parse_u32(arguments, 4),
                )
                .map(|_| "null".to_owned())
        }),
        "domain.metadata" => with_domain(connection, arguments, |domain| {
            domain
                .get_metadata(
                    parse_i32(arguments, 2),
                    optional_string(arguments, 3),
                    parse_u32(arguments, 4),
                )
                .map(|value| json_string(&value))
        }),
        "domain.set-metadata" => with_domain(connection, arguments, |domain| {
            let metadata = optional_hex_string(arguments, 3);
            domain
                .set_metadata(
                    parse_i32(arguments, 2),
                    metadata.as_deref(),
                    optional_string(arguments, 4),
                    optional_string(arguments, 5),
                    parse_u32(arguments, 6),
                )
                .map(|_| "null".to_owned())
        }),
        "domain.rename" => with_domain(connection, arguments, |domain| {
            domain.rename(required(arguments, 2), parse_u32(arguments, 3))?;
            domain_json(domain)
        }),
        "domain.set-user-password" => with_domain(connection, arguments, |domain| {
            domain
                .set_user_password(
                    required(arguments, 2),
                    required(arguments, 3),
                    parse_u32(arguments, 4),
                )
                .map(|_| "null".to_owned())
        }),
        "domain.qemu-monitor" => with_domain(connection, arguments, |domain| {
            let command = decode_hex_utf8(required(arguments, 2));
            domain
                .qemu_monitor_command(&command, parse_u32(arguments, 3))
                .map(|value| json_string(&value))
        }),
        "domain.qemu-agent" => with_domain(connection, arguments, |domain| {
            let command = decode_hex_utf8(required(arguments, 2));
            domain
                .qemu_agent_command(&command, parse_i32(arguments, 3), parse_u32(arguments, 4))
                .map(|value| json_string(&value))
        }),
        "domain.restore" => {
            let xml = optional_hex_string(arguments, 1);
            Domain::domain_restore_flags(
                connection,
                required(arguments, 0),
                xml.as_deref(),
                parse_u32(arguments, 2),
            )
            .map(|_| "null".to_owned())
        }
        "domain.save-image-xml" => Domain::save_image_get_xml_desc(
            connection,
            required(arguments, 0),
            parse_u32(arguments, 1),
        )
        .map(|value| json_string(&value)),
        "domain.set-save-image-xml" => {
            let xml = decode_hex_utf8(required(arguments, 1));
            Domain::save_image_define_xml(
                connection,
                required(arguments, 0),
                &xml,
                parse_u32(arguments, 2),
            )
            .map(|_| "null".to_owned())
        }
        "domain.migrate-uri" => with_domain(connection, arguments, |domain| {
            let xml = optional_hex_string(arguments, 4);
            domain
                .migrate_to_uri2(
                    optional_string(arguments, 2),
                    optional_string(arguments, 3),
                    xml.as_deref(),
                    parse_u32(arguments, 7),
                    optional_string(arguments, 5),
                    parse_u64(arguments, 6),
                )
                .map(|_| "null".to_owned())
        }),
        "domain.migrate-connect" => with_domain(connection, arguments, |domain| {
            let mut destination = Connect::open(Some(required(arguments, 2)))?;
            let migrated = domain.migrate(
                &destination,
                parse_u32(arguments, 6),
                optional_string(arguments, 3),
                optional_string(arguments, 4),
                parse_u64(arguments, 5),
            )?;
            let result = domain_json(&migrated);
            drop(migrated);
            let _ = destination.close();
            result
        }),

        "network.list" => connection.list_all_networks(0).and_then(|networks| {
            networks
                .iter()
                .map(network_json)
                .collect::<Result<Vec<_>, _>>()
                .map(json_array)
        }),
        "network.get" => with_network(connection, arguments, network_json),
        "network.xml" => with_network(connection, arguments, |network| {
            network
                .get_xml_desc(parse_u32(arguments, 2))
                .map(|value| json_string(&value))
        }),
        "network.define" => {
            let xml = decode_hex_utf8(required(arguments, 0));
            Network::define_xml(connection, &xml).and_then(|network| network_json(&network))
        }
        "network.create-xml" => {
            let xml = decode_hex_utf8(required(arguments, 0));
            Network::create_xml(connection, &xml).and_then(|network| network_json(&network))
        }
        "network.start" => network_action(connection, arguments, |network| network.create()),
        "network.destroy" => with_network(connection, arguments, |network| {
            network.destroy().map(|_| "null".to_owned())
        }),
        "network.undefine" => with_network(connection, arguments, |network| {
            network.undefine().map(|_| "null".to_owned())
        }),
        "network.set-autostart" => with_network(connection, arguments, |network| {
            network
                .set_autostart(parse_bool(arguments, 2))
                .map(json_number)
        }),
        "network.bridge-name" => with_network(connection, arguments, |network| {
            network.get_bridge_name().map(|value| json_string(&value))
        }),
        "network.update" => with_network(connection, arguments, |network| {
            let xml = decode_hex_utf8(required(arguments, 5));
            network
                .update(
                    parse_u32(arguments, 2),
                    parse_u32(arguments, 3),
                    parse_i32(arguments, 4),
                    &xml,
                    parse_u32(arguments, 6),
                )
                .map(|_| "null".to_owned())
        }),

        "interface.list" => connection.list_all_interfaces(0).and_then(|interfaces| {
            interfaces
                .iter()
                .map(interface_json)
                .collect::<Result<Vec<_>, _>>()
                .map(json_array)
        }),
        "interface.get" => with_interface(connection, arguments, interface_json),
        "interface.xml" => with_interface(connection, arguments, |interface| {
            interface
                .get_xml_desc(parse_u32(arguments, 2))
                .map(|value| json_string(&value))
        }),
        "interface.define" => {
            let xml = decode_hex_utf8(required(arguments, 0));
            Interface::define_xml(connection, &xml, parse_u32(arguments, 1))
                .and_then(|interface| interface_json(&interface))
        }
        "interface.start" => interface_action(connection, arguments, |interface| {
            interface.create(parse_u32(arguments, 2))
        }),
        "interface.destroy" => interface_action(connection, arguments, |interface| {
            interface.destroy(parse_u32(arguments, 2)).map(|_| 0)
        }),
        "interface.undefine" => with_interface(connection, arguments, |interface| {
            interface.undefine().map(|_| "null".to_owned())
        }),

        "storage-pool.list" => connection.list_all_storage_pools(0).and_then(|pools| {
            pools
                .iter()
                .map(storage_pool_json)
                .collect::<Result<Vec<_>, _>>()
                .map(json_array)
        }),
        "storage-pool.get" => with_storage_pool(connection, arguments, storage_pool_json),
        "storage-pool.xml" => with_storage_pool(connection, arguments, |pool| {
            pool.get_xml_desc(parse_u32(arguments, 2))
                .map(|value| json_string(&value))
        }),
        "storage-pool.define" => {
            let xml = decode_hex_utf8(required(arguments, 0));
            StoragePool::define_xml(connection, &xml, parse_u32(arguments, 1))
                .and_then(|pool| storage_pool_json(&pool))
        }
        "storage-pool.create-xml" => {
            let xml = decode_hex_utf8(required(arguments, 0));
            StoragePool::create_xml(connection, &xml, parse_u32(arguments, 1))
                .and_then(|pool| storage_pool_json(&pool))
        }
        "storage-pool.start" => storage_pool_action(connection, arguments, |pool| {
            pool.create(parse_u32(arguments, 2))
        }),
        "storage-pool.build" => storage_pool_action(connection, arguments, |pool| {
            pool.build(parse_u32(arguments, 2))
        }),
        "storage-pool.refresh" => storage_pool_action(connection, arguments, |pool| {
            pool.refresh(parse_u32(arguments, 2))
        }),
        "storage-pool.destroy" => with_storage_pool(connection, arguments, |pool| {
            pool.destroy().map(|_| "null".to_owned())
        }),
        "storage-pool.delete" => with_storage_pool(connection, arguments, |pool| {
            pool.delete(parse_u32(arguments, 2))
                .map(|_| "null".to_owned())
        }),
        "storage-pool.undefine" => with_storage_pool(connection, arguments, |pool| {
            pool.undefine().map(|_| "null".to_owned())
        }),
        "storage-pool.set-autostart" => with_storage_pool(connection, arguments, |pool| {
            pool.set_autostart(parse_bool(arguments, 2))
                .map(json_number)
        }),
        "storage-pool.volumes" => with_storage_pool(connection, arguments, |pool| {
            pool.list_all_volumes(0).and_then(|volumes| {
                volumes
                    .iter()
                    .map(storage_vol_json)
                    .collect::<Result<Vec<_>, _>>()
                    .map(json_array)
            })
        }),
        "storage-pool.by-volume" => with_storage_vol(connection, arguments, |volume| {
            StoragePool::lookup_by_volume(volume).and_then(|pool| storage_pool_json(&pool))
        }),

        "storage-vol.get" => with_storage_vol(connection, arguments, storage_vol_json),
        "storage-vol.xml" => with_storage_vol(connection, arguments, |volume| {
            volume
                .get_xml_desc(parse_u32(arguments, 2))
                .map(|value| json_string(&value))
        }),
        "storage-vol.create" => {
            let pool =
                lookup_storage_pool(connection, required(arguments, 0), required(arguments, 1));
            match pool {
                Ok(pool) => {
                    let xml = decode_hex_utf8(required(arguments, 2));
                    StorageVol::create_xml(&pool, &xml, parse_u32(arguments, 3))
                        .and_then(|volume| storage_vol_json(&volume))
                }
                Err(error) => Err(error),
            }
        }
        "storage-vol.delete" => with_storage_vol(connection, arguments, |volume| {
            volume
                .delete(parse_u32(arguments, 2))
                .map(|_| "null".to_owned())
        }),
        "storage-vol.wipe" => with_storage_vol(connection, arguments, |volume| {
            volume
                .wipe(parse_u32(arguments, 2))
                .map(|_| "null".to_owned())
        }),
        "storage-vol.resize" => with_storage_vol(connection, arguments, |volume| {
            volume
                .resize(parse_u64(arguments, 2), parse_u32(arguments, 3))
                .map(json_number)
        }),
        "storage-vol.by-name" => {
            let pool =
                lookup_storage_pool(connection, required(arguments, 0), required(arguments, 1));
            match pool {
                Ok(pool) => StorageVol::lookup_by_name(&pool, required(arguments, 2))
                    .and_then(|volume| storage_vol_json(&volume)),
                Err(error) => Err(error),
            }
        }
        "storage-vol.clone" => {
            let pool =
                lookup_storage_pool(connection, required(arguments, 0), required(arguments, 1));
            let source =
                lookup_storage_vol(connection, required(arguments, 3), required(arguments, 4));
            match (pool, source) {
                (Ok(pool), Ok(source)) => {
                    let xml = decode_hex_utf8(required(arguments, 2));
                    StorageVol::create_xml_from(&pool, &xml, &source, parse_u32(arguments, 5))
                        .and_then(|volume| storage_vol_json(&volume))
                }
                (Err(error), _) | (_, Err(error)) => Err(error),
            }
        }
        "storage-vol.wipe-pattern" => with_storage_vol(connection, arguments, |volume| {
            volume
                .wipe_pattern(parse_u32(arguments, 2), parse_u32(arguments, 3))
                .map(|_| "null".to_owned())
        }),

        "node-device.list" => connection.list_all_node_devices(0).and_then(|devices| {
            devices
                .iter()
                .map(node_device_json)
                .collect::<Result<Vec<_>, _>>()
                .map(json_array)
        }),
        "node-device.get" => NodeDevice::lookup_by_name(connection, required(arguments, 0))
            .and_then(|device| node_device_json(&device)),
        "node-device.xml" => NodeDevice::lookup_by_name(connection, required(arguments, 0))
            .and_then(|device| {
                device
                    .get_xml_desc(parse_u32(arguments, 1))
                    .map(|value| json_string(&value))
            }),
        "node-device.create" => {
            let xml = decode_hex_utf8(required(arguments, 0));
            NodeDevice::create_xml(connection, &xml, parse_u32(arguments, 1))
                .and_then(|device| node_device_json(&device))
        }
        "node-device.destroy" => NodeDevice::lookup_by_name(connection, required(arguments, 0))
            .and_then(|device| device.destroy().map(|_| "null".to_owned())),
        "node-device.detach" => node_device_action(connection, arguments, |device| device.detach()),
        "node-device.reset" => node_device_action(connection, arguments, |device| device.reset()),
        "node-device.reattach" => {
            node_device_action(connection, arguments, |device| device.reattach())
        }
        "node-device.scsi-host" => NodeDevice::lookup_scsi_host_by_www(
            connection,
            required(arguments, 0),
            required(arguments, 1),
            parse_u32(arguments, 2),
        )
        .and_then(|device| node_device_json(&device)),
        "node-device.detach-flags" => {
            NodeDevice::lookup_by_name(connection, required(arguments, 0)).and_then(|device| {
                device.detach_flags(optional_string(arguments, 1), parse_u32(arguments, 2))?;
                node_device_json(&device)
            })
        }
        "node-device.count" => NodeDevice::num_of_devices(
            connection,
            optional_string(arguments, 0),
            parse_u32(arguments, 1),
        )
        .map(json_number),

        "nwfilter.list" => connection.list_all_nw_filters(0).and_then(|filters| {
            filters
                .iter()
                .map(nwfilter_json)
                .collect::<Result<Vec<_>, _>>()
                .map(json_array)
        }),
        "nwfilter.get" => with_nwfilter(connection, arguments, nwfilter_json),
        "nwfilter.xml" => with_nwfilter(connection, arguments, |filter| {
            filter
                .get_xml_desc(parse_u32(arguments, 2))
                .map(|value| json_string(&value))
        }),
        "nwfilter.define" => {
            let xml = decode_hex_utf8(required(arguments, 0));
            NWFilter::define_xml(connection, &xml).and_then(|filter| nwfilter_json(&filter))
        }
        "nwfilter.undefine" => with_nwfilter(connection, arguments, |filter| {
            filter.undefine().map(|_| "null".to_owned())
        }),

        "secret.list" => connection.list_all_secrets(0).and_then(|secrets| {
            secrets
                .iter()
                .map(secret_json)
                .collect::<Result<Vec<_>, _>>()
                .map(json_array)
        }),
        "secret.get" => with_secret(connection, arguments, secret_json),
        "secret.xml" => with_secret(connection, arguments, |secret| {
            secret
                .get_xml_desc(parse_u32(arguments, secret_flag_index(arguments)))
                .map(|value| json_string(&value))
        }),
        "secret.define" => {
            let xml = decode_hex_utf8(required(arguments, 0));
            Secret::define_xml(connection, &xml, parse_u32(arguments, 1))
                .and_then(|secret| secret_json(&secret))
        }
        "secret.value" => with_secret(connection, arguments, |secret| {
            secret
                .get_value(parse_u32(arguments, secret_flag_index(arguments)))
                .map(|value| json_string(&encode_hex(&value)))
        }),
        "secret.set-value" => with_secret(connection, arguments, |secret| {
            let value_index = secret_flag_index(arguments);
            let value = decode_hex(required(arguments, value_index));
            secret
                .set_value(&value, parse_u32(arguments, value_index + 1))
                .map(|_| "null".to_owned())
        }),
        "secret.undefine" => with_secret(connection, arguments, |secret| {
            secret.undefine().map(|_| "null".to_owned())
        }),

        "snapshot.list" => with_domain(connection, arguments, |domain| {
            domain
                .list_all_snapshots(parse_u32(arguments, 2))
                .and_then(|snapshots| {
                    snapshots
                        .iter()
                        .map(snapshot_json)
                        .collect::<Result<Vec<_>, _>>()
                        .map(json_array)
                })
        }),
        "snapshot.get" => with_snapshot(connection, arguments, snapshot_json),
        "snapshot.get-flags" => {
            let domain = lookup_domain(connection, required(arguments, 0), required(arguments, 1));
            match domain {
                Ok(domain) => DomainSnapshot::lookup_by_name(
                    &domain,
                    required(arguments, 2),
                    parse_u32(arguments, 3),
                )
                .and_then(|snapshot| snapshot_json(&snapshot)),
                Err(error) => Err(error),
            }
        }
        "snapshot.xml" => with_snapshot(connection, arguments, |snapshot| {
            snapshot
                .get_xml_desc(parse_u32(arguments, 3))
                .map(|value| json_string(&value))
        }),
        "snapshot.create" => with_domain(connection, arguments, |domain| {
            let xml = decode_hex_utf8(required(arguments, 2));
            DomainSnapshot::create_xml(domain, &xml, parse_u32(arguments, 3))
                .and_then(|snapshot| snapshot_json(&snapshot))
        }),
        "snapshot.current" => with_domain(connection, arguments, |domain| {
            DomainSnapshot::current(domain, parse_u32(arguments, 2))
                .and_then(|snapshot| snapshot_json(&snapshot))
        }),
        "snapshot.revert" => with_snapshot(connection, arguments, |snapshot| {
            snapshot.revert(parse_u32(arguments, 3))?;
            snapshot_json(snapshot)
        }),
        "snapshot.delete" => with_snapshot(connection, arguments, |snapshot| {
            snapshot
                .delete(parse_u32(arguments, 3))
                .map(|_| "null".to_owned())
        }),
        "snapshot.children" => with_snapshot(connection, arguments, |snapshot| {
            snapshot
                .list_all_children(parse_u32(arguments, 3))
                .and_then(|snapshots| {
                    snapshots
                        .iter()
                        .map(snapshot_json)
                        .collect::<Result<Vec<_>, _>>()
                        .map(json_array)
                })
        }),
        "snapshot.parent" => with_snapshot(connection, arguments, |snapshot| {
            snapshot
                .get_parent(parse_u32(arguments, 3))
                .and_then(|parent| snapshot_json(&parent))
        }),

        _ => return Ok(false),
    };

    match result {
        Ok(json) => write_ok(id, &json)?,
        Err(error) => write_error(id, &error)?,
    }
    Ok(true)
}

fn with_domain<F>(connection: &Connect, args: &[&str], action: F) -> Result<String, VirtError>
where
    F: FnOnce(&Domain) -> Result<String, VirtError>,
{
    let domain = lookup_domain(connection, required(args, 0), required(args, 1))?;
    action(&domain)
}

fn domain_action<F>(connection: &Connect, args: &[&str], action: F) -> Result<String, VirtError>
where
    F: FnOnce(&Domain) -> Result<u32, VirtError>,
{
    with_domain(connection, args, |domain| {
        action(domain)?;
        domain_json(domain)
    })
}

fn domain_xml_action<F>(connection: &Connect, args: &[&str], action: F) -> Result<String, VirtError>
where
    F: FnOnce(&Domain, &str, u32) -> Result<u32, VirtError>,
{
    with_domain(connection, args, |domain| {
        let xml = decode_hex_utf8(required(args, 2));
        action(domain, &xml, parse_u32(args, 3))?;
        domain_json(domain)
    })
}

fn lookup_domain(connection: &Connect, kind: &str, value: &str) -> Result<Domain, VirtError> {
    match kind {
        "name" => Domain::lookup_by_name(connection, value),
        "uuid" => Domain::lookup_by_uuid_string(connection, value),
        _ => Domain::lookup_by_name(connection, ""),
    }
}

fn domain_json(domain: &Domain) -> Result<String, VirtError> {
    let name = domain.get_name()?;
    let uuid = domain.get_uuid_string()?;
    let (state, _) = domain.get_state()?;
    let runtime_id = domain
        .get_id()
        .map(|value| value.to_string())
        .unwrap_or_else(|| "null".to_owned());
    Ok(format!(
        "{{\"id\":{},\"name\":\"{}\",\"state\":\"{}\",\"uuid\":\"{}\"}}",
        runtime_id,
        escape_json(&name),
        domain_state_name(state),
        escape_json(&uuid)
    ))
}

fn with_network<F>(connection: &Connect, args: &[&str], action: F) -> Result<String, VirtError>
where
    F: FnOnce(&Network) -> Result<String, VirtError>,
{
    let network = lookup_network(connection, required(args, 0), required(args, 1))?;
    action(&network)
}

fn lookup_network(connection: &Connect, kind: &str, value: &str) -> Result<Network, VirtError> {
    match kind {
        "name" => Network::lookup_by_name(connection, value),
        "uuid" => Network::lookup_by_uuid_string(connection, value),
        _ => Network::lookup_by_name(connection, ""),
    }
}

fn network_action<F>(connection: &Connect, args: &[&str], action: F) -> Result<String, VirtError>
where
    F: FnOnce(&Network) -> Result<u32, VirtError>,
{
    with_network(connection, args, |network| {
        action(network)?;
        network_json(network)
    })
}

fn network_json(network: &Network) -> Result<String, VirtError> {
    Ok(format!(
        concat!(
            "{{\"name\":\"{}\",\"uuid\":\"{}\",\"active\":{},",
            "\"persistent\":{},\"autostart\":{}}}"
        ),
        escape_json(&network.get_name()?),
        escape_json(&network.get_uuid_string()?),
        network.is_active()?,
        network.is_persistent()?,
        network.get_autostart()?
    ))
}

fn with_interface<F>(connection: &Connect, args: &[&str], action: F) -> Result<String, VirtError>
where
    F: FnOnce(&Interface) -> Result<String, VirtError>,
{
    let interface = match required(args, 0) {
        "name" => Interface::lookup_by_name(connection, required(args, 1))?,
        "mac" => Interface::lookup_by_mac_string(connection, required(args, 1))?,
        _ => Interface::lookup_by_name(connection, "")?,
    };
    action(&interface)
}

fn interface_action<F>(connection: &Connect, args: &[&str], action: F) -> Result<String, VirtError>
where
    F: FnOnce(&Interface) -> Result<u32, VirtError>,
{
    with_interface(connection, args, |interface| {
        action(interface)?;
        interface_json(interface)
    })
}

fn interface_json(interface: &Interface) -> Result<String, VirtError> {
    Ok(format!(
        "{{\"name\":\"{}\",\"mac\":\"{}\",\"active\":{}}}",
        escape_json(&interface.get_name()?),
        escape_json(&interface.get_mac_string()?),
        interface.is_active()?
    ))
}

fn with_storage_pool<F>(connection: &Connect, args: &[&str], action: F) -> Result<String, VirtError>
where
    F: FnOnce(&StoragePool) -> Result<String, VirtError>,
{
    let pool = lookup_storage_pool(connection, required(args, 0), required(args, 1))?;
    action(&pool)
}

fn lookup_storage_pool(
    connection: &Connect,
    kind: &str,
    value: &str,
) -> Result<StoragePool, VirtError> {
    match kind {
        "name" => StoragePool::lookup_by_name(connection, value),
        "uuid" => StoragePool::lookup_by_uuid_string(connection, value),
        "path" => StoragePool::lookup_by_target_path(connection, value),
        _ => StoragePool::lookup_by_name(connection, ""),
    }
}

fn storage_pool_action<F>(
    connection: &Connect,
    args: &[&str],
    action: F,
) -> Result<String, VirtError>
where
    F: FnOnce(&StoragePool) -> Result<u32, VirtError>,
{
    with_storage_pool(connection, args, |pool| {
        action(pool)?;
        storage_pool_json(pool)
    })
}

fn storage_pool_json(pool: &StoragePool) -> Result<String, VirtError> {
    let info = pool.get_info()?;
    Ok(format!(
        concat!(
            "{{\"name\":\"{}\",\"uuid\":\"{}\",\"active\":{},",
            "\"persistent\":{},\"autostart\":{},\"state\":{},",
            "\"capacity\":\"{}\",\"allocation\":\"{}\",\"available\":\"{}\"}}"
        ),
        escape_json(&pool.get_name()?),
        escape_json(&pool.get_uuid_string()?),
        pool.is_active()?,
        pool.is_persistent()?,
        pool.get_autostart()?,
        info.state,
        info.capacity,
        info.allocation,
        info.available
    ))
}

fn with_storage_vol<F>(connection: &Connect, args: &[&str], action: F) -> Result<String, VirtError>
where
    F: FnOnce(&StorageVol) -> Result<String, VirtError>,
{
    let volume = lookup_storage_vol(connection, required(args, 0), required(args, 1))?;
    action(&volume)
}

fn lookup_storage_vol(
    connection: &Connect,
    kind: &str,
    value: &str,
) -> Result<StorageVol, VirtError> {
    match kind {
        "key" => StorageVol::lookup_by_key(connection, value),
        "path" => StorageVol::lookup_by_path(connection, value),
        _ => StorageVol::lookup_by_key(connection, ""),
    }
}

fn storage_vol_json(volume: &StorageVol) -> Result<String, VirtError> {
    let info = volume.get_info()?;
    Ok(format!(
        concat!(
            "{{\"name\":\"{}\",\"key\":\"{}\",\"path\":\"{}\",",
            "\"kind\":{},\"capacity\":\"{}\",\"allocation\":\"{}\"}}"
        ),
        escape_json(&volume.get_name()?),
        escape_json(&volume.get_key()?),
        escape_json(&volume.get_path()?),
        info.kind,
        info.capacity,
        info.allocation
    ))
}

fn node_device_action<F>(
    connection: &Connect,
    args: &[&str],
    action: F,
) -> Result<String, VirtError>
where
    F: FnOnce(&NodeDevice) -> Result<u32, VirtError>,
{
    let device = NodeDevice::lookup_by_name(connection, required(args, 0))?;
    action(&device)?;
    node_device_json(&device)
}

fn node_device_json(device: &NodeDevice) -> Result<String, VirtError> {
    let parent = device
        .get_parent()
        .map(|value| json_string(&value))
        .unwrap_or_else(|_| "null".to_owned());
    let caps = device
        .list_caps()?
        .iter()
        .map(|value| json_string(value))
        .collect::<Vec<_>>();
    Ok(format!(
        "{{\"name\":\"{}\",\"parent\":{},\"capabilities\":[{}]}}",
        escape_json(&device.get_name()?),
        parent,
        caps.join(",")
    ))
}

fn with_nwfilter<F>(connection: &Connect, args: &[&str], action: F) -> Result<String, VirtError>
where
    F: FnOnce(&NWFilter) -> Result<String, VirtError>,
{
    let filter = match required(args, 0) {
        "name" => NWFilter::lookup_by_name(connection, required(args, 1))?,
        "uuid" => NWFilter::lookup_by_uuid_string(connection, required(args, 1))?,
        _ => NWFilter::lookup_by_name(connection, "")?,
    };
    action(&filter)
}

fn nwfilter_json(filter: &NWFilter) -> Result<String, VirtError> {
    Ok(format!(
        "{{\"name\":\"{}\",\"uuid\":\"{}\"}}",
        escape_json(&filter.get_name()?),
        escape_json(&filter.get_uuid_string()?)
    ))
}

fn with_secret<F>(connection: &Connect, args: &[&str], action: F) -> Result<String, VirtError>
where
    F: FnOnce(&Secret) -> Result<String, VirtError>,
{
    let secret = match required(args, 0) {
        "uuid" => Secret::lookup_by_uuid_string(connection, required(args, 1))?,
        "usage" => Secret::lookup_by_usage(connection, parse_i32(args, 1), required(args, 2))?,
        _ => Secret::lookup_by_uuid_string(connection, "")?,
    };
    action(&secret)
}

fn secret_flag_index(arguments: &[&str]) -> usize {
    if required(arguments, 0) == "usage" {
        3
    } else {
        2
    }
}

fn secret_json(secret: &Secret) -> Result<String, VirtError> {
    Ok(format!(
        "{{\"uuid\":\"{}\",\"usageType\":{},\"usageId\":\"{}\"}}",
        escape_json(&secret.get_uuid_string()?),
        secret.get_usage_type()?,
        escape_json(&secret.get_usage_id()?)
    ))
}

fn with_snapshot<F>(connection: &Connect, args: &[&str], action: F) -> Result<String, VirtError>
where
    F: FnOnce(&DomainSnapshot) -> Result<String, VirtError>,
{
    let domain = lookup_domain(connection, required(args, 0), required(args, 1))?;
    let snapshot = DomainSnapshot::lookup_by_name(&domain, required(args, 2), 0)?;
    action(&snapshot)
}

fn snapshot_json(snapshot: &DomainSnapshot) -> Result<String, VirtError> {
    Ok(format!(
        concat!(
            "{{\"name\":\"{}\",\"current\":{},",
            "\"hasMetadata\":{},\"children\":{}}}"
        ),
        escape_json(&snapshot.get_name()?),
        snapshot.is_current(0)?,
        snapshot.has_metadata(0)?,
        snapshot.num_children(0)?
    ))
}

fn scheduler_json(info: &SchedulerInfo) -> String {
    format!(
        concat!(
            "{{\"schedulerType\":\"{}\",\"cpuShares\":{},",
            "\"vcpu\":{{\"period\":{},\"quota\":{}}},",
            "\"emulator\":{{\"period\":{},\"quota\":{}}},",
            "\"global\":{{\"period\":{},\"quota\":{}}},",
            "\"ioThread\":{{\"period\":{},\"quota\":{}}},",
            "\"weight\":{},\"cap\":{},\"reservation\":{},",
            "\"limit\":{},\"shares\":{}}}"
        ),
        escape_json(&info.scheduler_type),
        json_optional_u64(info.cpu_shares),
        json_optional_u64(info.vcpu_bw.period),
        json_optional_i64(info.vcpu_bw.quota),
        json_optional_u64(info.emulator_bw.period),
        json_optional_i64(info.emulator_bw.quota),
        json_optional_u64(info.global_bw.period),
        json_optional_i64(info.global_bw.quota),
        json_optional_u64(info.iothread_bw.period),
        json_optional_i64(info.iothread_bw.quota),
        json_optional_u32(info.weight),
        json_optional_u32(info.cap),
        json_optional_i64(info.reservation),
        json_optional_i64(info.limit),
        json_optional_i32(info.shares)
    )
}

fn job_stats_json(stats: &JobStats) -> String {
    let mut fields = vec![format!("\"type\":{}", stats.r#type)];
    push_optional_i32(
        &mut fields,
        "autoConvergeThrottle",
        stats.auto_converge_throttle,
    );
    push_optional_u64(&mut fields, "compressionBytes", stats.compression_bytes);
    push_optional_u64(&mut fields, "compressionCache", stats.compression_cache);
    push_optional_u64(
        &mut fields,
        "compressionCacheMisses",
        stats.compression_cache_misses,
    );
    push_optional_u64(
        &mut fields,
        "compressionOverflow",
        stats.compression_overflow,
    );
    push_optional_u64(&mut fields, "compressionPages", stats.compression_pages);
    push_optional_u64(&mut fields, "dataProcessed", stats.data_processed);
    push_optional_u64(&mut fields, "dataRemaining", stats.data_remaining);
    push_optional_u64(&mut fields, "dataTotal", stats.data_total);
    push_optional_u64(&mut fields, "diskBps", stats.disk_bps);
    push_optional_u64(&mut fields, "diskProcessed", stats.disk_processed);
    push_optional_u64(&mut fields, "diskRemaining", stats.disk_remaining);
    push_optional_u64(&mut fields, "diskTempTotal", stats.disk_temp_total);
    push_optional_u64(&mut fields, "diskTempUsed", stats.disk_temp_used);
    push_optional_u64(&mut fields, "diskTotal", stats.disk_total);
    push_optional_u64(&mut fields, "downtime", stats.downtime);
    push_optional_u64(&mut fields, "downtimeNet", stats.downtime_net);
    if let Some(value) = stats.error_message.as_deref() {
        fields.push(format!("\"errorMessage\":{}", json_string(value)));
    }
    push_optional_u64(&mut fields, "memoryBps", stats.mem_bps);
    push_optional_u64(&mut fields, "memoryConstant", stats.mem_constant);
    push_optional_u64(&mut fields, "memoryDirtyRate", stats.mem_dirty_rate);
    push_optional_u64(&mut fields, "memoryIteration", stats.mem_iteration);
    push_optional_u64(&mut fields, "memoryNormal", stats.mem_normal);
    push_optional_u64(&mut fields, "memoryNormalBytes", stats.mem_normal_bytes);
    push_optional_u64(&mut fields, "memoryPageSize", stats.mem_page_size);
    push_optional_u64(
        &mut fields,
        "memoryPostcopyRequests",
        stats.mem_postcopy_reqs,
    );
    push_optional_u64(&mut fields, "memoryProcessed", stats.mem_processed);
    push_optional_u64(&mut fields, "memoryRemaining", stats.mem_remaining);
    push_optional_u64(&mut fields, "memoryTotal", stats.mem_total);
    push_optional_i32(&mut fields, "operation", stats.operation);
    push_optional_u64(&mut fields, "setupTime", stats.setup_time);
    if let Some(value) = stats.success {
        fields.push(format!("\"success\":{}", json_bool(value)));
    }
    push_optional_u64(&mut fields, "timeElapsed", stats.time_elapsed);
    push_optional_u64(&mut fields, "timeElapsedNet", stats.time_elapsed_net);
    push_optional_u64(&mut fields, "timeRemaining", stats.time_remaining);
    format!("{{{}}}", fields.join(","))
}

fn push_optional_u64(fields: &mut Vec<String>, name: &str, value: Option<u64>) {
    if let Some(value) = value {
        fields.push(format!("\"{}\":\"{}\"", name, value));
    }
}

fn push_optional_i32(fields: &mut Vec<String>, name: &str, value: Option<i32>) {
    if let Some(value) = value {
        fields.push(format!("\"{}\":{}", name, value));
    }
}

fn required<'a>(arguments: &'a [&str], index: usize) -> &'a str {
    arguments.get(index).copied().unwrap_or("")
}

fn optional_string<'a>(arguments: &'a [&str], index: usize) -> Option<&'a str> {
    arguments
        .get(index)
        .copied()
        .filter(|value| !value.is_empty())
}

fn optional_hex_string(arguments: &[&str], index: usize) -> Option<String> {
    optional_string(arguments, index).map(decode_hex_utf8)
}

fn parse_u32(arguments: &[&str], index: usize) -> u32 {
    required(arguments, index).parse().unwrap_or(0)
}

fn parse_u64(arguments: &[&str], index: usize) -> u64 {
    required(arguments, index).parse().unwrap_or(0)
}

fn parse_i32(arguments: &[&str], index: usize) -> i32 {
    required(arguments, index).parse().unwrap_or(0)
}

fn parse_i64(arguments: &[&str], index: usize) -> i64 {
    required(arguments, index).parse().unwrap_or(0)
}

fn parse_optional_u64(arguments: &[&str], index: usize) -> Option<u64> {
    optional_string(arguments, index).and_then(|value| value.parse().ok())
}

fn parse_optional_i32(arguments: &[&str], index: usize) -> Option<i32> {
    optional_string(arguments, index).and_then(|value| value.parse().ok())
}

fn parse_optional_u32(arguments: &[&str], index: usize) -> Option<u32> {
    optional_string(arguments, index).and_then(|value| value.parse().ok())
}

fn parse_optional_i64(arguments: &[&str], index: usize) -> Option<i64> {
    optional_string(arguments, index).and_then(|value| value.parse().ok())
}

fn parse_u32_list(value: &str) -> Vec<u32> {
    value
        .split(',')
        .filter(|value| !value.is_empty())
        .filter_map(|value| value.parse().ok())
        .collect()
}

fn parse_bool(arguments: &[&str], index: usize) -> bool {
    required(arguments, index) == "true"
}

fn string_result(result: Result<String, VirtError>) -> Result<String, VirtError> {
    result.map(|value| json_string(&value))
}

fn bool_result(result: Result<bool, VirtError>) -> Result<String, VirtError> {
    result.map(json_bool)
}

fn number_result<T: ToString>(result: Result<T, VirtError>) -> Result<String, VirtError> {
    result.map(json_number)
}

fn json_string(value: &str) -> String {
    format!("\"{}\"", escape_json(value))
}

fn json_bool(value: bool) -> String {
    value.to_string()
}

fn json_number(value: impl ToString) -> String {
    value.to_string()
}

fn json_array(values: Vec<String>) -> String {
    format!("[{}]", values.join(","))
}

fn json_strings(values: &[String]) -> String {
    json_array(values.iter().map(|value| json_string(value)).collect())
}

fn json_u64_strings(values: &[u64]) -> String {
    json_array(
        values
            .iter()
            .map(|value| json_string(&value.to_string()))
            .collect(),
    )
}

fn json_optional_u64(value: Option<u64>) -> String {
    value
        .map(|value| json_string(&value.to_string()))
        .unwrap_or_else(|| "null".to_owned())
}

fn json_optional_i32(value: Option<i32>) -> String {
    value.map(json_number).unwrap_or_else(|| "null".to_owned())
}

fn json_optional_u32(value: Option<u32>) -> String {
    value.map(json_number).unwrap_or_else(|| "null".to_owned())
}

fn json_optional_i64(value: Option<i64>) -> String {
    value
        .map(|value| json_string(&value.to_string()))
        .unwrap_or_else(|| "null".to_owned())
}

fn json_optional_string(value: Option<&str>) -> String {
    value.map(json_string).unwrap_or_else(|| "null".to_owned())
}

fn parse_id(id: &str) -> Result<u64, String> {
    id.parse::<u64>()
        .map_err(|_| "request id must be an unsigned integer".to_owned())
}

fn write_ok(id: u64, json: &str) -> Result<(), String> {
    write_line(&format!(
        "{{\"id\":{},\"ok\":true,\"result\":{}}}",
        id, json
    ))
}

fn write_error(id: u64, error: &VirtError) -> Result<(), String> {
    let code = match error.code() {
        ErrorNumber::NoDomain
        | ErrorNumber::NoNetwork
        | ErrorNumber::NoInterface
        | ErrorNumber::NoStoragePool
        | ErrorNumber::NoStorageVolume
        | ErrorNumber::NoNodeDevice
        | ErrorNumber::NoNwfilter
        | ErrorNumber::NoSecret
        | ErrorNumber::NoDomainSnapshot => "NOT_FOUND",
        ErrorNumber::OperationInvalid => "CONFLICT",
        ErrorNumber::InvalidArg => "INVALID_ARGUMENT",
        _ => "HOST_ERROR",
    };
    write_line(&format!(
        concat!(
            "{{\"id\":{},\"ok\":false,\"code\":\"{}\",",
            "\"error\":\"{}\"}}"
        ),
        id,
        code,
        escape_json(error.message())
    ))
}

fn decode_hex_utf8(value: &str) -> String {
    if !value.len().is_multiple_of(2) {
        return String::new();
    }
    let mut decoded = Vec::with_capacity(value.len() / 2);
    for pair in value.as_bytes().chunks_exact(2) {
        let high = decode_hex_digit(pair[0]);
        let low = decode_hex_digit(pair[1]);
        decoded.push((high << 4) | low);
    }
    String::from_utf8(decoded).unwrap_or_default()
}

fn decode_hex(value: &str) -> Vec<u8> {
    if !value.len().is_multiple_of(2) {
        return Vec::new();
    }
    value
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| (decode_hex_digit(pair[0]) << 4) | decode_hex_digit(pair[1]))
        .collect()
}

fn encode_hex(value: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(value.len() * 2);
    for byte in value {
        encoded.push(DIGITS[(byte >> 4) as usize] as char);
        encoded.push(DIGITS[(byte & 0x0f) as usize] as char);
    }
    encoded
}

fn decode_hex_digit(value: u8) -> u8 {
    match value {
        b'0'..=b'9' => value - b'0',
        b'a'..=b'f' => value - b'a' + 10,
        b'A'..=b'F' => value - b'A' + 10,
        _ => 0,
    }
}
