// Compatibility shim. The step-execution logic now lives under ./actions/.
// Kept so existing import sites (pipeline.ts) don't churn; re-target and
// remove in the cleanup step of the refactor.
export { executeAction, registeredStepTypes } from "./actions/registry";
export { resolveSelector } from "./actions/resolve-selector";
export { failedStepResult } from "./actions/types";
export type { StepHandler, StepHandlerRegistry, StepResultMap } from "./actions/types";
