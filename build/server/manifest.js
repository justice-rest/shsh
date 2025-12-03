const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["assets/bootstrap/css/bootstrap.min.css","assets/bootstrap/js/bootstrap.min.js","assets/css/styles.css"]),
	mimeTypes: {".css":"text/css",".js":"text/javascript"},
	_: {
		client: {start:"_app/immutable/entry/start.CFvdyLXk.js",app:"_app/immutable/entry/app.Ca7uW6bn.js",imports:["_app/immutable/entry/start.CFvdyLXk.js","_app/immutable/chunks/BJs6n2cK.js","_app/immutable/chunks/B2QSKqcC.js","_app/immutable/entry/app.Ca7uW6bn.js","_app/immutable/chunks/B2QSKqcC.js","_app/immutable/chunks/CnsReGIK.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./chunks/0-CTd_5tbj.js')),
			__memo(() => import('./chunks/1-CRH3qnSi.js')),
			__memo(() => import('./chunks/2-C2USlANE.js'))
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
			},
			{
				id: "/api/extract",
				pattern: /^\/api\/extract\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-DSnlh4WY.js'))
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

const prerendered = new Set([]);

const base = "";

export { base, manifest, prerendered };
//# sourceMappingURL=manifest.js.map
