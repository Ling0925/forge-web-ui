import {
  ArrowLeft,
  Gear,
  MagnifyingGlass,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
// 侧效导入保持拆分前的模块加载顺序，确保打包后的 CSS 层叠顺序不变。
import { Button } from "../primitives/Button";
import { EmptyState } from "../primitives/EmptyState";
import "../primitives/Field";
import { Input } from "../primitives/Input";
import "../primitives/Select";
import "../primitives/Tag";
import { AgentProfilesPanel } from "./AgentProfilesPanel";
import { McpPanel } from "./McpPanel";
import { PluginPanel } from "./PluginPanel";
import "./ModelAccessPanels";
import { PhonePairing } from "./PhonePairing";
import { ProviderSources } from "./ProviderSources";
import { ServerConnection } from "./ServerConnection";
import { useSettingsForm } from "./settings/useSettingsForm";
import { ReasoningSection } from "./settings/ReasoningSection";
import { AppearanceSection } from "./settings/AppearanceSection";
import { ExecutionSection } from "./settings/ExecutionSection";
import { ContextSection } from "./settings/ContextSection";
import { LanguageSection } from "./settings/LanguageSection";
import "./settings-page.css";
import "../../styles/settings-models.css";

export function Settings() {
  const form = useSettingsForm();
  const {
    state,
    serviceStatus,
    section,
    setSection,
    query,
    setQuery,
    error,
    notice,
    busy,
    listing,
    setListing,
    mobile,
    agentDirty,
    setAgentDirty,
    agentBusy,
    setAgentBusy,
    sourceBusy,
    heading,
    dirty,
    close,
    reset,
    save,
    catalog,
    matching,
    selected,
    visible,
  } = form;

  return (
    <section
      className="settings-page"
      hidden={!state.isSettingsOpen}
      inert={!state.isSettingsOpen}
      style={!state.isSettingsOpen ? { display: "none" } : undefined}
      aria-label="设置工作区"
    >
      <aside className="settings-navigation">
        <div className="settings-nav-header">
          <Button
            variant="ghost"
            size="sm"
            className="settings-back-btn"
            icon={<ArrowLeft size={16} weight="bold" />}
            onClick={close}
            disabled={busy || listing}
          >
            返回工作台
          </Button>
          <div className="settings-brand">
            <div className="settings-brand-icon">
              <Gear size={20} weight="fill" />
            </div>
            <h1 ref={heading} tabIndex={-1}>
              设置
            </h1>
          </div>
        </div>

        <div className="settings-search">
          <MagnifyingGlass size={16} className="settings-search-icon" />
          <Input
            aria-label="搜索设置"
            placeholder="搜索设置…"
            value={query}
            disabled={agentBusy}
            onChange={(e) => {
              if (agentDirty) {
                if (
                  !window.confirm(
                    "当前智能体有未保存的修改，搜索将重置分类视图并丢失草稿。是否继续？",
                  )
                ) {
                  return;
                }
              }
              setQuery(e.target.value);
            }}
          />
          {query && (
            <button
              type="button"
              className="settings-search-clear"
              disabled={agentBusy}
              onClick={() => {
                if (agentDirty) {
                  if (
                    !window.confirm(
                      "当前智能体有未保存的修改，清空搜索将重置分类视图并丢失草稿。是否继续？",
                    )
                  ) {
                    return;
                  }
                }
                setQuery("");
              }}
              aria-label="清空搜索"
            >
              <X size={13} weight="bold" />
            </button>
          )}
        </div>

        <nav aria-label="设置分类" className="settings-nav-menu">
          {catalog.map((item) => {
            const Icon = item.icon;
            const isCurrent = !query && section === item.id;
            return (
              <button
                type="button"
                key={item.id}
                className={`settings-nav-item ${isCurrent ? "is-active" : ""}`}
                aria-current={isCurrent ? "page" : undefined}
                disabled={agentBusy}
                onClick={() => {
                  if (agentBusy) return;
                  if (item.id !== section && agentDirty) {
                    if (
                      !window.confirm(
                        "当前智能体有未保存的修改，切换分类将丢失这些草稿。是否继续？",
                      )
                    ) {
                      return;
                    }
                  }
                  setSection(item.id);
                  setQuery("");
                }}
              >
                <Icon
                  size={18}
                  weight={isCurrent ? "bold" : "regular"}
                  className="settings-nav-icon"
                />
                <span className="settings-nav-title">{item.title}</span>
              </button>
            );
          })}
        </nav>

        <div className="settings-local-note">
          <div className="settings-local-note-badge">本机配置</div>
          <p>配置与本机 CLI 共享 · 密钥受环境隔离保护，不会回显到页面。</p>
        </div>
      </aside>

      <div className="settings-body">
        <header className="settings-page-header">
          <div className="settings-header-meta">
            <small>偏好设置 / {query ? "搜索" : selected.title}</small>
            <h2>{query ? "搜索结果" : selected.title}</h2>
            <p>
              {query
                ? `找到 ${matching.length} 个相关分区`
                : selected.description}
            </p>
          </div>
          <div className="settings-status" title={serviceStatus.hint}>
            <span
              className="wb-status-dot"
              data-status={
                serviceStatus.state === "configured"
                  ? "ready"
                  : serviceStatus.state === "loading"
                    ? "running"
                    : "awaiting_approval"
              }
              aria-hidden="true"
            />
            <span>{serviceStatus.label}</span>
          </div>
        </header>

        <div className="settings-page-scroll">
          {!state.settings && (
            <p role="status" className="settings-loading-status">
              设置尚未加载，加载完成后即可编辑。
            </p>
          )}
          {query && !matching.length && (
            <EmptyState
              variant="inline"
              title="没有找到相关设置，试试“模型”“token”或“权限”。"
            />
          )}

          <div hidden={!visible("connection")}>
            <ProviderSources
              active={visible("connection")}
              onBusy={(value) => {
                sourceBusy.current = value;
                setListing(value);
              }}
            />
          </div>
          <form
            id="settings-page-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <fieldset
              disabled={busy || listing || !state.settings}
              className="settings-page-fields"
            >
              {visible("connection") && <ReasoningSection form={form} />}

              {visible("appearance") && <AppearanceSection form={form} />}

              {visible("execution") && <ExecutionSection form={form} />}

              {visible("context") && <ContextSection form={form} />}

              {visible("language") && <LanguageSection form={form} />}
            </fieldset>
          </form>

          {visible("agents") && (
            <section
              className="settings-section settings-section-agents"
              aria-label="智能体配置"
            >
              <AgentProfilesPanel
                onDirtyChange={setAgentDirty}
                onBusyChange={setAgentBusy}
              />
            </section>
          )}

          {visible("plugins") && (
            <section
              className="settings-section settings-section-plugins"
              aria-label="插件配置"
            >
              <PluginPanel />
            </section>
          )}

          {visible("mcp") && (
            <section
              className="settings-section settings-section-mcp"
              aria-label="MCP 配置"
            >
              <McpPanel showHeader={false} />
            </section>
          )}

          {visible("pairing") &&
            (mobile ? (
              <section className="settings-section" aria-label="服务器连接配置">
                <ServerConnection dirty={dirty} />
              </section>
            ) : (
              <section className="settings-section" aria-label="手机连接配置">
                <PhonePairing />
              </section>
            ))}
        </div>

        <footer className="settings-save-bar">
          <div className="settings-save-status" aria-live="polite">
            {error ? (
              <p role="alert" className="form-error">
                <WarningCircle size={15} weight="bold" />
                <span>{error}</span>
              </p>
            ) : (
              <div className="settings-status-indicator">
                <span
                  className={`settings-save-dot ${
                    busy
                      ? "is-busy"
                      : notice
                        ? "is-notice"
                        : dirty
                          ? "is-dirty"
                          : "is-clean"
                  }`}
                />
                <p>
                  {busy
                    ? "正在保存…"
                    : notice || (dirty ? "有未保存的修改" : "所有设置已同步")}
                </p>
              </div>
            )}
            <small>返回工作台保留草稿；退出应用不保留草稿。</small>
          </div>
          <div className="settings-save-actions">
            <Button
              variant="ghost"
              disabled={busy || listing || !dirty}
              onClick={reset}
            >
              放弃未保存修改
            </Button>
            <Button
              type="submit"
              form="settings-page-form"
              variant="primary"
              loading={busy}
              disabled={listing || !state.settings || !dirty}
            >
              保存设置
            </Button>
          </div>
        </footer>
      </div>
    </section>
  );
}
