# Lessons

> After every correction, after every PR, after every debugging session, update this file with the pattern that caused the issue and the rule that prevents it.

---

## Zotero Plugin Development

### Lesson 1: Plugin Reload Requires `-purgecaches`

**Pattern**: Made changes to plugin code but didn't see them in Zotero.

**Rule**: After any plugin code change, Zotero must be started with `-purgecaches` flag to force re-reading cached files.

**Example**:
```bash
# Wrong - changes not picked up
open /Applications/Zotero.app

# Correct - forces cache purge
open /Applications/Zotero.app --args -purgecaches
```

---

### Lesson 2: ItemPaneManager Sections Only Active in Reader Tab

**Pattern**: Registered a section but it never appeared.

**Rule**: Sections registered with `Zotero.ItemPaneManager.registerSection()` only show when `tabType === "reader"`. Check `onItemChange` callback to enable for reader only.

**Example**:
```typescript
onItemChange: ({ item, setEnabled, tabType }) => {
  setEnabled(tabType === "reader");  // Must check this
  return true;
}
```

---

### Lesson 3: bodyXHTML Must Be Valid XHTML

**Pattern**: Section body rendered as blank or threw console errors.

**Rule**: The `bodyXHTML` string must be valid XHTML. Use lowercase tag names and proper attribute syntax (`class="..."` not `class=...`).

**Example**:
```typescript
// Wrong
bodyXHTML: '<div class=test>content</div>'

// Correct
bodyXHTML: '<html:div class="test">content</html:div>'
```

---

### Lesson 4: attachment.attachmentText Returns Promise

**Pattern**: Tried to use PDF text but got `[object Promise]` or undefined.

**Rule**: `attachment.attachmentText` is an async method that returns a Promise. Must use `await` or `.then()`.

**Example**:
```typescript
// Wrong
const text = attachment.attachmentText;
console.log(text);  // Promise

// Correct
const text = await attachment.attachmentText;
console.log(text);  // Actual text
```

---

### Lesson 5: Zotero.Prefs Uses Specific Prefix

**Pattern**: Preference values not persisting or reading default values.

**Rule**: Preferences stored with `Zotero.Prefs.get/set` require the correct prefix. Scaffold uses `extensions.{addonID}.` prefix.

**Example**:
```typescript
const prefix = "extensions.zotero.addontemplate.";
// Wrong: Zotero.Prefs.get("enable")
// Correct: Zotero.Prefs.get(prefix + "enable")
```

---

### Lesson 6: bootstrap.js Runs Before TypeScript Modules

**Pattern**: Tried to use addon.data in bootstrap.js but it wasn't loaded yet.

**Rule**: `bootstrap.js` is the entry point. It loads the compiled TypeScript which then creates the `addon` global. Place initialization logic in `src/hooks.ts` `onStartup`, not in bootstrap.

**Example**:
```javascript
// bootstrap.js - just registers chrome, doesn't access addon.data
function startup(data, reason) {
  // Load scripts that set up addon global
}
```

---

### Lesson 7: DBConnection Name Must Be Unique Per Plugin

**Pattern**: Database operations conflict with other plugins or can't create tables.

**Rule**: Each plugin should use a unique DBConnection name. Use your addon ID or a namespaced name.

**Example**:
```typescript
// Wrong - might conflict
const db = new Zotero.DBConnection('zotero');

// Correct - unique to this plugin
const db = new Zotero.DBConnection('ai-reader-plugin');
```

---

---

### Lesson 12: bootstrap.js rootURI Already Has Trailing Slash

**Pattern**: `loadSubScript` silently fails to load the script, `Zotero.AddonInstance` stays `undefined`.

**Rule**: `rootURI` in `bootstrap.js` already ends with `/`. Do NOT add another `/` before `content/`. Double slashes (`//`) cause the URI to fail silently with no error.

**Example**:
```javascript
// Wrong - double slash causes silent failure
Services.scriptloader.loadSubScript(`${rootURI}/content/scripts/addon.js`, ctx);

// Correct
Services.scriptloader.loadSubScript(`${rootURI}content/scripts/addon.js`, ctx);
```

---

### Lesson 13: src/index.ts Must Assign Instance, Not Class

**Pattern**: `Zotero.AddonInstance` is `undefined` even after script loads successfully.

**Rule**: In `src/index.ts`, `Zotero[config.addonInstance]` must be assigned the **instance** (`_globalThis.addon`), not the class (`addon` / `addon_default`). The class and the instance variable share the same name in the compiled output, causing a subtle bug.

**Example**:
```typescript
// Wrong - assigns the class constructor
Zotero[config.addonInstance] = addon;

// Correct - assigns the created instance
Zotero[config.addonInstance] = _globalThis.addon;
```

---

### Lesson 14: Module-Level Singletons That Use Zotero APIs Crash on Load

**Pattern**: Script throws `ReferenceError: ztoolkit is not defined` or `Zotero.DBConnection is not a constructor` at load time.

**Rule**: Never instantiate singletons at module top-level if their constructor calls Zotero APIs (`Zotero.DBConnection`, `ztoolkit.log`, etc.). These APIs are not available when the script is first parsed. Use lazy initialization: defer the constructor work until the first method call.

**Example**:
```typescript
// Wrong - constructor runs at module parse time, before Zotero is ready
export class ChatStorage {
  constructor() {
    this.db = new Zotero.DBConnection("ai-reader"); // crashes
  }
}
export const chatStorage = new ChatStorage(); // top-level singleton

// Correct - defer DB creation to first use
export class ChatStorage {
  constructor() {} // no Zotero calls here
  private initDatabase() {
    if (this.db) return;
    this.db = new Zotero.DBConnection("ai-reader"); // safe, called lazily
  }
  async saveMessage(...) {
    this.initDatabase(); // initialize on first use
    ...
  }
}
```

---

### Lesson 15: registerSection Requires onRender (Not Optional)

**Pattern**: `registerSection` call is silently ignored; `customSectionData.options` stays empty.

**Rule**: `Zotero.ItemPaneManager.registerSection()` requires `onRender` as a **mandatory** field. Omitting it causes the registration to fail silently — no error, no section. Always provide `onRender` even if it just calls the same logic as `onInit`.

**Example**:
```typescript
// Wrong - missing onRender, section never appears
Zotero.ItemPaneManager.registerSection({
  paneID: "my-section",
  pluginID: "...",
  header: { ... },
  sidenav: { ... },
  onInit: ({ body, item }) => { render(body, item); },
});

// Correct - onRender is required
Zotero.ItemPaneManager.registerSection({
  paneID: "my-section",
  pluginID: "...",
  header: { ... },
  sidenav: { ... },
  onRender: ({ body, item }) => { render(body, item); }, // required!
  onInit: ({ body, item }) => { render(body, item); },
});
```

<!-- Add lessons above, newest first -->
<!-- Format: Pattern → Rule → Example -->
<!-- Update CLAUDE.md reference if adding new sections -->

### Lesson 12: `Zotero[addonInstance]` Must Be Assigned the Instance, Not the Class

**Pattern**: `Zotero.AddonAIReader` returned `undefined` even after the script loaded.

**Rule**: In `src/index.ts`, `Zotero[config.addonInstance]` must be assigned `_globalThis.addon` (the instance), not `addon` (which resolves to the class `addon_default` after bundling).

**Example**:
```typescript
// Wrong - assigns the class constructor
Zotero[config.addonInstance] = addon;

// Correct - assigns the instance
_globalThis.addon = new Addon();
Zotero[config.addonInstance] = _globalThis.addon;
```

---

### Lesson 13: `bootstrap.js` `rootURI` Already Has Trailing Slash

**Pattern**: `Services.scriptloader.loadSubScript` silently failed to load the script.

**Rule**: `rootURI` passed to `startup()` already ends with `/`. Adding another `/` creates a double-slash path (`jar:file:///...addon//content/...`) which fails silently.

**Example**:
```javascript
// Wrong - double slash
Services.scriptloader.loadSubScript(`${rootURI}/content/scripts/addon.js`, ctx);

// Correct
Services.scriptloader.loadSubScript(`${rootURI}content/scripts/addon.js`, ctx);
```

---

### Lesson 14: Module-Level Singletons That Call Zotero APIs Crash Script Load

**Pattern**: `ReferenceError: ztoolkit is not defined` when loading the plugin script.

**Rule**: Never instantiate classes at module top-level if their constructors call Zotero APIs (`Zotero.DBConnection`, `ztoolkit.log`, etc.). At script load time, `ztoolkit` and `Zotero` may not be fully ready. Use lazy initialization — defer construction to the first method call or to `onStartup`.

**Example**:
```typescript
// Wrong - constructor runs at module load time, before ztoolkit exists
export const chatStorage = new ChatStorage(); // ChatStorage() calls Zotero.DBConnection

// Correct - defer DB init to first use
constructor() { /* do nothing */ }
private initDatabase() {
  if (this.db) return;
  this.db = new Zotero.DBConnection("ai-reader-chat");
}
async saveMessage(...) {
  this.initDatabase(); // lazy init here
  ...
}
```

---

### Lesson 15: `registerSection` Requires `onRender` (Not Optional)

**Pattern**: `Zotero.ItemPaneManager.customSectionData.options` was empty — sections never registered.

**Rule**: `Zotero.ItemPaneManager.registerSection()` silently rejects registrations missing required fields. `onRender` is **required** (no `optional: true` in the type definition). Always provide it even if `onInit` handles the real work.

**Example**:
```typescript
// Wrong - missing onRender, registration silently fails
Zotero.ItemPaneManager.registerSection({
  paneID: "my-section",
  onInit: ({ body }) => { ... },
  ...
});

// Correct
Zotero.ItemPaneManager.registerSection({
  paneID: "my-section",
  onRender: ({ body, item }) => { /* required */ },
  onInit: ({ body, item }) => { ... },
  ...
});
```

### Lesson 10: TypeScript Relative Import Paths in Modules

**Pattern**: `Cannot find module './types'` errors when modules are in nested directories.

**Rule**: When modules are in subdirectories (e.g., `src/modules/llm/providers/`), imports to shared types must use correct relative paths from that location. Types in `src/modules/types.ts` should be imported as `../../types` from `providers/` subdirectory.

**Example**:
```typescript
// Wrong: src/modules/llm/providers/base.ts
import type { ChatMessage } from "../types";

// Correct:
import type { ChatMessage } from "../../types";

// Wrong: src/modules/llm/LLMService.ts
import type { ... } from "./types";

// Correct:
import type { ... } from "../../types";
```

---

### Lesson 11: Build Succeeds but tsc --noEmit Fails

**Pattern**: `zotero-plugin build` succeeds but `npm run build` (which includes `tsc --noEmit`) fails with many TypeScript errors.

**Rule**: The scaffold build itself works even with TypeScript errors. Use `npx zotero-plugin build` to bypass tsc checks during development. The type errors are in template code (examples.ts, preferenceScript.ts) and our new code that references DOM globals (document, window, alert) which don't exist in Zotero's TypeScript context.

**Fix**:
```bash
# For development, just use scaffold build
npx zotero-plugin build

# Or skip tsc by modifying package.json build script
```

---

### Lesson 8: Node.js Version Compatibility with zotero-plugin-scaffold

**Pattern**: Build failed with `ERR_INVALID_ARG_VALUE` on 'format' with 'grey' color.

**Rule**: zotero-plugin-scaffold 0.8.2 has compatibility issues with Node.js v25+. Use LTS version (v20.x or v22.x) for stable builds.

**Fix**:
```bash
# Check Node version
node --version
# If v25+, switch to LTS version using nvm or volta
nvm install 22
nvm use 22
```

---

### Lesson 9: Use npx for scaffold commands if not found in PATH

**Pattern**: `zotero-plugin: command not found` even after npm install.

**Rule**: Use `npx zotero-plugin <command>` to run scaffold from local node_modules.

**Example**:
```bash
# Wrong
npm start  # Uses global zotero-plugin which may not exist

# Correct
npx zotero-plugin serve
# or
npm run build  # if script uses npx internally
```