import { dirname, resolve } from 'node:path'
import process from 'node:process'
import ts from 'typescript'

export interface DomainEventInsertSite {
  file: string
  kind: 'drizzle-insert' | 'sql-literal-insert' | 'sql-template-insert'
  line: number
}

export interface AppendBatchCallSite {
  file: string
  line: number
}

export interface EventingWriteAnalysis {
  appendBatchCalls: AppendBatchCallSite[]
  domainEventInserts: DomainEventInsertSite[]
}

export interface EventingWriteAnalysisInput {
  files: Readonly<Record<string, string>>
  inspectFiles: readonly string[]
}

const virtualRoot = '/__eventing_write_analysis__'

export function productionEventingInspectFiles(files: readonly string[]): string[] {
  return files.filter((file) => {
    const normalized = file.replaceAll('\\', '/')
    return !normalized.includes('/db/schema/')
      && !normalized.startsWith('db/schema/')
      && !normalized.includes('/node_modules/')
      && !normalized.startsWith('node_modules/')
      && !/(?:^|\/)(?:test|tests|__tests__)\//.test(normalized)
      && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  })
}

export function analyzeEventingWrites(
  input: EventingWriteAnalysisInput,
): EventingWriteAnalysis {
  const virtualFiles = new Map(
    Object.entries(input.files).map(([file, source]) => [virtualPath(file), source]),
  )
  const displayNames = new Map(
    Object.keys(input.files).map(file => [virtualPath(file), file]),
  )
  const inspectFiles = new Set(input.inspectFiles.map(virtualPath))
  const program = createProgram(virtualFiles)
  const checker = program.getTypeChecker()
  const domainEventSymbols = collectDomainEventSymbols(program, checker)
  const appendBatchSymbols = collectAppendBatchSymbols(program, checker)
  const drizzleSqlSymbols = collectDrizzleSqlSymbols(program, checker)
  const domainEventInserts: DomainEventInsertSite[] = []
  const appendBatchCalls: AppendBatchCallSite[] = []

  for (const sourceFile of program.getSourceFiles()) {
    if (!inspectFiles.has(sourceFile.fileName))
      continue
    const file = displayNames.get(sourceFile.fileName) ?? sourceFile.fileName

    function addInsert(
      node: ts.Node,
      kind: DomainEventInsertSite['kind'],
    ): void {
      domainEventInserts.push({ file, kind, line: lineOf(sourceFile, node) })
    }

    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node)) {
        if (accessName(node.expression) === 'insert'
          && node.arguments[0]
          && expressionResolvesTo(
            node.arguments[0],
            domainEventSymbols,
            checker,
          )) {
          addInsert(node, 'drizzle-insert')
        }
        if (isRawSqlInsertCall(node, drizzleSqlSymbols, checker))
          addInsert(node, 'sql-literal-insert')
        if (expressionResolvesTo(node.expression, appendBatchSymbols, checker)) {
          appendBatchCalls.push({ file, line: lineOf(sourceFile, node) })
        }
      }
      if (ts.isTaggedTemplateExpression(node)
        && expressionResolvesTo(node.tag, drizzleSqlSymbols, checker)) {
        const kind = sqlTemplateInsertKind(node.template, domainEventSymbols, checker)
        if (kind)
          addInsert(node, kind)
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  return { appendBatchCalls, domainEventInserts }
}

function createProgram(files: ReadonlyMap<string, string>): ts.Program {
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  }
  const defaultHost = ts.createCompilerHost(options, true)
  const virtualDirectories = new Set<string>()
  for (const file of files.keys()) {
    let directory = dirname(file)
    while (directory.startsWith(virtualRoot)) {
      virtualDirectories.add(directory)
      if (directory === virtualRoot)
        break
      directory = dirname(directory)
    }
  }
  const host: ts.CompilerHost = {
    ...defaultHost,
    directoryExists: directoryName => virtualDirectories.has(directoryName)
      || defaultHost.directoryExists?.(directoryName)
      || false,
    fileExists: fileName => files.has(fileName) || defaultHost.fileExists(fileName),
    getSourceFile: (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
      const source = files.get(fileName)
      if (source !== undefined) {
        return ts.createSourceFile(
          fileName,
          source,
          languageVersion,
          true,
          ts.ScriptKind.TS,
        )
      }
      return defaultHost.getSourceFile(
        fileName,
        languageVersion,
        onError,
        shouldCreateNewSourceFile,
      )
    },
    readFile: fileName => files.get(fileName) ?? defaultHost.readFile(fileName),
    realpath: fileName => fileName,
    resolveModuleNames: (moduleNames, containingFile) => moduleNames.map((moduleName) => {
      const virtualResolution = ts.resolveModuleName(
        moduleName,
        containingFile,
        options,
        host,
      ).resolvedModule
      if (virtualResolution || moduleName !== 'drizzle-orm')
        return virtualResolution
      return ts.resolveModuleName(
        moduleName,
        resolve(process.cwd(), 'src/__eventing-write-analysis__.ts'),
        options,
        defaultHost,
      ).resolvedModule
    }),
    writeFile: () => {},
  }

  return ts.createProgram({ rootNames: [...files.keys()], options, host })
}

function collectDomainEventSymbols(
  program: ts.Program,
  checker: ts.TypeChecker,
): ReadonlySet<ts.Symbol> {
  const symbols = new Set<ts.Symbol>()
  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.fileName.includes('/db/schema/'))
      continue
    visitNodes(sourceFile, (node) => {
      if (!ts.isVariableDeclaration(node)
        || !ts.isIdentifier(node.name)
        || node.name.text !== 'domainEvents') {
        return
      }
      const symbol = checker.getSymbolAtLocation(node.name)
      if (symbol)
        symbols.add(resolveAlias(symbol, checker))
    })
  }
  return symbols
}

function collectDrizzleSqlSymbols(
  program: ts.Program,
  checker: ts.TypeChecker,
): ReadonlySet<ts.Symbol> {
  const symbols = new Set<ts.Symbol>()
  for (const sourceFile of program.getSourceFiles()) {
    for (const statement of sourceFile.statements) {
      if ((!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement))
        || !statement.moduleSpecifier
        || !ts.isStringLiteral(statement.moduleSpecifier)
        || statement.moduleSpecifier.text !== 'drizzle-orm') {
        continue
      }
      const moduleSymbol = checker.getSymbolAtLocation(statement.moduleSpecifier)
      if (moduleSymbol) {
        const sqlExport = checker.getExportsOfModule(moduleSymbol)
          .find(symbol => symbol.name === 'sql')
        if (sqlExport)
          symbols.add(resolveAlias(sqlExport, checker))
      }
      const bindings = ts.isImportDeclaration(statement)
        ? statement.importClause?.namedBindings
        : statement.exportClause
      if (!bindings || (!ts.isNamedImports(bindings) && !ts.isNamedExports(bindings)))
        continue
      for (const binding of bindings.elements) {
        if ((binding.propertyName ?? binding.name).text !== 'sql')
          continue
        const symbol = checker.getSymbolAtLocation(binding.name)
        if (symbol)
          symbols.add(resolveAlias(symbol, checker))
      }
    }
  }
  return symbols
}

function collectAppendBatchSymbols(
  program: ts.Program,
  checker: ts.TypeChecker,
): ReadonlySet<ts.Symbol> {
  const symbols = new Set<ts.Symbol>()
  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.fileName.endsWith('/eventing/event-store.ts'))
      continue
    visitNodes(sourceFile, (node) => {
      if (!ts.isInterfaceDeclaration(node)
        || node.name.text !== 'EventStoreSession') {
        return
      }
      for (const member of node.members) {
        if (!member.name || propertyName(member.name) !== 'appendBatch')
          continue
        const symbol = checker.getSymbolAtLocation(member.name)
        if (symbol)
          symbols.add(resolveAlias(symbol, checker))
      }
    })
  }
  return symbols
}

function expressionResolvesTo(
  node: ts.Expression,
  targets: ReadonlySet<ts.Symbol>,
  checker: ts.TypeChecker,
  visited = new Set<ts.Symbol>(),
): boolean {
  const expression = unwrapExpression(node)
  if (ts.isCallExpression(expression)
    && accessName(expression.expression) === 'bind') {
    const boundTarget = accessTarget(expression.expression)
    return boundTarget !== undefined
      && expressionResolvesTo(boundTarget, targets, checker, visited)
  }

  const symbol = symbolForExpression(expression, checker)
  if (!symbol)
    return false
  return symbolResolvesTo(symbol, targets, checker, visited)
}

function symbolResolvesTo(
  symbol: ts.Symbol,
  targets: ReadonlySet<ts.Symbol>,
  checker: ts.TypeChecker,
  visited: Set<ts.Symbol>,
): boolean {
  const resolved = resolveAlias(symbol, checker)
  if (targets.has(resolved))
    return true
  if (visited.has(resolved))
    return false
  visited.add(resolved)

  for (const declaration of resolved.declarations ?? []) {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      if (expressionResolvesTo(declaration.initializer, targets, checker, visited))
        return true
    }
    if (ts.isBindingElement(declaration)) {
      const sourceSymbol = bindingElementPropertySymbol(declaration, checker)
      if (sourceSymbol && symbolResolvesTo(sourceSymbol, targets, checker, visited))
        return true
    }
  }
  return false
}

function symbolForExpression(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): ts.Symbol | undefined {
  if (ts.isPropertyAccessExpression(expression))
    return checker.getSymbolAtLocation(expression.name)
  if (ts.isElementAccessExpression(expression)) {
    const name = propertyName(expression.argumentExpression)
    return name === undefined
      ? undefined
      : checker.getPropertyOfType(checker.getTypeAtLocation(expression.expression), name)
  }
  return checker.getSymbolAtLocation(expression)
}

function bindingElementPropertySymbol(
  binding: ts.BindingElement,
  checker: ts.TypeChecker,
): ts.Symbol | undefined {
  if (!ts.isObjectBindingPattern(binding.parent)
    || !ts.isVariableDeclaration(binding.parent.parent)
    || !binding.parent.parent.initializer) {
    return undefined
  }
  const name = propertyName(binding.propertyName ?? binding.name)
  if (name === undefined)
    return undefined
  const sourceType = checker.getTypeAtLocation(binding.parent.parent.initializer)
  return checker.getPropertyOfType(sourceType, name)
}

function resolveAlias(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  let resolved = symbol
  const seen = new Set<ts.Symbol>()
  while ((resolved.flags & ts.SymbolFlags.Alias) !== 0 && !seen.has(resolved)) {
    seen.add(resolved)
    const next = checker.getAliasedSymbol(resolved)
    if (next === resolved)
      break
    resolved = next
  }
  return resolved
}

function isRawSqlInsertCall(
  node: ts.CallExpression,
  drizzleSqlSymbols: ReadonlySet<ts.Symbol>,
  checker: ts.TypeChecker,
): boolean {
  if (accessName(node.expression) !== 'unsafe' || !node.arguments[0])
    return false
  const sqlExpression = accessTarget(node.expression)
  if (!sqlExpression
    || !expressionResolvesTo(sqlExpression, drizzleSqlSymbols, checker)) {
    return false
  }
  const statement = literalText(node.arguments[0])
  return statement !== undefined && containsDomainEventsInsert(statement)
}

function sqlTemplateInsertKind(
  template: ts.TemplateLiteral,
  domainEventSymbols: ReadonlySet<ts.Symbol>,
  checker: ts.TypeChecker,
): DomainEventInsertSite['kind'] | undefined {
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return containsDomainEventsInsert(template.text)
      ? 'sql-literal-insert'
      : undefined
  }

  const literalSql = [template.head.text, ...template.templateSpans.map(span => span.literal.text)]
    .join(' ')
  if (containsDomainEventsInsert(literalSql))
    return 'sql-literal-insert'

  let precedingText = template.head.text
  for (const span of template.templateSpans) {
    if (/\binsert\s+into\s+(?:only\s+)?$/i.test(precedingText)
      && expressionResolvesTo(span.expression, domainEventSymbols, checker)) {
      return 'sql-template-insert'
    }
    precedingText = span.literal.text
  }
  return undefined
}

function containsDomainEventsInsert(value: string): boolean {
  const identifier = String.raw`(?:"(?:[^"]|"")*"|[a-z_][\w$]*)`
  const domainEvents = String.raw`(?:"domain_events"|domain_events)`
  return new RegExp(
    String.raw`\binsert\s+into\s+(?:only\s+)?(?:${identifier}\s*\.\s*)?${domainEvents}(?=\s|\(|$)`,
    'i',
  ).test(value)
}

function literalText(node: ts.Expression): string | undefined {
  const expression = unwrapExpression(node)
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
    return expression.text
  return undefined
}

function accessName(node: ts.Expression): string | undefined {
  const expression = unwrapExpression(node)
  if (ts.isPropertyAccessExpression(expression))
    return expression.name.text
  if (ts.isElementAccessExpression(expression))
    return propertyName(expression.argumentExpression)
  return undefined
}

function accessTarget(node: ts.Expression): ts.Expression | undefined {
  const expression = unwrapExpression(node)
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression))
    return expression.expression
  return undefined
}

function propertyName(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node))
    return node.text
  return undefined
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

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
}

function visitNodes(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node)
  ts.forEachChild(node, child => visitNodes(child, visitor))
}

function virtualPath(file: string): string {
  return resolve(virtualRoot, file)
}
