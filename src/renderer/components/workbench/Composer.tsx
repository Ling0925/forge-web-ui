import { sessionOriginWorkspace } from "@forge/core/shared";
import {
  ArrowUp,
  Check,
  ClockCountdown,
  Compass,
  DotsSixVertical,
  Images,
  Lightning,
  Lock,
  PencilSimple,
  Play,
  ShieldCheck,
  ShieldWarning,
  Stop,
  X,
} from "@phosphor-icons/react";
import { z } from "zod";
import { composerReasoningEffort } from "../../state/composer-model";
import { Button } from "../primitives/Button";
import { IconButton } from "../primitives/IconButton";
import { ComposerDropdown } from "./ComposerDropdown";
import { ImageAttachments } from "./ImageAttachments";
import { ModelPicker } from "./ModelPicker";
import { UsagePopover } from "./UsagePopover";
import { WorkspacePicker } from "./WorkspacePicker";
import "./composer-layout.css";
import "./composer-live-input.css";

import { RunTimer } from "./RunTimer";
import { useComposerController } from "./useComposerController";

export function Composer({ isNew = false }: { readonly isNew?: boolean }) {
  const {
    runStartedAt,
    state,
    chooseWorkspace,
    cancelRun,
    openSettings,
    pendingInputs,
    inputQueuePaused,
    queueItemKey,
    removeQueuedInput,
    reorderQueuedInputs,
    resumeInputs,
    clearInputs,
    setDrafts,
    setManualDrafts,
    draftId,
    mode,
    prompt,
    manualSend,
    images,
    reading,
    imageError,
    addFiles,
    removeImage,
    fileInputRef,
    promptId,
    workspace,
    setWorkspace,
    promptRef,
    setPicks,
    routes,
    selectedRoute,
    providerSourceId,
    providerSource,
    model,
    setRoute,
    modelError,
    listing,
    selectedMetadata,
    configuredModels,
    modelUnlisted,
    modelGroups,
    savingEffort,
    changeEffort,
    failedStarts,
    submission,
    busy,
    error,
    run,
    running,
    activityClosing,
    isDual,
    rebounding,
    displayRun,
    showActivity,
    changingPermission,
    changePermission,
    displayedPermission,
    changeMode,
    isConfigured,
    configurationHint,
    slash,
    submit,
    steeringQueueIndex,
    steerQueuedItem,
    listModels,
    editingQueueItem,
    editingQueueText,
    setEditingQueueText,
    queueEditInputRef,
    draggingQueueIndex,
    dragOverQueueIndex,
    setDragOverQueueIndex,
    startQueueEdit,
    cancelQueueEdit,
    saveQueueEdit,
    handleQueueDragStart,
    handleQueueDragOver,
    handleQueueDrop,
    handleQueueDragEnd,
  } = useComposerController({ isNew });
  return (
    <form
      className={`workbench-composer composer${isNew ? " composer-fresh" : ""}`}
      aria-label={isNew ? "新会话输入" : "任务输入"}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="composer-inner composer-split">
        {pendingInputs.length > 0 && (
          <div
            className={`composer-status composer-queue${inputQueuePaused ? " is-paused" : ""}`}
            role="region"
            aria-label="待发消息队列"
          >
            <div className="composer-queue-header">
              <div className="composer-queue-header-main">
                <span className="composer-queue-title">
                  待发 {pendingInputs.length} 条
                  {inputQueuePaused ? " · 已暂停" : ""}
                </span>
                {pendingInputs.length > 1 && (
                  <span className="composer-queue-tip">拖动可调整顺序</span>
                )}
              </div>
              <div className="composer-queue-header-btns">
                {inputQueuePaused && !running && (
                  <button
                    type="button"
                    className="composer-queue-link-btn is-primary"
                    onClick={() => resumeInputs()}
                  >
                    <Play size={11} weight="fill" aria-hidden="true" />
                    <span>继续发送</span>
                  </button>
                )}
                {pendingInputs.length > 1 && (
                  <button
                    type="button"
                    className="composer-queue-link-btn is-danger"
                    onClick={() => clearInputs()}
                  >
                    清空
                  </button>
                )}
              </div>
            </div>
            <ol className="composer-queue-list" aria-label="待发消息列表">
              {pendingInputs.map((item, index) => {
                const isEditing = editingQueueItem === item;
                const isDragging = draggingQueueIndex === index;
                const isDragOver =
                  dragOverQueueIndex === index &&
                  draggingQueueIndex !== null &&
                  draggingQueueIndex !== index;
                const itemText = item.prompt.trim();
                const imageCount = item.images?.length ?? 0;
                const displaySummary =
                  itemText || (imageCount > 0 ? `图片 ${imageCount} 张` : "");
                return (
                  <li
                    key={
                      queueItemKey
                        ? queueItemKey(item)
                        : `${index}-${item.prompt.slice(0, 24)}`
                    }
                    className={`composer-queue-item${isDragging ? " is-dragging" : ""}${isDragOver ? " is-drag-over" : ""}${isEditing ? " is-editing" : ""}`}
                    draggable={pendingInputs.length > 1 && !isEditing}
                    onDragStart={(event) =>
                      handleQueueDragStart(event, index, item)
                    }
                    onDragOver={(event) => handleQueueDragOver(event, index)}
                    onDragLeave={() => {
                      if (dragOverQueueIndex === index)
                        setDragOverQueueIndex(null);
                    }}
                    onDrop={(event) => handleQueueDrop(event, index)}
                    onDragEnd={handleQueueDragEnd}
                    onKeyDown={(event) => {
                      if (isEditing) return;
                      if (
                        event.altKey &&
                        event.key === "ArrowUp" &&
                        index > 0
                      ) {
                        event.preventDefault();
                        reorderQueuedInputs?.(index, index - 1);
                      } else if (
                        event.altKey &&
                        event.key === "ArrowDown" &&
                        index < pendingInputs.length - 1
                      ) {
                        event.preventDefault();
                        reorderQueuedInputs?.(index, index + 1);
                      }
                    }}
                  >
                    {isEditing ? (
                      <div className="composer-queue-edit-row">
                        <span
                          className="composer-queue-index"
                          aria-hidden="true"
                        >
                          {index + 1}
                        </span>
                        <textarea
                          ref={queueEditInputRef}
                          className="composer-queue-edit-input"
                          rows={1}
                          aria-label={`编辑第 ${index + 1} 条待发消息内容`}
                          value={editingQueueText}
                          onChange={(event) =>
                            setEditingQueueText(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              event.stopPropagation();
                              cancelQueueEdit();
                            } else if (
                              event.key === "Enter" &&
                              !event.shiftKey &&
                              !event.nativeEvent.isComposing &&
                              event.nativeEvent.keyCode !== 229
                            ) {
                              event.preventDefault();
                              event.stopPropagation();
                              saveQueueEdit(index, item);
                            }
                          }}
                        />
                        <div className="composer-queue-item-btns">
                          <IconButton
                            size="sm"
                            className="composer-queue-icon-btn is-confirm"
                            label={`保存第 ${index + 1} 条待发消息`}
                            title="保存 (Enter)"
                            disabled={
                              !editingQueueText.trim() && imageCount === 0
                            }
                            onClick={() => saveQueueEdit(index, item)}
                            icon={<Check size={13} weight="bold" />}
                          />
                          <IconButton
                            size="sm"
                            className="composer-queue-icon-btn"
                            label="取消编辑"
                            title="取消编辑 (Esc)"
                            onClick={cancelQueueEdit}
                            icon={<X size={13} />}
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <span
                          className={`composer-queue-handle${pendingInputs.length > 1 ? " is-draggable" : ""}`}
                          title={
                            pendingInputs.length > 1
                              ? "拖动调整顺序"
                              : undefined
                          }
                          aria-hidden="true"
                        >
                          <DotsSixVertical size={14} weight="bold" />
                        </span>
                        <span
                          className="composer-queue-index"
                          aria-hidden="true"
                        >
                          {index + 1}
                        </span>
                        <span
                          className="composer-queue-text"
                          title={item.prompt}
                          onDoubleClick={() => startQueueEdit(item)}
                        >
                          {displaySummary}
                          {itemText && imageCount > 0
                            ? ` · 图片 ${imageCount} 张`
                            : ""}
                        </span>
                        <div className="composer-queue-item-btns">
                          {running && (
                            <button
                              type="button"
                              className="composer-queue-steer-btn"
                              aria-label={`立即插话第 ${index + 1} 条待发消息`}
                              title="立即作为插话发送到当前运行"
                              disabled={
                                busy ||
                                !!submission ||
                                steeringQueueIndex !== null
                              }
                              onClick={() => void steerQueuedItem(index, item)}
                            >
                              <Lightning
                                size={11}
                                weight="fill"
                                aria-hidden="true"
                              />
                              <span>插话</span>
                            </button>
                          )}
                          <IconButton
                            size="sm"
                            className="composer-queue-icon-btn"
                            label={`编辑第 ${index + 1} 条待发消息`}
                            title="编辑"
                            onClick={() => startQueueEdit(item)}
                            icon={<PencilSimple size={13} />}
                          />
                          <IconButton
                            size="sm"
                            className="composer-queue-icon-btn is-danger"
                            label={`取消第 ${index + 1} 条待发消息`}
                            title="取消此条待发消息"
                            onClick={() => removeQueuedInput?.(index)}
                            icon={<X size={13} />}
                          />
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
        {(!isConfigured || error || imageError || modelUnlisted) && (
          <div className="composer-status" aria-live="polite">
            {!isConfigured && (
              <span className="wb-muted">
                {configurationHint}{" "}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => openSettings(true)}
                >
                  配置模型
                </Button>
              </span>
            )}
            {modelUnlisted && (
              <span className="wb-muted composer-plan-note">
                当前模型 {model} 未在
                {providerSource?.label ? `来源 ${providerSource.label} 的` : ""}
                设置中启用，请先添加配置或选择已配置模型。
              </span>
            )}
            {error && (
              <span role="alert" className="form-error composer-error">
                {error}
              </span>
            )}
            {imageError && (
              <span role="alert" className="form-error composer-error">
                {imageError}
              </span>
            )}
          </div>
        )}
        <ImageAttachments
          images={images}
          reading={reading}
          onRemove={removeImage}
        />
        {images.length === 0 && slash.view}
        {/* One integrated composer card: the prompt row and the control row are
            two bands of a single rounded surface, so the text field, the send
            button and the mode/model controls share one silhouette instead of
            reading as three detached strips. The usage meter stays directly
            beneath the card, inset to the card's text edge. */}
        <div className="composer-card composer-surface">
          {/* Design A card header: the workspace this task runs in (new
              session: the picker; no git branch is shown because no source
              exposes one) and, while a turn runs, its elapsed time. */}
          {(isNew || (running && runStartedAt)) && (
            <div className="composer-card-header">
              {isNew && (
                <WorkspacePicker
                  workspace={workspace}
                  recentWorkspaces={state.sessions
                    .map((session) => sessionOriginWorkspace(session))
                    .filter(Boolean)}
                  chooseWorkspace={chooseWorkspace}
                  onChange={setWorkspace}
                  onDone={() => promptRef.current?.focus()}
                />
              )}
              {running && runStartedAt && <RunTimer startedAt={runStartedAt} />}
            </div>
          )}
          <div className="composer-input-row">
            <div className="composer-prompt">
              <label htmlFor={promptId} className="visually-hidden">
                {isNew ? "新会话消息" : "继续任务"}
              </label>
              <span
                className={`composer-mode-arrow is-${mode}`}
                aria-hidden="true"
              />
              <span
                className="visually-hidden"
                aria-live="polite"
              >{`Mode: ${mode}${running || busy ? "；仅影响下一次运行，当前运行模式不变" : ""}`}</span>
              <textarea
                id={promptId}
                ref={promptRef}
                className="composer-textarea"
                value={prompt}
                rows={1}
                placeholder={
                  isNew ? "描述任务或提问…" : "继续对话，或输入新要求…"
                }
                title={
                  manualSend
                    ? "多行模式：Enter 换行，点击发送"
                    : running
                      ? "Enter 排队，Alt+Enter 插话"
                      : "Enter 发送，Shift+Enter 换行"
                }
                onChange={(event) => {
                  setDrafts((old) => ({
                    ...old,
                    [draftId]: event.target.value,
                  }));
                }}
                onPaste={(event) => {
                  const clipboardData = event.clipboardData;
                  if (!clipboardData) return;
                  const items = Array.from(clipboardData.items ?? []);
                  const imageFiles: File[] = [];
                  for (const item of items) {
                    if (item.type.startsWith("image/")) {
                      const file = item.getAsFile();
                      if (file) imageFiles.push(file);
                    }
                  }
                  if (imageFiles.length === 0) return;
                  const hasText = Boolean(clipboardData.getData("text/plain"));
                  if (!hasText) {
                    event.preventDefault();
                  }
                  void addFiles(imageFiles);
                }}
                {...slash.inputProps}
                onKeyDown={(event) => {
                  if (images.length === 0 && slash.onKeyDown(event)) return;
                  if (
                    event.key === "Tab" &&
                    event.shiftKey &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.altKey &&
                    !event.nativeEvent.isComposing &&
                    !document.querySelector("dialog[open]")
                  ) {
                    event.preventDefault();
                    changeMode(mode === "build" ? "plan" : "build");
                    return;
                  }
                  if (
                    event.key === "Enter" &&
                    !event.nativeEvent.isComposing &&
                    event.nativeEvent.keyCode !== 229
                  ) {
                    if (reading) {
                      event.preventDefault();
                      return;
                    }
                    if (
                      event.altKey &&
                      !event.shiftKey &&
                      !event.ctrlKey &&
                      !event.metaKey
                    ) {
                      event.preventDefault();
                      if (running) {
                        void submit("steer");
                      }
                      return;
                    }
                    if (
                      (event.ctrlKey || event.metaKey) &&
                      !event.shiftKey &&
                      !event.altKey
                    ) {
                      event.preventDefault();
                      void submit("follow-up");
                      return;
                    }
                    if (event.ctrlKey || event.metaKey || event.altKey) {
                      event.preventDefault();
                      return;
                    }
                    if (event.shiftKey) {
                      setManualDrafts((old) => ({ ...old, [draftId]: true }));
                    } else if (!manualSend) {
                      event.preventDefault();
                      void submit();
                    }
                  }
                }}
              />
            </div>
            <div
              className={`composer-submit-col ${
                isDual ? "is-dual" : ""
              } ${rebounding ? "is-rebounding" : ""}`}
            >
              {running ? (
                <>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    className="composer-cancel composer-action"
                    loading={!run?.runId || Boolean(run.isCancelling)}
                    aria-label={
                      !run?.runId
                        ? "等待运行确认"
                        : run.isCancelling
                          ? "正在取消"
                          : "取消"
                    }
                    title={
                      !run?.runId
                        ? "等待运行确认后可取消"
                        : run.isCancelling
                          ? "正在取消…"
                          : "停止生成"
                    }
                    icon={<Stop size={16} weight="fill" aria-hidden="true" />}
                    onClick={() => void cancelRun()}
                  />
                  {isDual && (
                    <div
                      className="composer-dual-send-wrap"
                      role="group"
                      aria-label="运行中发送方式"
                    >
                      <button
                        type="button"
                        className="btn btn-sm composer-steer-btn"
                        disabled={
                          busy || !!submission || reading || savingEffort
                        }
                        aria-label="插话"
                        title="立即插话到当前运行 · Alt+Enter"
                        onClick={() => void submit("steer")}
                      >
                        <Lightning size={15} weight="fill" aria-hidden="true" />
                        <span className="composer-dual-btn-label">插话</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm composer-submit composer-queue-btn"
                        disabled={
                          busy || !!submission || reading || savingEffort
                        }
                        aria-label="排队发送"
                        title="加入待发队列，当前运行结束后自动发送 · Enter"
                        onClick={() => void submit("follow-up")}
                      >
                        <ClockCountdown
                          size={15}
                          weight="bold"
                          aria-hidden="true"
                        />
                        <span className="composer-dual-btn-label">排队</span>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="composer-submit composer-run composer-action"
                  loading={busy || !!submission}
                  disabled={
                    (!isConfigured && !slash.isCommand) ||
                    (!prompt.trim() && images.length === 0) ||
                    reading ||
                    !!submission ||
                    savingEffort
                  }
                  aria-label={
                    failedStarts[draftId]
                      ? "重新发送草稿"
                      : isNew
                        ? "发送并开始会话"
                        : "发送消息"
                  }
                  title={
                    busy || submission
                      ? "正在发送…"
                      : reading
                        ? "正在读取图片…"
                        : failedStarts[draftId]
                          ? "核对会话后，重新发送保留的草稿"
                          : manualSend
                            ? "发送消息"
                            : "发送 · Enter"
                  }
                  icon={<ArrowUp size={16} weight="bold" aria-hidden="true" />}
                />
              )}
            </div>
          </div>
          <div className="composer-toolbar">
            <div className="composer-toolbar-start">
              {/* Custom Mode Selector */}
              <ComposerDropdown
                value={mode}
                onChange={(next) =>
                  changeMode(z.enum(["build", "plan"]).parse(next))
                }
                options={[
                  { value: "build", label: "Build", sub: "执行与修改" },
                  { value: "plan", label: "Plan", sub: "只读规划" },
                ]}
                icon={
                  mode === "plan" ? (
                    <Compass size={16} weight="fill" />
                  ) : (
                    <Lightning size={16} weight="fill" />
                  )
                }
                ariaLabel="运行模式"
              />
              {/* Hidden native select for Playwright test compatibility */}
              <select
                id="run-mode"
                className="visually-hidden"
                tabIndex={-1}
                aria-hidden="true"
                value={mode}
                onChange={(event) =>
                  changeMode(
                    z.enum(["build", "plan"]).parse(event.target.value),
                  )
                }
              >
                <option value="build">Build</option>
                <option value="plan">Plan</option>
              </select>

              {/* Custom Permission Selector */}
              <ComposerDropdown
                value={mode === "plan" ? "readonly" : displayedPermission}
                disabled={
                  mode === "plan" ||
                  changingPermission ||
                  busy ||
                  !!submission ||
                  reading
                }
                onChange={(next) => void changePermission(next)}
                options={[
                  {
                    value: "workspace",
                    label: "工作区",
                    sub: "修改文件需批准命令",
                  },
                  {
                    value: "readonly",
                    label: "只读",
                    sub: "不修改文件或执行命令",
                  },
                  {
                    value: "unrestricted",
                    label: "无限制",
                    sub: running
                      ? "立即生效，并放行当前会话待审批操作"
                      : "允许执行系统命令",
                  },
                ]}
                icon={
                  (mode === "plan" ? "readonly" : displayedPermission) ===
                  "readonly" ? (
                    <Lock size={16} />
                  ) : (mode === "plan" ? "readonly" : displayedPermission) ===
                    "unrestricted" ? (
                    <ShieldWarning size={16} />
                  ) : (
                    <ShieldCheck size={16} />
                  )
                }
                ariaLabel="执行权限"
              />
              {/* Hidden native select for Playwright test compatibility */}
              <select
                id="run-permission"
                className="visually-hidden"
                tabIndex={-1}
                aria-hidden="true"
                value={mode === "plan" ? "readonly" : displayedPermission}
                disabled={
                  mode === "plan" ||
                  changingPermission ||
                  busy ||
                  !!submission ||
                  reading
                }
                onChange={(event) => void changePermission(event.target.value)}
              >
                <option value="workspace">工作区</option>
                <option value="readonly">只读</option>
                <option value="unrestricted">无限制</option>
              </select>
              <button
                type="button"
                className="composer-dropdown-trigger is-icon-only composer-image-trigger"
                onClick={() => fileInputRef.current?.click()}
                disabled={reading}
                aria-label="添加图片"
                title="添加图片"
              >
                <Images size={16} aria-hidden="true" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif"
                aria-label="选择图片文件"
                className="visually-hidden"
                tabIndex={-1}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length > 0) {
                    void addFiles(files);
                  }
                }}
              />
            </div>
            <div className="composer-toolbar-end">
              <ModelPicker
                value={model}
                models={configuredModels}
                hideSearch={true}
                sourceLabel={selectedRoute ? undefined : providerSource?.label}
                routes={routes.map((route) => ({
                  id: route.id,
                  label: route.label,
                }))}
                routeGroupId={selectedRoute?.id}
                onSelectRoute={setRoute}
                onSelect={(model, sourceId) => {
                  if (busy || submission) return;
                  // Picking a model records the source it came from in the same
                  // update, so the pair can never drift apart.
                  setPicks((old) => ({
                    ...old,
                    [draftId]: {
                      ...(sourceId
                        ? { sourceId }
                        : providerSourceId
                          ? { sourceId: providerSourceId }
                          : {}),
                      model,
                    },
                  }));
                }}
                onOpen={() => void listModels()}
                onRefresh={() => void listModels(true)}
                loading={listing}
                error={modelError}
                reasoning={{
                  value: composerReasoningEffort(
                    model,
                    providerSource,
                    state.settings,
                  ),
                  options: selectedMetadata?.reasoningEfforts,
                  disabled:
                    savingEffort ||
                    busy ||
                    !!submission ||
                    !!(providerSourceId && !providerSource),
                  onChange: (value) => void changeEffort(value),
                }}
                groups={modelGroups}
                sourceId={providerSourceId}
                disabled={busy || !!submission}
              />
            </div>
          </div>
        </div>
        <UsagePopover
          run={showActivity ? (displayRun ?? null) : null}
          closing={activityClosing}
          selection={{
            model,
            sourceId: providerSourceId,
            metadata: selectedMetadata,
          }}
          snapshot={
            !isNew && state.activeSnapshot?.id === state.activeSessionId
              ? state.activeSnapshot
              : undefined
          }
          events={
            !isNew && state.activeSnapshot?.id === state.activeSessionId
              ? state.activeSnapshot.events
              : []
          }
        />
      </div>
    </form>
  );
}
