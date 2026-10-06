  const transpilePythonToJs = (pythonCode: string) => {
    // Strip common leading whitespace from all lines
    const stripCommonIndent = (codeStr: string): string => {
      const lines = codeStr.split('\n');
      let minIndent = Infinity;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const indent = line.length - line.trimStart().length;
          if (indent < minIndent) {
            minIndent = indent;
          }
        }
      }
      if (minIndent === Infinity || minIndent === 0) {
        return codeStr;
      }
      return lines.map(line => {
        if (line.trim() === '') return '';
        return line.substring(Math.min(line.length - line.trimStart().length, minIndent));
      }).join('\n');
    };

    const normalizedPython = stripCommonIndent(pythonCode);
    let lines = normalizedPython.split('\n');
    let jsCode = '';
    let currentIndent = 0;
    let blockStack: string[] = [];
    
    // Extract variables (supporting indented variables and excluding comparisons like ==)
    const declaredVars = new Set<string>();
    const varRegex = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=(?!=)/gm;
    let match;
    while ((match = varRegex.exec(normalizedPython)) !== null) {
      const name = match[1];
      if (!['global', 'import', 'from', 'pass', 'return', 'if', 'while', 'elif', 'else', 'try', 'except'].includes(name)) {
        declaredVars.add(name);
      }
    }
    
    // Header declarations
    let declarations = Array.from(declaredVars).map(v => `let ${v} = 0;`).join('\n') + '\n';
    jsCode += declarations;

    for (let i = 0; i < lines.length; i++) {
      const origLine = lines[i];
      const trimmed = origLine.trim();
      
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      
      // Indentation checks
      const indent = origLine.length - origLine.trimStart().length;
      while (indent < currentIndent) {
        const isTargetTry = (currentIndent - 4 === indent) && (trimmed.startsWith('except') || trimmed.startsWith('finally'));
        
        const blockType = blockStack.pop();
        if (blockType === 'try' && !isTargetTry) {
            jsCode += ' '.repeat(Math.max(0, currentIndent - 4)) + '} catch (e) {}\n';
        } else if (blockType === 'while') {
            jsCode += ' '.repeat(currentIndent) + 'await sleep(10);\n';
            jsCode += ' '.repeat(Math.max(0, currentIndent - 4)) + '}\n';
        } else {
            jsCode += ' '.repeat(Math.max(0, currentIndent - 4)) + '}\n';
        }
        currentIndent -= 4;
      }
      
      let translated = trimmed;
      let lineComment = '';
      const hashIndex = translated.indexOf('#');
      if (hashIndex !== -1) {
        lineComment = translated.substring(hashIndex);
        translated = translated.substring(0, hashIndex).trim();
      }
      
      // Control flows
      if (translated === 'while True:') {
        translated = 'while (true) {';
        currentIndent = indent + 4;
        blockStack.push('while');
      } else if ((translated.startsWith('while ') || translated.startsWith('while(')) && translated.endsWith(':')) {
        const cond = translated.startsWith('while(') ? translated.substring(5, translated.length - 1) : translated.substring(6, translated.length - 1);
        translated = `while (${translateExpression(cond.trim())}) {`;
        currentIndent = indent + 4;
        blockStack.push('while');
      } else if ((translated.startsWith('if ') || translated.startsWith('if(') || translated.startsWith('se ') || translated.startsWith('se(')) && translated.endsWith(':')) {
        console.log('DEBUG: Processing IF/SE', translated);
        let cond = '';
        if (translated.startsWith('if(')) {
          cond = translated.substring(2, translated.length - 1);
        } else if (translated.startsWith('if ')) {
          cond = translated.substring(3, translated.length - 1);
        } else if (translated.startsWith('se(')) {
          cond = translated.substring(2, translated.length - 1);
        } else {
          cond = translated.substring(3, translated.length - 1);
        }
        translated = `if (${translateExpression(cond.trim())}) {`;
        currentIndent = indent + 4;
        blockStack.push('if');
      } else if ((translated.startsWith('elif ') || translated.startsWith('elif(')) && translated.endsWith(':')) {
        const cond = translated.startsWith('elif(') ? translated.substring(4, translated.length - 1) : translated.substring(5, translated.length - 1);
        translated = `else if (${translateExpression(cond.trim())}) {`;
        currentIndent = indent + 4;
        blockStack.push('if');
      } else if (translated === 'else:') {
        translated = 'else {';
        currentIndent = indent + 4;
        blockStack.push('if');
      } else if (translated.startsWith('async def ') && translated.endsWith(':')) {
        const funcHeader = translated.substring(10, translated.length - 1);
        translated = `async function ${funcHeader} {`;
        currentIndent = indent + 4;
        blockStack.push('def');
      } else if (translated.startsWith('def ') && translated.endsWith(':')) {
        const funcHeader = translated.substring(4, translated.length - 1);
        translated = `function ${funcHeader} {`;
        currentIndent = indent + 4;
        blockStack.push('def');
      } else if (translated.startsWith('for ') && translated.endsWith(':')) {
        const forRangeMatch = translated.match(/^for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+range\((.*)\)\s*:$/);
        if (forRangeMatch) {
          const varName = forRangeMatch[1];
          const rangeArgsStr = forRangeMatch[2].trim();
          const args = rangeArgsStr.split(',').map(a => a.trim());
          let start = '0';
          let stop = '0';
          let step = '1';
          if (args.length === 1) {
            stop = translateExpression(args[0]);
          } else if (args.length === 2) {
            start = translateExpression(args[0]);
            stop = translateExpression(args[1]);
          } else if (args.length === 3) {
            start = translateExpression(args[0]);
            stop = translateExpression(args[1]);
            step = translateExpression(args[2]);
          }
          const isNegativeStep = step.startsWith('-') || parseInt(step) < 0;
          const cmp = isNegativeStep ? '>' : '<';
          const increment = step === '1' ? `${varName}++` : (step === '-1' ? `${varName}--` : `${varName} += ${step}`);
          translated = `for (let ${varName} = ${start}; ${varName} ${cmp} ${stop}; ${increment}) {`;
          currentIndent = indent + 4;
          blockStack.push('for');
        } else {
          const forInMatch = translated.match(/^for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+(.*)\s*:$/);
          if (forInMatch) {
            const varName = forInMatch[1];
            const iterable = translateExpression(forInMatch[2].trim());
            translated = `for (let ${varName} of ${iterable}) {`;
            currentIndent = indent + 4;
            blockStack.push('for');
          }
        }
      } else if (translated === 'try:') {
        translated = 'try {';
        currentIndent = indent + 4;
        blockStack.push('try');
      } else if (translated.startsWith('except') && translated.endsWith(':')) {
        translated = 'catch (e) {';
        currentIndent = indent + 4;
        blockStack.push('except');
      } else if (translated === 'finally:') {
        translated = 'finally {';
        currentIndent = indent + 4;
        blockStack.push('except');
      } else if (translated.startsWith('try: ')) {
        const stmt = translated.substring(5).trim();
        translated = `try { ${translateStatement(stmt)}`;
        currentIndent = indent + 4;
        blockStack.push('try');
      } else if (translated.startsWith('except:')) {
        const stmt = translated.substring(7).trim();
        const jsStmt = stmt === 'pass' ? '' : translateStatement(stmt);
        translated = `catch (e) { ${jsStmt} }`;
        // One-liner except doesn't change currentIndent, so no push needed
      } else if (translated.startsWith('except ') && !translated.endsWith(':')) {
        const colonIndex = translated.indexOf(':');
        if (colonIndex !== -1) {
          const stmt = translated.substring(colonIndex + 1).trim();
          const jsStmt = stmt === 'pass' ? '' : translateStatement(stmt);
          translated = `catch (e) { ${jsStmt} }`;
          // One-liner except doesn't change currentIndent, so no push needed
        }
      } else if (translated === 'pass') {
        translated = '// pass';
      } else if (translated.startsWith('global ')) {
        translated = '// global ' + translated.substring(7);
      } else if (translated.startsWith('import ') || translated.startsWith('from ')) {
        translated = '// ' + translated;
      } else if (translated.startsWith('raise ')) {
        translated = 'throw new Error(String(' + translated.substring(6) + '));';
      } else {
        translated = translateStatement(translated);
      }
      
      jsCode += ' '.repeat(indent) + translated + (lineComment ? ' ' + lineComment.replace('#', '//') : '') + '\n';
    }
    
    while (currentIndent > 0) {
      const blockType = blockStack.pop();
      if (blockType === 'try') {
        jsCode += ' '.repeat(Math.max(0, currentIndent - 4)) + '} catch (e) {}\n';
      } else if (blockType === 'while') {
        jsCode += ' '.repeat(currentIndent) + 'await sleep(10);\n';
        jsCode += ' '.repeat(Math.max(0, currentIndent - 4)) + '}\n';
      } else {
        jsCode += ' '.repeat(Math.max(0, currentIndent - 4)) + '}\n';
      }
      currentIndent -= 4;
    }
    
    console.log("Transpiled JS code:\n", jsCode);
    return jsCode;
  };
