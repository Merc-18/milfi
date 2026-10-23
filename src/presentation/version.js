import { readableBuild } from './buildStamp.js';

// These constants belong to the running bundle. Missing build metadata is
// reported as unavailable; a browser must never invent a compilation date.
export const APP_VERSION = (import.meta.env.VITE_MILFI_VERSION ?? 'local').slice(0, 7);
export const BUILD_STAMP = import.meta.env.VITE_MILFI_BUILD ?? '';
export const BUILD_DETAILS = readableBuild(BUILD_STAMP);
export const versionLabel = `Versión ${APP_VERSION}, compilado ${BUILD_DETAILS?.label ?? 'sin fecha disponible'} (Perú)`;
