import { expect, it } from "vitest";
import { versionNotice } from "../src/renderer/version-notice";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
it("reports a stale running Core without implying an automatic restart", () => {
  const headers = new Headers({
    "X-Forge-Core-Build": a,
    "X-Forge-Core-Disk-Build": b,
    "X-Forge-Core-Restart-Required": "true",
  });
  expect(versionNotice(headers, b)).toContain("新构建尚未生效");
  expect(versionNotice(headers, b)).toContain("不会自动重启或重放任务");
});
it("distinguishes a client build mismatch from incompatibility and ignores absent/invalid evidence", () => {
  expect(versionNotice(new Headers({ "X-Forge-Core-Build": a }), b)).toContain(
    "不一定不兼容",
  );
  expect(versionNotice(new Headers({ "X-Forge-Core-Build": a }), a)).toBe("");
  expect(versionNotice(new Headers(), a)).toBe("");
  expect(
    versionNotice(
      new Headers({ "X-Forge-Core-Build": "PRIVATE UNTRUSTED" }),
      a,
    ),
  ).toBe("");
  expect(
    versionNotice(new Headers({ "X-Forge-Core-Build": "unknown" }), a),
  ).toBe("");
});
