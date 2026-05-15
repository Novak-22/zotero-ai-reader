// Preferences pane script - runs in Cu.Sandbox with sandboxPrototype=prefWindow
// Called when the plugin pane is loaded in Zotero preferences
(function() {
  try {
    Zotero.__addonInstance__.hooks.onPrefsEvent('load', { window });
  } catch (e) {
    Zotero.debug('AI Reader prefs script error: ' + e);
  }
})();
