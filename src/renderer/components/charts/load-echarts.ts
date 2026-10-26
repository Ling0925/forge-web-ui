import type { EchartsModule } from "./echarts-instance";

export type { EchartsModule };

let loader: Promise<EchartsModule> | undefined;

/** One shared dynamic chunk for every chart on the page. */
export function loadEcharts(): Promise<EchartsModule> {
  loader ??= import("./echarts-instance").then((module) => module.echarts);
  return loader;
}
