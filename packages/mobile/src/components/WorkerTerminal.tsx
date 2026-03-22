import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface Props {
  lines: string[];
  onInput?: (data: string) => void;
}

/**
 * xterm.js ベースの Worker 出力ビューア。
 * ANSI エスケープをそのまま描画し、モバイルでもスクロール可能。
 */
export function WorkerTerminal({ lines, onInput }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const writtenCount = useRef(0);

  // 初期化
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontSize: 11,
      fontFamily: '"SF Mono", "Fira Code", "Menlo", monospace',
      theme: {
        background: "#0a0c0f",
        foreground: "#e4e4e7",
        cursor: "#3b82f6",
        selectionBackground: "rgba(59,130,246,0.3)",
      },
      scrollback: 500,
      convertEol: true,
      cursorBlink: false,
      disableStdin: !onInput,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;
    writtenCount.current = 0;

    if (onInput) {
      term.onData((data) => onInput(data));
    }

    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      writtenCount.current = 0;
    };
  }, [onInput]);

  // 差分書き込み
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const newLines = lines.slice(writtenCount.current);
    for (const line of newLines) {
      term.writeln(line);
    }
    writtenCount.current = lines.length;
  }, [lines]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: 280,
        borderRadius: 8,
        overflow: "hidden",
        background: "#0a0c0f",
      }}
    />
  );
}
