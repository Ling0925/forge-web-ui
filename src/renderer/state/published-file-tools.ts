/**
 * Host-owned tools whose successful result may carry deliverable attachments.
 * Kept in one place so restored transcripts and live events classify the same
 * calls; the host still decides which files actually exist.
 */
const PUBLISHING_TOOLS: ReadonlySet<string> = new Set([
  "publish_file",
  "browser_screenshot",
]);

export function publishesPublishedFiles(toolName: string): boolean {
  return PUBLISHING_TOOLS.has(toolName);
}
