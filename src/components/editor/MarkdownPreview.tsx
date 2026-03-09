import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          fontSize: 11,
          color: "#888",
          textTransform: "uppercase",
          letterSpacing: 1,
          borderBottom: "1px solid #2a2a3a",
          flexShrink: 0,
        }}
      >
        PREVIEW
      </div>
      <div
        className="markdown-body"
        style={{
          flex: 1,
          overflow: "auto",
          padding: "12px 16px",
          fontSize: 13,
          minWidth: 0,
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
