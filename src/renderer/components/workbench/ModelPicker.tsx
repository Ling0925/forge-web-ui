import { reasoningEffortSchema } from "@forge/core/shared";
import { CaretDown, CaretLeft, CaretRight, Cpu } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { ModelCatalog, type ModelCatalogGroup } from "./ModelCatalog";
// The composer needs these styles before the lazy-loaded Settings page opens.
import "../../styles/settings-models.css";
import "./model-picker-v2.css";
import { useDismiss } from "../primitives/useDismiss";
import { GLOBAL_REASONING_EFFORT_OPTIONS } from "./settings/settings-options";

const defaultEfforts = ["low", "medium", "high", "xhigh", "max"] as const;
// Same names as the settings page, so one level reads the same everywhere.
const formatEffort = (value: string | undefined) =>
  value === undefined
    ? undefined
    : (GLOBAL_REASONING_EFFORT_OPTIONS.find((option) => option.value === value)
        ?.shortLabel ?? value);

export function ModelPicker(props: {
  readonly value: string;
  readonly models: readonly string[];
  readonly onSelect: (model: string, sourceId?: string) => void;
  readonly onRefresh: () => void;
  readonly onOpen?: () => void;
  readonly loading: boolean;
  readonly error: string;
  readonly reasoning?: {
    value: string;
    options?: readonly string[] | undefined;
    disabled: boolean;
    onChange: (value: string) => void;
  };
  readonly hideSearch?: boolean;
  readonly groups?: readonly ModelCatalogGroup[] | undefined;
  readonly sourceId?: string | undefined;
  /** Human-readable label of the source the value belongs to. */
  readonly sourceLabel?: string | undefined;
  readonly routes?: readonly { readonly id: string; readonly label: string }[];
  readonly routeGroupId?: string | undefined;
  readonly onSelectRoute?: (routeId: string) => void;
  readonly disabled?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [returned, setReturned] = useState(false);
  useEffect(() => {
    if (modelsOpen) setReturned(true);
    else if (!open) setReturned(false);
  }, [modelsOpen, open]);
  const catalogId = useId();
  const selectedRoute = props.routes?.find(
    (route) => route.id === props.routeGroupId,
  );
  const shownValue = selectedRoute?.label || props.value || "选择模型";
  // Narrow screens show the last path segment ("provider/model" -> "model");
  // the full id stays in the title and in the panel.
  const shortValue = shownValue.split("/").pop() || shownValue;
  const initialized = useRef(false);
  // Capability metadata limits new choices, not the effective request setting.
  // Keep the configured value even if discovery omits it; otherwise the slider
  // displays the first option and can overwrite the saved effort on mere blur.
  // The schema filters unknown levels and orders the remaining choices by effort.
  const availableEfforts: readonly string[] =
    props.reasoning?.options ?? defaultEfforts;
  const efforts = reasoningEffortSchema.options.filter(
    (value) =>
      value === props.reasoning?.value || availableEfforts.includes(value),
  );
  const effortSignature = JSON.stringify(efforts);
  const effortIndex = efforts.findIndex(
    (value) => value === props.reasoning?.value,
  );
  const effortLabel = formatEffort(efforts[effortIndex]);
  const [rawDraftEffort, setDraftEffort] = useState(Math.max(0, effortIndex));
  // The option list can shrink under a held draft (a source re-declares its
  // levels). Clamp so the fill, ticks and readout never point past the range.
  const draftEffort = Math.min(rawDraftEffort, Math.max(0, efforts.length - 1));
  const submittedEffort = useRef<number | null>(null);
  useEffect(() => {
    if (props.reasoning?.disabled) return;
    setDraftEffort(Math.max(0, effortIndex));
    submittedEffort.current = null;
  }, [
    effortIndex,
    effortSignature,
    props.value,
    props.sourceId,
    props.reasoning?.disabled,
  ]);
  const commitEffort = (index: number) => {
    const choice = efforts[index];
    if (
      !choice ||
      !props.reasoning ||
      props.reasoning.disabled ||
      index === effortIndex ||
      submittedEffort.current === index
    )
      return;
    submittedEffort.current = index;
    props.reasoning.onChange(choice);
  };
  const close = () => {
    if (ref.current) ref.current.open = false;
    setOpen(false);
    setModelsOpen(false);
  };
  useEffect(() => {
    if (!open) return;
    if (modelsOpen) {
      const search =
        !props.hideSearch &&
        window.matchMedia("(pointer: fine) and (min-width: 769px)").matches
          ? ref.current?.querySelector<HTMLInputElement>(
              "input:not([type=range])",
            )
          : null;
      const option =
        ref.current?.querySelector<HTMLButtonElement>(
          '.model-catalog-option[aria-pressed="true"]:not(:disabled)',
        ) ??
        ref.current?.querySelector<HTMLButtonElement>(
          ".model-catalog-option:not(:disabled)",
        );
      const back =
        ref.current?.querySelector<HTMLButtonElement>(".model-picker-back");
      (search ?? option ?? back)?.focus();
    } else {
      ref.current
        ?.querySelector<HTMLButtonElement>(".model-picker-current")
        ?.focus();
    }
  }, [open, modelsOpen, props.hideSearch]);
  useDismiss({ open, refs: [ref], onDismiss: close });
  return (
    <details
      ref={ref}
      className="composer-model composer-model-picker"
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        if (event.currentTarget.open) {
          if (props.onOpen) props.onOpen();
          else if (!initialized.current) props.onRefresh();
          initialized.current = true;
        } else {
          setModelsOpen(false);
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        if (modelsOpen) {
          setModelsOpen(false);
        } else {
          close();
          ref.current?.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        className="composer-dropdown-trigger composer-model-summary"
        title={`${shownValue}${selectedRoute ? " · 路由组" : ""}${props.sourceLabel ? ` · ${props.sourceLabel}` : ""}${effortLabel ? ` · 思考：${effortLabel}` : ""}`}
      >
        <span className="composer-model-icon" aria-hidden="true">
          <Cpu size={14} weight="bold" />
        </span>
        <span className="composer-dropdown-label">
          {shortValue === shownValue ? (
            shownValue
          ) : (
            <>
              <span className="composer-model-name-full">{shownValue}</span>
              <span className="composer-model-name-short">{shortValue}</span>
            </>
          )}
        </span>
        {selectedRoute && <span className="composer-model-source">路由组</span>}
        {props.sourceLabel && !selectedRoute && (
          // The source is not a separate choice: it always travels with the
          // model, so it is shown as belonging to the model rather than as a
          // control of its own.
          <span
            className="composer-model-source"
            title={`来源：${props.sourceLabel}`}
          >
            {props.sourceLabel}
          </span>
        )}
        {effortLabel && (
          <span
            className="model-effort-meter"
            aria-label={`思考等级：${effortLabel}，${effortIndex + 1}/${efforts.length}`}
          >
            {efforts.map((value, index) => (
              <span
                key={value}
                className={index <= effortIndex ? "is-filled" : ""}
                style={{ "--i": index } as React.CSSProperties}
              />
            ))}
          </span>
        )}
        <CaretDown
          size={14}
          aria-hidden="true"
          className="composer-model-caret"
        />
      </summary>
      {open && (
        <div
          className="composer-model-panel"
          data-view={modelsOpen ? "catalog" : "settings"}
          data-returned={returned && !modelsOpen ? "" : undefined}
        >
          {!modelsOpen && (
            <div className="model-picker-heading">
              <span>模型</span>
              <button
                type="button"
                className="model-picker-current"
                title={`${shownValue}${selectedRoute ? " · 路由组" : ""}${props.sourceLabel ? ` · ${props.sourceLabel}` : ""}`}
                aria-label={`选择模型：${shownValue}${props.sourceLabel ? ` · ${props.sourceLabel}` : ""}`}
                onClick={() => setModelsOpen(true)}
              >
                <span className="composer-model-icon" aria-hidden="true">
                  <Cpu size={14} weight="bold" />
                </span>
                <span>{shownValue}</span>
                {props.sourceLabel && !selectedRoute && (
                  <small>{props.sourceLabel}</small>
                )}
                <CaretRight size={14} aria-hidden="true" />
              </button>
            </div>
          )}
          {!modelsOpen && props.routes && props.routes.length > 0 && (
            <div
              className="model-picker-routes"
              role="group"
              aria-label="路由组"
            >
              {props.routes.map((route) => (
                <button
                  key={route.id}
                  type="button"
                  aria-pressed={route.id === props.routeGroupId}
                  disabled={props.disabled}
                  onClick={() => {
                    props.onSelectRoute?.(route.id);
                    close();
                    ref.current?.querySelector("summary")?.focus();
                  }}
                >
                  <span>{route.label}</span>
                  <small>路由组</small>
                </button>
              ))}
            </div>
          )}
          {!modelsOpen && props.reasoning && efforts.length > 0 && (
            <fieldset
              className="model-effort-options"
              disabled={props.reasoning.disabled}
            >
              <legend className="visually-hidden">思考等级</legend>
              <div className="effort-slider-heading">
                <output key={draftEffort}>
                  {formatEffort(efforts[draftEffort])}
                </output>
              </div>
              <div
                className="effort-slider"
                data-max={draftEffort === efforts.length - 1}
              >
                <div className="effort-slider-track" aria-hidden="true">
                  <span
                    className="effort-slider-fill"
                    style={{
                      transform: `scaleX(${draftEffort / Math.max(1, efforts.length - 1)})`,
                    }}
                  />
                </div>
                <div className="effort-slider-ticks" aria-hidden="true">
                  {efforts.map((value, index) => (
                    <span key={value} data-reached={index <= draftEffort} />
                  ))}
                </div>
                <input
                  type="range"
                  min={0}
                  max={efforts.length - 1}
                  step={1}
                  value={draftEffort}
                  aria-label="思考等级"
                  aria-valuetext={formatEffort(efforts[draftEffort])}
                  onChange={(event) =>
                    setDraftEffort(Number(event.currentTarget.value))
                  }
                  onPointerUp={(event) =>
                    commitEffort(Number(event.currentTarget.value))
                  }
                  onPointerCancel={() =>
                    setDraftEffort(Math.max(0, effortIndex))
                  }
                  onKeyUp={(event) => {
                    if (
                      [
                        "ArrowLeft",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowDown",
                        "Home",
                        "End",
                        "PageUp",
                        "PageDown",
                      ].includes(event.key)
                    )
                      commitEffort(Number(event.currentTarget.value));
                  }}
                  onBlur={(event) =>
                    commitEffort(Number(event.currentTarget.value))
                  }
                />
              </div>
              <div className="effort-slider-labels" aria-hidden="true">
                {efforts.map((value, index) => (
                  <span key={value} data-active={draftEffort === index}>
                    {formatEffort(value)}
                  </span>
                ))}
              </div>
            </fieldset>
          )}
          {modelsOpen && (
            <div
              id={catalogId}
              className="model-picker-subpanel"
              role="region"
              aria-label="选择模型"
            >
              <div className="model-picker-subheading">
                <button
                  type="button"
                  className="model-picker-back"
                  aria-label="返回模型设置"
                  onClick={() => setModelsOpen(false)}
                >
                  <CaretLeft size={16} aria-hidden="true" />
                </button>
                <span>选择模型</span>
              </div>
              <ModelCatalog
                value={props.value}
                models={props.models}
                onRefresh={props.onRefresh}
                loading={props.loading}
                error={props.error}
                inputId={catalogId + "-search"}
                {...(props.hideSearch !== undefined
                  ? { hideSearch: props.hideSearch }
                  : {})}
                groups={props.groups}
                sourceId={props.sourceId}
                disabled={props.disabled}
                onSelect={(model, sourceId) => {
                  props.onSelect(model, sourceId);
                  if (props.reasoning) {
                    setModelsOpen(false);
                  } else {
                    close();
                    ref.current?.querySelector("summary")?.focus();
                  }
                }}
              />
            </div>
          )}
        </div>
      )}
    </details>
  );
}
