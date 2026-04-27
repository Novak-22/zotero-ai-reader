import { config } from "../package.json";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";
import type { TOCItem, ChatMessage } from "./modules/types";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    env: "development" | "production";
    initialized?: boolean;
    ztoolkit: ZToolkit;
    locale?: {
      current: any;
    };
    prefs?: {
      window: Window;
    };
    reader?: {
      currentItem: Zotero.Item | null;
      toc: TOCItem[];
      chatMessages: ChatMessage[];
    };
  };
  public hooks: typeof hooks;
  public api: object;

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      ztoolkit: createZToolkit(),
      reader: {
        currentItem: null,
        toc: [],
        chatMessages: [],
      },
    };
    this.hooks = hooks;
    this.api = {};
  }
}

export default Addon;