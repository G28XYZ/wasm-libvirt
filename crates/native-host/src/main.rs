use std::env;
use std::io::{self, BufRead, Write};

use virt::connect::Connect;
use virt::error::{Error as VirtError, ErrorNumber};

mod auth;
mod binary;
mod resources;

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let HostOptions {
        uri,
        read_only,
        binary_transport,
        auth_types,
    } = parse_options()?;
    let mut connection = if let Some(auth_types) = auth_types {
        auth::open(&uri, auth_types, u32::from(read_only))
    } else if read_only {
        Connect::open_read_only(Some(&uri)).map_err(|error| error.to_string())
    } else {
        Connect::open(Some(&uri)).map_err(|error| error.to_string())
    }?;

    if binary_transport {
        binary::start(connection.clone())?;
    }

    write_line(&format!(
        "{{\"type\":\"ready\",\"uri\":\"{}\"}}",
        escape_json(&connection.get_uri().map_err(|error| error.to_string())?)
    ))?;

    for line in io::stdin().lock().lines() {
        let line = line.map_err(|error| error.to_string())?;
        let mut fields = line.split('\t');
        let (Some(id), Some(operation)) = (fields.next(), fields.next()) else {
            continue;
        };
        let arguments = fields.collect::<Vec<_>>();
        let argument = arguments.first().copied();

        if resources::dispatch(id, operation, &arguments, &connection)? {
            continue;
        }

        match operation {
            "health" => write_health(id, &connection)?,
            "list-domains" => write_domains(id, &connection)?,
            "get-domain-by-uuid" => match argument {
                Some(uuid) => write_domain_by_uuid(id, &connection, uuid)?,
                None => write_line(&format!(
                    "{{\"id\":{},\"ok\":false,\"error\":\"UUID is required\"}}",
                    parse_id(id)?
                ))?,
            },
            "get-domain-by-name" => match argument {
                Some(name) => write_domain_by_name(id, &connection, name)?,
                None => write_line(&format!(
                    "{{\"id\":{},\"ok\":false,\"error\":\"name is required\"}}",
                    parse_id(id)?
                ))?,
            },
            "get-domain-xml-by-name" => match argument {
                Some(name) => write_domain_xml_by_name(id, &connection, name)?,
                None => write_line(&format!(
                    "{{\"id\":{},\"ok\":false,\"error\":\"name is required\"}}",
                    parse_id(id)?
                ))?,
            },
            "get-domain-xml-by-uuid" => match argument {
                Some(uuid) => write_domain_xml_by_uuid(id, &connection, uuid)?,
                None => write_line(&format!(
                    "{{\"id\":{},\"ok\":false,\"error\":\"UUID is required\"}}",
                    parse_id(id)?
                ))?,
            },
            "define-domain" => match argument {
                Some(encoded_xml) => define_domain(id, &connection, encoded_xml)?,
                None => write_line(&format!(
                    "{{\"id\":{},\"ok\":false,\"error\":\"XML is required\"}}",
                    parse_id(id)?
                ))?,
            },
            "undefine-domain-by-name" => match argument {
                Some(name) => undefine_domain_by_name(id, &connection, name)?,
                None => write_line(&format!(
                    "{{\"id\":{},\"ok\":false,\"error\":\"name is required\"}}",
                    parse_id(id)?
                ))?,
            },
            "undefine-domain-by-uuid" => match argument {
                Some(uuid) => undefine_domain_by_uuid(id, &connection, uuid)?,
                None => write_line(&format!(
                    "{{\"id\":{},\"ok\":false,\"error\":\"UUID is required\"}}",
                    parse_id(id)?
                ))?,
            },
            "start-domain-by-uuid" => match argument {
                Some(uuid) => start_domain_by_uuid(id, &connection, uuid)?,
                None => write_line(&format!(
                    "{{\"id\":{},\"ok\":false,\"error\":\"UUID is required\"}}",
                    parse_id(id)?
                ))?,
            },
            "start-domain-by-name" => match argument {
                Some(name) => start_domain_by_name(id, &connection, name)?,
                None => write_line(&format!(
                    "{{\"id\":{},\"ok\":false,\"error\":\"name is required\"}}",
                    parse_id(id)?
                ))?,
            },
            "shutdown-domain-by-name" => match argument {
                Some(name) => shutdown_domain_by_name(id, &connection, name)?,
                None => write_line(&format!(
                    "{{\"id\":{},\"ok\":false,\"error\":\"name is required\"}}",
                    parse_id(id)?
                ))?,
            },
            "shutdown-domain-by-uuid" => match argument {
                Some(uuid) => shutdown_domain_by_uuid(id, &connection, uuid)?,
                None => write_line(&format!(
                    "{{\"id\":{},\"ok\":false,\"error\":\"UUID is required\"}}",
                    parse_id(id)?
                ))?,
            },
            "destroy-domain-by-name" => match argument {
                Some(name) => destroy_domain_by_name(id, &connection, name)?,
                None => write_line(&format!(
                    "{{\"id\":{},\"ok\":false,\"error\":\"name is required\"}}",
                    parse_id(id)?
                ))?,
            },
            "destroy-domain-by-uuid" => match argument {
                Some(uuid) => destroy_domain_by_uuid(id, &connection, uuid)?,
                None => write_line(&format!(
                    "{{\"id\":{},\"ok\":false,\"error\":\"UUID is required\"}}",
                    parse_id(id)?
                ))?,
            },
            "reboot-domain-by-name" => match argument {
                Some(name) => reboot_domain_by_name(id, &connection, name)?,
                None => write_line(&format!(
                    "{{\"id\":{},\"ok\":false,\"error\":\"name is required\"}}",
                    parse_id(id)?
                ))?,
            },
            "reboot-domain-by-uuid" => match argument {
                Some(uuid) => reboot_domain_by_uuid(id, &connection, uuid)?,
                None => write_line(&format!(
                    "{{\"id\":{},\"ok\":false,\"error\":\"UUID is required\"}}",
                    parse_id(id)?
                ))?,
            },
            "close" => {
                connection.close().map_err(|error| error.to_string())?;
                write_line(&format!(
                    "{{\"id\":{},\"ok\":true,\"result\":{{\"state\":\"closed\"}}}}",
                    parse_id(id)?
                ))?;
                return Ok(());
            }
            _ => write_line(&format!(
                "{{\"id\":{},\"ok\":false,\"error\":\"unsupported operation\"}}",
                parse_id(id)?
            ))?,
        }
    }

    let _ = connection.close();
    Ok(())
}

fn undefine_domain_by_name(id: &str, connection: &Connect, name: &str) -> Result<(), String> {
    let id = parse_id(id)?;
    let domain = match virt::domain::Domain::lookup_by_name(connection, name) {
        Ok(domain) => domain,
        Err(error) => return write_lookup_error(id, &error),
    };

    if let Err(error) = domain.undefine() {
        return write_domain_action_error(id, &error);
    }

    write_line(&format!("{{\"id\":{},\"ok\":true,\"result\":null}}", id))
}

fn undefine_domain_by_uuid(id: &str, connection: &Connect, uuid: &str) -> Result<(), String> {
    let id = parse_id(id)?;
    let domain = match virt::domain::Domain::lookup_by_uuid_string(connection, uuid) {
        Ok(domain) => domain,
        Err(error) => return write_lookup_error(id, &error),
    };

    if let Err(error) = domain.undefine() {
        return write_domain_action_error(id, &error);
    }

    write_line(&format!("{{\"id\":{},\"ok\":true,\"result\":null}}", id))
}

fn define_domain(id: &str, connection: &Connect, encoded_xml: &str) -> Result<(), String> {
    let id = parse_id(id)?;
    let xml = decode_hex_utf8(encoded_xml)?;
    let domain = match virt::domain::Domain::define_xml(connection, &xml) {
        Ok(domain) => domain,
        Err(error) => return write_definition_error(id, &error),
    };

    write_domain_result(id, &domain)
}

fn write_definition_error(id: u64, error: &VirtError) -> Result<(), String> {
    let code = match error.code() {
        ErrorNumber::XmlError
        | ErrorNumber::XmlDetail
        | ErrorNumber::NoName
        | ErrorNumber::NoOs => "INVALID_DEFINITION",
        _ => "HOST_ERROR",
    };
    write_line(&format!(
        concat!(
            "{{\"id\":{},\"ok\":false,",
            "\"code\":\"{}\",",
            "\"error\":\"{}\"}}"
        ),
        id,
        code,
        escape_json(error.message())
    ))
}

fn decode_hex_utf8(value: &str) -> Result<String, String> {
    if !value.len().is_multiple_of(2) {
        return Err("hex-encoded XML must contain complete bytes".to_owned());
    }

    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len() / 2);
    for pair in bytes.chunks_exact(2) {
        let high = decode_hex_digit(pair[0])?;
        let low = decode_hex_digit(pair[1])?;
        decoded.push((high << 4) | low);
    }

    String::from_utf8(decoded).map_err(|_| "domain XML must be valid UTF-8".to_owned())
}

fn decode_hex_digit(value: u8) -> Result<u8, String> {
    match value {
        b'0'..=b'9' => Ok(value - b'0'),
        b'a'..=b'f' => Ok(value - b'a' + 10),
        b'A'..=b'F' => Ok(value - b'A' + 10),
        _ => Err("domain XML contains invalid hex encoding".to_owned()),
    }
}

fn write_domain_xml_by_name(id: &str, connection: &Connect, name: &str) -> Result<(), String> {
    let id = parse_id(id)?;
    let domain = match virt::domain::Domain::lookup_by_name(connection, name) {
        Ok(domain) => domain,
        Err(error) => return write_lookup_error(id, &error),
    };
    let xml = domain.get_xml_desc(0).map_err(|error| error.to_string())?;

    write_line(&format!(
        "{{\"id\":{},\"ok\":true,\"result\":\"{}\"}}",
        id,
        escape_json(&xml)
    ))
}

fn write_domain_xml_by_uuid(id: &str, connection: &Connect, uuid: &str) -> Result<(), String> {
    let id = parse_id(id)?;
    let domain = match virt::domain::Domain::lookup_by_uuid_string(connection, uuid) {
        Ok(domain) => domain,
        Err(error) => return write_lookup_error(id, &error),
    };
    let xml = domain.get_xml_desc(0).map_err(|error| error.to_string())?;

    write_line(&format!(
        "{{\"id\":{},\"ok\":true,\"result\":\"{}\"}}",
        id,
        escape_json(&xml)
    ))
}

fn reboot_domain_by_name(id: &str, connection: &Connect, name: &str) -> Result<(), String> {
    let id = parse_id(id)?;
    let domain = match virt::domain::Domain::lookup_by_name(connection, name) {
        Ok(domain) => domain,
        Err(error) => return write_lookup_error(id, &error),
    };

    if let Err(error) = domain.reboot(virt::sys::VIR_DOMAIN_REBOOT_DEFAULT) {
        return write_domain_action_error(id, &error);
    }

    write_domain_result(id, &domain)
}

fn reboot_domain_by_uuid(id: &str, connection: &Connect, uuid: &str) -> Result<(), String> {
    let id = parse_id(id)?;
    let domain = match virt::domain::Domain::lookup_by_uuid_string(connection, uuid) {
        Ok(domain) => domain,
        Err(error) => return write_lookup_error(id, &error),
    };

    if let Err(error) = domain.reboot(virt::sys::VIR_DOMAIN_REBOOT_DEFAULT) {
        return write_domain_action_error(id, &error);
    }

    write_domain_result(id, &domain)
}

fn destroy_domain_by_name(id: &str, connection: &Connect, name: &str) -> Result<(), String> {
    let id = parse_id(id)?;
    let domain = match virt::domain::Domain::lookup_by_name(connection, name) {
        Ok(domain) => domain,
        Err(error) => return write_lookup_error(id, &error),
    };

    if let Err(error) = domain.destroy() {
        return write_domain_action_error(id, &error);
    }

    write_domain_result(id, &domain)
}

fn destroy_domain_by_uuid(id: &str, connection: &Connect, uuid: &str) -> Result<(), String> {
    let id = parse_id(id)?;
    let domain = match virt::domain::Domain::lookup_by_uuid_string(connection, uuid) {
        Ok(domain) => domain,
        Err(error) => return write_lookup_error(id, &error),
    };

    if let Err(error) = domain.destroy() {
        return write_domain_action_error(id, &error);
    }

    write_domain_result(id, &domain)
}

fn shutdown_domain_by_name(id: &str, connection: &Connect, name: &str) -> Result<(), String> {
    let id = parse_id(id)?;
    let domain = match virt::domain::Domain::lookup_by_name(connection, name) {
        Ok(domain) => domain,
        Err(error) => return write_lookup_error(id, &error),
    };

    if !domain.is_active().map_err(|error| error.to_string())? {
        return write_conflict(id, "domain is not active");
    }

    if let Err(error) = domain.shutdown() {
        return write_domain_action_error(id, &error);
    }

    write_domain_result(id, &domain)
}

fn shutdown_domain_by_uuid(id: &str, connection: &Connect, uuid: &str) -> Result<(), String> {
    let id = parse_id(id)?;
    let domain = match virt::domain::Domain::lookup_by_uuid_string(connection, uuid) {
        Ok(domain) => domain,
        Err(error) => return write_lookup_error(id, &error),
    };

    if !domain.is_active().map_err(|error| error.to_string())? {
        return write_conflict(id, "domain is not active");
    }

    if let Err(error) = domain.shutdown() {
        return write_domain_action_error(id, &error);
    }

    write_domain_result(id, &domain)
}

fn start_domain_by_name(id: &str, connection: &Connect, name: &str) -> Result<(), String> {
    let id = parse_id(id)?;
    let domain = match virt::domain::Domain::lookup_by_name(connection, name) {
        Ok(domain) => domain,
        Err(error) => return write_lookup_error(id, &error),
    };

    start_domain(id, &domain)
}

fn start_domain_by_uuid(id: &str, connection: &Connect, uuid: &str) -> Result<(), String> {
    let id = parse_id(id)?;
    let domain = match virt::domain::Domain::lookup_by_uuid_string(connection, uuid) {
        Ok(domain) => domain,
        Err(error) => return write_lookup_error(id, &error),
    };

    start_domain(id, &domain)
}

fn start_domain(id: u64, domain: &virt::domain::Domain) -> Result<(), String> {
    if domain.is_active().map_err(|error| error.to_string())? {
        return write_conflict(id, "domain is already active");
    }

    if let Err(error) = domain.create() {
        return write_domain_action_error(id, &error);
    }

    write_domain_result(id, domain)
}

fn write_conflict(id: u64, message: &str) -> Result<(), String> {
    write_line(&format!(
        concat!(
            "{{\"id\":{},\"ok\":false,",
            "\"code\":\"CONFLICT\",",
            "\"error\":\"{}\"}}"
        ),
        id,
        escape_json(message)
    ))
}

fn write_domain_action_error(id: u64, error: &VirtError) -> Result<(), String> {
    let code = if error.code() == ErrorNumber::OperationInvalid {
        "CONFLICT"
    } else {
        "HOST_ERROR"
    };

    write_line(&format!(
        concat!(
            "{{\"id\":{},\"ok\":false,",
            "\"code\":\"{}\",",
            "\"error\":\"{}\"}}"
        ),
        id,
        code,
        escape_json(error.message())
    ))
}

fn write_domain_result(id: u64, domain: &virt::domain::Domain) -> Result<(), String> {
    let name = domain.get_name().map_err(|error| error.to_string())?;
    let uuid = domain
        .get_uuid_string()
        .map_err(|error| error.to_string())?;
    let (state, _) = domain.get_state().map_err(|error| error.to_string())?;
    let runtime_id = domain
        .get_id()
        .map(|value| value.to_string())
        .unwrap_or_else(|| "null".to_owned());

    write_line(&format!(
        concat!(
            "{{\"id\":{},\"ok\":true,\"result\":{{",
            "\"id\":{},",
            "\"name\":\"{}\",",
            "\"state\":\"{}\",",
            "\"uuid\":\"{}\"",
            "}}}}"
        ),
        id,
        runtime_id,
        escape_json(&name),
        domain_state_name(state),
        escape_json(&uuid)
    ))
}

fn write_domain_by_name(id: &str, connection: &Connect, name: &str) -> Result<(), String> {
    let id = parse_id(id)?;
    let domain = match virt::domain::Domain::lookup_by_name(connection, name) {
        Ok(domain) => domain,
        Err(error) => return write_lookup_error(id, &error),
    };
    write_domain_result(id, &domain)
}

fn write_domain_by_uuid(id: &str, connection: &Connect, uuid: &str) -> Result<(), String> {
    let id = parse_id(id)?;
    let domain = match virt::domain::Domain::lookup_by_uuid_string(connection, uuid) {
        Ok(domain) => domain,
        Err(error) => return write_lookup_error(id, &error),
    };
    write_domain_result(id, &domain)
}

fn write_lookup_error(id: u64, error: &VirtError) -> Result<(), String> {
    let code = if error.code() == ErrorNumber::NoDomain {
        "NOT_FOUND"
    } else {
        "HOST_ERROR"
    };

    write_line(&format!(
        concat!(
            "{{\"id\":{},\"ok\":false,",
            "\"code\":\"{}\",",
            "\"error\":\"{}\"}}"
        ),
        id,
        code,
        escape_json(error.message())
    ))
}

fn write_domains(id: &str, connection: &Connect) -> Result<(), String> {
    let id = parse_id(id)?;
    let domains = connection
        .list_all_domains(0)
        .map_err(|error| error.to_string())?;
    let mut results = Vec::with_capacity(domains.len());

    for domain in domains {
        let name = domain.get_name().map_err(|error| error.to_string())?;
        let uuid = domain
            .get_uuid_string()
            .map_err(|error| error.to_string())?;
        let (state, _) = domain.get_state().map_err(|error| error.to_string())?;
        let runtime_id = domain
            .get_id()
            .map(|value| value.to_string())
            .unwrap_or_else(|| "null".to_owned());

        results.push(format!(
            concat!(
                "{{",
                "\"id\":{},",
                "\"name\":\"{}\",",
                "\"state\":\"{}\",",
                "\"uuid\":\"{}\"",
                "}}"
            ),
            runtime_id,
            escape_json(&name),
            domain_state_name(state),
            escape_json(&uuid)
        ));
    }

    write_line(&format!(
        "{{\"id\":{},\"ok\":true,\"result\":[{}]}}",
        id,
        results.join(",")
    ))
}

pub(crate) fn domain_state_name(state: virt::sys::virDomainState) -> &'static str {
    match state {
        virt::sys::VIR_DOMAIN_RUNNING => "running",
        virt::sys::VIR_DOMAIN_BLOCKED => "blocked",
        virt::sys::VIR_DOMAIN_PAUSED => "paused",
        virt::sys::VIR_DOMAIN_SHUTDOWN => "shutdown",
        virt::sys::VIR_DOMAIN_SHUTOFF => "shutoff",
        virt::sys::VIR_DOMAIN_CRASHED => "crashed",
        virt::sys::VIR_DOMAIN_PMSUSPENDED => "suspended",
        _ => "unknown",
    }
}

struct HostOptions {
    uri: String,
    read_only: bool,
    binary_transport: bool,
    auth_types: Option<Vec<u32>>,
}

fn parse_options() -> Result<HostOptions, String> {
    let mut args = env::args().skip(1);
    let mut uri = None;
    let mut read_only = false;
    let mut binary_transport = false;
    let mut auth_types = None;
    while let Some(argument) = args.next() {
        match argument.as_str() {
            "--uri" => uri = args.next(),
            "--read-only" => read_only = true,
            "--binary-fd" => binary_transport = true,
            "--auth-types" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--auth-types requires a value".to_owned())?;
                let parsed = value
                    .split(',')
                    .map(|item| {
                        item.parse::<u32>().map_err(|_| {
                            "auth credential type must be an unsigned integer".to_owned()
                        })
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                if parsed.is_empty() {
                    return Err("at least one auth credential type is required".to_owned());
                }
                auth_types = Some(parsed);
            }
            _ => return Err("unsupported native host argument".to_owned()),
        }
    }
    let uri = uri.filter(|value| !value.is_empty()).ok_or_else(|| {
        "usage: wasm-libvirt-host --uri <connection-uri> [--read-only] [--binary-fd] [--auth-types <types>]".to_owned()
    })?;
    Ok(HostOptions {
        uri,
        read_only,
        binary_transport,
        auth_types,
    })
}

fn write_health(id: &str, connection: &Connect) -> Result<(), String> {
    let id = parse_id(id)?;
    let alive = connection.is_alive().map_err(|error| error.to_string())?;
    let hypervisor = connection.get_type().map_err(|error| error.to_string())?;
    let uri = connection.get_uri().map_err(|error| error.to_string())?;

    write_line(&format!(
        concat!(
            "{{\"id\":{},\"ok\":true,\"result\":{{",
            "\"state\":\"ready\",",
            "\"alive\":{},",
            "\"hypervisor\":\"{}\",",
            "\"uri\":\"{}\"",
            "}}}}"
        ),
        id,
        alive,
        escape_json(&hypervisor),
        escape_json(&uri)
    ))
}

fn parse_id(id: &str) -> Result<u64, String> {
    id.parse::<u64>()
        .map_err(|_| "request id must be an unsigned integer".to_owned())
}

pub(crate) fn write_line(line: &str) -> Result<(), String> {
    let mut stdout = io::stdout().lock();
    writeln!(stdout, "{line}").map_err(|error| error.to_string())?;
    stdout.flush().map_err(|error| error.to_string())
}

pub(crate) fn escape_json(value: &str) -> String {
    value
        .chars()
        .flat_map(|character| match character {
            '\"' => "\\\"".chars().collect::<Vec<_>>(),
            '\\' => "\\\\".chars().collect::<Vec<_>>(),
            '\n' => "\\n".chars().collect::<Vec<_>>(),
            '\r' => "\\r".chars().collect::<Vec<_>>(),
            '\t' => "\\t".chars().collect::<Vec<_>>(),
            other => vec![other],
        })
        .collect()
}
