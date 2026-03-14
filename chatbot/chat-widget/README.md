# Sample Agent Chat Widget

A self-contained React component for integrating the Sample Agent into any Next.js app.

## Quick Start

1. Copy `SampleChat.tsx` into your project (e.g., `components/SampleChat.tsx`)
2. Import and render it in your layout:

```tsx
import SampleChat from "@/components/SampleChat";

export default function Layout({ children }) {
  return (
    <>
      {children}
      <SampleChat apiUrl="http://localhost:8000" />
    </>
  );
}
```

3. Start the Python agent server:

```bash
cd composed/
source .venv/bin/activate
uvicorn sample_agent.server:app --port 8000
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `apiUrl` | `string` | required | Base URL of the Sample Agent API |
| `title` | `string` | `"Sample Agent"` | Header text in the chat panel |
| `placeholder` | `string` | `"Describe a sound..."` | Input placeholder text |
| `accentColor` | `string` | `"#6c63ff"` | Primary color for bubble, buttons, and user messages |

## Features

- Floating chat bubble (bottom-right corner)
- Real-time token streaming
- Tool trace cards with live spinners and completion timing
- Zero external dependencies (inline styles, no CSS imports)
- Dark theme optimized for music production apps
