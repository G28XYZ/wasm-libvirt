use virt::connect::Connect;
use wasm_bindgen::prelude::*;

/// This deliberately attempts to cross the unsupported seam. The build result
/// is the experiment: `virt` expects a native libvirt C library.
#[wasm_bindgen]
pub fn can_open_test_driver() -> bool {
    Connect::open(Some("test:///default")).is_ok()
}
