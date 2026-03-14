import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SampleChat from "../components/SampleChat";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fake ReadableStream that yields the given chunks (strings) one by
 * one, then closes.
 */
function makeFakeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let idx = 0;
  return new ReadableStream({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(encoder.encode(chunks[idx++]));
      } else {
        controller.close();
      }
    },
  });
}

/** Format an SSE frame. */
function sseFrame(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Default: fetch resolves with an empty stream so non-streaming tests work.
  global.fetch = jest.fn(() =>
    Promise.resolve({
      body: makeFakeStream([]),
    })
  ) as unknown as typeof fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SampleChat", () => {
  const API = "http://localhost:8000";

  // 1. Renders without crashing
  it("renders without crashing", () => {
    const { unmount } = render(<SampleChat apiUrl={API} />);
    // If we get here, render did not throw.
    unmount();
  });

  // 2. Chat bubble renders with correct aria-label
  it("renders a chat bubble with aria-label 'Open chat'", () => {
    render(<SampleChat apiUrl={API} />);
    const bubble = screen.getByRole("button", { name: "Open chat" });
    expect(bubble).toBeInTheDocument();
  });

  // 3. Clicking the bubble opens the chat panel
  it("opens the chat panel when the bubble is clicked", async () => {
    render(<SampleChat apiUrl={API} title="Sample Agent" />);
    const bubble = screen.getByRole("button", { name: "Open chat" });

    // Panel title should NOT be visible yet.
    expect(screen.queryByText("Sample Agent")).not.toBeInTheDocument();

    await userEvent.click(bubble);

    // After click the panel (with its title) should appear.
    expect(screen.getByText("Sample Agent")).toBeInTheDocument();
    // The bubble's aria-label should flip.
    expect(screen.getByRole("button", { name: "Close chat" })).toBeInTheDocument();
  });

  // 4. Panel shows title text
  it("displays the custom title in the panel header", async () => {
    render(<SampleChat apiUrl={API} title="My Custom Title" />);
    await userEvent.click(screen.getByRole("button", { name: "Open chat" }));
    expect(screen.getByText("My Custom Title")).toBeInTheDocument();
  });

  // 5. Input field accepts text
  it("accepts text input in the message field", async () => {
    render(<SampleChat apiUrl={API} />);
    await userEvent.click(screen.getByRole("button", { name: "Open chat" }));

    const input = screen.getByPlaceholderText("Describe a sound...");
    await userEvent.type(input, "dark kick");
    expect(input).toHaveValue("dark kick");
  });

  // 6. Send button is disabled during streaming
  it("disables the send button while streaming", async () => {
    // Create a stream that never resolves so isStreaming stays true.
    const neverResolve = new ReadableStream<Uint8Array>({
      start() {
        // intentionally never close
      },
    });

    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({ body: neverResolve })
    );

    render(<SampleChat apiUrl={API} />);
    await userEvent.click(screen.getByRole("button", { name: "Open chat" }));

    const input = screen.getByPlaceholderText("Describe a sound...");
    await userEvent.type(input, "warm pad");

    const sendBtn = screen.getByRole("button", { name: "Send" });
    await userEvent.click(sendBtn);

    // The button should now show "..." and be disabled.
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: "..." });
      expect(btn).toBeDisabled();
    });
  });

  // 7. parseSSE correctly parses SSE events (tested via component integration)
  it("renders streamed assistant text from SSE token events", async () => {
    const chunks = [
      sseFrame("token", { content: "Here " }),
      sseFrame("token", { content: "are some samples." }),
    ];

    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({ body: makeFakeStream(chunks) })
    );

    render(<SampleChat apiUrl={API} />);
    await userEvent.click(screen.getByRole("button", { name: "Open chat" }));

    const input = screen.getByPlaceholderText("Describe a sound...");
    await userEvent.type(input, "bright lead");

    const sendBtn = screen.getByRole("button", { name: "Send" });
    await userEvent.click(sendBtn);

    // Wait for streamed text to appear.
    await waitFor(() => {
      expect(screen.getByText("Here are some samples.")).toBeInTheDocument();
    });
  });

  // 8. Tool trace cards render with tool name
  it("renders tool trace cards showing the tool name", async () => {
    const chunks = [
      sseFrame("tool_start", {
        name: "search_samples",
        args: { query: "dark kick" },
        id: "tool-1",
      }),
      sseFrame("tool_end", { id: "tool-1", duration_ms: 42 }),
      sseFrame("token", { content: "Found 3 results." }),
    ];

    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({ body: makeFakeStream(chunks) })
    );

    render(<SampleChat apiUrl={API} />);
    await userEvent.click(screen.getByRole("button", { name: "Open chat" }));

    const input = screen.getByPlaceholderText("Describe a sound...");
    await userEvent.type(input, "dark kick");

    const sendBtn = screen.getByRole("button", { name: "Send" });
    await userEvent.click(sendBtn);

    // Wait for the tool name to appear in a trace card.
    await waitFor(() => {
      expect(screen.getByText("search_samples")).toBeInTheDocument();
    });

    // Duration should also render.
    await waitFor(() => {
      expect(screen.getByText("42ms")).toBeInTheDocument();
    });
  });
});
