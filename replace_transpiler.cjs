const fs = require('fs');

const file = 'src/components/VirtualEnvironment.tsx';
const content = fs.readFileSync(file, 'utf8');

const startPattern = '  const transpilePythonToJs = (pythonCode: string) => {';
const endPattern = '  const translateStatement = (stmt: string): string => {';

const startIndex = content.indexOf(startPattern);
const endIndex = content.indexOf(endPattern, startIndex);

if (startIndex === -1 || endIndex === -1) {
  console.error("Could not find start or end index", startIndex, endIndex);
  process.exit(1);
}

// Ensure we get the correct ending string
const oldFunctionStr = content.substring(startIndex, endIndex);
const lastClosingBraceIndex = oldFunctionStr.lastIndexOf('};');
if (lastClosingBraceIndex === -1) {
  console.error("Could not find };");
  process.exit(1);
}

const functionToReplace = oldFunctionStr.substring(0, lastClosingBraceIndex + 2);

const newFunction = `  const transpilePythonToJs = (pythonCode: string) => {
    // 1. Rimuove indentazione iniziale comune
    const stripCommonIndent = (codeStr: string): string => {
      const lines = codeStr.split('\\n');
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
      }).join('\\n');
    };

    const strippedPython = stripCommonIndent(pythonCode);

    // 2. Sostituzioni Espressioni Python Base
    const translateExpression = (expr: string): string => {
      let e = expr;
      e = e.replace(/\\bnot\\b/g, '!');
      e = e.replace(/\\band\\b/g, '&&');
      e = e.replace(/\\bor\\b/g, '||');
      e = e.replace(/\\bTrue\\b/g, 'true');
      e = e.replace(/\\bFalse\\b/g, 'false');
      e = e.replace(/\\bNone\\b/g, 'null');
      
      e = e.replace(/\\bint\\(/g, 'py_int(');
      e = e.replace(/\\bfloat\\(/g, 'py_float(');
      e = e.replace(/\\bstr\\(/g, 'py_str(');
      e = e.replace(/\\blen\\(/g, 'py_len(');
      e = e.replace(/\\babs\\(/g, 'py_abs(');
      e = e.replace(/\\bround\\(/g, 'py_round(');
      e = e.replace(/\\bmin\\(/g, 'py_min(');
      e = e.replace(/\\bmax\\(/g, 'py_max(');
      
      e = e.replace(/_safe_sensor\\(color_sensor\\.color,\\s*port\\.([a-zA-Z0-9_]+)(?:,\\s*[^)]*)?\\)/g, 'getColor("$1")');
      e = e.replace(/_safe_sensor\\(color_sensor\\.reflection,\\s*port\\.([a-zA-Z0-9_]+)(?:,\\s*[^)]*)?\\)/g, 'getReflection("$1")');
      e = e.replace(/_safe_sensor\\(distance_sensor\\.distance,\\s*port\\.([a-zA-Z0-9_]+)(?:,\\s*[^)]*)?\\)/g, 'getDistance("$1")');
      e = e.replace(/_safe_sensor\\(force_sensor\\.force,\\s*port\\.([a-zA-Z0-9_]+)(?:,\\s*[^)]*)?\\)/g, 'getForce("$1")');
      e = e.replace(/_safe_sensor\\(motion_sensor\\.yaw_angle\\)/g, 'getYaw()');
      e = e.replace(/_safe_sensor\\(motion_sensor\\.pitch_angle\\)/g, 'getPitch()');
      e = e.replace(/_safe_sensor\\(motion_sensor\\.roll_angle\\)/g, 'getRoll()');
      
      return e;
    };

    // 3. Sostituzioni Statements Base
    const translateStatement = (stmt: string): string => {
      let s = stmt;
      if (s.startsWith('await _drive_pair_for_degrees(')) s = s.replace(/^await _drive_pair_for_degrees\\(/, 'await drivePairForDegrees(');
      else if (s.startsWith('await _drive_pair(')) s = s.replace(/^await _drive_pair\\(/, 'await drivePair(');
      else if (s.startsWith('_drive_pair(')) s = s.replace(/^_drive_pair\\(/, 'drivePair(');
      else if (s.startsWith('_stop_pair(')) s = s.replace(/^_stop_pair\\(/, 'stopPair(');
      else if (s.startsWith('_run_motor_for_degrees(')) s = s.replace(/^_run_motor_for_degrees\\(/, 'runMotorForDegrees(');
      else if (s.startsWith('_run_motor(')) s = s.replace(/^_run_motor\\(/, 'runMotor(');
      else if (s.startsWith('_stop_motor(')) s = s.replace(/^_stop_motor\\(/, 'stopMotor(');
      else if (s.startsWith('_write_light_matrix(')) s = s.replace(/^_write_light_matrix\\(/, 'writeLightMatrix(');
      else if (s.startsWith('_clear_light_matrix(')) s = s.replace(/^_clear_light_matrix\\(/, 'clearLightMatrix(');
      else if (s.startsWith('_show_image_light_matrix(')) s = s.replace(/^_show_image_light_matrix\\(/, 'showImageLightMatrix(');
      else if (s.startsWith('_play_note(')) s = s.replace(/^_play_note\\(/, 'playNote(');
      else if (s.startsWith('_beep(')) s = s.replace(/^_beep\\(/, 'beep(');
      else if (s.startsWith('_reset_yaw(')) s = s.replace(/^_reset_yaw\\(/, 'resetYaw(');

      return translateExpression(s) + (s.endsWith('}') || s.endsWith('{') ? '' : ';');
    };

    let jsCode = '';
    
    // Lo stack tiene traccia dei blocchi aperti
    const blockStack: { type: string, indent: number }[] = [];
    
    // 4. Scansione preliminare delle variabili per dichiarazione
    const varRegex = /^[ \\t]*([a-zA-Z_][a-zA-Z0-9_]*)\\s*=[^=]/;
    const declaredVars = new Set<string>();
    const lines = strippedPython.split('\\n');
    for (const line of lines) {
      const match = line.match(varRegex);
      if (match) {
        declaredVars.add(match[1]);
      }
    }
    const declarations = Array.from(declaredVars).map(v => \`let \${v} = 0;\`).join('\\n') + (declaredVars.size > 0 ? '\\n' : '');
    jsCode += declarations;

    // 5. Scansione del corpo linea per linea
    for (let i = 0; i < lines.length; i++) {
      const origLine = lines[i];
      const trimmed = origLine.trim();
      
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      
      const indent = origLine.length - origLine.trimStart().length;
      
      // Chiusura blocchi
      while (blockStack.length > 0) {
        const topBlock = blockStack[blockStack.length - 1];
        if (indent <= topBlock.indent) {
           const blockType = topBlock.type;
           const blockIndent = topBlock.indent;
           blockStack.pop();
           
           if (blockType === 'try') {
               if (indent === blockIndent && (trimmed.startsWith('except') || trimmed.startsWith('finally'))) {
                   jsCode += ' '.repeat(blockIndent) + '}\\n';
               } else {
                   jsCode += ' '.repeat(blockIndent) + '} catch (e) {}\\n';
               }
           } else if (blockType === 'while') {
               jsCode += ' '.repeat(blockIndent + 4) + 'await sleep(10);\\n';
               jsCode += ' '.repeat(blockIndent) + '}\\n';
           } else {
               jsCode += ' '.repeat(blockIndent) + '}\\n';
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
      
      // Control flows JS
      if (translated === 'while True:') {
        translated = 'while (true) {';
        blockStack.push({ type: 'while', indent: indent });
      } else if ((translated.startsWith('while ') || translated.startsWith('while(')) && translated.endsWith(':')) {
        const cond = translated.startsWith('while(') ? translated.substring(5, translated.length - 1) : translated.substring(6, translated.length - 1);
        translated = \`while (\${translateExpression(cond.trim())}) {\`;
        blockStack.push({ type: 'while', indent: indent });
      } else if ((translated.startsWith('if ') || translated.startsWith('if(') || translated.startsWith('se ') || translated.startsWith('se(')) && translated.endsWith(':')) {
        let cond = '';
        if (translated.startsWith('if(')) cond = translated.substring(2, translated.length - 1);
        else if (translated.startsWith('if ')) cond = translated.substring(3, translated.length - 1);
        else if (translated.startsWith('se(')) cond = translated.substring(2, translated.length - 1);
        else cond = translated.substring(3, translated.length - 1);
        translated = \`if (\${translateExpression(cond.trim())}) {\`;
        blockStack.push({ type: 'if', indent: indent });
      } else if ((translated.startsWith('elif ') || translated.startsWith('elif(')) && translated.endsWith(':')) {
        const cond = translated.startsWith('elif(') ? translated.substring(4, translated.length - 1) : translated.substring(5, translated.length - 1);
        translated = \`else if (\${translateExpression(cond.trim())}) {\`;
        blockStack.push({ type: 'if', indent: indent });
      } else if (translated === 'else:') {
        translated = 'else {';
        blockStack.push({ type: 'if', indent: indent });
      } else if (translated.startsWith('async def ') && translated.endsWith(':')) {
        const funcHeader = translated.substring(10, translated.length - 1);
        translated = \`async function \${funcHeader} {\`;
        blockStack.push({ type: 'def', indent: indent });
      } else if (translated.startsWith('def ') && translated.endsWith(':')) {
        const funcHeader = translated.substring(4, translated.length - 1);
        translated = \`function \${funcHeader} {\`;
        blockStack.push({ type: 'def', indent: indent });
      } else if (translated.startsWith('for ') && translated.endsWith(':')) {
        const forRangeMatch = translated.match(/^for\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s+in\\s+range\\((.*)\\)\\s*:$/);
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
          const increment = step === '1' ? \`\${varName}++\` : (step === '-1' ? \`\${varName}--\` : \`\${varName} += \${step}\`);
          translated = \`for (let \${varName} = \${start}; \${varName} \${cmp} \${stop}; \${increment}) {\`;
        } else {
          const forInMatch = translated.match(/^for\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s+in\\s+(.*)\\s*:$/);
          if (forInMatch) {
            const varName = forInMatch[1];
            const iterable = translateExpression(forInMatch[2].trim());
            translated = \`for (let \${varName} of \${iterable}) {\`;
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
        translated = \`try { \${translateStatement(stmt)}\`;
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
      
      jsCode += ' '.repeat(indent) + translated + (lineComment ? ' ' + lineComment.replace('#', '//') : '') + '\\n';
    }
    
    // 6. Svuota lo Stack residuo a fine file
    while (blockStack.length > 0) {
      const topBlock = blockStack.pop();
      if (!topBlock) break;
      const { type: blockType, indent: blockIndent } = topBlock;
      
      if (blockType === 'try') {
        jsCode += ' '.repeat(blockIndent) + '} catch (e) {}\\n';
      } else if (blockType === 'while') {
        jsCode += ' '.repeat(blockIndent + 4) + 'await sleep(10);\\n';
        jsCode += ' '.repeat(blockIndent) + '}\\n';
      } else {
        jsCode += ' '.repeat(blockIndent) + '}\\n';
      }
    }
    
    console.log("Transpiled JS code:\\n", jsCode);
    return jsCode;
  };`;

const newContent = content.replace(functionToReplace, newFunction);
fs.writeFileSync(file, newContent);
console.log('Replaced');
