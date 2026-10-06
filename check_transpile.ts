import fs from 'fs';

// Extract the transpiler function from VirtualEnvironment.tsx dynamically or replicate it
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

  const translateExpression = (expr: string): string => {
    let e = expr;
    e = e.replace(/\bTrue\b/g, 'true');
    e = e.replace(/\bFalse\b/g, 'false');
    e = e.replace(/\band\b/g, '&&');
    e = e.replace(/\bor\b/g, '||');
    e = e.replace(/\bnot\b/g, '!');
    
    e = e.replace(/color_sensor\.color\(port\.(.*?)\)/g, 'getColor("$1")');
    e = e.replace(/color_sensor\.reflection\(port\.(.*?)\)/g, 'getReflection("$1")');
    e = e.replace(/distance_sensor\.distance\(port\.(.*?)\)/g, 'getDistance("$1")');
    e = e.replace(/force_sensor\.force\(port\.(.*?)\)/g, 'getForce("$1")');
    
    e = e.replace(/_safe_sensor\(color_sensor\.color,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getColor("$1")');
    e = e.replace(/_safe_sensor\(color_sensor\.reflection,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getReflection("$1")');
    e = e.replace(/_safe_sensor\(distance_sensor\.distance,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getDistance("$1")');
    e = e.replace(/_safe_sensor\(force_sensor\.force,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getForce("$1")');
    
    e = e.replace(/motion_sensor\.tilt_angles\(\)\[0\]/g, 'getYaw()');
    e = e.replace(/motion_sensor\.tilt_angles\(\)\[1\]/g, 'getPitch()');
    e = e.replace(/motion_sensor\.tilt_angles\(\)\[2\]/g, 'getRoll()');
    
    e = e.replace(/len\((.*?)\)/g, 'String($1).length');
    e = e.replace(/str\((.*?)\)/g, 'String($1)');
    
    return e;
  };

  const translateStatement = (stmt: string): string => {
    let s = stmt;
    
    // replace sleep/delays
    s = s.replace(/await\s+runloop\.sleep_ms\((.*?)\)/g, 'await sleep($1)');
    s = s.replace(/await\s+custom_sleep\((.*?)\)/g, 'await sleep($1)');
    
    // replace drive pairs
    s = s.replace(/_drive_pair\((.*?),\s*(.*?)\)/g, 'drivePair($1, $2)');
    s = s.replace(/await\s+_drive_pair_for_degrees\((.*?),\s*(.*?),\s*(.*?)\)/g, 'await drivePairForDegrees($1, $2, $3)');
    s = s.replace(/_stop_pair\(\)/g, 'stopPair()');
    
    // replace light matrix
    s = s.replace(/light_matrix\.write\((.*?)\)/g, 'writeLightMatrix($1)');
    s = s.replace(/light_matrix\.clear\(\)/g, 'clearLightMatrix()');
    s = s.replace(/light_matrix\.show_image\(light_matrix\.(.*?)\)/g, 'showImageLightMatrix("$1")');
    
    // replace sounds
    s = s.replace(/sound\.beep\((.*?),\s*(.*?)\)/g, 'playNote($1, $2)');
    s = s.replace(/sound\.beep\(\)/g, 'beep()');
    
    // replace motor controllers
    s = s.replace(/motor\.run\(port\.(.*?),\s*(.*?)\)/g, 'runMotor("$1", $2)');
    s = s.replace(/motor\.stop\(port\.(.*?)\)/g, 'stopMotor("$1")');
    s = s.replace(/await\s+motor\.run_for_degrees\(port\.(.*?),\s*(.*?),\s*(.*?)\)/g, 'await runMotorForDegrees("$1", $2, $3)');
    
    // replace motion/gyro
    s = s.replace(/motion_sensor\.reset_yaw\((.*?)\)/g, 'resetYaw($1)');
    
    // replace sensor calls
    s = s.replace(/_safe_sensor\(color_sensor\.color,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getColor("$1")');
    s = s.replace(/_safe_sensor\(color_sensor\.reflection,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getReflection("$1")');
    s = s.replace(/_safe_sensor\(distance_sensor\.distance,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getDistance("$1")');
    s = s.replace(/_safe_sensor\(force_sensor\.force,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getForce("$1")');
    
    // print statement
    s = s.replace(/print\((.*?)\)/g, 'print($1)');

    if (s.includes('=')) {
      const parts = s.split('=');
      const lhs = parts[0].trim();
      const rhs = parts.slice(1).join('=').trim();
      s = `${lhs} = ${translateExpression(rhs)}`;
    } else {
      s = translateExpression(s);
    }
    
    return s;
  };

  const normalizedPython = stripCommonIndent(pythonCode);
  let lines = normalizedPython.split('\n');
  let jsCode = '';
  let currentIndent = 0;
  let blockStack: string[] = [];
  
  // Extract variables
  const varMatches = normalizedPython.match(/^[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*/gm);
  const declaredVars = new Set<string>();
  if (varMatches) {
    varMatches.forEach(m => {
      const name = m.split('=')[0].trim();
      if (!['global', 'import', 'from', 'pass', 'return', 'if', 'while', 'elif', 'else', 'try', 'except'].includes(name)) {
        declaredVars.add(name);
      }
    });
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
      let hasExceptFollowing = false;
      // Look ahead for except/finally
      for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();
          if (nextLine && !nextLine.startsWith('#')) {
            if (nextLine.startsWith('except') || nextLine.startsWith('finally')) {
              hasExceptFollowing = true;
            }
            break;
          }
      }
      
      const blockType = blockStack.pop();
      if (blockType === 'try' && !hasExceptFollowing) {
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
    } else if (translated.startsWith('while ') && translated.endsWith(':')) {
      const cond = translated.substring(6, translated.length - 1);
      translated = `while (${translateExpression(cond)}) {`;
      currentIndent = indent + 4;
      blockStack.push('while');
    } else if (translated.startsWith('if ') && translated.endsWith(':') || (translated.startsWith('se ') && translated.endsWith(':'))) {
      const cond = translated.startsWith('if ') ? translated.substring(3, translated.length - 1) : translated.substring(3, translated.length - 1);
      translated = `if (${translateExpression(cond)}) {`;
      currentIndent = indent + 4;
      blockStack.push('if');
    } else if (translated.startsWith('elif ') && translated.endsWith(':')) {
      const cond = translated.substring(5, translated.length - 1);
      translated = `else if (${translateExpression(cond)}) {`;
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
      translated = '} catch (e) {';
      currentIndent = indent + 4;
    } else if (translated === 'finally:') {
      translated = '} finally {';
      currentIndent = indent + 4;
    } else if (translated.startsWith('try: ')) {
      const stmt = translated.substring(5).trim();
      translated = `try { ${translateStatement(stmt)}`;
      currentIndent = indent + 4;
      blockStack.push('try');
    } else if (translated.startsWith('except:')) {
      const stmt = translated.substring(7).trim();
      const jsStmt = stmt === 'pass' ? '' : translateStatement(stmt);
      translated = `catch (e) { ${jsStmt} }`;
    } else if (translated.startsWith('except ') && !translated.endsWith(':')) {
      const colonIndex = translated.indexOf(':');
      if (colonIndex !== -1) {
        const stmt = translated.substring(colonIndex + 1).trim();
        const jsStmt = stmt === 'pass' ? '' : translateStatement(stmt);
        translated = `catch (e) { ${jsStmt} }`;
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
    if (blockType === 'while') {
      jsCode += ' '.repeat(currentIndent) + 'await sleep(10);\n';
    }
    jsCode += ' '.repeat(Math.max(0, currentIndent - 4)) + '}\n';
    currentIndent -= 4;
  }
  
  return jsCode;
};

const pythonCode = `    while True:
        if 0 == 0:
            await _drive_pair_for_degrees(int(float(10) * 11.5 / 5.6), int(0), int(int(float(50) * 1000 / 100)))`;

console.log("=== TRANSPILATION RESULT ===");
console.log(transpilePythonToJs(pythonCode));
