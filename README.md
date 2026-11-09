# Hindsight sync for DeepSeek Harness

A removable DSH client bundle that adds one conversation view tab, **Hindsight**, to the
right of the statistics view. It writes the current Session's full conversation into a
self-hosted [Hindsight](https://github.com/deepseek-ai/deepseek-harness) memory bank, and
shows when that Session was last synced and whether it is stale.

Nothing about your deployment is compiled in: the Hindsight server URL, the memory bank
name, and the request timeouts live in the plugin's **Config**, editable from DSH's
settings page and stored per device in the active profile. The package can be installed
unchanged on any machine.

## Requirements

- DeepSeek Harness `0.2.2-rc.1` or newer (`engines.dsh`).
- A reachable self-hosted Hindsight service. The default is `http://localhost:8888`.
- `git` on the machine when installing from this repository; DSH Desktop ships the
  package manager used for installation, so no global pnpm is required.

## Install

### From the DSH Desktop UI (recommended)

1. Open **Plugins** in the sidebar.
2. Choose **Add plugin** (or the arrow next to it → **Install a third-party plugin**).
3. Enter one of:

   ```text
   github:MaxwellJay256/dsh-hindsight-sync#v1.0.0
   https://github.com/MaxwellJay256/dsh-hindsight-sync.git#v1.0.0
   ```

4. Install and restart DSH. With git sources there is no "update" entry: to upgrade,
   remove the plugin and add it again at the new tag.

### From the DSH Desktop command line

```powershell
$dsh = "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
& $dsh plugin --profile desktop add "github:MaxwellJay256/dsh-hindsight-sync#v1.0.0"
```

Uninstall with `& $dsh plugin --profile desktop remove dsh-hindsight-sync`.

### Manual (development)

```text
git clone git@github.com:MaxwellJay256/dsh-hindsight-sync.git <path>
```

Then add `"dsh-hindsight-sync": "link:<path>"` to the profile's `dependencies` and
`"dsh-hindsight-sync"` to `dsh.profile.bundles` in
`%USERPROFILE%\.dsh\profiles\<profile>\package.json`, and restart DSH.

## Settings

Open **Settings → Hindsight sync**. The page is backed by the plugin's Config schema; a
save is validated by the Host and written to the active profile's Cordis patch
(`~/.dsh/profiles/<profile>/cordis.patch.yml`), which is outside this repository and
therefore never published.

| Setting | Default | Meaning |
| --- | --- | --- |
| Hindsight server URL | `http://localhost:8888` | Base URL of the self-hosted Hindsight service (http or https, no trailing slash needed). |
| Memory bank | `hermes` | Bank that receives this machine's synced conversations. |
| Sync timeout (ms) | `20000` | How long a manual sync may wait for Hindsight to accept the retain call. |
| Status timeout (ms) | `8000` | How long a sync-status read may take. |

Every device keeps its own values: install the plugin elsewhere and point it at the
Hindsight instance that device can reach.

## Use

Open a conversation, select the **Hindsight** tab on the right, and press **Sync to
Hindsight**. The tab shows the last sync time, whether the conversation has messages that
were not synced yet, and the result of the current request.

How the sync behaves:

- The document id is `dsh-ui-sync:<sessionId>`, so every click **replaces** that
  Session's previous copy instead of appending duplicates.
- The request is asynchronous (`async: true`): Hindsight accepts it and extracts in the
  background. The tab reconciles the displayed timestamp afterwards.
- Only user and assistant text is written. Tool calls, reasoning blocks, and attachments
  are omitted (an image or file becomes a short marker).
- Each document carries `session:<id>`, `harness:dsh`, and `source:dsh-ui-sync` tags plus
  Session metadata (`dsh_session_id`, `cwd`, `synced_at`, `synced_through_seq`).

## How it works

| File | Role |
| --- | --- |
| `index.js` | Host entry: Config schema, web carrier route, envelope validation, `sync` / `status` dispatch. |
| `lib/hindsight.js` | Transcript extraction, settings projection, and Hindsight HTTP calls. |
| `client.js` | Browser module: locale dictionaries, the conversation view tab, and the Settings page. |
| `cordis.patch.yml` | Inserts the single bundle row (`id: hindsight-sync`). |
| `locale/en.json`, `locale/zh.json` | Plugin inventory title and description. |
| `icon.svg` | Plugin inventory artwork. |
| `scripts/selftest.mjs` | Offline transport/config test (no live memory bank touched). |
| `scripts/clienttest.mjs` | Offline browser-half wiring test (module loader stub, settings page registration). |

The browser never calls the memory bank directly: it POSTs a small same-origin envelope to
`/hindsight-sync/sync` or `/hindsight-sync/status`, and the Host half reads the Session log
and issues the Hindsight request from Node. The route is registered directly on the web
carrier; a profile plugin cannot register a shared `connection.rpc` channel. Requests are
fenced by a same-origin check that accepts the desktop shell's `dsh-app:` origin and treats
`localhost`, `127.0.0.1`, and `[::1]` on the same port as one origin.

Settings are declared as a Schemastery `Config` with volatile fields. A save therefore
commits into the running values without remounting the plugin, so the tab and the HTTP
route survive a settings change. `@deepseek-ai/schemastery` is declared both as a
dependency (so the bundle always resolves the schema package it was built against) and as
a peer dependency (so the Host can route the import to its own copy).

## Development

```text
pnpm install            # installs the schema dependency for local checks
node scripts/build.mjs  # manifest, patch, locales, icon, wiring, syntax
pnpm test               # host transport/config test + browser-half wiring test
```

All scripts run offline; the tests stub both the Session log and the Hindsight HTTP calls.

## Privacy

- Connection settings are stored per device in the DSH profile, not in this repository.
- Synced conversations are sent to the Hindsight service **you** configure; review that
  service's retention policy before syncing sensitive Sessions.
- Session `cwd` is included as document metadata, as are the document tags listed above.

## License

MIT — see [LICENSE](LICENSE).
