# PROTOTYPE — `virt` + WASM feasibility gate

This is throwaway code. It answers one question:

> Can an npm-installed TypeScript adapter load a Rust/WASM module while using
> the `virt` crate for real libvirt access, and which part must remain native?

The prototype checks three paths independently:

1. a portable Rust crate compiled to `wasm32-unknown-unknown`;
2. the same target with a direct dependency on `virt`;
3. a native Rust binary that opens `test:///default` through `virt`.

Run every check:

```sh
npm run prototype:feasibility
```

Drive the checks interactively:

```sh
npm run prototype:feasibility:interactive
```

The expected architectural result is that the portable core compiles to WASM,
while the `virt` integration remains in a native host adapter linked to the
system libvirt library. The experiment reports evidence instead of treating
that expectation as a foregone conclusion.

On macOS, install libvirt before running the native check if `pkg-config` cannot
find `libvirt.pc`. The prototype itself does not install system packages.
