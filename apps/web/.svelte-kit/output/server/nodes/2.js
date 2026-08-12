import * as server from '../entries/pages/_page.server.ts.js';

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/+page.server.ts";
export const imports = ["_app/immutable/nodes/2.CQOZhWOY.js","_app/immutable/chunks/BwB7A-Jm.js","_app/immutable/chunks/BVXX0rzL.js","_app/immutable/chunks/Da54aoGM.js","_app/immutable/chunks/y2n_6JWw.js","_app/immutable/chunks/CnMMPLzk.js","_app/immutable/chunks/DqqCtrrk.js"];
export const stylesheets = ["_app/immutable/assets/2.BMFbX6oq.css"];
export const fonts = [];
