import type { Extension } from "@codemirror/state";

/**
 * ファイルパスの拡張子から CodeMirror 言語拡張を返す。
 * 動的 import でバンドルサイズを最小化する。
 */
export async function getLanguageExtension(path: string): Promise<Extension[]> {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";

  switch (ext) {
    case "ts":
    case "tsx": {
      const { javascript } = await import("@codemirror/lang-javascript");
      return [javascript({ typescript: true, jsx: ext === "tsx" })];
    }
    case "js":
    case "jsx": {
      const { javascript } = await import("@codemirror/lang-javascript");
      return [javascript({ jsx: ext === "jsx" })];
    }
    case "rs": {
      const { rust } = await import("@codemirror/lang-rust");
      return [rust()];
    }
    case "html":
    case "htm": {
      const { html } = await import("@codemirror/lang-html");
      return [html()];
    }
    case "css":
    case "scss":
    case "sass": {
      const { css } = await import("@codemirror/lang-css");
      return [css()];
    }
    case "sql": {
      const { sql } = await import("@codemirror/lang-sql");
      return [sql()];
    }
    case "json": {
      const { json } = await import("@codemirror/lang-json");
      return [json()];
    }
    case "py": {
      const { python } = await import("@codemirror/lang-python");
      return [python()];
    }
    case "php": {
      const { php } = await import("@codemirror/lang-php");
      return [php()];
    }
    default:
      return []; // ハイライトなし
  }
}

/** 拡張子から表示用ラベルを返す */
export function getLangLabel(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "TypeScript", tsx: "TSX", js: "JavaScript", jsx: "JSX",
    rs: "Rust", html: "HTML", htm: "HTML", css: "CSS",
    scss: "SCSS", sass: "Sass", sql: "SQL", json: "JSON",
    py: "Python", php: "PHP", toml: "TOML", yaml: "YAML", yml: "YAML",
    md: "Markdown", sh: "Shell", bash: "Shell", go: "Go",
  };
  return map[ext] ?? (ext.toUpperCase() || "Text");
}
