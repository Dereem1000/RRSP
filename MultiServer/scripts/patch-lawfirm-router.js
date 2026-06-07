const fs = require("fs");
const path = require("path");

const bundlePath =
  process.argv[2] ||
  path.join(
    __dirname,
    "../../Management Systems/Document Manager/lawfirm-deployment-20260416_004524 - Demo/client/dist/index.onKv2WDT.js"
  );

let text = fs.readFileSync(bundlePath, "utf8");
const original = text;

const routerOld = "Et.jsx(fh,{children:Et.jsx(TN,{})})";
const routerNew =
  'Et.jsx(fh,{basename:(()=>{const m=location.pathname.match(/^\\/demo\\/[^/]+/);return m?m[0]:"/"})(),children:Et.jsx(TN,{})})';

const pathHelper =
  '((()=>{const m=location.pathname.match(/^\\/demo\\/[^/]+/);return m?location.pathname.slice(m[0].length)||"/":location.pathname})())';

if (text.includes(routerOld)) {
  text = text.replace(routerOld, routerNew);
}

if (!text.includes(pathHelper)) {
  text = text.replace(/window\.location\.pathname/g, pathHelper);
}

if (text !== original) {
  fs.writeFileSync(bundlePath, text);
  console.log("Patched:", bundlePath);
} else {
  console.log("Already patched:", bundlePath);
}

require("child_process").execSync(`node --check "${bundlePath}"`, {
  stdio: "inherit",
});
