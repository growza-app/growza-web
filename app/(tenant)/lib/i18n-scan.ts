import ts from 'typescript';

/**
 * Jira GRW-317 — finds owner-facing English written straight into a component.
 *
 * A string in JSX is invisible to any dictionary, so translating `copy.ts` alone
 * can never make the app fully Hindi (Jira GRW-315). This reads a `.tsx` file and
 * reports the places such text hides:
 *
 * - JSX text                                  `<p>Save</p>`
 * - a literal in a JSX child expression       `{busy ? 'Saving…' : 'Save'}`
 * - a text-carrying attribute or prop         `placeholder="…"`, `subtitle="…"`, `confirmLabel="…"`
 * - a text-carrying object property           `{ label: 'Present' }`
 * - a string handed to a message call         `setError('…')`, `confirm('…')`
 *
 * "Literal" includes a template with words in it (`Call ${name}`) and either
 * branch of a ternary or `||` / `&&` / `??`.
 *
 * It parses with the TypeScript compiler rather than searching with a regex: JSX
 * text spans lines, follows expressions, and sits in attributes split across
 * lines, and a regex gets those wrong in both directions.
 *
 * ## Exempting text that is not translated
 *
 * A comment `i18n-ok: <reason>` excuses the literal it sits directly before (or
 * on the same line after): `{/* i18n-ok: brand name *\/}Growza`, or a `//` comment
 * on the line above an attribute. In JSX it excuses the ONE node that follows it.
 * The reason is mandatory. A comment saying `i18n-ok` without one is reported.
 *
 * ## What it still does not see
 *
 * Text built at runtime, and English in plain `.ts` helpers (`lib/validate.ts`
 * returns some). Those need the API-message and dictionary work in Jira GRW-315.
 */

interface Literal {
  line: number;
  /** Normalised, and stable across edits elsewhere in the file: this is what the allowlist stores. */
  text: string;
}

export interface ScanResult {
  literals: Literal[];
  /** Comments saying `i18n-ok` with no reason. */
  badMarkers: number;
}

/**
 * Names that carry text an owner reads or a screen reader speaks. A suffix match
 * (`confirmLabel`, `emptyText`, `pageTitle`) plus a few whole names, rather than
 * a closed list: a list misses the next prop somebody invents.
 */
const TEXT_NAME = /(label|title|text|hint|placeholder|message|caption|subtitle|description|heading|body|detail|helper|tooltip)$/i;
const TEXT_NAMES = new Set(['alt', 'sub', 'what', 'note']);
const isTextName = (name: string) => !name.startsWith('data-') && (TEXT_NAMES.has(name) || TEXT_NAME.test(name));

/** Calls whose string argument reaches the owner. */
const MESSAGE_CALLS = new Set(['alert', 'confirm', 'prompt', 'setError', 'setNotice', 'setMessage', 'setToast', 'toast']);

/** `&nbsp;`, `&amp;`, `&frac12;`, `&#8377;` — entities are not words. */
const ENTITY = /&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]*);/gi;
const hasWords = (s: string) => /[A-Za-z]{2,}/.test(s.replace(ENTITY, ' '));
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

/** `i18n-ok: <reason>` — the reason is mandatory, so every exemption reads as a decision in review. */
const MARKER = /i18n-ok/;
const MARKER_WITH_REASON = /i18n-ok:\s*[^\s*]/;

export function scanSource(fileName: string, source: string): ScanResult {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const literals: Literal[] = [];

  const lineAt = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;

  /** Comments attached at `pos`: the ones on the lines before it AND the ones after the previous token on the same line. */
  const commentsAt = (pos: number) => [
    ...(ts.getLeadingCommentRanges(source, pos) ?? []),
    ...(ts.getTrailingCommentRanges(source, pos) ?? []),
  ];
  const excusedAt = (node: ts.Node) =>
    commentsAt(node.getFullStart()).some((c) => MARKER_WITH_REASON.test(source.slice(c.pos, c.end)));

  /** A `{/* i18n-ok: why *\/}` directly before this JSX child; whitespace between is ignored. */
  const childExcused = (node: ts.Node): boolean => {
    const siblings = (node.parent as ts.JsxElement | ts.JsxFragment).children;
    for (let i = siblings.indexOf(node as ts.JsxChild) - 1; i >= 0; i--) {
      const prev = siblings[i]!;
      if (ts.isJsxText(prev) && prev.containsOnlyTriviaWhiteSpaces) continue;
      return ts.isJsxExpression(prev) && !prev.expression && MARKER_WITH_REASON.test(prev.getText(sf));
    }
    return false;
  };

  /** The string-ish parts of an expression that will be shown: literals, templates, and the branches of ternaries and logical operators. */
  const strings = (e: ts.Expression | undefined, out: { node: ts.Node; text: string }[] = []) => {
    if (!e) return out;
    if (ts.isParenthesizedExpression(e)) strings(e.expression, out);
    else if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) out.push({ node: e, text: e.text });
    else if (ts.isTemplateExpression(e)) {
      const words = [e.head.text, ...e.templateSpans.map((s) => s.literal.text)];
      if (words.some(hasWords)) out.push({ node: e, text: e.head.text + e.templateSpans.map((s) => '${…}' + s.literal.text).join('') });
    } else if (ts.isConditionalExpression(e)) {
      strings(e.whenTrue, out);
      strings(e.whenFalse, out);
    } else if (ts.isBinaryExpression(e)) {
      const k = e.operatorToken.kind;
      if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.AmpersandAmpersandToken || k === ts.SyntaxKind.QuestionQuestionToken) {
        strings(e.left, out);
        strings(e.right, out);
      }
    }
    return out;
  };

  const report = (anchor: ts.Node, e: ts.Expression | undefined, label: (t: string) => string, excused: boolean) => {
    for (const s of strings(e)) {
      if (!hasWords(s.text) || excused || excusedAt(s.node) || excusedAt(anchor)) continue;
      literals.push({ line: lineAt(s.node.getStart(sf)), text: label(tidy(s.text)) });
    }
  };

  const nameOf = (n: ts.PropertyName | ts.JsxAttributeName): string =>
    ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : n.getText(sf);

  const calleeName = (e: ts.Expression): string | null =>
    ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : null;

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      if (!node.containsOnlyTriviaWhiteSpaces && hasWords(node.text) && !childExcused(node)) {
        literals.push({ line: lineAt(node.getFullStart() + Math.max(0, node.text.search(/\S/))), text: tidy(node.text) });
      }
    } else if (ts.isJsxAttribute(node)) {
      const name = nameOf(node.name);
      const init = node.initializer;
      if (init && isTextName(name)) {
        const expr = ts.isJsxExpression(init) ? init.expression : (init as ts.StringLiteral);
        report(node, expr, (t) => `${name}="${t}"`, false);
      }
    } else if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      report(node, node.expression, (t) => `{${t}}`, childExcused(node));
    } else if (ts.isPropertyAssignment(node) && isTextName(nameOf(node.name))) {
      report(node, node.initializer, (t) => `${nameOf(node.name)}: "${t}"`, false);
    } else if (ts.isCallExpression(node)) {
      const callee = calleeName(node.expression);
      if (callee && MESSAGE_CALLS.has(callee)) for (const a of node.arguments) report(node, a, (t) => `${callee}("${t}")`, false);
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Markers with no reason, found in COMMENTS only — a string that happens to
  // contain "i18n-ok" is not one. Every token is visited so that the comment
  // inside `{/* … */}` (which belongs to the closing brace) is seen too.
  const seen = new Set<number>();
  let badMarkers = 0;
  const walk = (n: ts.Node): void => {
    if (!ts.isJsxText(n)) {
      for (const c of commentsAt(n.getFullStart())) {
        if (seen.has(c.pos)) continue;
        seen.add(c.pos);
        const text = source.slice(c.pos, c.end);
        if (MARKER.test(text) && !MARKER_WITH_REASON.test(text)) badMarkers++;
      }
    }
    for (const child of n.getChildren(sf)) walk(child);
  };
  walk(sf);

  return { literals, badMarkers };
}
