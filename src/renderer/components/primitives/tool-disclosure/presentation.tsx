import {
  Cpu,
  FilePlus,
  FileText,
  FolderOpen,
  FolderPlus,
  GitDiff,
  Globe,
  HardDrive,
  ListBullets,
  ListChecks,
  ListNumbers,
  MagnifyingGlass,
  PaperPlaneTilt,
  PencilSimple,
  PuzzlePiece,
  Robot,
  ShieldCheck,
  TerminalWindow,
  Wrench,
} from "@phosphor-icons/react";

const friendlyLabels: Readonly<Record<string, string>> = {
  read_file: "读取文件",
  write_file: "写入文件",
  append_file: "追加文件",
  edit_file: "编辑文件",
  list_files: "列出文件",
  search_files: "搜索文件",
  make_directory: "创建目录",
  run_command: "运行命令",
  command_task: "查看后台命令",
  read_command_output: "读取命令输出",
  git_status: "查看 Git 状态",
  git_diff: "查看差异",
  git_log: "查看提交记录",
  browser_navigate: "打开网页",
  browser_read: "读取网页",
  browser_click: "点击网页",
  browser_fill: "填写网页",
  browser_screenshot: "截取网页",
  browser_close: "关闭浏览器",
  update_plan: "更新计划",
  create_plan: "创建计划",
  spawn_agent: "委派子任务",
  wait_agents: "等待子任务",
  get_agent_result: "查看子任务结果",
  send_agent_message: "向子代理发送指令",
  resolve_agent: "确认子任务解决",
  cancel_agent: "取消子代理",
  list_agents: "查看子代理列表",
  mcp_list_tools: "列出 MCP 工具",
  mcp_call_tool: "调用 MCP 工具",
  project_context: "读取项目上下文",
  load_skill: "加载技能",
  publish_file: "发布文件",
  web_search: "网页搜索",
  web_fetch: "抓取网页",
  history_search: "搜索历史记录",
  history_read: "读取历史记录",
  list_models: "列出模型",
  update_memory: "更新记忆",
  del_memory: "删除记忆",
  get_memory: "查看记忆",
  search_memory: "搜索记忆",
  forge_memory: "整理记忆",
};

export function friendlyLabel(name: string): string {
  const known = friendlyLabels[name];
  if (known) return known;
  if (name.startsWith("mcp_")) return "MCP 工具";
  return "工具调用";
}

/** One glyph per action family, so a long transcript is scannable by shape. */
export function getToolIcon(name: string) {
  if (name === "read_file") return <FileText size={16} weight="regular" />;
  if (name === "write_file" || name === "append_file")
    return <FilePlus size={16} weight="regular" />;
  if (name === "edit_file") return <PencilSimple size={16} weight="regular" />;
  if (name === "make_directory")
    return <FolderPlus size={16} weight="regular" />;
  if (name === "list_files") return <ListBullets size={16} weight="regular" />;
  if (name === "search_files")
    return <MagnifyingGlass size={16} weight="regular" />;
  if (name === "create_plan" || name === "update_plan")
    return <ListChecks size={16} weight="regular" />;
  if (
    name === "run_command" ||
    name === "command_task" ||
    name === "read_command_output"
  ) {
    return <TerminalWindow size={16} weight="regular" />;
  }
  if (
    name === "spawn_agent" ||
    name === "wait_agents" ||
    name === "get_agent_result" ||
    name === "list_agents" ||
    name === "cancel_agent"
  ) {
    return <Robot size={16} weight="regular" />;
  }
  if (name === "send_agent_message") {
    return <PaperPlaneTilt size={16} weight="regular" />;
  }
  if (name === "resolve_agent") {
    return <ShieldCheck size={16} weight="regular" />;
  }
  if (name.startsWith("git_")) return <GitDiff size={16} weight="regular" />;
  if (name.startsWith("browser_")) return <Globe size={16} weight="regular" />;
  if (name.startsWith("mcp_"))
    return <PuzzlePiece size={16} weight="regular" />;
  // Named families come before the generic "…file…" fallback, which would
  // otherwise swallow publish_file and label it as a plain file read.
  if (name === "project_context") {
    return <FolderOpen size={16} weight="regular" />;
  }
  if (name === "load_skill") return <PuzzlePiece size={16} weight="regular" />;
  if (name === "publish_file")
    return <PaperPlaneTilt size={16} weight="regular" />;
  if (name === "web_search" || name === "web_fetch")
    return <Globe size={16} weight="regular" />;
  if (name === "list_models") return <Cpu size={16} weight="regular" />;
  if (name.startsWith("history_"))
    return <ListNumbers size={16} weight="regular" />;
  if (name.endsWith("_memory")) return <HardDrive size={16} weight="regular" />;
  if (name.includes("file") || name.includes("directory")) {
    return <FileText size={16} weight="regular" />;
  }
  return <Wrench size={16} weight="regular" />;
}

/** Compact, terminal-style durations: 480ms, 1.4s, 25s, 2m 5s. */
export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60)
    return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

/** Local wall-clock for a start timestamp; null when it is not a real date. */
export function formatClock(timestamp: string): string | null {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toLocaleTimeString(undefined, { hour12: false });
}

export function formatStamp(timestamp: string): string | undefined {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toLocaleString();
}

/** Human labels for the most common tool argument and result keys. */
export const paramLabels: Readonly<Record<string, string>> = {
  path: "路径",
  file_path: "路径",
  pattern: "模式",
  glob: "匹配",
  query: "查询",
  needle: "查询",
  content: "内容",
  new_text: "新内容",
  old_text: "原内容",
  text: "文本",
  command: "命令",
  argv: "命令",
  cwd: "工作目录",
  url: "网址",
  selector: "选择器",
  value: "值",
  model: "模型",
  prompt: "提示词",
  line: "行",
  column: "列",
  limit: "上限",
  offset: "偏移",
  recursive: "递归",
  description: "说明",
  name: "名称",
  id: "ID",
  server: "服务",
  tool: "工具",
  mode: "模式",
  depth: "深度",
  task: "任务",
  origin: "来源",
  // Common result fields.
  edited: "已编辑",
  written: "已写入",
  unchanged: "无变化",
  created: "已创建",
  replacements: "替换",
  matches: "匹配数",
  entries: "条目数",
  exit_code: "退出码",
  stdout: "标准输出",
  stderr: "标准错误",
  error: "错误",
  total_lines: "总行数",
  truncated: "已截断",
  scan_truncated: "扫描不完整",
  // Console and result metadata.
  status: "状态",
  signal: "信号",
  duration_ms: "进程耗时",
  timed_out: "已超时",
  spawn_failed: "启动失败",
  partial_line: "末行不完整",
  size_bytes: "字节数",
  lines_returned: "返回行数",
  next_offset: "下一页偏移",
  total_chars: "总字符数",
  output_available: "输出可用",
  output_truncated: "原始输出已截断",
  explanation: "计划说明",
  steps: "计划步骤",
};
