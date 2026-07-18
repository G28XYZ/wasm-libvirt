import { readFile } from "node:fs/promises";

import ts from "typescript";

const sourcePath = new URL("../packages/libvirt-adapter/src/index.ts", import.meta.url);
const sourceText = await readFile(sourcePath, "utf8");
const source = ts.createSourceFile(
  sourcePath.pathname,
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const missing = [];

for (const statement of source.statements) {
  const exported = (ts.getModifiers(statement) ?? [])
    .some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
  if (!exported) continue;

  const declarationName = statement.name?.getText(source) ?? ts.SyntaxKind[statement.kind];
  requireJsDoc(statement, declarationName);

  if (ts.isInterfaceDeclaration(statement) || ts.isClassDeclaration(statement)) {
    for (const member of statement.members) {
      const isPrivate = (ts.getModifiers(member) ?? [])
        .some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword);
      if (isPrivate) continue;
      requireJsDoc(member, `${declarationName}.${member.name?.getText(source) ?? "member"}`);
    }
  }

  if (ts.isEnumDeclaration(statement)) {
    for (const member of statement.members) {
      requireJsDoc(member, `${declarationName}.${member.name.getText(source)}`);
    }
  }
}

if (missing.length > 0) {
  for (const item of missing) console.error(`Missing JSDoc: ${item}`);
  process.exitCode = 1;
}

/** Records a public declaration when no JSDoc block is attached to it. */
function requireJsDoc(node, name) {
  if (Array.isArray(node.jsDoc) && node.jsDoc.length > 0) return;
  const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  missing.push(`${name} (${sourcePath.pathname}:${line})`);
}
