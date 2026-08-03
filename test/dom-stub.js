/* dom-stub.js — load a rendered fp-report and stub just enough browser for its script.
 *
 *   const load = require("./dom-stub");
 *   const { app, nodes } = load("out.html");
 *   eval(app + `…assertions…`);          // the REAL shipped script, not a copy of it
 *
 * Returns the raw html, the embedded fp-data JSON, the injected app script, and the
 * `nodes` map — every element the script asked for by id, so an assertion can read back
 * the markup it rendered (e.g. nodes.orphans.innerHTML).
 */
const fs = require("fs");

// one inert element, permissive enough for the report's top-level render calls
const el = () => ({
  innerHTML: "", textContent: "", value: "", hidden: false, dataset: {}, style: {},
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  addEventListener() {}, insertAdjacentHTML() {}, toggleAttribute() {}, scrollIntoView() {},
  querySelectorAll: () => [], querySelector: () => el(), closest: () => null,
  getAttribute: () => null, setAttribute() {}, focus() {}, remove() {}, appendChild() {}, select() {},
});

module.exports = function load(html_path) {
  const html = fs.readFileSync(html_path, "utf-8");
  const data = html.match(/<script type="application\/json" id="fp-data">([\s\S]*?)<\/script>/)[1];
  const app = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  const nodes = {};
  global.document = {
    getElementById: id => (id === "fp-data" ? { textContent: data } : (nodes[id] ||= el())),
    querySelector: () => el(), querySelectorAll: () => [], createElement: () => el(),
    addEventListener() {}, body: el(), documentElement: { getAttribute: () => null, setAttribute() {} },
  };
  global.matchMedia = () => ({ matches: false });
  global.navigator = { clipboard: null };
  global.setTimeout = () => {}; global.clearTimeout = () => {};
  return { html, data, app, nodes };
};
