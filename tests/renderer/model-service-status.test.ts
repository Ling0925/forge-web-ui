import {
  type PublicProviderSource,
  defaultPublicSettings,
} from "@forge/core/shared/schemas";
import { expect, it } from "vitest";
import { modelServiceStatus } from "../../src/renderer/state/model-service-status";

const source: PublicProviderSource = {
  id: "session-source",
  label: "Session source",
  revision: 1,
  baseUrl: "https://fixture.invalid/v1",
  model: "",
  hasApiKey: false,
  modelSelection: { mode: "none" },
};

it("does not announce a missing service before settings have loaded", () => {
  expect(modelServiceStatus(null).state).toBe("loading");
  expect(modelServiceStatus(undefined).state).toBe("loading");
});

it("recognizes a source without requiring a global or source default model", () => {
  const status = modelServiceStatus({
    ...defaultPublicSettings,
    providerSources: [source],
  });
  expect(status.state).toBe("configured");
  expect(status.label).toBe("模型服务已添加");
  expect(status.hint).toContain("不是网络连接状态");
});

it("recognizes legacy and environment endpoints without inferring network health", () => {
  expect(
    modelServiceStatus({ ...defaultPublicSettings, baseUrl: source.baseUrl })
      .state,
  ).toBe("configured");
  expect(
    modelServiceStatus({ ...defaultPublicSettings, isConfigured: true }).state,
  ).toBe("configured");
});

it("does not infer setup from model names or credentials alone", () => {
  expect(
    modelServiceStatus({
      ...defaultPublicSettings,
      model: "fixture/model",
      hasApiKey: true,
    }).state,
  ).toBe("missing");
  expect(
    modelServiceStatus({
      ...defaultPublicSettings,
      providerSources: [{ ...source, baseUrl: " " }],
    }).state,
  ).toBe("missing");
});

it("clears the service indicator when the last endpoint is removed", () => {
  expect(modelServiceStatus(defaultPublicSettings).state).toBe("missing");
});
