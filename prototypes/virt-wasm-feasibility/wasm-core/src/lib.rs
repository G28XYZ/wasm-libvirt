use wasm_bindgen::prelude::*;

/// Contract marker that a TypeScript wrapper can query after loading WASM.
#[wasm_bindgen]
pub fn adapter_contract_version() -> String {
    "prototype-v1".to_owned()
}

/// Tiny portable behavior to prove that validation can live in the WASM core.
#[wasm_bindgen]
pub fn normalize_connection_uri(uri: &str) -> Result<String, JsError> {
    let uri = uri.trim();

    if uri.is_empty() {
        return Err(JsError::new("connection URI must not be empty"));
    }

    if uri.as_bytes().contains(&0) {
        return Err(JsError::new("connection URI must not contain NUL bytes"));
    }

    Ok(uri.to_owned())
}
