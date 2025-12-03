

export const index = 1;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/fallbacks/error.svelte.js')).default;
export const imports = ["_app/immutable/nodes/1.DHpX5zUK.js","_app/immutable/chunks/B2QSKqcC.js","_app/immutable/chunks/CnsReGIK.js","_app/immutable/chunks/BJs6n2cK.js"];
export const stylesheets = [];
export const fonts = [];
