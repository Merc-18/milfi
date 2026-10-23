// TEST ONLY: one SSR entry so routes and the session store share a module instance.
export { default as AppRoutes } from '../../src/routes/AppRoutes.jsx';
export { SessionViewContext } from '../../src/presentation/moduleAccess.js';
