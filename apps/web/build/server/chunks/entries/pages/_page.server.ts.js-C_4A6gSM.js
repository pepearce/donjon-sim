const SIM_ORIGIN = process.env["DONJON_API"] ?? "http://localhost:8787";
const load = async ({ fetch }) => {
  try {
    const [bootRes, mapRes] = await Promise.all([
      fetch(`${SIM_ORIGIN}/api/v1/bootstrap`),
      fetch(`${SIM_ORIGIN}/api/v1/floors/1/map`)
    ]);
    if (!bootRes.ok || !mapRes.ok) throw new Error("sim unavailable");
    const bootstrap = await bootRes.json();
    const floorMap = await mapRes.json();
    return { bootstrap, floorMap, offline: false };
  } catch {
    return { bootstrap: null, floorMap: null, offline: true };
  }
};

var _page_server_ts = /*#__PURE__*/Object.freeze({
  __proto__: null,
  load: load
});

export { _page_server_ts as _ };
//# sourceMappingURL=_page.server.ts.js-C_4A6gSM.js.map
