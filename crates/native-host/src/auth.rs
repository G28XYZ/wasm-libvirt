use std::cell::RefCell;
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::os::fd::FromRawFd;

use virt::connect::{Connect, ConnectAuth, ConnectCredential};

thread_local! {
    static AUTH_BRIDGE: RefCell<Option<AuthBridge>> = const { RefCell::new(None) };
}

struct AuthBridge {
    input: BufReader<File>,
    output: File,
    next_id: u32,
    error: Option<String>,
}

/// Opens libvirt through `Connect::open_auth` and forwards credentials to Node.
pub(crate) fn open(uri: &str, credential_types: Vec<u32>, flags: u32) -> Result<Connect, String> {
    // SAFETY: Node creates fd 4 specifically for auth when --auth-types is used.
    let channel = unsafe { File::from_raw_fd(4) };
    let output = channel.try_clone().map_err(|error| error.to_string())?;
    AUTH_BRIDGE.with(|bridge| {
        bridge.replace(Some(AuthBridge {
            input: BufReader::new(channel),
            output,
            next_id: 1,
            error: None,
        }));
    });

    let mut auth = ConnectAuth::new(credential_types, auth_callback);
    let result = Connect::open_auth(Some(uri), &mut auth, flags);
    let bridge_error =
        AUTH_BRIDGE.with(|bridge| bridge.borrow_mut().take().and_then(|bridge| bridge.error));
    if let Some(error) = bridge_error {
        return Err(format!("authentication callback failed: {error}"));
    }
    result.map_err(|error| error.to_string())
}

// The Vec parameter is fixed by virt::connect::ConnectAuthCallback.
#[allow(clippy::ptr_arg)]
fn auth_callback(credentials: &mut Vec<ConnectCredential>) {
    AUTH_BRIDGE.with(|bridge| {
        let mut bridge = bridge.borrow_mut();
        let Some(bridge) = bridge.as_mut() else {
            return;
        };
        match bridge.request(credentials) {
            Ok(results) => {
                for (credential, result) in credentials.iter_mut().zip(results) {
                    credential.result = result;
                }
            }
            Err(error) => bridge.error = Some(error),
        }
    });
}

impl AuthBridge {
    fn request(
        &mut self,
        credentials: &[ConnectCredential],
    ) -> Result<Vec<Option<String>>, String> {
        let id = self.next_id;
        self.next_id = self.next_id.wrapping_add(1);
        let mut request = id.to_string();
        for credential in credentials {
            request.push('\t');
            request.push_str(&credential.typed.to_string());
            request.push('\t');
            request.push_str(&encode_hex(credential.prompt.as_bytes()));
            request.push('\t');
            request.push_str(&encode_hex(credential.challenge.as_bytes()));
            request.push('\t');
            request.push_str(&encode_hex(credential.def_result.as_bytes()));
        }
        request.push('\n');
        self.output
            .write_all(request.as_bytes())
            .map_err(|error| error.to_string())?;
        self.output.flush().map_err(|error| error.to_string())?;

        let mut response = String::new();
        let size = self
            .input
            .read_line(&mut response)
            .map_err(|error| error.to_string())?;
        if size == 0 {
            return Err("Node closed the authentication callback channel".to_owned());
        }
        let response = response.trim_end_matches(['\r', '\n']);
        let fields = response.split('\t').collect::<Vec<_>>();
        if fields.first().copied() != Some(id.to_string().as_str()) {
            return Err("authentication callback returned a mismatched request id".to_owned());
        }
        if fields.len() != credentials.len() + 1 {
            return Err("authentication callback returned an invalid result count".to_owned());
        }
        fields[1..]
            .iter()
            .map(|value| match value.strip_prefix('+') {
                Some(encoded) => decode_hex_utf8(encoded).map(Some),
                None if *value == "-" => Ok(None),
                None => Err("authentication callback returned an invalid result".to_owned()),
            })
            .collect()
    }
}

fn encode_hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        encoded.push(DIGITS[(byte >> 4) as usize] as char);
        encoded.push(DIGITS[(byte & 0x0f) as usize] as char);
    }
    encoded
}

fn decode_hex_utf8(value: &str) -> Result<String, String> {
    if !value.len().is_multiple_of(2) {
        return Err("authentication result contains incomplete hex bytes".to_owned());
    }
    let mut decoded = Vec::with_capacity(value.len() / 2);
    for pair in value.as_bytes().chunks_exact(2) {
        decoded.push((decode_hex_digit(pair[0])? << 4) | decode_hex_digit(pair[1])?);
    }
    String::from_utf8(decoded)
        .map_err(|_| "authentication result must contain valid UTF-8".to_owned())
}

fn decode_hex_digit(value: u8) -> Result<u8, String> {
    match value {
        b'0'..=b'9' => Ok(value - b'0'),
        b'a'..=b'f' => Ok(value - b'a' + 10),
        b'A'..=b'F' => Ok(value - b'A' + 10),
        _ => Err("authentication result contains invalid hex".to_owned()),
    }
}

#[cfg(test)]
mod tests {
    use std::os::fd::OwnedFd;
    use std::os::unix::net::UnixStream;
    use std::thread;

    use super::*;

    #[test]
    fn auth_bridge_round_trips_utf8_credentials() {
        let (host, mut node) = UnixStream::pair().unwrap();
        let output_fd: OwnedFd = host.try_clone().unwrap().into();
        let input_fd: OwnedFd = host.into();
        let output = File::from(output_fd);
        let mut bridge = AuthBridge {
            input: BufReader::new(File::from(input_fd)),
            output,
            next_id: 1,
            error: None,
        };
        let callback = thread::spawn(move || {
            let mut request = String::new();
            BufReader::new(node.try_clone().unwrap())
                .read_line(&mut request)
                .unwrap();
            assert!(request.contains("\t2\t"));
            node.write_all("1\t+d180d0beD0B9\n".as_bytes()).unwrap();
        });
        let credentials = vec![ConnectCredential {
            typed: 2,
            prompt: "Логин".to_owned(),
            challenge: String::new(),
            def_result: String::new(),
            result: None,
        }];

        let results = bridge.request(&credentials).unwrap();

        assert_eq!(results, vec![Some("рой".to_owned())]);
        callback.join().unwrap();
    }
}
