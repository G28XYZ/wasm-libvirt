use std::collections::HashMap;
use std::fs::File;
use std::io::{ErrorKind, Read, Write};
use std::os::fd::FromRawFd;
use std::os::unix::net::UnixStream;
use std::sync::{mpsc, Arc, Mutex};
use std::thread;

use virt::connect::Connect;
use virt::domain::Domain;
use virt::storage_vol::StorageVol;
use virt::stream::Stream;

const MAGIC: &[u8; 4] = b"VST1";
const HEADER_SIZE: usize = 16;
const MAX_PAYLOAD_SIZE: usize = 16 * 1024 * 1024;

const OPEN_SCREENSHOT: u8 = 0x01;
const OPEN_CONSOLE: u8 = 0x02;
const OPEN_CHANNEL: u8 = 0x03;
const OPEN_VOLUME_DOWNLOAD: u8 = 0x04;
const OPEN_VOLUME_UPLOAD: u8 = 0x05;
const OPEN_GRAPHICS: u8 = 0x06;
const INPUT_DATA: u8 = 0x10;
const INPUT_FINISH: u8 = 0x11;
const INPUT_ABORT: u8 = 0x12;

const OUTPUT_READY: u8 = 0x80;
const OUTPUT_DATA: u8 = 0x81;
const OUTPUT_END: u8 = 0x82;
const OUTPUT_ERROR: u8 = 0x83;

type Sessions = Arc<Mutex<HashMap<u32, mpsc::Sender<SessionCommand>>>>;

struct Frame {
    kind: u8,
    id: u32,
    payload: Vec<u8>,
}

#[derive(Clone)]
struct FrameWriter(Arc<Mutex<File>>);

enum SessionCommand {
    Data(Vec<u8>),
    Finish,
    Abort,
}

/// Starts the framed binary stream transport on inherited file descriptor 3.
pub(crate) fn start(connection: Connect) -> Result<(), String> {
    // SAFETY: Node creates fd 3 specifically for this child when --binary-fd is used.
    let input = unsafe { File::from_raw_fd(3) };
    let output = input.try_clone().map_err(|error| error.to_string())?;

    thread::Builder::new()
        .name("libvirt-binary-transport".to_owned())
        .spawn(move || run(input, FrameWriter(Arc::new(Mutex::new(output))), connection))
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn run(mut input: File, writer: FrameWriter, connection: Connect) {
    let sessions: Sessions = Arc::new(Mutex::new(HashMap::new()));
    loop {
        let frame = match read_frame(&mut input) {
            Ok(Some(frame)) => frame,
            Ok(None) => break,
            Err(error) => {
                let _ = writer.write(OUTPUT_ERROR, 0, error.as_bytes());
                break;
            }
        };

        match frame.kind {
            OPEN_SCREENSHOT | OPEN_CONSOLE | OPEN_CHANNEL | OPEN_VOLUME_DOWNLOAD
            | OPEN_VOLUME_UPLOAD | OPEN_GRAPHICS => open_session(
                frame,
                connection.clone(),
                writer.clone(),
                Arc::clone(&sessions),
            ),
            INPUT_DATA | INPUT_FINISH | INPUT_ABORT => {
                let sender = sessions
                    .lock()
                    .ok()
                    .and_then(|sessions| sessions.get(&frame.id).cloned());
                if let Some(sender) = sender {
                    let command = match frame.kind {
                        INPUT_DATA => SessionCommand::Data(frame.payload),
                        INPUT_FINISH => SessionCommand::Finish,
                        _ => SessionCommand::Abort,
                    };
                    let _ = sender.send(command);
                }
            }
            _ => {
                let _ = writer.write(OUTPUT_ERROR, frame.id, b"unsupported binary frame");
            }
        }
    }

    if let Ok(mut sessions) = sessions.lock() {
        for sender in sessions.values() {
            let _ = sender.send(SessionCommand::Abort);
        }
        sessions.clear();
    };
}

fn open_session(frame: Frame, connection: Connect, writer: FrameWriter, sessions: Sessions) {
    let (sender, receiver) = mpsc::channel();
    if let Ok(mut active) = sessions.lock() {
        if active.contains_key(&frame.id) {
            let _ = writer.write(OUTPUT_ERROR, frame.id, b"duplicate stream id");
            return;
        }
        active.insert(frame.id, sender);
    } else {
        let _ = writer.write(OUTPUT_ERROR, frame.id, b"stream registry is unavailable");
        return;
    }

    thread::spawn(move || {
        let result = create_session(&frame, &connection, &writer, receiver);
        if let Err(error) = result {
            let _ = writer.write(OUTPUT_ERROR, frame.id, error.as_bytes());
        }
        if let Ok(mut active) = sessions.lock() {
            active.remove(&frame.id);
        }
    });
}

fn create_session(
    frame: &Frame,
    connection: &Connect,
    writer: &FrameWriter,
    receiver: mpsc::Receiver<SessionCommand>,
) -> Result<(), String> {
    let payload = std::str::from_utf8(&frame.payload)
        .map_err(|_| "binary stream control payload must be UTF-8".to_owned())?;
    let arguments = payload.split('\t').collect::<Vec<_>>();

    match frame.kind {
        OPEN_SCREENSHOT => {
            require_arguments(&arguments, 4)?;
            let stream = Stream::new(connection, 0).map_err(|error| error.to_string())?;
            let domain = lookup_domain(connection, arguments[0], arguments[1])?;
            let mime_type = domain
                .screenshot(
                    &stream,
                    parse_u32(arguments[2], "screen")?,
                    parse_u32(arguments[3], "flags")?,
                )
                .map_err(|error| error.to_string())?;
            writer.write(OUTPUT_READY, frame.id, mime_type.as_bytes())?;
            run_read_session(frame.id, stream, receiver, writer)
        }
        OPEN_CONSOLE | OPEN_CHANNEL => {
            require_arguments(&arguments, 4)?;
            let stream = Stream::new(connection, 0).map_err(|error| error.to_string())?;
            let domain = lookup_domain(connection, arguments[0], arguments[1])?;
            let device = decode_optional_hex(arguments[2])?;
            let flags = parse_u32(arguments[3], "flags")?;
            if frame.kind == OPEN_CONSOLE {
                domain
                    .open_console(device.as_deref(), &stream, flags)
                    .map_err(|error| error.to_string())?;
            } else {
                domain
                    .open_channel(device.as_deref(), &stream, flags)
                    .map_err(|error| error.to_string())?;
            }
            writer.write(OUTPUT_READY, frame.id, &[])?;
            run_duplex_session(frame.id, stream, receiver, writer)
        }
        OPEN_VOLUME_DOWNLOAD | OPEN_VOLUME_UPLOAD => {
            require_arguments(&arguments, 5)?;
            let stream = Stream::new(connection, 0).map_err(|error| error.to_string())?;
            let volume = lookup_storage_volume(connection, arguments[0], arguments[1])?;
            let offset = parse_u64(arguments[2], "offset")?;
            let length = parse_u64(arguments[3], "length")?;
            let flags = parse_u32(arguments[4], "flags")?;
            if frame.kind == OPEN_VOLUME_DOWNLOAD {
                volume
                    .download(&stream, offset, length, flags)
                    .map_err(|error| error.to_string())?;
                writer.write(OUTPUT_READY, frame.id, &[])?;
                run_read_session(frame.id, stream, receiver, writer)
            } else {
                volume
                    .upload(&stream, offset, length, flags)
                    .map_err(|error| error.to_string())?;
                writer.write(OUTPUT_READY, frame.id, &[])?;
                run_write_session(frame.id, stream, receiver, writer)
            }
        }
        OPEN_GRAPHICS => {
            require_arguments(&arguments, 4)?;
            let domain = lookup_domain(connection, arguments[0], arguments[1])?;
            let descriptor = domain
                .open_graphics_fd(
                    parse_u32(arguments[2], "graphics index")?,
                    parse_u32(arguments[3], "flags")?,
                )
                .map_err(|error| error.to_string())?;
            let descriptor = i32::try_from(descriptor)
                .map_err(|_| "graphics file descriptor is out of range".to_owned())?;
            // SAFETY: virDomainOpenGraphicsFD transfers ownership of this new socket fd.
            let socket = unsafe { UnixStream::from_raw_fd(descriptor) };
            writer.write(OUTPUT_READY, frame.id, &[])?;
            run_graphics_session(frame.id, socket, receiver, writer)
        }
        _ => Err("unsupported binary stream operation".to_owned()),
    }
}

fn run_read_session(
    id: u32,
    stream: Stream,
    receiver: mpsc::Receiver<SessionCommand>,
    writer: &FrameWriter,
) -> Result<(), String> {
    let sender = reader_thread(id, stream.clone(), writer.clone());
    forward_reader_result(id, stream, receiver, sender, writer, false)
}

fn run_duplex_session(
    id: u32,
    stream: Stream,
    receiver: mpsc::Receiver<SessionCommand>,
    writer: &FrameWriter,
) -> Result<(), String> {
    let sender = reader_thread(id, stream.clone(), writer.clone());
    forward_reader_result(id, stream, receiver, sender, writer, true)
}

fn reader_thread(
    id: u32,
    stream: Stream,
    writer: FrameWriter,
) -> mpsc::Receiver<Result<(), String>> {
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let result = receive_stream(id, &stream, &writer);
        let _ = sender.send(result);
    });
    receiver
}

fn forward_reader_result(
    id: u32,
    stream: Stream,
    receiver: mpsc::Receiver<SessionCommand>,
    reader: mpsc::Receiver<Result<(), String>>,
    writer: &FrameWriter,
    writable: bool,
) -> Result<(), String> {
    loop {
        if let Ok(result) = reader.try_recv() {
            result?;
            stream.finish().map_err(|error| error.to_string())?;
            writer.write(OUTPUT_END, id, &[])?;
            return Ok(());
        }

        match receiver.recv_timeout(std::time::Duration::from_millis(20)) {
            Ok(SessionCommand::Data(data)) if writable => send_all(&stream, &data)?,
            Ok(SessionCommand::Data(_)) => {
                return Err("stream is not writable".to_owned());
            }
            Ok(SessionCommand::Finish) => {
                stream.finish().map_err(|error| error.to_string())?;
                writer.write(OUTPUT_END, id, &[])?;
                return Ok(());
            }
            Ok(SessionCommand::Abort) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                stream.abort().map_err(|error| error.to_string())?;
                writer.write(OUTPUT_END, id, &[])?;
                return Ok(());
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
    }
}

fn run_write_session(
    id: u32,
    stream: Stream,
    receiver: mpsc::Receiver<SessionCommand>,
    writer: &FrameWriter,
) -> Result<(), String> {
    loop {
        match receiver.recv() {
            Ok(SessionCommand::Data(data)) => send_all(&stream, &data)?,
            Ok(SessionCommand::Finish) => {
                stream.finish().map_err(|error| error.to_string())?;
                writer.write(OUTPUT_END, id, &[])?;
                return Ok(());
            }
            Ok(SessionCommand::Abort) | Err(_) => {
                stream.abort().map_err(|error| error.to_string())?;
                writer.write(OUTPUT_END, id, &[])?;
                return Ok(());
            }
        }
    }
}

fn run_graphics_session(
    id: u32,
    mut socket: UnixStream,
    receiver: mpsc::Receiver<SessionCommand>,
    writer: &FrameWriter,
) -> Result<(), String> {
    let mut input = socket.try_clone().map_err(|error| error.to_string())?;
    let frame_writer = writer.clone();
    let (result_sender, result_receiver) = mpsc::channel();
    thread::spawn(move || {
        let mut buffer = vec![0_u8; 64 * 1024];
        let result = loop {
            match input.read(&mut buffer) {
                Ok(0) => break Ok(()),
                Ok(size) => {
                    if let Err(error) = frame_writer.write(OUTPUT_DATA, id, &buffer[..size]) {
                        break Err(error);
                    }
                }
                Err(error) => break Err(error.to_string()),
            }
        };
        let _ = result_sender.send(result);
    });

    loop {
        if let Ok(result) = result_receiver.try_recv() {
            result?;
            writer.write(OUTPUT_END, id, &[])?;
            return Ok(());
        }
        match receiver.recv_timeout(std::time::Duration::from_millis(20)) {
            Ok(SessionCommand::Data(data)) => {
                socket.write_all(&data).map_err(|error| error.to_string())?
            }
            Ok(SessionCommand::Finish)
            | Ok(SessionCommand::Abort)
            | Err(mpsc::RecvTimeoutError::Disconnected) => {
                let _ = socket.shutdown(std::net::Shutdown::Both);
                writer.write(OUTPUT_END, id, &[])?;
                return Ok(());
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
    }
}

fn receive_stream(id: u32, stream: &Stream, writer: &FrameWriter) -> Result<(), String> {
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
        let size = stream
            .recv(&mut buffer)
            .map_err(|error| error.to_string())?;
        if size == 0 {
            return Ok(());
        }
        writer.write(OUTPUT_DATA, id, &buffer[..size])?;
    }
}

fn send_all(stream: &Stream, mut data: &[u8]) -> Result<(), String> {
    while !data.is_empty() {
        let written = stream.send(data).map_err(|error| error.to_string())?;
        if written == 0 {
            return Err("libvirt stream accepted zero bytes".to_owned());
        }
        data = &data[written..];
    }
    Ok(())
}

fn lookup_domain(connection: &Connect, kind: &str, value: &str) -> Result<Domain, String> {
    match kind {
        "name" => Domain::lookup_by_name(connection, value),
        "uuid" => Domain::lookup_by_uuid_string(connection, value),
        _ => return Err("unsupported domain selector".to_owned()),
    }
    .map_err(|error| error.to_string())
}

fn lookup_storage_volume(
    connection: &Connect,
    kind: &str,
    value: &str,
) -> Result<StorageVol, String> {
    match kind {
        "key" => StorageVol::lookup_by_key(connection, value),
        "path" => StorageVol::lookup_by_path(connection, value),
        _ => return Err("unsupported storage volume selector".to_owned()),
    }
    .map_err(|error| error.to_string())
}

fn read_frame(input: &mut File) -> Result<Option<Frame>, String> {
    let mut header = [0_u8; HEADER_SIZE];
    match input.read_exact(&mut header) {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::UnexpectedEof => return Ok(None),
        Err(error) => return Err(error.to_string()),
    }
    if &header[..4] != MAGIC {
        return Err("invalid binary stream frame magic".to_owned());
    }
    let length = u32::from_be_bytes(header[12..16].try_into().unwrap()) as usize;
    if length > MAX_PAYLOAD_SIZE {
        return Err("binary stream frame exceeds 16 MiB".to_owned());
    }
    let mut payload = vec![0_u8; length];
    input
        .read_exact(&mut payload)
        .map_err(|error| error.to_string())?;
    Ok(Some(Frame {
        kind: header[4],
        id: u32::from_be_bytes(header[8..12].try_into().unwrap()),
        payload,
    }))
}

impl FrameWriter {
    fn write(&self, kind: u8, id: u32, payload: &[u8]) -> Result<(), String> {
        let length = u32::try_from(payload.len())
            .map_err(|_| "binary stream frame is too large".to_owned())?;
        let mut header = [0_u8; HEADER_SIZE];
        header[..4].copy_from_slice(MAGIC);
        header[4] = kind;
        header[8..12].copy_from_slice(&id.to_be_bytes());
        header[12..16].copy_from_slice(&length.to_be_bytes());
        let mut output = self
            .0
            .lock()
            .map_err(|_| "binary stream output is unavailable".to_owned())?;
        output
            .write_all(&header)
            .map_err(|error| error.to_string())?;
        output
            .write_all(payload)
            .map_err(|error| error.to_string())?;
        output.flush().map_err(|error| error.to_string())
    }
}

fn require_arguments(arguments: &[&str], count: usize) -> Result<(), String> {
    if arguments.len() == count {
        Ok(())
    } else {
        Err("invalid binary stream control payload".to_owned())
    }
}

fn parse_u32(value: &str, name: &str) -> Result<u32, String> {
    value
        .parse::<u32>()
        .map_err(|_| format!("{name} must be an unsigned 32-bit integer"))
}

fn parse_u64(value: &str, name: &str) -> Result<u64, String> {
    value
        .parse::<u64>()
        .map_err(|_| format!("{name} must be an unsigned 64-bit integer"))
}

fn decode_optional_hex(value: &str) -> Result<Option<String>, String> {
    if value.is_empty() {
        return Ok(None);
    }
    if !value.len().is_multiple_of(2) {
        return Err("hex string must contain complete bytes".to_owned());
    }
    let mut bytes = Vec::with_capacity(value.len() / 2);
    for pair in value.as_bytes().chunks_exact(2) {
        let high = decode_hex_digit(pair[0])?;
        let low = decode_hex_digit(pair[1])?;
        bytes.push((high << 4) | low);
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| "hex string must contain UTF-8".to_owned())
}

fn decode_hex_digit(value: u8) -> Result<u8, String> {
    match value {
        b'0'..=b'9' => Ok(value - b'0'),
        b'a'..=b'f' => Ok(value - b'a' + 10),
        b'A'..=b'F' => Ok(value - b'A' + 10),
        _ => Err("invalid hex string".to_owned()),
    }
}
