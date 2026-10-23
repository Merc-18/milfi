import { buildStamp } from './buildStamp.js';

// Commit and build code of the running bundle (set by vite.config.js). Without
// them (tests, other tools) the commit reads 'local' and the build is load time.
// Direct access on purpose: Vite's define does not replace optional chaining.
export const APP_VERSION = import.meta.env.VITE_MILFI_VERSION ?? 'local';
export const BUILD_STAMP = import.meta.env.VITE_MILFI_BUILD ?? buildStamp();
export const versionLabel = `Versión ${BUILD_STAMP} (commit ${APP_VERSION})`;
