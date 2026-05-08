import { config } from "../../package.json";

type PluginPrefsMap = _ZoteroTypes.Prefs["PluginPrefsMap"];

const PREFS_PREFIX = config.prefsPrefix;

/**
 * Get preference value using Services.prefs (XPCOM).
 * This works reliably in all contexts unlike Zotero.Prefs.
 * @param key - The preference key (without prefix)
 */
export function getPref(key: string): string | number | boolean | null {
  try {
    const fullKey = `${PREFS_PREFIX}.${key}`;
    // Try Services.prefs first (most reliable)
    if (Services.prefs.prefHasUserValue(fullKey)) {
      const type = Services.prefs.getPrefType(fullKey);
      if (type === Services.prefs.PREF_STRING) {
        return Services.prefs.getCharPref(fullKey);
      } else if (type === Services.prefs.PREF_INT) {
        return Services.prefs.getIntPref(fullKey);
      } else if (type === Services.prefs.PREF_BOOL) {
        return Services.prefs.getBoolPref(fullKey);
      }
    }
    // Fallback to Zotero.Prefs
    const val = Zotero.Prefs.get(fullKey, true);
    return val !== undefined ? (val as string | number | boolean) : null;
  } catch (e) {
    ztoolkit.log(`getPref failed for ${key}:`, e);
    return null;
  }
}

/**
 * Set preference value.
 * Wrapper of `Zotero.Prefs.set`.
 * @param key
 * @param value
 */
export function setPref<K extends keyof PluginPrefsMap>(
  key: K,
  value: PluginPrefsMap[K],
) {
  return Zotero.Prefs.set(`${PREFS_PREFIX}.${key}`, value, true);
}

/**
 * Clear preference value.
 * Wrapper of `Zotero.Prefs.clear`.
 * @param key
 */
export function clearPref(key: string) {
  return Zotero.Prefs.clear(`${PREFS_PREFIX}.${key}`, true);
}
