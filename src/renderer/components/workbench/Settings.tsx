import {
  ArrowLeft,
  CaretRight,
  Gear,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";
import { useEffect } from "react";
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
import { GeneralSection } from "./settings/GeneralSection";
import { ReasoningSection } from "./settings/ReasoningSection";
import { LanguageSection } from "./settings/LanguageSection";
import { SECTION_GROUPS } from "./settings/settings-options";
import "./settings-page.css";
import "../../styles/settings-models.css";

export function Settings() {
  const form = useSettingsForm();
  const {
    state,
    serviceStatus,
    section,
    goTo,
    query,
    setQuery,
    results,
    titleOf,
    focusSetting,
    setFocusSetting,
    listing,
    setListing,
    mobile,
    setAgentDirty,
    agentBusy,
    setAgentBusy,
    sourceBusy,
    heading,
    close,
    confirmDialog,
    catalog,
    selected,
    lspDirty,
    migrationNotice,
  } = form;
  const searching = query.trim().length > 0;
  const visible = (id: typeof section) => section === id;

  // A search result lands on its row: scroll it into view and flash it.
  useEffect(() => {
    if (!focusSetting) return;
    const frame = requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(
        `.settings-page [data-setting="${focusSetting}"]`,
      );
      if (!row) return;
      row.scrollIntoView({ block: "center" });
      row.classList.add("is-highlighted");
      setTimeout(() => row.classList.remove("is-highlighted"), 1600);
      setFocusSetting(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusSetting, setFocusSetting]);

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
            onClick={() => void close()}
            disabled={listing || agentBusy}
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
            placeholder="搜索设置项…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="settings-search-clear"
              onClick={() => setQuery("")}
              aria-label="清空搜索"
            >
              <X size={13} weight="bold" />
            </button>
          )}
        </div>

        <nav aria-label="设置分类" className="settings-nav-menu">
          {SECTION_GROUPS.map((group) => (
            <div className="settings-nav-group" key={group}>
              <div className="settings-nav-group-title" aria-hidden="true">
                {group}
              </div>
              {catalog
                .filter((item) => item.group === group)
                .map((item) => {
                  const Icon = item.icon;
                  const isCurrent = !searching && section === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`settings-nav-item ${isCurrent ? "is-active" : ""}`}
                      aria-current={isCurrent ? "page" : undefined}
                      disabled={agentBusy}
                      onClick={() => void goTo(item.id)}
                    >
                      <Icon
                        size={18}
                        weight={isCurrent ? "bold" : "regular"}
                        className="settings-nav-icon"
                      />
                      <span className="settings-nav-title">{item.title}</span>
                      {item.id === "language" && lspDirty && (
                        <span
                          className="settings-nav-unsaved"
                          title="有未保存的修改"
                          aria-label="有未保存的修改"
                        />
                      )}
                    </button>
                  );
                })}
            </div>
          ))}
        </nav>

        <div className="settings-local-note">
          <div className="settings-local-note-badge">本机配置</div>
          <p>配置与本机 CLI 共享 · 密钥受环境隔离保护，不会回显到页面。</p>
        </div>
      </aside>

      <div className="settings-body">
        <header className="settings-page-header">
          <div className="settings-header-meta">
            <small>{searching ? "设置" : selected.group}</small>
            <h2>{searching ? "搜索结果" : selected.title}</h2>
            <p>
              {searching
                ? results.length
                  ? `找到 ${results.length} 个相关设置项`
                  : "没有找到相关设置"
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

          {searching && (
            <div className="settings-search-results">
              {results.length ? (
                <ul aria-label="搜索结果">
                  {results.map((item) => (
                    <li key={`${item.section}-${item.id || "page"}`}>
                      <button
                        type="button"
                        className="settings-search-result"
                        onClick={() => void goTo(item.section, item.id)}
                      >
                        <span className="settings-search-result-label">
                          {item.label}
                        </span>
                        <span className="settings-search-result-path">
                          {catalog.find((page) => page.id === item.section)
                            ?.group ?? ""}{" "}
                          › {titleOf(item.section)}
                        </span>
                        <CaretRight size={14} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  variant="inline"
                  title="没有找到相关设置，试试“主题”“上下文窗口”或“权限”。"
                />
              )}
            </div>
          )}

          <div className="settings-page-content" hidden={searching}>
            {(visible("models") || visible("reasoning")) &&
              migrationNotice.state !== "idle" && (
                <p
                  className={`settings-migration-notice${
                    migrationNotice.state === "error" ? " is-error" : ""
                  }`}
                  role={migrationNotice.state === "error" ? "alert" : "status"}
                >
                  {migrationNotice.state === "error"
                    ? migrationNotice.message
                    : "已把旧版“逐模型窗口覆盖”移到对应模型的参数中，生效值不变。"}
                </p>
              )}
            <div hidden={!visible("models")}>
              <ProviderSources
                active={visible("models")}
                onBusy={(value) => {
                  sourceBusy.current = value;
                  setListing(value);
                }}
              />
            </div>

            {visible("general") && <GeneralSection form={form} />}

            {visible("reasoning") && <ReasoningSection form={form} />}

            {visible("language") && <LanguageSection form={form} />}

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
                <section
                  className="settings-section"
                  aria-label="服务器连接配置"
                >
                  <ServerConnection dirty={lspDirty} />
                </section>
              ) : (
                <section className="settings-section" aria-label="手机连接配置">
                  <PhonePairing />
                </section>
              ))}
          </div>
        </div>
      </div>
      {confirmDialog}
    </section>
  );
}
