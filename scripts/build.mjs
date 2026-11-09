/**
 * Build-time validation for the Hindsight sync bundle.
 *
 * The runtime entry points are plain JavaScript, so the build step proves that the
 * manifest, patch, locale resources, icon, settings wiring, and both JavaScript
 * halves are present and syntactically valid instead of compiling sources. The
 * script reads the package name from the manifest instead of hard-coding it, so
 * renaming the package cannot leave a stale assertion behind.
 *
 * Run `pnpm install` once before this script: the host half imports its Config
 * schema from @deepseek-ai/schemastery.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const problems = [];

function fail(message) {
  problems.push(message);
}

function readJson(relative) {
  try {
    return JSON.parse(readFileSync(join(root, relative), "utf8"));
  } catch (error) {
    fail(
      `${relative}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

const manifest = readJson("package.json");
const name = manifest !== undefined && typeof manifest.name === "string" ? manifest.name : "";
const namePattern = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

if (manifest !== undefined) {
  if (!namePattern.test(name)) fail(`package.json: name ${JSON.stringify(name)} is not a valid package name`);
  if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version)) {
    fail("package.json: version must be a semver version");
  }
  if (manifest.private === true) fail("package.json: private must not be true for a published plugin");
  if (typeof manifest.license !== "string" || manifest.license === "") fail("package.json: license is missing");
  if (!existsSync(join(root, "LICENSE"))) fail("LICENSE: missing");
  if (manifest.dsh === undefined || manifest.dsh.bundle === undefined)
    fail("package.json: dsh.bundle is missing");
  else if (manifest.dsh.bundle.patch !== "./cordis.patch.yml")
    fail("package.json: dsh.bundle.patch must be ./cordis.patch.yml");
  if (manifest.dsh === undefined || manifest.dsh.client === undefined)
    fail("package.json: dsh.client is missing");
  else {
    if (manifest.dsh.client.platform !== "web")
      fail("package.json: dsh.client.platform must be web");
    if (
      !Array.isArray(manifest.dsh.client.inject) ||
      manifest.dsh.client.inject.length === 0
    ) {
      fail("package.json: dsh.client.inject must list the client dependencies");
    }
  }
  for (const entry of [".", "./client", "./cordis.patch.yml", "./locale/*.json", "./icon", "./package.json"]) {
    if (
      manifest.exports === undefined ||
      manifest.exports[entry] === undefined
    ) {
      fail(`package.json: exports["${entry}"] is missing`);
    }
  }
  if (!Array.isArray(manifest.files))
    fail("package.json: files must be an array");
  const peerDependencies = manifest.peerDependencies ?? {};
  if (typeof peerDependencies["@deepseek-ai/schemastery"] !== "string")
    fail("package.json: peerDependencies['@deepseek-ai/schemastery'] is required (the Config schema resolves it from the Host)");
  const dependencies = manifest.dependencies ?? {};
  if (typeof dependencies["@deepseek-ai/schemastery"] !== "string")
    fail("package.json: dependencies['@deepseek-ai/schemastery'] must pin the copy the bundle can always resolve");
}

const patch = readFileSync(join(root, "cordis.patch.yml"), "utf8");
if (!patch.startsWith("- insert:"))
  fail(
    "cordis.patch.yml: must be a plain array starting with an insert operation",
  );
if (patch.includes("group:") || patch.includes("!!") || patch.includes("&")) {
  fail(
    "cordis.patch.yml: only insert operations are allowed (no groups, aliases, or custom tags)",
  );
}
/**
 * Read one scalar field from the patch file, accepting quoted and bare YAML.
 * @param {string} key - field name.
 * @returns {string} the scalar value, or '' when absent.
 */
function yamlScalar(key) {
  const match = patch.match(new RegExp(`\\b${key}:\\s*("[^"]*"|'[^']*'|\\S+)`));
  return match === null ? "" : match[1].replace(/^["']|["']$/g, "");
}

const entryId = yamlScalar("id");
if (!/^[a-z0-9][a-z0-9-]*$/.test(entryId)) {
  fail(
    `cordis.patch.yml: the inserted entry id must be a short kebab-case id (got ${JSON.stringify(entryId)})`,
  );
}
const entryName = yamlScalar("name");
if (entryName !== name) {
  fail(`cordis.patch.yml: the inserted module name must be the package name (${name})`);
}

for (const locale of ["en", "zh"]) {
  const data = readJson(`locale/${locale}.json`);
  if (data === undefined) continue;
  if (
    data.meta === undefined ||
    typeof data.meta.title !== "string" ||
    data.meta.title === ""
  ) {
    fail(`locale/${locale}.json: meta.title is missing`);
  }
  if (
    data.meta === undefined ||
    typeof data.meta.description !== "string" ||
    data.meta.description === ""
  ) {
    fail(`locale/${locale}.json: meta.description is missing`);
  }
}

const iconPath = join(root, "icon.svg");
if (!existsSync(iconPath)) fail("icon.svg: missing");
else {
  const icon = readFileSync(iconPath, "utf8");
  if (!icon.trimStart().startsWith("<svg"))
    fail("icon.svg: does not look like SVG");
  if (statSync(iconPath).size > 256 * 1024)
    fail("icon.svg: exceeds the 256 KiB limit");
}

const client = readFileSync(join(root, "client.js"), "utf8");
const loaderId = client.match(/load\(\{\s*id:\s*["']([^"']+)["']/);
if (loaderId === null || loaderId[1] !== name) {
  fail("client.js: the module loader id must equal the package name");
}
const channel = client.match(/const CHANNEL = ["']([^"']+)["']/);
if (channel === null || channel[1] !== `/${entryId}`) {
  fail(`client.js: CHANNEL must be "/${entryId}" (the host route)`);
}
const viewId = client.match(/const VIEW_ID = ["']([^"']+)["']/);
if (viewId === null || viewId[1] !== entryId) {
  fail(`client.js: VIEW_ID must be "${entryId}"`);
}
const entryIdLiteral = client.match(/const ENTRY_ID = ["']([^"']+)["']/);
if (entryIdLiteral === null || entryIdLiteral[1] !== entryId) {
  fail(`client.js: ENTRY_ID must be "${entryId}" (the settings namespace)`);
}

const host = readFileSync(join(root, "index.js"), "utf8");
const route = host.match(/export const ROUTE = ["']([^"']+)["']/);
if (route === null || route[1] !== `/${entryId}`) {
  fail(`index.js: ROUTE must be "/${entryId}"`);
}
if (!/export const Config = Schema\.object\(/.test(host)) {
  fail("index.js: the Config schema export is missing");
}

// Syntax checks without child processes: the browser half is a classic script,
// the host half is an ES module that resolves its schema dependency.
try {
  // eslint-disable-next-line no-new-func
  new Function(client);
} catch (error) {
  fail(`client.js: syntax check failed: ${error instanceof Error ? error.message : String(error)}`);
}
for (const relative of ["index.js", "lib/hindsight.js"]) {
  try {
    await import(pathToFileURL(join(root, relative)).href);
  } catch (error) {
    fail(
      `${relative}: module check failed (run pnpm install first): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// Every runtime artifact named by the manifest must exist on disk.
if (manifest !== undefined && Array.isArray(manifest.files)) {
  for (const entry of manifest.files) {
    if (entry.endsWith("/*.json")) {
      const directory = join(root, dirname(entry));
      if (
        !existsSync(directory) ||
        readdirSync(directory).every((name) => !name.endsWith(".json"))
      ) {
        fail(`files: ${entry} matches nothing`);
      }
    } else if (!existsSync(join(root, entry))) {
      fail(`files: ${entry} is missing`);
    }
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`FAIL ${problem}`);
  process.exitCode = 1;
} else {
  console.log(
    "build: package manifest, patch, locales, icon, settings wiring, and entry points are valid",
  );
}
