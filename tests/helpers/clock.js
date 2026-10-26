// TEST ONLY: script for Page.addScriptToEvaluateOnNewDocument that moves the
// page clock to an invented instant, so "today" matches invented data.
export const fixedClockScript = iso => `(() => {
  const offset = Date.parse(${JSON.stringify(iso)}) - Date.now();
  const Real = Date;
  class Shifted extends Real {
    constructor(...args) { if (args.length) super(...args); else super(Real.now() + offset); }
    static now() { return Real.now() + offset; }
  }
  globalThis.Date = Shifted;
})();`;
