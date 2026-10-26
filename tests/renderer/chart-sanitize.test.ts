import { describe, expect, it } from "vitest";
import { sanitizeRawOption } from "../../src/renderer/components/charts/sanitize";

describe("sanitizeRawOption", () => {
  it("passes through clean options and clones them", () => {
    const option = { series: [{ type: "graph", data: [1, 2] }], backgroundColor: "#fff" };
    const result = sanitizeRawOption({ option });
    expect(result.ok).toBe(true);
    expect(result.option).toEqual(option);
    expect(result.option).not.toBe(option);
  });

  it("rejects HTML in tooltip formatters (ECharts renders tooltip as HTML)", () => {
    expect(
      sanitizeRawOption({
        option: { tooltip: { formatter: "<img src=x onerror=alert(1)>" } },
      }).ok,
    ).toBe(false);
    expect(
      sanitizeRawOption({ option: { title: { text: "a < b" } } }).ok,
    ).toBe(false);
    expect(
      sanitizeRawOption({ option: { series: [{ data: ["javascript:alert(1)"] }] } }).ok,
    ).toBe(false);
  });

  it("rejects prototype-polluting and event-handler keys", () => {
    // JSON.parse keeps "__proto__" as an own property, unlike an object literal.
    expect(
      sanitizeRawOption({ option: JSON.parse('{"__proto__": {"x": 1}}') as Record<string, unknown> }).ok,
    ).toBe(false);
    expect(sanitizeRawOption({ option: { onClick: "x" } }).ok).toBe(false);
    expect(
      sanitizeRawOption({ option: { series: [{ formatter: "ok", constructor: 1 }] } }).ok,
    ).toBe(false);
  });

  it("forces tooltips to stay inside the chart container", () => {
    const result = sanitizeRawOption({
      option: { tooltip: { appendToBody: true, trigger: "item" } },
    });
    expect(result.ok).toBe(true);
    expect((result.option?.["tooltip"] as Record<string, unknown>)["appendToBody"]).toBe(false);
  });

  it("rejects a missing option object", () => {
    expect(sanitizeRawOption(undefined).ok).toBe(false);
  });
});
