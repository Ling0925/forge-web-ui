import { useEffect, useState } from "react";
import { requestInspectorSection } from "../../state/inspector-sections";
import {
  shallowEqual,
  useWorkbenchSelector,
} from "../../state/workbench-store";
import {
  type WorkspaceResourcesTab,
  subscribeWorkspaceResources,
} from "../../state/workspace-resources";
import { EmptyState } from "../primitives/EmptyState";
import { Tabs } from "../primitives/Tabs";
import { ProjectResources } from "./CatalogPanels";
import { Dialog } from "./Dialog";
import { WorkspaceFileManager } from "./WorkspaceFileManager";

function workspaceName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}

/**
 * 「工作区」对话框：工作区文件浏览与项目指令 / 技能 / MCP。
 * 它们描述的是项目而不是某一次执行，因此从会话详情移到这里；
 * 侧栏工作区行与会话详情底部都能打开，并绑定当前选中的会话。
 */
export function WorkspaceResourcesDialog() {
  const [tab, setTab] = useState<WorkspaceResourcesTab | null>(null);
  useEffect(() => subscribeWorkspaceResources(setTab), []);
  const state = useWorkbenchSelector(
    ({ state }) => ({
      activeSessionId: state.activeSessionId,
      activeSnapshot: state.activeSnapshot,
    }),
    shallowEqual,
  );
  if (!tab) return null;
  const snapshot =
    state.activeSnapshot?.id === state.activeSessionId
      ? state.activeSnapshot
      : null;
  return (
    <Dialog
      title={snapshot ? workspaceName(snapshot.workspace) : "工作区"}
      kicker={snapshot?.workspace ?? "工作区文件与项目资源"}
      className="workspace-resources-dialog"
      onClose={() => setTab(null)}
    >
      <div className="modal-content workspace-resources-content">
        {!snapshot ? (
          <EmptyState
            variant="compact"
            title="先选择一个会话"
            description="工作区文件与项目资源按会话所在的工作区读取。"
          />
        ) : (
          <Tabs
            className="workspace-resources-tabs"
            ariaLabel="工作区内容"
            activeId={tab}
            onChange={(id) =>
              setTab(id === "resources" ? "resources" : "files")
            }
            tabs={[
              {
                id: "files",
                label: "工作区文件",
                content: (
                  <WorkspaceFileManager
                    key={`files:${snapshot.id}`}
                    session={snapshot}
                    liveEvents={[]}
                    active={tab === "files"}
                    onSelectChangesTab={() => {
                      setTab(null);
                      requestInspectorSection("changes");
                    }}
                  />
                ),
              },
              {
                id: "resources",
                label: "项目资源",
                content: <ProjectResources key={`resources:${snapshot.id}`} />,
              },
            ]}
          />
        )}
      </div>
    </Dialog>
  );
}
