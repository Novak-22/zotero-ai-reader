// @ts-nocheck

function getRequiredFields(provider: string): string[] {
  switch (provider) {
    case "openai":
      return ["api-key-openai"];
    case "generic":
      return ["api-key-generic", "endpoint-generic"];
    case "ollama":
      return [];
    default:
      return [];
  }
}

function updateProviderGroups(win: Window): void {
  const doc = win.document;
  const providerSelect = doc.getElementById("default-provider") as HTMLSelectElement | null;
  if (!providerSelect) return;

  const provider = providerSelect.value || "openai";
  const groups = ["openai", "ollama", "generic"];

  for (const p of groups) {
    const group = doc.getElementById(`provider-group-${p}`) as HTMLElement | null;
    if (!group) continue;
    group.style.display = p === provider ? "" : "none";
  }
}

function validateCurrentProviderConfig(win: Window): void {
  const doc = win.document;
  const providerSelect = doc.getElementById("default-provider") as HTMLSelectElement | null;
  const helpLabel = doc.getElementById("provider-config-hint") as HTMLElement | null;
  if (!providerSelect || !helpLabel) return;

  const requiredFields = getRequiredFields(providerSelect.value || "openai");
  const missing: string[] = [];

  for (const id of requiredFields) {
    const el = doc.getElementById(id) as HTMLInputElement | null;
    if (!el || !el.value?.trim()) {
      missing.push(id);
    }
  }

  if (missing.length === 0) {
    helpLabel.textContent = "";
    return;
  }

  if ((providerSelect.value || "openai") === "openai") {
    helpLabel.textContent = "OpenAI requires API Key.";
  } else if ((providerSelect.value || "openai") === "generic") {
    helpLabel.textContent = "Generic API requires API Key and Endpoint.";
  } else {
    helpLabel.textContent = "";
  }
}

function bindPrefEvents(win: Window): void {
  const doc = win.document;
  const providerSelect = doc.getElementById("default-provider") as HTMLSelectElement | null;

  providerSelect?.addEventListener("change", () => {
    updateProviderGroups(win);
    validateCurrentProviderConfig(win);
  });

  const watchedInputs = [
    "api-key-openai",
    "api-key-generic",
    "endpoint-generic",
    "endpoint-ollama",
    "model-openai",
    "model-ollama",
    "model-generic",
  ];

  for (const id of watchedInputs) {
    const input = doc.getElementById(id) as HTMLInputElement | null;
    input?.addEventListener("input", () => validateCurrentProviderConfig(win));
  }
}

export async function registerPrefsScripts(win: Window) {
  // The win passed here may be a Cu.Sandbox with sandboxPrototype=prefWindow.
  // We need the actual preferences window to hook Zotero_Preferences._showPane.
  // Use Services.wm to get the real preferences window.
  let prefWin: any = win;
  try {
    const realWin = (Services as any).wm.getMostRecentWindow("zotero:pref");
    if (realWin) prefWin = realWin;
  } catch {
    // fallback to win
  }

  const zp = (prefWin as any).Zotero_Preferences;
  if (zp && typeof zp._showPane === "function" && !zp._aiReaderHooked) {
    zp._aiReaderHooked = true;
    const origShowPane = zp._showPane.bind(zp);
    zp._showPane = function(paneID: string) {
      const result = origShowPane(paneID);
      if (paneID && paneID.indexOf("ai-reader") !== -1) {
        setTimeout(() => {
          updateProviderGroups(prefWin);
          bindPrefEvents(prefWin);
          validateCurrentProviderConfig(prefWin);
        }, 100);
      }
      return result;
    };
  } else {
    // Fallback: try directly if pane elements are already in DOM
    setTimeout(() => {
      updateProviderGroups(prefWin);
      bindPrefEvents(prefWin);
      validateCurrentProviderConfig(prefWin);
    }, 300);
  }
}
