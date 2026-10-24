import { Globe } from "@phosphor-icons/react";
import { SectionHead } from "./common";

export function WebSearchResultView({
  record,
  isWaiting,
}: {
  readonly record: Record<string, unknown>;
  readonly isWaiting: boolean;
}) {
  const sources = Array.isArray(record.sources)
    ? record.sources.filter((s): s is string => typeof s === "string")
    : [];
  const citations = Array.isArray(record.citations)
    ? (record.citations as readonly {
        readonly url: string;
        readonly title?: string;
      }[])
    : [];

  if (isWaiting && !sources.length && !citations.length) {
    return (
      <div className="tool-section">
        <SectionHead title="搜索结果" />
        <span className="tool-section-empty">等待搜索返回…</span>
      </div>
    );
  }

  const openUrl = (url: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    void (
      window as unknown as {
        forge?: { openExternal?: (url: string) => Promise<void> };
      }
    ).forge?.openExternal?.(url);
  };

  return (
    <div className="tool-section tool-web-search-view">
      {citations.length > 0 && (
        <div className="tool-web-search-group">
          <SectionHead title={`引用来源（${citations.length}）`} />
          <ul className="tool-web-search-list">
            {citations.map((c, i) => {
              let hostname = "";
              try {
                hostname = new URL(c.url).hostname;
              } catch {}
              return (
                <li key={`${c.url}-${i}`} className="tool-web-search-item">
                  <span className="tool-web-search-badge">{i + 1}</span>
                  <a
                    href={c.url}
                    onClick={openUrl(c.url)}
                    className="tool-web-search-link"
                    title={c.url}
                    rel="noreferrer noopener"
                  >
                    <span className="tool-web-search-title">
                      {c.title || hostname || "来源"}
                    </span>
                    {hostname && (
                      <span className="tool-web-search-host">{hostname}</span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {sources.length > 0 && (
        <div className="tool-web-search-group">
          <SectionHead title={`检索来源（${sources.length}）`} />
          <ul className="tool-web-search-list">
            {sources.map((url, i) => {
              let hostname = "";
              try {
                hostname = new URL(url).hostname;
              } catch {}
              return (
                <li key={`${url}-${i}`} className="tool-web-search-item">
                  <Globe
                    size={13}
                    className="tool-web-search-item-icon"
                    aria-hidden="true"
                  />
                  <a
                    href={url}
                    onClick={openUrl(url)}
                    className="tool-web-search-link"
                    title={url}
                    rel="noreferrer noopener"
                  >
                    <span className="tool-web-search-host">
                      {hostname || url}
                    </span>
                    <span className="tool-web-search-url">{url}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {!sources.length && !citations.length && (
        <span className="tool-section-empty">搜索未返回来源网页</span>
      )}
    </div>
  );
}
