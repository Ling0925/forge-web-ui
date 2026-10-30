import type { PublicAccountLogin } from "@forge/core/shared/model-access";
import { Plugs } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../primitives/Button";
import { Select } from "../../primitives/Select";
import { Tag } from "../../primitives/Tag";
import { describedFailure } from "./drafts";

export function AccountLoginPanel({
  sourceId,
  disabled,
  onCompleted,
}: {
  readonly sourceId: string;
  readonly disabled: boolean;
  readonly onCompleted: () => Promise<void>;
}) {
  const [platform, setPlatform] = useState<"codex" | "copilot">("codex");
  const [login, setLogin] = useState<PublicAccountLogin | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const loginRef = useRef<PublicAccountLogin | null>(null);
  loginRef.current = login;
  const completed = useRef(false);
  const finish = async () => {
    if (completed.current) return;
    completed.current = true;
    await onCompleted();
  };
  const poll = async (loginId: string) => {
    if (!window.forge.modelAccess) return;
    try {
      const result = await window.forge.modelAccess({
        type: "login-poll",
        loginId,
      });
      if (result.type !== "login-poll" || loginRef.current?.loginId !== loginId)
        return;
      setLogin(result.login);
      if (result.login.status === "done") await finish();
      if (result.login.status === "failed" || result.login.status === "expired")
        setError(
          result.login.error ??
            `登录${result.login.status === "expired" ? "已过期" : "失败"}。`,
        );
    } catch (pollError) {
      setError(describedFailure(pollError));
    }
  };
  useEffect(() => {
    const active = login?.status === "waiting" ? login : null;
    if (!active) return;
    const timer = setInterval(() => void poll(active.loginId), 2000);
    return () => clearInterval(timer);
    // poll is intentionally keyed to the current login id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [login?.loginId, login?.status]);
  useEffect(() => {
    return () => {
      const active = loginRef.current;
      if (active?.status === "waiting" && window.forge.modelAccess)
        void window.forge
          .modelAccess({ type: "login-cancel", loginId: active.loginId })
          .catch(() => {});
    };
  }, []);
  const start = async () => {
    if (!window.forge.modelAccess) {
      setError("当前宿主不支持账号登录。");
      return;
    }
    setBusy(true);
    setError("");
    completed.current = false;
    try {
      const result = await window.forge.modelAccess({
        type: "login-start",
        sourceId,
        platform,
      });
      if (result.type === "login-start") setLogin(result.login);
    } catch (startError) {
      setError(describedFailure(startError));
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    const active = loginRef.current;
    if (!active || !window.forge.modelAccess) return;
    setBusy(true);
    try {
      const result = await window.forge.modelAccess({
        type: "login-cancel",
        loginId: active.loginId,
      });
      if (result.type === "login-cancel") setLogin(result.login);
    } catch (cancelError) {
      setError(describedFailure(cancelError));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="model-access-account">
      <div className="model-access-inline">
        <Select
          aria-label="账号平台"
          value={platform}
          options={[
            { value: "codex", label: "Codex" },
            { value: "copilot", label: "Copilot" },
          ]}
          onValueChange={(value) =>
            setPlatform(value === "copilot" ? "copilot" : "codex")
          }
        />
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          disabled={disabled || (!!login && login.status === "waiting")}
          onClick={() => void start()}
        >
          开始登录
        </Button>
        {login?.status === "waiting" && (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void poll(login.loginId)}
            >
              查询
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void cancel()}
            >
              取消登录
            </Button>
          </>
        )}
      </div>
      {login && (
        <div className="model-access-login" aria-live="polite">
          <span className="model-access-status">
            {login.platform} ·{" "}
            {login.status === "waiting"
              ? "等待登录"
              : login.status === "done"
                ? "登录完成"
                : login.status}
          </span>
          {login.verificationUrl && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Plugs size={14} />}
              onClick={() => {
                void window.forge
                  .openExternal(login.verificationUrl!)
                  .catch((openError) => {
                    setError(describedFailure(openError));
                  });
              }}
            >
              打开登录页面
            </Button>
          )}
          {login.userCode && (
            <code className="model-access-code">{login.userCode}</code>
          )}
          {login.account?.user && (
            <span className="model-access-status">{login.account.user}</span>
          )}
          {login.account?.plan && <Tag>{login.account.plan}</Tag>}
        </div>
      )}
      {error && (
        <span className="model-access-status is-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
