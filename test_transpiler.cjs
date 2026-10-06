const transpilePythonToJs = (pythonCode) => {
  // 1. Rimuove indentazione iniziale comune
  const stripCommonIndent = (codeStr) => {
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
    if (minIndent === Infinity || minIndent === 0) return codeStr;
    return lines.map(line => {
      if (line.trim().length === 0) return '';
      return line.substring(Math.min(minIndent, line.length - line.trimStart().length));
    }).join('\n');
  };

  const strippedPython = stripCommonIndent(pythonCode);

  // 2. Sostituzioni Espressioni Python Base
  const translateExpression = (expr) => {
    let e = expr;
    
    e = e.replace(/\bnot\b/g, '!');
    e = e.replace(/\band\b/g, '&&');
    e = e.replace(/\bor\b/g, '||');
    e = e.replace(/\bTrue\b/g, 'true');
    e = e.replace(/\bFalse\b/g, 'false');
    e = e.replace(/\bNone\b/g, 'null');
    
    e = e.replace(/\bint\(/g, 'py_int(');
    e = e.replace(/\bfloat\(/g, 'py_float(');
    e = e.replace(/\bstr\(/g, 'py_str(');
    e = e.replace(/\blen\(/g, 'py_len(');
    e = e.replace(/\babs\(/g, 'py_abs(');
    e = e.replace(/\bround\(/g, 'py_round(');
    e = e.replace(/\bmin\(/g, 'py_min(');
    e = e.replace(/\bmax\(/g, 'py_max(');
    
    // Standard LEGO Spike sensor calls
    e = e.replace(/color_sensor\.color\(\s*port\.([a-zA-Z0-9_]+)\s*\)/g, 'getColor("$1")');
    e = e.replace(/color_sensor\.reflection\(\s*port\.([a-zA-Z0-9_]+)\s*\)/g, 'getReflection("$1")');
    e = e.replace(/distance_sensor\.distance\(\s*port\.([a-zA-Z0-9_]+)\s*\)/g, 'getDistance("$1")');
    e = e.replace(/force_sensor\.force\(\s*port\.([a-zA-Z0-9_]+)\s*\)/g, 'getForce("$1")');
    
    // _safe_sensor wrapper calls
    e = e.replace(/_safe_sensor\(color_sensor\.color,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getColor("$1")');
    e = e.replace(/_safe_sensor\(color_sensor\.reflection,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getReflection("$1")');
    e = e.replace(/_safe_sensor\(distance_sensor\.distance,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getDistance("$1")');
    e = e.replace(/_safe_sensor\(force_sensor\.force,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getForce("$1")');
    e = e.replace(/_safe_sensor\(motion_sensor\.yaw_angle\)/g, 'getYaw()');
    e = e.replace(/_safe_sensor\(motion_sensor\.pitch_angle\)/g, 'getPitch()');
    e = e.replace(/_safe_sensor\(motion_sensor\.roll_angle\)/g, 'getRoll()');
    
    // Replace button ternary pattern with false
    e = e.replace(/\(button\.pressed\(button\.([A-Z_]+)\)\s+if\s+hasattr\(button,\s+'\1'\)\s+else\s+\(button\.([a-z_]+)\.is_pressed\(\)\s+if\s+hasattr\(button,\s+'\2'\)\s+else\s+False\)\)/gi, 'false');
    
    // Support isinstance translations to typeof/isArray checks
    e = e.replace(/\bisinstance\(([^,]+),\s*Number\)/g, "typeof $1 === 'number'");
    e = e.replace(/\bisinstance\(([^,]+),\s*str\)/g, "typeof $1 === 'string'");
    e = e.replace(/\bisinstance\(([^,]+),\s*list\)/g, "Array.isArray($1)");
    e = e.replace(/\bisinstance\(([^,]+),\s*dict\)/g, "(typeof $1 === 'object' && $1 !== null)");
    e = e.replace(/\bisinstance\(([^,]+),\s*bool\)/g, "typeof $1 === 'boolean'");

    // Generic Python ternary replacement: expr1 if cond else expr2 -> (cond ? expr1 : expr2)
    let prev;
    do {
      prev = e;
      e = e.replace(/\b([a-zA-Z0-9_.\(\)\[\]'"]+)\s+if\s+([a-zA-Z0-9_.\(\)\[\]!=<>, '"&|!]+)\s+else\s+([a-zA-Z0-9_.\(\)\[\]'"]+)\b/g, '($2 ? $1 : $3)');
    } while (e !== prev);
    
    // Gyro/tilt angles standard calls
    e = e.replace(/motion_sensor\.tilt_angles\(\)\[0\]/g, '(getYaw() * 10)');
    e = e.replace(/motion_sensor\.tilt_angles\(\)\[1\]/g, '(getPitch() * 10)');
    e = e.replace(/motion_sensor\.tilt_angles\(\)\[2\]/g, '(getRoll() * 10)');
    
    // Replace Python int and float with safe non-reserved JS parameter names
    e = e.replace(/\bint\b/g, 'py_int');
    e = e.replace(/\bfloat\b/g, 'py_float');
    
    return e;
  };

  // 3. Sostituzioni Statements Base
  const translateStatement = (stmt) => {
    let s = stmt;
    
    // replace sleep/delays (standard and internal)
    s = s.replace(/await\s+runloop\.sleep_ms\((.*?)\)/g, 'await sleep($1)');
    s = s.replace(/await\s+custom_sleep\((.*?)\)/g, 'await sleep($1)');
    
    // replace drive pairs (standard & simulator-internal)
    s = s.replace(/await\s+_drive_pair_for_degrees\((.*?),\s*(.*?),\s*(.*?)\)/g, 'await drivePairForDegrees($1, $2, $3)');
    s = s.replace(/_drive_pair_for_degrees\((.*?),\s*(.*?),\s*(.*?)\)/g, 'drivePairForDegrees($1, $2, $3)');
    s = s.replace(/await\s+_drive_pair\((.*?),\s*(.*?)\)/g, 'await drivePair($1, $2)');
    s = s.replace(/_drive_pair\((.*?),\s*(.*?)\)/g, 'drivePair($1, $2)');
    s = s.replace(/_stop_pair\(\)/g, 'stopPair()');
    
    // replace light matrix (standard & simulator-internal)
    s = s.replace(/light_matrix\.write\((.*?)\)/g, 'writeLightMatrix($1)');
    s = s.replace(/_write_light_matrix\((.*?)\)/g, 'writeLightMatrix($1)');
    s = s.replace(/light_matrix\.clear\(\)/g, 'clearLightMatrix()');
    s = s.replace(/_clear_light_matrix\(\)/g, 'clearLightMatrix()');
    s = s.replace(/light_matrix\.show_image\(light_matrix\.(.*?)\)/g, 'showImageLightMatrix("$1")');
    s = s.replace(/_show_image_light_matrix\((.*?)\)/g, 'showImageLightMatrix($1)');
    
    // replace sounds (standard & simulator-internal)
    s = s.replace(/sound\.beep\((.*?),\s*(.*?)\)/g, 'playNote($1, $2)');
    s = s.replace(/sound\.beep\(\)/g, 'beep()');
    s = s.replace(/_play_note\((.*?),\s*(.*?)\)/g, 'playNote($1, $2)');
    s = s.replace(/_beep\(\)/g, 'beep()');
    
    // replace motor controllers (standard & simulator-internal)
    s = s.replace(/await\s+motor\.run_for_degrees\(port\.(.*?),\s*(.*?),\s*(.*?)\)/g, 'await runMotorForDegrees("$1", $2, $3)');
    s = s.replace(/motor\.run\(port\.(.*?),\s*(.*?)\)/g, 'runMotor("$1", $2)');
    s = s.replace(/motor\.stop\(port\.(.*?)\)/g, 'stopMotor("$1")');
    
    s = s.replace(/_run_motor_for_degrees\((.*?),\s*(.*?),\s*(.*?)\)/g, 'runMotorForDegrees($1, $2, $3)');
    s = s.replace(/_run_motor\((.*?),\s*(.*?)\)/g, 'runMotor($1, $2)');
    s = s.replace(/_stop_motor\((.*?)\)/g, 'stopMotor($1)');
    
    // replace motion/gyro (standard & simulator-internal)
    s = s.replace(/motion_sensor\.reset_yaw\((.*?)\)/g, 'resetYaw($1)');
    s = s.replace(/_reset_yaw\((.*?)\)/g, 'resetYaw($1)');
    
    // print statement
    s = s.replace(/print\((.*?)\)/g, 'print($1)');

    // SAFE ASSIGNMENT CHECK
    const assignmentMatch = s.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^=].*)$/);
    if (assignmentMatch) {
      const lhs = assignmentMatch[1].trim();
      const rhs = assignmentMatch[2].trim();
      s = `${lhs} = ${translateExpression(rhs)}`;
    } else {
      s = translateExpression(s);
    }

    return s + (s.endsWith('}') || s.endsWith('{') ? '' : ';');
  };

  let jsCode = '';
  const blockStack = [];
  const varRegex = /^[ \t]*([a-zA-Z_][a-zA-Z0-9_]*)\s*=[^=]/;
  const declaredVars = new Set();
  const lines = strippedPython.split('\n');
  for (const line of lines) {
    const match = line.match(varRegex);
    if (match) {
      declaredVars.add(match[1]);
    }
  }
  const declarations = Array.from(declaredVars).map(v => `let ${v} = 0;`).join('\n') + (declaredVars.size > 0 ? '\n' : '');
  jsCode += declarations;

  for (let i = 0; i < lines.length; i++) {
    const origLine = lines[i];
    const trimmed = origLine.trim();
    
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    
    const indent = origLine.length - origLine.trimStart().length;
    
    while (blockStack.length > 0) {
      const topBlock = blockStack[blockStack.length - 1];
      if (indent <= topBlock.indent) {
         const blockType = topBlock.type;
         const blockIndent = topBlock.indent;
         blockStack.pop();
         
         if (blockType === 'try') {
             if (indent === blockIndent && (trimmed.startsWith('except') || trimmed.startsWith('finally'))) {
                 jsCode += ' '.repeat(blockIndent) + '}\n';
             } else {
                 jsCode += ' '.repeat(blockIndent) + '} catch (e) {}\n';
             }
         } else if (blockType === 'while') {
             jsCode += ' '.repeat(blockIndent + 4) + 'await sleep(10);\n';
             jsCode += ' '.repeat(blockIndent) + '}\n';
         } else {
             jsCode += ' '.repeat(blockIndent) + '}\n';
         }
      } else {
         break;
      }
    }
    
    let translated = trimmed;
    let lineComment = '';
    const hashIndex = translated.indexOf('#');
    if (hashIndex !== -1) {
      lineComment = translated.substring(hashIndex);
      translated = translated.substring(0, hashIndex).trim();
    }
    
    if (translated === 'while True:') {
      translated = 'while (true) {';
      blockStack.push({ type: 'while', indent: indent });
    } else if ((translated.startsWith('while ') || translated.startsWith('while(')) && translated.endsWith(':')) {
      const cond = translated.startsWith('while(') ? translated.substring(5, translated.length - 1) : translated.substring(6, translated.length - 1);
      translated = `while (${translateExpression(cond.trim())}) {`;
      blockStack.push({ type: 'while', indent: indent });
    } else if ((translated.startsWith('if ') || translated.startsWith('if(') || translated.startsWith('se ') || translated.startsWith('se(')) && translated.endsWith(':')) {
      let cond = '';
      if (translated.startsWith('if(')) cond = translated.substring(2, translated.length - 1);
      else if (translated.startsWith('if ')) cond = translated.substring(3, translated.length - 1);
      else if (translated.startsWith('se(')) cond = translated.substring(2, translated.length - 1);
      else cond = translated.substring(3, translated.length - 1);
      translated = `if (${translateExpression(cond.trim())}) {`;
      blockStack.push({ type: 'if', indent: indent });
    } else if ((translated.startsWith('elif ') || translated.startsWith('elif(')) && translated.endsWith(':')) {
      const cond = translated.startsWith('elif(') ? translated.substring(4, translated.length - 1) : translated.substring(5, translated.length - 1);
      translated = `else if (${translateExpression(cond.trim())}) {`;
      blockStack.push({ type: 'if', indent: indent });
    } else if (translated === 'else:') {
      translated = 'else {';
      blockStack.push({ type: 'if', indent: indent });
    } else if (translated.startsWith('async def ') && translated.endsWith(':')) {
      const funcHeader = translated.substring(10, translated.length - 1);
      translated = `async function ${funcHeader} {`;
      blockStack.push({ type: 'def', indent: indent });
    } else if (translated.startsWith('def ') && translated.endsWith(':')) {
      const funcHeader = translated.substring(4, translated.length - 1);
      translated = `function ${funcHeader} {`;
      blockStack.push({ type: 'def', indent: indent });
    } else if (translated.startsWith('for ') && translated.endsWith(':')) {
      const forRangeMatch = translated.match(/^for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+range\((.*)\)\s*:$/);
      if (forRangeMatch) {
        const varName = forRangeMatch[1];
        const rangeArgsStr = forRangeMatch[2].trim();
        const args = rangeArgsStr.split(',').map(a => a.trim());
        let start = '0', stop = '0', step = '1';
        if (args.length === 1) stop = translateExpression(args[0]);
        else if (args.length === 2) { start = translateExpression(args[0]); stop = translateExpression(args[1]); }
        else if (args.length === 3) { start = translateExpression(args[0]); stop = translateExpression(args[1]); step = translateExpression(args[2]); }
        const isNegativeStep = step.startsWith('-') || parseInt(step) < 0;
        const cmp = isNegativeStep ? '>' : '<';
        const increment = step === '1' ? `${varName}++` : (step === '-1' ? `${varName}--` : `${varName} += ${step}`);
        translated = `for (let ${varName} = ${start}; ${varName} ${cmp} ${stop}; ${increment}) {`;
      } else {
        const forInMatch = translated.match(/^for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+(.*)\s*:$/);
        if (forInMatch) {
          const varName = forInMatch[1];
          const iterable = translateExpression(forInMatch[2].trim());
          translated = `for (let ${varName} of ${iterable}) {`;
        }
      }
      blockStack.push({ type: 'for', indent: indent });
    } else if (translated === 'try:') {
      translated = 'try {';
      blockStack.push({ type: 'try', indent: indent });
    } else if (translated.startsWith('except') && translated.endsWith(':')) {
      translated = 'catch (e) {';
      blockStack.push({ type: 'except', indent: indent });
    } else if (translated === 'finally:') {
      translated = 'finally {';
      blockStack.push({ type: 'finally', indent: indent });
    } else if (translated.startsWith('try: ')) {
      const stmt = translated.substring(5).trim();
      translated = `try { ${translateStatement(stmt)}`;
      blockStack.push({ type: 'try', indent: indent });
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
  
  while (blockStack.length > 0) {
    const topBlock = blockStack.pop();
    if (!topBlock) break;
    const { type: blockType, indent: blockIndent } = topBlock;
    
    if (blockType === 'try') {
      jsCode += ' '.repeat(blockIndent) + '} catch (e) {}\n';
    } else if (blockType === 'while') {
      jsCode += ' '.repeat(blockIndent + 4) + 'await sleep(10);\n';
      jsCode += ' '.repeat(blockIndent) + '}\n';
    } else {
      jsCode += ' '.repeat(blockIndent) + '}\n';
    }
  }
  
  return jsCode;
};

// ---------------- TEST CASES ----------------
const testCases = [
  // Test case 1: Standard while not wait loop
  `while not (abs(int(motion_sensor.tilt_angles()[0] / 10)) <= int(90)):
    await runloop.sleep_ms(10)`,

  // Test case 2: If statement
  `if abs(int(motion_sensor.tilt_angles()[0] / 10)) <= int(90):
    print("yes")`,

  // Test case 3: Nested loops and ifs
  `while True:
    if abs(int(motion_sensor.tilt_angles()[0] / 10)) <= int(90):
        print("nested")`
];

for (const [index, testCode] of testCases.entries()) {
  console.log(`\n=== TEST ${index + 1} ===`);
  const result = transpilePythonToJs(testCode);
  console.log("Transpiled JS:\n", result);
  try {
    new Function('sleep', 'getYaw', 'getPitch', 'getRoll', 'print', 'py_int', 'py_abs', result);
    console.log("-> SYNTAX CHECK PASSED ✅");
  } catch (err) {
    console.error("-> SYNTAX ERROR ❌:", err.message);
  }
}

module.exports = { transpilePythonToJs };
