/**
 * Offline wiring test for the browser half.
 *
 * Loads the real `client.js` through a stub module loader, executes its factory
 * with stubbed React and settings primitives, and applies the plugin against a
 * fake client context. It proves the plugin registers the conversation tab and
 * the Settings section with the ids and hooks the Host and the settings service
 * expect, without a browser.
 */

/** @type {{ id: string, factory: Function } | undefined} */
let definition;

globalThis.window = {
  __ModuleLoader__: {
    load(value) {
      definition = value;
    },
  },
};

await import("../client.js");

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}${detail === undefined ? "" : `: ${detail}`}`);
  }
}

if (definition === undefined) {
  console.error("FAIL: client.js did not register a module definition");
  process.exit(1);
}

const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useRef: (value) => ({ current: value }),
  useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
  useCallback: (callback) => callback,
  useEffect: () => {},
};

const textField = (field) => ({ field, kind: "text" });
const numberField = (field) => ({ field, kind: "number" });
const SettingsValueField = () => null;
const SettingsForm = () => null;
class SettingsFormModel {
  constructor(scope, specs) {
    this.scope = scope;
    this.specs = specs;
  }
  bind(projection) {
    this.projection = projection;
    const store = () => projection();
    return store;
  }
  shell() {
    return { available: true, writable: true, dirty: false, invalid: false, saving: false, failed: false };
  }
  field(name) {
    return { text: "", overridden: false, invalid: false, __field: name };
  }
  actions() {
    return {
      edit: (field, value) => {
        this.lastEdit = { field, value };
      },
      resetField: (field) => {
        this.lastReset = field;
      },
      save: () => {},
      discard: () => {},
    };
  }
  dispose() {}
}

const primitives = {
  SettingsForm,
  SettingsValueField,
  SettingsFormModel,
  settingsTextField: textField,
  settingsNumberField: numberField,
};

const requireStub = (name) => {
  if (name === "react") return React;
  if (name === "@deepseek-ai/dsh-client-ui-primitives") return primitives;
  throw new Error(`unexpected client module: ${name}`);
};

let exported;
try {
  exported = definition.factory(requireStub);
} catch (error) {
  console.error(`FAIL: factory threw: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
}

check("module loader id is the package name", definition.id === "dsh-hindsight-sync", definition.id);
check("exports apply", typeof exported.apply === "function");
check(
  "exports the required services",
  JSON.stringify(exported.inject) === JSON.stringify(["slots", "sessions", "locale", "connection"]),
  JSON.stringify(exported.inject),
);

const slots = [];
const localeDictionaries = [];
let formScope;
let whileServedNamespaces;

const locale = {
  register(namespace, dictionaries) {
    localeDictionaries.push({ namespace, dictionaries });
    return () => {};
  },
  bind(namespace) {
    return (key) => `${namespace}.${key}`;
  },
};

const slotsService = {
  inject(name, callback) {
    return callback();
  },
  register(definition, component) {
    slots.push({ definition, component });
    return () => {};
  },
};

const childCtx = {
  effect: (callback) => {
    callback();
  },
  slots: slotsService,
  locale,
  configForms: {
    get(namespace) {
      formScope = namespace;
      return {};
    },
    whileServed(namespaces, register) {
      whileServedNamespaces = namespaces;
      return register(new Set(namespaces));
    },
  },
};

const ctx = {
  effect: (callback) => {
    callback();
  },
  slots: slotsService,
  locale,
  sessions: {
    binding: (sessionId) => ({ session: { header: { cwd: "C:\\workspace" } } }),
  },
  connection: {
    rpc: {
      call: () => Promise.resolve({ ok: true, value: {} }),
    },
  },
  inject: (dependencies, callback) => {
    check("settings page is optional (child fiber injects configForms)", dependencies.includes("configForms"));
    callback(childCtx);
  },
};

exported.apply(ctx);

check("registers dictionaries for en and zh", localeDictionaries.length === 1 && localeDictionaries[0].dictionaries.zh !== undefined);

const view = slots.find((entry) => entry.definition.name === "conversation.view");
check("registers the conversation view", view !== undefined);
if (view !== undefined) {
  check("view id", view.definition.id === "hindsight-sync", view.definition.id);
  check("view order", view.definition.order === 50, String(view.definition.order));
  const injected = view.definition.inject("session-1");
  check("view inject carries the session", injected.sessionId === "session-1");
  check("view inject exposes sync/status", typeof injected.sync === "function" && typeof injected.status === "function");
}

const section = slots.find((entry) => entry.definition.name === "settings.section");
check("registers the settings section", section !== undefined);
if (section !== undefined) {
  check("settings section id", section.definition.id === "hindsight-sync", section.definition.id);
  check("settings section order", section.definition.order === 60, String(section.definition.order));
  check("settings section label", section.definition.label() === "hindsight-sync.settings.nav");
  check("settings form targets the entry id", formScope === "hindsight-sync", formScope);
  check(
    "settings page waits for the served namespace",
    JSON.stringify(whileServedNamespaces) === JSON.stringify(["hindsight-sync"]),
    JSON.stringify(whileServedNamespaces),
  );
  const injected = section.definition.inject();
  check("settings inject exposes the form hook", typeof injected.useHindsightSettings === "function" || typeof injected.hooks?.hindsightSettings === "function");
  check("settings inject exposes form actions", typeof injected.edit === "function" && typeof injected.save === "function");

  // Render the card against the injected snapshot shape.
  const store = injected.hooks?.hindsightSettings ?? injected.useHindsightSettings;
  const element = section.component({
    t: (key) => key,
    useHindsightSettings: store,
    edit: injected.edit,
    resetField: injected.resetField,
    save: injected.save,
    discard: injected.discard,
  });
  check("settings card renders a root element", element !== null && typeof element === "object");
  const formElement = element.children.find((child) => child?.type === SettingsForm);
  const fieldElements = formElement === undefined
    ? []
    : formElement.children.filter(
        (child) => typeof child?.props?.id === "string" && child.props.id.startsWith("dsh-hindsight-sync-"),
      );
  check("settings card renders the official form", formElement !== undefined);
  check(
    "settings card renders four fields",
    fieldElements.length === 4,
    JSON.stringify(formElement?.children?.map((child) => child?.props?.id)),
  );
  check(
    "settings fields use the number factory for timeouts",
    fieldElements.some((child) => child.props.numeric === true),
  );
}

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
