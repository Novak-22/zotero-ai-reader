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

<!-- Add lessons above, newest first -->
<!-- Format: Pattern → Rule → Example -->
<!-- Update CLAUDE.md reference if adding new sections -->