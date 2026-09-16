import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-288 (AC-05) — every admin form control has a label that is
 * actually attached to it.
 *
 * GRW-277 fixed `Field` so its label points at the control it wraps, and QA
 * then found the forms that do not go through `Field` the way it assumes:
 * AddAdminModal's labels had no `htmlFor`; RoleEditor's "Name" was a `<div>`;
 * DiscountModal had four bare `<label>`s beside their controls; the
 * Impersonate dialog's "Reason *" labelled nothing; and AddBusinessModal's
 * "Owner's phone" pointed at the wrapper `<div>` round the input, because
 * `Field` gives its id to whatever its child is. Each one reads out as an
 * unnamed box to a screen reader, and clicking the visible word focuses
 * nothing.
 *
 * No browser in `npm test`, so this reads the source — parsed as TSX, not
 * grepped — and holds every `input`, `select`, `textarea`, `TextInput` and
 * `Select` under `web/app/admin` to one of the ways a control really gets a
 * name:
 *
 * 1. `aria-label` / `aria-labelledby` on the control;
 * 2. an `id` that a `<label htmlFor>` in the same file names, with the same
 *    expression;
 * 3. a `<label>` element around it;
 * 4. being the one element child of a `<Field>` (which clones its id onto
 *    that child) — or, when the child is a wrapper, a `<Field id>` naming the
 *    control's own `id`.
 *
 * And the other direction: every `<label>` must label something by one of
 * those routes, because a label that points at nothing is the bug, not a style.
 */

const ADMIN_ROOT = resolve(__dirname, '..');
const CONTROL_TAGS = new Set(['input', 'select', 'textarea', 'TextInput', 'Select']);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

type JsxNode = ts.JsxElement | ts.JsxSelfClosingElement;

const openingOf = (node: JsxNode) => (ts.isJsxElement(node) ? node.openingElement : node);
const tagOf = (node: JsxNode) => openingOf(node).tagName.getText();

function attr(node: JsxNode, name: string): ts.JsxAttribute | undefined {
  return openingOf(node).attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name,
  );
}

/** The attribute's value as source text, so `{nameId}` matches `{nameId}`. */
function attrText(node: JsxNode, name: string): string | undefined {
  const a = attr(node, name);
  if (!a?.initializer) return undefined;
  return ts.isJsxExpression(a.initializer) ? a.initializer.expression?.getText() : a.initializer.getText();
}

const hasSpread = (node: JsxNode) => openingOf(node).attributes.properties.some((p) => ts.isJsxSpreadAttribute(p));

function jsxNodes(root: ts.Node): JsxNode[] {
  const out: JsxNode[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) out.push(n);
    ts.forEachChild(n, visit);
  };
  visit(root);
  return out;
}

/** The nearest enclosing JSX element, skipping expressions, conditionals and maps. */
function parentElement(node: ts.Node): ts.JsxElement | undefined {
  let n = node.parent;
  while (n) {
    if (ts.isJsxElement(n)) return n;
    n = n.parent;
  }
  return undefined;
}

/**
 * The element children of a `Field`, looking through `{cond ? <A/> : <B/>}` —
 * at runtime that is still one element, which is all `Field` checks.
 */
function soleElementChild(field: ts.JsxElement): ts.Node | undefined {
  const kids = field.children.filter((c) => !(ts.isJsxText(c) && c.containsOnlyTriviaWhiteSpaces));
  return kids.length === 1 ? kids[0] : undefined;
}

function isDirectFieldChild(control: JsxNode, field: ts.JsxElement): boolean {
  const only = soleElementChild(field);
  if (!only) return false;
  if (only === control) return true;
  // `{x ? <TextInput/> : <Select/>}` — the control is a branch of the one expression.
  if (ts.isJsxExpression(only)) {
    let n: ts.Node | undefined = control.parent;
    while (n && n !== only) {
      if (ts.isJsxElement(n) || ts.isJsxFragment(n)) return false;
      n = n.parent;
    }
    return n === only;
  }
  return false;
}

/** `only` itself if it is an element, else the outermost elements inside an expression. */
function topLevelElements(only: ts.Node): JsxNode[] {
  if (ts.isJsxElement(only) || ts.isJsxSelfClosingElement(only)) return [only];
  return jsxNodes(only).filter((n) => {
    for (let p: ts.Node | undefined = n.parent; p && p !== only; p = p.parent) {
      if (ts.isJsxElement(p) || ts.isJsxFragment(p)) return false;
    }
    return true;
  });
}

/** Is `name` a parameter (or destructured prop) of a function this node sits in? */
function isOwnParameter(node: ts.Node, name: string): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (!ts.isFunctionLike(n)) continue;
    const bound = new Set<string>();
    const collect = (b: ts.BindingName) => {
      if (ts.isIdentifier(b)) bound.add(b.text);
      else for (const el of b.elements) if (!ts.isOmittedExpression(el)) collect(el.name);
    };
    for (const p of n.parameters) collect(p.name);
    // `Field` derives its id in the body — `const controlId = …` — from props.
    if (ts.isFunctionDeclaration(n) && n.body) {
      for (const st of n.body.statements) {
        if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) collect(d.name);
      }
    }
    if (bound.has(name)) return true;
  }
  return false;
}

interface Finding {
  file: string;
  line: number;
  what: string;
}

function audit(path: string): Finding[] {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const file = relative(ADMIN_ROOT, path);
  const lineOf = (n: ts.Node) => source.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const nodes = jsxNodes(source);

  const controls = nodes.filter((n) => CONTROL_TAGS.has(tagOf(n)) && attrText(n, 'type') !== "'hidden'" && attrText(n, 'type') !== '"hidden"');
  const labels = nodes.filter((n) => tagOf(n) === 'label');
  const fields = nodes.filter((n): n is ts.JsxElement => tagOf(n) === 'Field' && ts.isJsxElement(n));

  // Any element's `htmlFor`, so a small label component (`<FieldLabel htmlFor>`)
  // counts the same as a `<label>` written in place.
  const labelTargets = new Set(nodes.map((n) => attrText(n, 'htmlFor')).filter((t): t is string => Boolean(t)));
  const fieldTargets = new Set(fields.map((f) => attrText(f, 'id')).filter((t): t is string => Boolean(t)));
  const controlIds = new Set(controls.map((c) => attrText(c, 'id')).filter((t): t is string => Boolean(t)));

  const insideLabel = (n: ts.Node) => {
    for (let p = parentElement(n); p; p = parentElement(p)) if (tagOf(p) === 'label') return true;
    return false;
  };

  const findings: Finding[] = [];

  for (const control of controls) {
    // The primitives themselves: `<input {...props} />` is labelled by its caller.
    if (hasSpread(control)) continue;
    if (attr(control, 'aria-label') || attr(control, 'aria-labelledby')) continue;
    const id = attrText(control, 'id');
    if (id && (labelTargets.has(id) || fieldTargets.has(id))) continue;
    if (insideLabel(control)) continue;
    const field = parentElement(control);
    if (field && tagOf(field) === 'Field' && !attr(field, 'id') && isDirectFieldChild(control, field)) continue;
    findings.push({ file, line: lineOf(control), what: `<${tagOf(control)}> has no label attached to it` });
  }

  for (const label of labels) {
    const target = attrText(label, 'htmlFor');
    // A label component's own `<label htmlFor={htmlFor}>` names an id its
    // caller supplies — `Field` (`controlId`), `FieldLabel` — so it is checked
    // at each call site, where the id and the control are both visible.
    if (target && isOwnParameter(label, target)) continue;
    if (target) {
      if (!controlIds.has(target)) findings.push({ file, line: lineOf(label), what: `<label htmlFor={${target}}> names no control in this file` });
      continue;
    }
    // A `Toggle` is a <button>, which a label can wrap and activate too.
    const wraps = jsxNodes(label).some((n) => n !== label && (CONTROL_TAGS.has(tagOf(n)) || tagOf(n) === 'Toggle' || tagOf(n) === 'button'));
    if (!wraps) findings.push({ file, line: lineOf(label), what: '<label> with no htmlFor and no control inside it' });
  }

  for (const field of fields) {
    const id = attrText(field, 'id');
    if (id) {
      if (!controlIds.has(id)) findings.push({ file, line: lineOf(field), what: `<Field id={${id}}> names no control in this file` });
      continue;
    }
    // A Field whose child is not itself a control hands its id — and its
    // label — to a wrapper. This is the "Owner's phone" bug.
    const only = soleElementChild(field);
    const direct = only !== undefined && topLevelElements(only).length > 0 && topLevelElements(only).every((n) => CONTROL_TAGS.has(tagOf(n)));
    // A Field around something that is not a control at all (a Toggle, a
    // read-only value) has a label pointing at a box that cannot take focus.
    if (!direct) {
      findings.push({
        file,
        line: lineOf(field),
        what: `<Field label=${attrText(field, 'label')}> labels something other than a control; pass the control's id as <Field id>`,
      });
    }
  }

  return findings;
}

describe('every admin form control has a working label', () => {
  const files = tsxFiles(ADMIN_ROOT);

  it('finds the admin forms at all (a sweep of nothing would pass)', () => {
    const withControls = files.filter((f) => /<(input|select|textarea|TextInput|Select)\b/.test(readFileSync(f, 'utf8')));
    expect(withControls.length).toBeGreaterThan(15);
  });

  it('AC-05 — no unlabelled control, no label pointing at nothing, no Field labelling a wrapper', () => {
    const findings = files.flatMap(audit);
    expect(findings.map((f) => `${f.file}:${f.line} — ${f.what}`)).toEqual([]);
  });
});
