import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";

// AST inspection avoids treating message text such as "Enter a prompt (...)" as an API call.
const counts = {
  select: 0,
  option: 0,
  datalist: 0,
  alert: 0,
  confirm: 0,
  prompt: 0,
};
const violations = [];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspect(path);
      continue;
    }
    if (!/\.[jt]sx?$/.test(path)) continue;
    const source = ts.createSourceFile(
      path,
      await readFile(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    function visit(node) {
      let name;
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(source);
        if (["select", "option", "datalist"].includes(tag)) name = tag;
      }
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const call = ts.isIdentifier(callee)
          ? callee.text
          : ts.isPropertyAccessExpression(callee)
            ? callee.name.text
            : "";
        if (["alert", "confirm", "prompt"].includes(call)) name = call;
      }
      if (name) {
        counts[name]++;
        violations.push(
          `${path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${name}`,
        );
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
await inspect("apps/web/app");
await inspect("apps/web/lib");
console.log(JSON.stringify(counts));
if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
}
