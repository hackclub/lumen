import type * as Monaco from 'monaco-editor';
import type { languages } from 'monaco-editor';

export const glslLanguageId = 'glsl';
const declarationQualifiers = ['const', 'uniform', 'attribute', 'varying', 'in', 'out', 'inout'] as const;
const precisionQualifiers = ['lowp', 'mediump', 'highp'] as const;

export type GlslSymbol = {
  name: string;
  type: string;
  qualifier?: string;
  detail?: string;
  documentation?: string;
};

export const conf: languages.LanguageConfiguration = {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/']
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')']
  ],
  autoClosingPairs: [
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: '(', close: ')' },
    { open: "'", close: "'", notIn: ['string', 'comment'] },
    { open: '"', close: '"', notIn: ['string'] }
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" }
  ]
};

export const keywords = [
  'const', 'uniform', 'break', 'continue',
  'do', 'for', 'while', 'if', 'else', 'switch', 'case', 'in', 'out', 'inout', 'true', 'false',
  'invariant', 'discard', 'return', 'sampler2D', 'samplerCube', 'sampler3D', 'struct',
  'radians', 'degrees', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'pow', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt', 'abs', 'sign', 'floor', 'ceil', 'round', 'roundEven', 'trunc', 'fract', 'mod', 'modf',
  'min', 'max', 'clamp', 'mix', 'step', 'smoothstep', 'length', 'distance', 'dot', 'cross',
  'determinant', 'inverse', 'normalize', 'faceforward', 'reflect', 'refract', 'matrixCompMult', 'outerProduct', 'transpose', 'lessThan',
  'lessThanEqual', 'greaterThan', 'greaterThanEqual', 'equal', 'notEqual', 'any', 'all', 'not', 'packUnorm2x16', 'unpackUnorm2x16', 'packSnorm2x16', 'unpackSnorm2x16', 'packHalf2x16', 'unpackHalf2x16',
  'dFdx', 'dFdy', 'fwidth', 'textureSize', 'texture', 'textureProj', 'textureLod', 'textureGrad', 'texelFetch', 'texelFetchOffset',
  'textureProjLod', 'textureLodOffset', 'textureGradOffset', 'textureProjLodOffset', 'textureProjGrad', 'intBitsToFloat', 'uintBitsToFloat', 'floatBitsToInt', 'floatBitsToUint', 'isnan', 'isinf',
  'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4', 'uvec2', 'uvec3', 'uvec4', 'bvec2', 'bvec3', 'bvec4',
  'mat2', 'mat3', 'mat2x2', 'mat2x3', 'mat2x4', 'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4', 'mat4',
  'float', 'int', 'uint', 'void', 'bool'
];

const modelExtraSymbols = new Map<string, GlslSymbol[]>();

export const language: languages.IMonarchLanguage = {
  tokenPostfix: '.glsl',
  defaultToken: 'invalid',
  keywords,
  operators: [
    '=',
    '>',
    '<',
    '!',
    '~',
    '?',
    ':',
    '==',
    '<=',
    '>=',
    '!=',
    '&&',
    '||',
    '++',
    '--',
    '+',
    '-',
    '*',
    '/',
    '&',
    '|',
    '^',
    '%',
    '<<',
    '>>',
    '>>>',
    '+=',
    '-=',
    '*=',
    '/=',
    '&=',
    '|=',
    '^=',
    '%=',
    '<<=',
    '>>=',
    '>>>='
  ],
  symbols: /[=><!~?:&|+\-*\/\^%]+/,
  escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
  integersuffix: /([uU](ll|LL|l|L)|(ll|LL|l|L)?[uU]?)/,
  floatsuffix: /[fFlL]?/,
  encoding: /u|u8|U|L/,

  tokenizer: {
    root: [
      [
        /[a-zA-Z_]\w*/,
        {
          cases: {
            '@keywords': { token: 'keyword.$0' },
            '@default': 'identifier'
          }
        }
      ],
      [/^\s*#\s*\w+/, 'keyword.directive'],
      { include: '@whitespace' },
      [/[{}()\[\]]/, '@brackets'],
      [/@symbols/, {
        cases: {
          '@operators': 'operator',
          '@default': ''
        }
      }],
      [/\d*\d+[eE]([\-+]?\d+)?(@floatsuffix)/, 'number.float'],
      [/\d*\.\d+([eE][\-+]?\d+)?(@floatsuffix)/, 'number.float'],
      [/0[xX][0-9a-fA-F']*[0-9a-fA-F](@integersuffix)/, 'number.hex'],
      [/0[0-7']*[0-7](@integersuffix)/, 'number.octal'],
      [/0[bB][0-1']*[0-1](@integersuffix)/, 'number.binary'],
      [/\d[\d']*\d(@integersuffix)/, 'number'],
      [/\d(@integersuffix)/, 'number'],
      [/[;,.]/, 'delimiter']
    ],

    comment: [
      [/[^\/*]+/, 'comment'],
      [/\/\*/, 'comment', '@push'],
      ['\\*/', 'comment', '@pop'],
      [/[\/*]/, 'comment']
    ],

    string: [
      [/[^\\"]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/"/, {
        token: 'string.quote',
        bracket: '@close',
        next: '@pop'
      }]
    ],

    whitespace: [
      [/[ \t\r\n]+/, 'white'],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/.*$/, 'comment']
    ]
  }
};

let isGlslRegistered = false;

const extractVariableNames = (declaration: string) =>
  declaration
    .split(',')
    .map((part) => part.trim())
    .map((part) => part.replace(/\s*=.*$/, '').trim())
    .map((part) => part.match(/^([A-Za-z_]\w*)/))
    .flatMap((match) => (match ? [match[1]] : []));

const extractFunctionSymbols = (source: string) => {
  const symbols = new Map<string, GlslSymbol>();
  const functionPattern = /\b[A-Za-z_]\w*\s+[A-Za-z_]\w*\s*\(([^)]*)\)/g;

  for (const match of source.matchAll(functionPattern)) {
    const parameters = match[1]
      .split(',')
      .map((parameter) => parameter.trim())
      .filter(Boolean);

    for (const parameter of parameters) {
      const parameterMatch = parameter.match(
        new RegExp(
          `^(?:(?:${declarationQualifiers.join('|')})\\s+)?(?:(?:${precisionQualifiers.join('|')})\\s+)?([A-Za-z_]\\w*)\\s+([A-Za-z_]\\w*)`
        )
      );

      if (!parameterMatch) {
        continue;
      }

      const [, type, name] = parameterMatch;
      const qualifier = declarationQualifiers.find((value) => parameter.startsWith(`${value} `));
      symbols.set(name, {
        name,
        type,
        qualifier,
        detail: qualifier ? `${qualifier} parameter` : 'parameter'
      });
    }
  }

  return symbols;
};

const extractDeclaredSymbols = (source: string) => {
  const strippedSource = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, '');
  const symbols = extractFunctionSymbols(strippedSource);
  const declarationPattern = new RegExp(
    `^\\s*(?:(?:${declarationQualifiers.join('|')})\\s+)?(?:(?:${precisionQualifiers.join('|')})\\s+)?([A-Za-z_]\\w*)\\s+(.+?)\\s*;$`
  );

  for (const line of strippedSource.split('\n')) {
    if (!line.includes(';') || line.includes('(')) {
      continue;
    }

    const match = line.match(declarationPattern);
    if (!match) {
      continue;
    }

    const [, type, declaration] = match;
    const qualifier = declarationQualifiers.find((value) => line.trimStart().startsWith(`${value} `));

    for (const name of extractVariableNames(declaration)) {
      symbols.set(name, {
        name,
        type,
        qualifier,
        detail: qualifier ? `${qualifier} variable` : 'variable'
      });
    }
  }

  return [...symbols.values()];
};

const getModelSymbols = (model: Monaco.editor.ITextModel) => {
  const symbols = new Map<string, GlslSymbol>();

  for (const symbol of extractDeclaredSymbols(model.getValue())) {
    symbols.set(symbol.name, symbol);
  }

  for (const symbol of modelExtraSymbols.get(model.uri.toString()) ?? []) {
    if (!symbols.has(symbol.name)) {
      symbols.set(symbol.name, symbol);
    }
  }

  return [...symbols.values()];
};

export const setGlslModelExtraSymbols = (
  model: Monaco.editor.ITextModel,
  symbols: GlslSymbol[]
) => {
  modelExtraSymbols.set(model.uri.toString(), symbols);
};

export const clearGlslModelExtraSymbols = (model: Monaco.editor.ITextModel) => {
  modelExtraSymbols.delete(model.uri.toString());
};

export const registerGlslLanguage = (monaco: typeof Monaco) => {
  if (isGlslRegistered) {
    return;
  }

  if (!monaco.languages.getLanguages().some((language) => language.id === glslLanguageId)) {
    monaco.languages.register({
      id: glslLanguageId,
      aliases: ['GLSL', 'glsl'],
      extensions: ['.glsl', '.frag', '.vert']
    });
  }

  monaco.languages.setLanguageConfiguration(glslLanguageId, conf);
  monaco.languages.setMonarchTokensProvider(glslLanguageId, language);
  monaco.languages.registerCompletionItemProvider(glslLanguageId, {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };
      const variableSuggestions = getModelSymbols(model).map((symbol) => ({
        label: symbol.name,
        kind: monaco.languages.CompletionItemKind.Variable,
        insertText: symbol.name,
        detail: symbol.qualifier ? `${symbol.qualifier} ${symbol.type}` : symbol.type,
        documentation: symbol.documentation,
        range
      }));

      return {
        suggestions: [
          ...variableSuggestions,
          ...keywords.map((keyword) => ({
            label: keyword,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: keyword,
            detail: 'GLSL keyword',
            range
          }))
        ]
      };
    }
  });
  monaco.languages.registerHoverProvider(glslLanguageId, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) {
        return null;
      }

      const symbol = getModelSymbols(model).find((entry) => entry.name === word.word);
      if (!symbol) {
        return null;
      }

      const signature = symbol.qualifier
        ? `${symbol.qualifier} ${symbol.type} ${symbol.name}`
        : `${symbol.type} ${symbol.name}`;

      return {
        range: new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn
        ),
        contents: [
          { value: `\`\`\`glsl\n${signature}\n\`\`\`` },
          { value: symbol.detail ?? 'GLSL symbol' },
          ...(symbol.documentation ? [{ value: symbol.documentation }] : [])
        ]
      };
    }
  });

  isGlslRegistered = true;
};
