/**
 * @tyche/module-sdk — the contract for building terminal modules. A module is
 * registered through one manifest (validated against the contracts schema) plus
 * a UI component and optional data/lifecycle hooks. This keeps panels
 * declarative and the product extensible.
 */
export * from './capabilities';
export * from './PanelState';
export * from './ModuleDefinition';
export * from './ModuleRuntime';
