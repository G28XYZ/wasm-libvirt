/// Version of the private contract between the TypeScript adapter and WASM.
#[no_mangle]
pub extern "C" fn adapter_contract_version() -> u32 {
    1
}
