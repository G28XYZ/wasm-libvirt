export const CHECKS = ["wasmCore", "directVirt", "nativeHost"];

export function initialState() {
  return {
    question: "Can WASM and the C-backed virt crate share one portable artifact?",
    checks: Object.fromEntries(
      CHECKS.map((name) => [name, { status: "not-run", summary: "" }]),
    ),
    verdict: "Run the checks to collect evidence.",
  };
}

export function reduce(state, action) {
  if (action.type !== "check-finished") return state;

  const checks = {
    ...state.checks,
    [action.check]: {
      status: action.status,
      summary: action.summary,
    },
  };

  return {
    ...state,
    checks,
    verdict: deriveVerdict(checks),
  };
}

function deriveVerdict(checks) {
  if (checks.wasmCore.status === "failed") {
    return "Portable WASM is not viable until the wasm-core build is fixed.";
  }

  if (
    checks.wasmCore.status === "passed" &&
    checks.directVirt.status === "failed"
  ) {
    if (checks.nativeHost.status === "passed") {
      return "Validated: keep portable logic in WASM and libvirt access in a native virt host adapter.";
    }

    return "Likely split architecture: WASM works, direct virt does not; native libvirt still needs verification.";
  }

  if (checks.directVirt.status === "passed") {
    return "Unexpected result: direct virt compiled for WASM; inspect linkage and runtime behavior before accepting it.";
  }

  return "More checks are required.";
}
