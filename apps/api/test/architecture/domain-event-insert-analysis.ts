import ts from 'typescript'

export interface DomainEventInsertSite {
  file: string
  kind: 'drizzle-insert' | 'sql-template-insert'
  line: number
}

export function findDomainEventInsertSites(
  file: string,
  source: string,
): DomainEventInsertSite[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const directBindings = new Set<string>()
  const namespaceBindings = new Set<string>()
  const sites: DomainEventInsertSite[] = []

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || !isDatabaseSchemaModule(statement.moduleSpecifier.text)) {
      continue
    }
    const bindings = statement.importClause?.namedBindings
    if (bindings && ts.isNamedImports(bindings)) {
      for (const binding of bindings.elements) {
        if ((binding.propertyName ?? binding.name).text === 'domainEvents')
          directBindings.add(binding.name.text)
      }
    }
    else if (bindings && ts.isNamespaceImport(bindings)) {
      namespaceBindings.add(bindings.name.text)
    }
  }

  function addSite(node: ts.Node, kind: DomainEventInsertSite['kind']): void {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    sites.push({ file, kind, line: line + 1 })
  }

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'insert'
      && node.arguments[0]
      && isDomainEventsReference(node.arguments[0], directBindings, namespaceBindings)) {
      addSite(node, 'drizzle-insert')
    }
    if (ts.isTaggedTemplateExpression(node)
      && isDomainEventsInsertTemplate(node.template, directBindings, namespaceBindings)) {
      addSite(node, 'sql-template-insert')
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return sites
}

function isDatabaseSchemaModule(moduleName: string): boolean {
  return moduleName === 'db/schema'
    || moduleName.includes('/db/schema')
}

function isDomainEventsReference(
  node: ts.Expression,
  directBindings: ReadonlySet<string>,
  namespaceBindings: ReadonlySet<string>,
): boolean {
  const expression = unwrapExpression(node)
  if (ts.isIdentifier(expression))
    return directBindings.has(expression.text)
  if (ts.isPropertyAccessExpression(expression)) {
    return ts.isIdentifier(expression.expression)
      && namespaceBindings.has(expression.expression.text)
      && expression.name.text === 'domainEvents'
  }
  if (ts.isElementAccessExpression(expression)) {
    return ts.isIdentifier(expression.expression)
      && namespaceBindings.has(expression.expression.text)
      && ts.isStringLiteral(expression.argumentExpression)
      && expression.argumentExpression.text === 'domainEvents'
  }
  return false
}

function unwrapExpression(node: ts.Expression): ts.Expression {
  if (ts.isParenthesizedExpression(node)
    || ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node)
    || ts.isNonNullExpression(node)) {
    return unwrapExpression(node.expression)
  }
  return node
}

function isDomainEventsInsertTemplate(
  template: ts.TemplateLiteral,
  directBindings: ReadonlySet<string>,
  namespaceBindings: ReadonlySet<string>,
): boolean {
  if (ts.isNoSubstitutionTemplateLiteral(template))
    return containsRawDomainEventsInsert(template.text)

  let precedingText = template.head.text
  if (containsRawDomainEventsInsert(precedingText))
    return true
  for (const span of template.templateSpans) {
    if (/insert\s+into\s*$/i.test(precedingText)
      && isDomainEventsReference(span.expression, directBindings, namespaceBindings)) {
      return true
    }
    precedingText += span.literal.text
    if (containsRawDomainEventsInsert(precedingText))
      return true
  }
  return false
}

function containsRawDomainEventsInsert(value: string): boolean {
  return /insert\s+into\s+["']?domain_events\b/i.test(value)
}
