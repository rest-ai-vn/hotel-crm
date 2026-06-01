import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatResponse {
  reply: string;
  stop_reason: string | null;
}

const PANEL_WIDTH = 360;

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch<ChatResponse>("/api/chat", {
        method: "POST",
        body: { messages: next },
      });
      setMessages([...next, { role: "assistant", content: res.reply || "(không có phản hồi)" }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi gửi tin nhắn");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        aria-label="Trợ lý AI"
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          right: 24,
          bottom: 24,
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "none",
          background: "var(--color-accent)",
          color: "#fff",
          fontSize: 22,
          cursor: "pointer",
          boxShadow: "0 8px 24px oklch(0% 0 0 / 0.18)",
          zIndex: 60,
        }}
      >
        {open ? "✕" : "💬"}
      </button>

      {open ? (
        <div
          style={{
            position: "fixed",
            right: 24,
            bottom: 96,
            width: PANEL_WIDTH,
            maxWidth: "calc(100vw - 48px)",
            height: 480,
            maxHeight: "calc(100vh - 120px)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-md)",
            display: "flex",
            flexDirection: "column",
            zIndex: 60,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "var(--space-3)",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <div style={{ fontWeight: 600 }}>Trợ lý Hotel CRM</div>
            <div className="muted" style={{ fontSize: 12 }}>
              Hỏi nhanh về tình trạng phòng, đặt phòng hôm nay, doanh thu…
            </div>
          </div>

          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "var(--space-3)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            {messages.length === 0 ? (
              <div className="muted" style={{ fontSize: 13, textAlign: "center", marginTop: 40 }}>
                Bắt đầu trò chuyện. Ví dụ: <em>"Công suất hôm nay?"</em>
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    background:
                      m.role === "user"
                        ? "var(--color-accent-soft)"
                        : "oklch(96% 0 0)",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    maxWidth: "85%",
                    fontSize: 14,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {m.content}
                </div>
              ))
            )}
            {sending ? (
              <div className="muted" style={{ fontSize: 12, alignSelf: "flex-start" }}>
                Đang trả lời…
              </div>
            ) : null}
            {error ? (
              <div style={{ color: "var(--color-danger)", fontSize: 12 }}>{error}</div>
            ) : null}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            style={{
              padding: "var(--space-2)",
              borderTop: "1px solid var(--color-border)",
              display: "flex",
              gap: 6,
            }}
          >
            <input
              className="input"
              placeholder="Nhập câu hỏi…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" type="submit" disabled={sending || !input.trim()}>
              Gửi
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
