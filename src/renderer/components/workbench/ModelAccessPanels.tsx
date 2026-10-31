/**
 * 模型接入面板的公共入口：实现按职责拆分在 `./model-access/` 下，
 * 这里保持原有的导出与样式加载顺序不变。
 */
// 按拆分前的导入顺序先加载这些模块，保证 model-access.css 在样式层叠中的位置不变。
import "../primitives/Button";
import "../primitives/Checkbox";
import "../primitives/EmptyState";
import "../primitives/Field";
import "../primitives/Input";
import "../primitives/Select";
import "./Dialog";
import "./model-access.css";
export type {
  AccessDraft,
  AccountQuota,
  CatalogTestState,
  ConnectionDraft,
  EditableAlias,
  EditableCredential,
  EditableHeader,
  EditableModelSelection,
  ProviderProtocol,
} from "./model-access/drafts";
export {
  accessDraft,
  aliasDraft,
  aliasesObject,
  connectionDraft,
  credentialRows,
  describedFailure,
  endpointProblem,
  formatTokens,
  freshAccessDraft,
  freshCredentials,
  modelSelectionObject,
  protocolLabel,
  selectionDraft,
} from "./model-access/drafts";
export type {
  ModelOverrideEntry,
  ModelReasoningEffort,
} from "./model-access/model-overrides";
export {
  CONTEXT_WINDOW_PRESETS,
  MAX_OUTPUT_PRESETS,
  REASONING_EFFORT_OPTIONS,
  SUPPORTED_EFFORT_LEVELS,
  cleanModelOverrides,
  clearModelOverride,
  countModelOverrides,
  effectiveModelEntry,
  hasModelOverride,
  updateModelOverride,
} from "./model-access/model-overrides";
export { EffortBars, ModelMetadata } from "./model-access/ModelMetadata";
export {
  ModelSelectionEditor,
  PresetPicker,
  presetEndpoints,
} from "./model-access/ModelSelectionEditor";
export { SourceCardModelPanel } from "./model-access/SourceCardModelPanel";
export { ConnectionEditor } from "./model-access/ConnectionEditor";
export { CredentialsEditor } from "./model-access/CredentialsEditor";
export { AccountLoginPanel } from "./model-access/AccountLoginPanel";
export { ImportPanel } from "./model-access/ImportPanel";
export { RouteGroupsPanel } from "./model-access/RouteGroupsPanel";
