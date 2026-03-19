import { memo, useState } from "react";
import {
  IconChevronRight,
  IconChevronDown,
  IconFolder,
  IconFolderOpen,
  IconFile,
  IconFileCode,
  IconFileText,
  IconMarkdown,
  IconBrandTypescript,
  IconBrandReact,
  IconBrandJavascript,
  IconBrandPython,
  IconBrandGolang,
  IconBraces,
  IconDatabase,
  IconSettings,
  IconTerminal2,
  IconBrandGit,
  IconTestPipe,
  IconPackage,
  IconLock,
  IconFileInfo,
} from "@tabler/icons-react";
import type { FileNode } from "../../types";

type IconComponent = React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties }>;

interface FileIconSpec {
  Icon: IconComponent;
  color: string;
}

/** ファイル名・拡張子から専用アイコンと色を返す */
function getFileIcon(name: string, ext?: string): FileIconSpec {
  const lower = name.toLowerCase();

  // 特定ファイル名マッチ
  if (lower === "package.json" || lower === "package-lock.json")
    return { Icon: IconPackage, color: "#cb3837" };
  if (lower === "cargo.toml" || lower === "cargo.lock")
    return { Icon: IconPackage, color: "#ce412b" };
  if (lower === ".gitignore" || lower === ".gitattributes" || lower === ".gitmodules")
    return { Icon: IconBrandGit, color: "#f14e32" };
  if (lower === "readme.md" || lower === "claude.md")
    return { Icon: IconFileInfo, color: "#7c6cf2" };
  if (lower.endsWith(".lock"))
    return { Icon: IconLock, color: "#888" };
  if (lower.includes(".spec.") || lower.includes(".test.") || lower.startsWith("test_"))
    return { Icon: IconTestPipe, color: "#2ecc71" };

  // 拡張子マッチ
  switch (ext?.toLowerCase()) {
    case "tsx":
      return { Icon: IconBrandReact, color: "#61dafb" };
    case "ts":
      return { Icon: IconBrandTypescript, color: "#3178c6" };
    case "jsx":
      return { Icon: IconBrandReact, color: "#f7df1e" };
    case "js":
      return { Icon: IconBrandJavascript, color: "#f7df1e" };
    case "mjs": case "cjs":
      return { Icon: IconBrandJavascript, color: "#f7df1e" };
    case "rs":
      return { Icon: IconFileCode, color: "#ce412b" };
    case "py":
      return { Icon: IconBrandPython, color: "#3572a5" };
    case "go":
      return { Icon: IconBrandGolang, color: "#00add8" };
    case "md":
      return { Icon: IconMarkdown, color: "#519aba" };
    case "json":
      return { Icon: IconBraces, color: "#cbcb41" };
    case "toml": case "yaml": case "yml":
      return { Icon: IconSettings, color: "#9c4221" };
    case "sql":
      return { Icon: IconDatabase, color: "#336791" };
    case "css": case "scss": case "sass":
      return { Icon: IconFileCode, color: "#264de4" };
    case "html": case "htm":
      return { Icon: IconFileCode, color: "#e44d26" };
    case "sh": case "bash": case "zsh":
      return { Icon: IconTerminal2, color: "#89e051" };
    case "txt": case "log":
      return { Icon: IconFileText, color: "#888" };
    case "svg": case "png": case "jpg": case "jpeg": case "gif": case "webp": case "ico":
      return { Icon: IconFile, color: "#e44d26" };
    default:
      return { Icon: IconFile, color: "#888" };
  }
}

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

const FileTreeNodeRow = memo(function FileTreeNodeRow({ node, depth, selectedPath, onSelect }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isSelected = selectedPath === node.path;

  if (node.is_dir) {
    return (
      <>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            width: "100%",
            padding: `4px 8px 4px ${8 + depth * 14}px`,
            background: "transparent",
            border: "none",
            color: "#aaa",
            cursor: "pointer",
            fontSize: 12,
            textAlign: "left",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#1e1e2e"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        >
          {expanded
            ? <IconChevronDown size={11} style={{ flexShrink: 0 }} />
            : <IconChevronRight size={11} style={{ flexShrink: 0 }} />}
          {expanded
            ? <IconFolderOpen size={14} color="#e8c84a" style={{ flexShrink: 0 }} />
            : <IconFolder size={14} color="#e8c84a" style={{ flexShrink: 0 }} />}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {node.name}
          </span>
        </button>
        {expanded && node.children?.map((child) => (
          <FileTreeNodeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
      </>
    );
  }

  const { Icon, color } = getFileIcon(node.name, node.ext);

  return (
    <button
      onClick={() => onSelect(node.path)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        width: "100%",
        padding: `3px 8px 3px ${8 + depth * 14 + 15}px`,
        background: isSelected ? "#2a2a42" : "transparent",
        borderLeft: isSelected ? "2px solid #7c6cf2" : "2px solid transparent",
        border: "none",
        color: isSelected ? "#e0e0e0" : "#999",
        cursor: "pointer",
        fontSize: 12,
        textAlign: "left",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = "#1e1e2e";
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
      title={node.path}
    >
      <Icon size={13} color={color} style={{ flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {node.name}
      </span>
    </button>
  );
});

interface FileTreePanelProps {
  nodes: FileNode[];
  loading: boolean;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export function FileTreePanel({ nodes, loading, selectedPath, onSelect }: FileTreePanelProps) {
  if (loading) {
    return <div style={{ padding: 16, color: "#666", fontSize: 13 }}>読み込み中…</div>;
  }
  if (nodes.length === 0) {
    return <div style={{ padding: 16, color: "#666", fontSize: 13 }}>ファイルがありません</div>;
  }
  return (
    <div style={{ overflow: "auto", flex: 1 }}>
      {nodes.map((node) => (
        <FileTreeNodeRow
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
