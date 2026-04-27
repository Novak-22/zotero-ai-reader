import type { ChatMessage } from "../types";

export class ChatStorage {
  private db: any;

  constructor() {
    this.initDatabase();
  }

  private initDatabase(): void {
    try {
      this.db = new Zotero.DBConnection("ai-reader-chat");
      this.db.query(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_key TEXT NOT NULL,
          created_at INTEGER,
          updated_at INTEGER,
          UNIQUE(item_key)
        )
      `);
      this.db.query(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER,
          role TEXT,
          content TEXT,
          created_at INTEGER,
          FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
        )
      `);
    } catch (error) {
      ztoolkit.log("Failed to initialize chat database:", error);
    }
  }

  async saveMessage(
    itemKey: string,
    role: "user" | "assistant" | "system",
    content: string
  ): Promise<void> {
    if (!this.db) return;

    try {
      // Get or create session
      let session = this.db.query(
        `SELECT id FROM chat_sessions WHERE item_key = ?`,
        [itemKey]
      );

      let sessionId: number;
      if (!session || session.length === 0) {
        const now = Date.now();
        this.db.query(
          `INSERT INTO chat_sessions (item_key, created_at, updated_at) VALUES (?, ?, ?)`,
          [itemKey, now, now]
        );
        sessionId = this.db.query(
          `SELECT id FROM chat_sessions WHERE item_key = ?`,
          [itemKey]
        )[0].id;
      } else {
        sessionId = session[0].id;
        this.db.query(
          `UPDATE chat_sessions SET updated_at = ? WHERE id = ?`,
          [Date.now(), sessionId]
        );
      }

      // Insert message
      this.db.query(
        `INSERT INTO chat_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)`,
        [sessionId, role, content, Date.now()]
      );
    } catch (error) {
      ztoolkit.log("Failed to save chat message:", error);
    }
  }

  async getMessages(itemKey: string): Promise<ChatMessage[]> {
    if (!this.db) return [];

    try {
      const session = this.db.query(
        `SELECT id FROM chat_sessions WHERE item_key = ?`,
        [itemKey]
      );

      if (!session || session.length === 0) return [];

      const messages = this.db.query(
        `SELECT role, content, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC`,
        [session[0].id]
      );

      return messages.map((m: any) => ({
        role: m.role,
        content: m.content,
        timestamp: m.created_at,
      }));
    } catch (error) {
      ztoolkit.log("Failed to get chat messages:", error);
      return [];
    }
  }

  async clearMessages(itemKey: string): Promise<void> {
    if (!this.db) return;

    try {
      const session = this.db.query(
        `SELECT id FROM chat_sessions WHERE item_key = ?`,
        [itemKey]
      );

      if (session && session.length > 0) {
        this.db.query(`DELETE FROM chat_messages WHERE session_id = ?`, [
          session[0].id,
        ]);
        this.db.query(`DELETE FROM chat_sessions WHERE item_key = ?`, [itemKey]);
      }
    } catch (error) {
      ztoolkit.log("Failed to clear chat messages:", error);
    }
  }
}

export const chatStorage = new ChatStorage();