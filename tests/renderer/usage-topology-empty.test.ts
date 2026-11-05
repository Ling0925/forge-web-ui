import { defaultPublicSettings } from "@forge/core/shared/schemas";
import { expect, it } from "vitest";
import { buildEnergyNetworkTopology } from "../../src/renderer/components/workbench/usage-topology";

type Stats = Parameters<typeof buildEnergyNetworkTopology>[0];
const empty = {
  models: [],
  requests: [],
  routes: [],
  topSessions: [],
} as unknown as Stats;

it("does not fabricate a default provider/model node when nothing is configured or recorded", () => {
  const topology = buildEnergyNetworkTopology(
    empty,
    { ...defaultPublicSettings, providerSources: [] },
    [],
    {},
  );
  expect(topology.providers).toEqual([]);
  expect(topology.models).toEqual([]);
  expect(JSON.stringify(topology)).not.toMatch(/forge-default|默认供应商/);
});

it("still lists configured providers when there is no usage yet", () => {
  const settings = {
    ...defaultPublicSettings,
    model: "fixture/model",
    providerSources: [
      {
        id: "src-a",
        name: "Provider A",
        baseUrl: "https://a.invalid",
        model: "a/model",
      },
    ],
  } as unknown as Parameters<typeof buildEnergyNetworkTopology>[1];
  const topology = buildEnergyNetworkTopology(empty, settings, [], {});
  expect(topology.providers.map((p) => p.id)).toEqual(["src-a"]);
});
