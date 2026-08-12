export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set([]),
	mimeTypes: {},
	_: {
		client: {start:"_app/immutable/entry/start.c5lhW66b.js",app:"_app/immutable/entry/app.o4XuJLUT.js",imports:["_app/immutable/entry/start.c5lhW66b.js","_app/immutable/chunks/CkyGhl_y.js","_app/immutable/chunks/BVXX0rzL.js","_app/immutable/chunks/Da54aoGM.js","_app/immutable/entry/app.o4XuJLUT.js","_app/immutable/chunks/BVXX0rzL.js","_app/immutable/chunks/y2n_6JWw.js","_app/immutable/chunks/BwB7A-Jm.js","_app/immutable/chunks/Da54aoGM.js","_app/immutable/chunks/CnMMPLzk.js","_app/immutable/chunks/DqqCtrrk.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
