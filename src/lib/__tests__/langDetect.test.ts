import { describe, it, expect, vi } from "vitest";
import { getLangLabel, getLanguageExtension } from "../langDetect";

// @codemirror/lang-* モジュールをモック（実際の拡張を返す）
vi.mock("@codemirror/lang-javascript", () => ({
  javascript: vi.fn(() => ({ type: "js-extension" })),
}));
vi.mock("@codemirror/lang-rust", () => ({
  rust: vi.fn(() => ({ type: "rust-extension" })),
}));
vi.mock("@codemirror/lang-html", () => ({
  html: vi.fn(() => ({ type: "html-extension" })),
}));
vi.mock("@codemirror/lang-css", () => ({
  css: vi.fn(() => ({ type: "css-extension" })),
}));
vi.mock("@codemirror/lang-sql", () => ({
  sql: vi.fn(() => ({ type: "sql-extension" })),
}));
vi.mock("@codemirror/lang-json", () => ({
  json: vi.fn(() => ({ type: "json-extension" })),
}));
vi.mock("@codemirror/lang-python", () => ({
  python: vi.fn(() => ({ type: "py-extension" })),
}));
vi.mock("@codemirror/lang-php", () => ({
  php: vi.fn(() => ({ type: "php-extension" })),
}));

// ── getLangLabel ──────────────────────────────────────────────────────────────

describe("getLangLabel", () => {
  it.each([
    ["src/app.ts",       "TypeScript"],
    ["src/app.tsx",      "TSX"],
    ["src/app.js",       "JavaScript"],
    ["src/app.jsx",      "JSX"],
    ["src/lib.rs",       "Rust"],
    ["index.html",       "HTML"],
    ["index.htm",        "HTML"],
    ["styles.css",       "CSS"],
    ["styles.scss",      "SCSS"],
    ["styles.sass",      "Sass"],
    ["schema.sql",       "SQL"],
    ["data.json",        "JSON"],
    ["main.py",          "Python"],
    ["plugin.php",       "PHP"],
    ["Cargo.toml",       "TOML"],
    ["config.yaml",      "YAML"],
    ["config.yml",       "YAML"],
    ["README.md",        "Markdown"],
    ["setup.sh",         "Shell"],
    ["setup.bash",       "Shell"],
    ["main.go",          "Go"],
  ])("getLangLabel('%s') === '%s'", (path, expected) => {
    expect(getLangLabel(path)).toBe(expected);
  });

  it("未知の拡張子は大文字に変換される", () => {
    expect(getLangLabel("file.xyz")).toBe("XYZ");
  });

  it("拡張子なしのファイルは大文字のファイル名を返す (Makefile → MAKEFILE)", () => {
    // split(".").pop() が "Makefile" を返し、map にないので toUpperCase() される
    expect(getLangLabel("Makefile")).toBe("MAKEFILE");
  });
});

// ── getLanguageExtension ───────────────────────────────────────────────────────

describe("getLanguageExtension", () => {
  it(".ts ファイルで TypeScript 拡張が返る", async () => {
    const result = await getLanguageExtension("src/app.ts");
    expect(result).toHaveLength(1);
  });

  it(".tsx ファイルで TypeScript JSX 拡張が返る", async () => {
    const result = await getLanguageExtension("src/app.tsx");
    expect(result).toHaveLength(1);
  });

  it(".js ファイルで JavaScript 拡張が返る", async () => {
    const result = await getLanguageExtension("src/app.js");
    expect(result).toHaveLength(1);
  });

  it(".jsx ファイルで JavaScript JSX 拡張が返る", async () => {
    const result = await getLanguageExtension("src/app.jsx");
    expect(result).toHaveLength(1);
  });

  it(".rs ファイルで Rust 拡張が返る", async () => {
    const result = await getLanguageExtension("lib.rs");
    expect(result).toHaveLength(1);
  });

  it(".html ファイルで HTML 拡張が返る", async () => {
    const result = await getLanguageExtension("index.html");
    expect(result).toHaveLength(1);
  });

  it(".htm ファイルで HTML 拡張が返る", async () => {
    const result = await getLanguageExtension("index.htm");
    expect(result).toHaveLength(1);
  });

  it(".css ファイルで CSS 拡張が返る", async () => {
    const result = await getLanguageExtension("styles.css");
    expect(result).toHaveLength(1);
  });

  it(".scss ファイルで CSS 拡張が返る", async () => {
    const result = await getLanguageExtension("styles.scss");
    expect(result).toHaveLength(1);
  });

  it(".sass ファイルで CSS 拡張が返る", async () => {
    const result = await getLanguageExtension("styles.sass");
    expect(result).toHaveLength(1);
  });

  it(".sql ファイルで SQL 拡張が返る", async () => {
    const result = await getLanguageExtension("schema.sql");
    expect(result).toHaveLength(1);
  });

  it(".json ファイルで JSON 拡張が返る", async () => {
    const result = await getLanguageExtension("data.json");
    expect(result).toHaveLength(1);
  });

  it(".py ファイルで Python 拡張が返る", async () => {
    const result = await getLanguageExtension("main.py");
    expect(result).toHaveLength(1);
  });

  it(".php ファイルで PHP 拡張が返る", async () => {
    const result = await getLanguageExtension("plugin.php");
    expect(result).toHaveLength(1);
  });

  it("未知の拡張子は空配列を返す", async () => {
    const result = await getLanguageExtension("file.xyz");
    expect(result).toEqual([]);
  });

  it("Makefile など未知の拡張子扱いになるものは空配列を返す", async () => {
    // "Makefile" → ext = "makefile" → default case → []
    const result = await getLanguageExtension("Makefile");
    expect(result).toEqual([]);
  });
});
