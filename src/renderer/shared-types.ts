export type {
  ConfigureInput,
  CreateSessionInput,
  AgentEvent,
  ApprovalRequest,
  ErrorInfo,
  FileChange,
  Permission,
  PublicSettings,
  RunInput,
  SessionId,
  SessionStatus,
  SessionSummary,
  ToolCall,
  ToolResult,
} from "@forge/core/shared/schemas";

// View-only paging metadata never enters the persisted session schema.
export type { TranscriptSnapshot as SessionSnapshot } from "./core-compat";

export type {
  PublishedFile,
  PublishedFileResponse,
} from "@forge/core/shared";

export type {
  ForgeBridge,
  RpcRequest,
  RpcResponse,
  HostEvent,
  RunEvent,
  RunHandle,
  RunId,
  UsageFilter,
  UsageStatsDto,
  UsageRequest,
  ModelUsageStat,
  DailyUsageStat,
  SessionUsageStat,
} from "@forge/core/shared/ipc";
