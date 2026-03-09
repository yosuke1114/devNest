/**
 * Playwright の addInitScript で注入する Tauri IPC モック。
 * window.__TAURI_INTERNALS__ を差し替えて、ブリッジサーバー経由でバックエンドと通信する。
 */
const BRIDGE_URL = "http://localhost:7420/invoke";

const tauriMock = `
(function() {
  const BRIDGE = "${BRIDGE_URL}";
  const callbacks = {};
  let cbId = 1;

  window.__TAURI_INTERNALS__ = {
    invoke: async function(cmd, args) {
      const res = await fetch(BRIDGE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd, args: args || {} }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "bridge error");
      return json.result;
    },
    transformCallback: function(cb, once) {
      const id = cbId++;
      callbacks[id] = { cb, once };
      return id;
    },
    clearCallback: function(id) {
      delete callbacks[id];
    },
    // listen は no-op（イベントは届かないが、クラッシュしない）
    listen: async function(event, handler) {
      return () => {};
    },
  };

  console.log("[tauri-mock] __TAURI_INTERNALS__ injected -> bridge at ${BRIDGE_URL}");
})();
`;

export { tauriMock };
