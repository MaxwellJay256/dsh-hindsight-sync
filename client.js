window.__ModuleLoader__.load({
  id: "dsh-hindsight-sync",
  factory(require) {
    const React = require("react");
    const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    const h = React.createElement;

    const NS = "hindsight-sync";
    const CHANNEL = "/hindsight-sync";
    const VIEW_ID = "hindsight-sync";
    // Entry id from cordis.patch.yml: the settings service addresses the plugin's
    // Config form by profile entry id, not by package name.
    const ENTRY_ID = "hindsight-sync";

    const EN = {
      "view.label": "Hindsight",
      "action.sync": "Sync to Hindsight",
      "action.syncing": "Syncing…",
      hint: "Writes this session's full conversation to your Hindsight memory bank. Each click replaces this session's previous copy.",
      "lastSync.label": "Last sync",
      "lastSync.none": "Not synced yet",
      "status.label": "Status",
      "status.never": "Not synced",
      "status.current": "Up to date",
      "status.stale": "New conversation not synced yet",
      "status.unavailable": "Sync status unavailable",
      "status.pending": "Processing in the background",
      "result.accepted": "Sync submitted",
      "result.processing": "Hindsight is processing it in the background",
      "result.failed": "Sync failed",
      messages: "messages",
      "error.empty": "This session has no messages to sync yet",
      "error.session": "This session is no longer available",
      "error.unreachable":
        "Cannot reach the Hindsight server. Check the connection settings for this plugin.",
      "error.rejected": "Hindsight rejected the sync",
      "error.unknown": "Unexpected error",
      "settings.nav": "Hindsight sync",
      "settings.title": "Hindsight connection",
      "settings.summary":
        "Where this machine writes synced conversations. Each device keeps its own values.",
      "settings.baseUrl": "Hindsight server URL",
      "settings.baseUrlHint":
        "Base URL of the self-hosted Hindsight service, for example http://localhost:8888.",
      "settings.bank": "Memory bank",
      "settings.bankHint":
        "Bank that receives this machine's synced conversations. Letters, digits, dot, dash and underscore.",
      "settings.retainTimeout": "Sync timeout (ms)",
      "settings.retainTimeoutHint":
        "How long a manual sync may wait for Hindsight to accept the retain call.",
      "settings.statusTimeout": "Status timeout (ms)",
      "settings.statusTimeoutHint": "How long a sync-status read may take.",
      "settings.overridden": "Overridden",
      "settings.reset": "Reset to default",
      "settings.save": "Save",
      "settings.saving": "Saving…",
      "settings.saveFailed":
        "The deployment did not accept these values; they were left for you to correct.",
      "settings.unavailable": "This plugin is not loaded, so it cannot be configured right now.",
      "settings.readOnly": "This deployment stores settings read-only.",
      "settings.invalidNumber": "Enter a number, or leave blank to use the default.",
    };

    const ZH = {
      "view.label": "Hindsight",
      "action.sync": "同步到 Hindsight",
      "action.syncing": "正在同步…",
      hint: "把本会话的完整对话写入你的 Hindsight 记忆库。每次点击都会替换该会话上一次同步的内容。",
      "lastSync.label": "上次同步",
      "lastSync.none": "尚未同步",
      "status.label": "状态",
      "status.never": "尚未同步",
      "status.current": "已是最新",
      "status.stale": "有新的对话尚未同步",
      "status.unavailable": "暂时无法读取同步状态",
      "status.pending": "已提交，后台处理中",
      "result.accepted": "已提交同步",
      "result.processing": "Hindsight 正在后台处理",
      "result.failed": "同步失败",
      messages: "条消息",
      "error.empty": "当前会话还没有可同步的对话",
      "error.session": "当前会话已不可用",
      "error.unreachable": "无法连接 Hindsight 服务器，请检查本插件的连接设置。",
      "error.rejected": "Hindsight 拒绝了本次同步",
      "error.unknown": "出现未知错误",
      "settings.nav": "Hindsight 同步",
      "settings.title": "Hindsight 连接",
      "settings.summary":
        "设置本机把对话同步到哪里。每台设备各自保存自己的设置。",
      "settings.baseUrl": "Hindsight 服务地址",
      "settings.baseUrlHint":
        "自托管 Hindsight 服务的基础地址，例如 http://localhost:8888。",
      "settings.bank": "记忆库",
      "settings.bankHint":
        "接收本机同步内容的记忆库名称；可用字母、数字、点、横线和下划线。",
      "settings.retainTimeout": "同步超时（毫秒）",
      "settings.retainTimeoutHint":
        "一次手动同步最多等待 Hindsight 接受写入的时间。",
      "settings.statusTimeout": "状态读取超时（毫秒）",
      "settings.statusTimeoutHint": "读取同步状态最多等待的时间。",
      "settings.overridden": "已覆盖",
      "settings.reset": "恢复默认",
      "settings.save": "保存",
      "settings.saving": "保存中…",
      "settings.saveFailed": "本部署没有接受这些值，已保留供你修改。",
      "settings.unavailable": "该插件当前未加载，暂时无法配置。",
      "settings.readOnly": "本部署的设置为只读。",
      "settings.invalidNumber": "请填数字；留空表示使用默认值。",
    };

    const CSS = [
      ".hdgsync-root{box-sizing:border-box;min-height:100%;padding:24px;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family)}",
      ".hdgsync-card{box-sizing:border-box;max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:16px;padding:20px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-xl);background:var(--dsw-alias-bg-layer-1)}",
      ".hdgsync-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}",
      ".hdgsync-heading{display:flex;flex-direction:column;gap:4px;min-width:0}",
      ".hdgsync-title{margin:0;font-size:14px;font-weight:500;line-height:22px;color:var(--dsw-alias-label-primary)}",
      ".hdgsync-hint{margin:0;font-size:12px;font-weight:400;line-height:18px;color:var(--dsw-alias-label-tertiary)}",
      ".hdgsync-button{flex:none;height:30px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;cursor:pointer}",
      ".hdgsync-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
      ".hdgsync-button:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}",
      ".hdgsync-button:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}",
      ".hdgsync-meta{display:flex;flex-direction:column;gap:6px;margin:0}",
      ".hdgsync-row{display:flex;align-items:baseline;gap:12px;font-size:12px;line-height:18px}",
      ".hdgsync-row dt{min-width:64px;margin:0;color:var(--dsw-alias-label-tertiary)}",
      ".hdgsync-row dd{margin:0;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}",
      '.hdgsync-row dd[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary)}',
      '.hdgsync-row dd[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}',
      ".hdgsync-notice{margin:0;padding:8px 10px;border-radius:var(--dsw-radius-md);font-size:12px;line-height:18px;overflow-wrap:anywhere}",
      '.hdgsync-notice[data-kind="success"]{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent)}',
      '.hdgsync-notice[data-kind="error"]{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}',
      ".hdgsync-settings{box-sizing:border-box;max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:12px;padding:8px 4px 24px}",
      "@media (width <= 600px){.hdgsync-head{flex-direction:column;align-items:stretch}.hdgsync-button{align-self:flex-start}}",
    ].join("");

    function formatTime(value) {
      if (typeof value !== "string" || value === "") return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return date.toLocaleString();
    }

    function errorText(t, error) {
      const code =
        error !== null &&
        typeof error === "object" &&
        typeof error.code === "string"
          ? error.code
          : "";
      if (code === "hindsight/empty-conversation") return t("error.empty");
      if (code === "hindsight/session-unavailable") return t("error.session");
      if (code === "hindsight/unreachable") return t("error.unreachable");
      if (
        code === "hindsight/rejected" ||
        code === "hindsight/invalid-response"
      )
        return t("error.rejected");
      if (
        error !== null &&
        typeof error === "object" &&
        typeof error.message === "string" &&
        error.message !== ""
      )
        return error.message;
      return t("error.unknown");
    }

    function emptyState(sessionId) {
      return {
        sessionId,
        busy: false,
        lastSync: null,
        currentLastSeq: null,
        unavailable: false,
        notice: null,
      };
    }

    function HindsightSyncView(props) {
      const t = typeof props.t === "function" ? props.t : (key) => key;
      const sessionId = props.sessionId;
      const session = props.session;
      const requestSync = props.sync;
      const requestStatus = props.status;
      // The slot may re-run inject on renders; keep effects on a stable status reader.
      const statusRef = React.useRef(requestStatus);
      statusRef.current = requestStatus;

      // Async replies from a previous Session must never paint the current one.
      const activeSession = React.useRef(sessionId);
      activeSession.current = sessionId;
      // Newest sync this tab knows about; a delayed status read must not regress it.
      const knownSync = React.useRef(null);

      const [state, setState] = React.useState(() => emptyState(sessionId));
      const current =
        state.sessionId === sessionId ? state : emptyState(sessionId);

      const patch = React.useCallback((sid, next) => {
        if (activeSession.current !== sid) return;
        setState((prev) => {
          const base = prev.sessionId === sid ? prev : emptyState(sid);
          return { ...base, ...next, sessionId: sid };
        });
      }, []);

      const refresh = React.useCallback(
        async (sid, signal) => {
          try {
            const result = await statusRef.current(signal);
            if (activeSession.current !== sid) return;
            if (signal !== undefined && signal.aborted) return;
            if (
              result === null ||
              typeof result !== "object" ||
              result.ok !== true
            ) {
              patch(sid, { unavailable: true });
              return;
            }
            const value =
              result.value !== null && typeof result.value === "object"
                ? result.value
                : {};
            const next = { unavailable: false };
            if (typeof value.currentLastSeq === "number")
              next.currentLastSeq = value.currentLastSeq;
            if (value.lastSync !== null && typeof value.lastSync === "object") {
              const known = knownSync.current;
              const candidate =
                typeof value.lastSync.syncedThroughSeq === "number"
                  ? value.lastSync.syncedThroughSeq
                  : -1;
              if (known === null || candidate >= known.syncedThroughSeq) {
                next.lastSync = value.lastSync;
                knownSync.current = value.lastSync;
              }
            }
            patch(sid, next);
          } catch {
            if (signal !== undefined && signal.aborted) return;
            patch(sid, { unavailable: true });
          }
        },
        [patch],
      );

      React.useEffect(() => {
        knownSync.current = null;
      }, [sessionId]);

      React.useEffect(() => {
        const controller = new AbortController();
        void refresh(sessionId, controller.signal);
        return () => controller.abort();
      }, [refresh, sessionId]);

      React.useEffect(() => {
        if (
          session === null ||
          typeof session !== "object" ||
          typeof session.subscribe !== "function"
        ) {
          return undefined;
        }
        let timer = null;
        let controller = null;
        let disposed = false;
        const onChange = () => {
          if (disposed) return;
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (disposed) return;
            if (controller !== null) controller.abort();
            controller = new AbortController();
            void refresh(sessionId, controller.signal);
          }, 1200);
        };
        const unsubscribe = session.subscribe(onChange);
        return () => {
          disposed = true;
          clearTimeout(timer);
          if (controller !== null) controller.abort();
          unsubscribe();
        };
      }, [refresh, session, sessionId]);

      const reconcileTimers = React.useRef([]);
      React.useEffect(
        () => () => {
          for (const timer of reconcileTimers.current) clearTimeout(timer);
          reconcileTimers.current = [];
        },
        [],
      );

      const busy = current.busy === true;

      const onSync = React.useCallback(async () => {
        if (busy) return;
        const sid = sessionId;
        patch(sid, { busy: true, notice: null });
        try {
          const result = await requestSync();
          if (activeSession.current !== sid) return;
          if (
            result === null ||
            typeof result !== "object" ||
            result.ok !== true
          ) {
            const error =
              result !== null && typeof result === "object"
                ? result.error
                : undefined;
            patch(sid, {
              busy: false,
              notice: {
                kind: "error",
                text: `${t("result.failed")}: ${errorText(t, error)}`,
              },
            });
            return;
          }
          const value =
            result.value !== null && typeof result.value === "object"
              ? result.value
              : {};
          const syncedThroughSeq =
            typeof value.syncedThroughSeq === "number"
              ? value.syncedThroughSeq
              : 0;
          const localSync = {
            at:
              typeof value.syncedAt === "string"
                ? value.syncedAt
                : new Date().toISOString(),
            syncedThroughSeq,
            pending: true,
          };
          knownSync.current = localSync;
          patch(sid, {
            busy: false,
            lastSync: localSync,
            currentLastSeq: syncedThroughSeq,
            notice: {
              kind: "success",
              text: `${t("result.accepted")} · ${String(value.messageCount ?? 0)} ${t("messages")} · ${t("result.processing")}`,
            },
          });
          // Hindsight processes asynchronously; reconcile the displayed timestamp with it.
          for (const delay of [5000, 15000, 30000, 60000, 120000, 180000]) {
            const timer = setTimeout(() => {
              reconcileTimers.current = reconcileTimers.current.filter(
                (entry) => entry !== timer,
              );
              if (activeSession.current !== sid) return;
              void refresh(sid, new AbortController().signal);
            }, delay);
            reconcileTimers.current.push(timer);
          }
        } catch (error) {
          patch(sid, {
            busy: false,
            notice: {
              kind: "error",
              text: `${t("result.failed")}: ${errorText(t, error)}`,
            },
          });
        }
      }, [busy, patch, refresh, requestSync, sessionId, t]);

      const lastSyncAt =
        current.lastSync !== null && typeof current.lastSync === "object"
          ? formatTime(current.lastSync.at)
          : null;
      const hasSync =
        current.lastSync !== null && typeof current.lastSync === "object";
      const syncedThroughSeq = hasSync
        ? current.lastSync.syncedThroughSeq
        : null;
      const stale =
        hasSync &&
        typeof current.currentLastSeq === "number" &&
        typeof syncedThroughSeq === "number" &&
        current.currentLastSeq > syncedThroughSeq;
      const pending = hasSync && current.lastSync.pending === true;
      const statusText = hasSync
        ? pending
          ? t("status.pending")
          : stale
            ? t("status.stale")
            : t("status.current")
        : current.unavailable
          ? t("status.unavailable")
          : t("status.never");
      const statusTone = hasSync
        ? pending
          ? undefined
          : stale
            ? "warn"
            : undefined
        : current.unavailable
          ? "error"
          : undefined;

      return h(
        "div",
        { className: "hdgsync-root" },
        h("style", { key: "style" }, CSS),
        h(
          "section",
          { className: "hdgsync-card", "aria-label": t("view.label") },
          h(
            "div",
            { className: "hdgsync-head" },
            h(
              "div",
              { className: "hdgsync-heading" },
              h("h2", { className: "hdgsync-title" }, t("view.label")),
              h("p", { className: "hdgsync-hint" }, t("hint")),
            ),
            h(
              "button",
              {
                type: "button",
                className: "hdgsync-button",
                onClick: onSync,
                disabled: busy,
                "aria-busy": busy ? "true" : undefined,
              },
              busy ? t("action.syncing") : t("action.sync"),
            ),
          ),
          h(
            "dl",
            { className: "hdgsync-meta" },
            h(
              "div",
              { className: "hdgsync-row" },
              h("dt", null, t("lastSync.label")),
              h(
                "dd",
                null,
                lastSyncAt !== null
                  ? lastSyncAt
                  : hasSync
                    ? "—"
                    : t("lastSync.none"),
              ),
            ),
            h(
              "div",
              { className: "hdgsync-row" },
              h("dt", null, t("status.label")),
              h("dd", { "data-tone": statusTone }, statusText),
            ),
          ),
          current.notice !== null && typeof current.notice === "object"
            ? h(
                "p",
                {
                  className: "hdgsync-notice",
                  "data-kind": current.notice.kind,
                  role: current.notice.kind === "error" ? "alert" : "status",
                },
                current.notice.text,
              )
            : null,
        ),
      );
    }

    function formLabels(t) {
      return {
        unavailable: t("settings.unavailable"),
        readOnly: t("settings.readOnly"),
        saveFailed: t("settings.saveFailed"),
        save: t("settings.save"),
        saving: t("settings.saving"),
      };
    }

    function HindsightSettingsSection(props) {
      const t = typeof props.t === "function" ? props.t : (key) => key;
      const state = props.useHindsightSettings((snapshot) => snapshot);
      if (props.view === "summary") return t("settings.summary");
      const disabled = state.writable !== true;
      const field = (name, labelKey, hintKey, numeric) =>
        h(primitives.SettingsValueField, {
          id: `dsh-hindsight-sync-${name}`,
          label: t(labelKey),
          hint: t(hintKey),
          overriddenLabel: t("settings.overridden"),
          resetLabel: t("settings.reset"),
          invalidLabel: t("settings.invalidNumber"),
          numeric: numeric === true,
          disabled,
          ...(state[name] !== null && typeof state[name] === "object"
            ? state[name]
            : {}),
          onEdit: (text) => props.edit(name, text),
          onReset: () => props.resetField(name),
        });
      return h(
        "div",
        { className: "hdgsync-settings" },
        h("h2", { className: "hdgsync-title" }, t("settings.title")),
        h("p", { className: "hdgsync-hint" }, t("settings.summary")),
        h(
          primitives.SettingsForm,
          {
            labels: formLabels(t),
            state,
            onSave: props.save,
            onDiscard: props.discard,
          },
          field("baseUrl", "settings.baseUrl", "settings.baseUrlHint"),
          field("bank", "settings.bank", "settings.bankHint"),
          field("retainTimeoutMs", "settings.retainTimeout", "settings.retainTimeoutHint", true),
          field("statusTimeoutMs", "settings.statusTimeout", "settings.statusTimeoutHint", true),
        ),
      );
    }

    function createSettingsController(scope) {
      const form = new primitives.SettingsFormModel(scope, [
        primitives.settingsTextField("baseUrl"),
        primitives.settingsTextField("bank"),
        primitives.settingsNumberField("retainTimeoutMs"),
        primitives.settingsNumberField("statusTimeoutMs"),
      ]);
      const store = form.bind(() => ({
        ...form.shell(),
        baseUrl: form.field("baseUrl"),
        bank: form.field("bank"),
        retainTimeoutMs: form.field("retainTimeoutMs"),
        statusTimeoutMs: form.field("statusTimeoutMs"),
      }));
      return {
        inject: () => ({ hooks: { hindsightSettings: store }, ...form.actions() }),
        dispose: () => form.dispose(),
      };
    }

    function apply(ctx) {
      ctx.effect(
        () => ctx.locale.register(NS, { zh: ZH, en: EN }),
        "hindsight-sync: dictionaries",
      );
      const t = ctx.locale.bind(NS);

      ctx.slots.inject("conversation.view", () =>
        ctx.slots.register(
          {
            name: "conversation.view",
            id: VIEW_ID,
            order: 50,
            locale: NS,
            label: () => t("view.label"),
            inject: (sessionId) => {
              const binding = ctx.sessions.binding(sessionId);
              const session =
                binding === undefined ? undefined : binding.session;
              if (session === undefined || session === null) {
                throw new Error(
                  `hindsight-sync: session "${sessionId}" is unavailable`,
                );
              }
              return {
                sessionId,
                session,
                sync: () =>
                  ctx.connection.rpc.call(CHANNEL, "sync", { sessionId }),
                status: (signal) =>
                  ctx.connection.rpc.call(
                    CHANNEL,
                    "status",
                    { sessionId },
                    signal,
                  ),
              };
            },
          },
          HindsightSyncView,
        ),
      );

      // The settings page lives in an optional child fiber: a deployment whose
      // client composition has no settings service keeps the conversation tab.
      if (typeof ctx.inject === "function") {
        ctx.inject(["configForms"], (child) => {
          const card = createSettingsController(child.configForms.get(ENTRY_ID));
          child.effect(
            () => () => card.dispose(),
            "hindsight-sync: settings form",
          );
          child.effect(
            () =>
              child.configForms.whileServed([ENTRY_ID], () =>
                child.slots.inject("settings.section", () =>
                  child.slots.register(
                    {
                      name: "settings.section",
                      id: "hindsight-sync",
                      order: 60,
                      label: () => t("settings.nav"),
                      locale: NS,
                      inject: () => ({ t, ...card.inject() }),
                    },
                    HindsightSettingsSection,
                  ),
                ),
              ),
            "hindsight-sync: settings page",
          );
        });
      }
    }

    return {
      inject: ["slots", "sessions", "locale", "connection"],
      apply,
    };
  },
});
