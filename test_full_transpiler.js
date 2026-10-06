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

const translateNot = (str) => {
  let result = '';
  let i = 0;
  while (i < str.length) {
    const remainingFromI = str.substring(i);
    const matchNot = /^not\b/.test(remainingFromI);
    
    if (matchNot && (i === 0 || /\W/.test(str[i - 1]))) {
      let opStart = i + 3;
      while (opStart < str.length && /\s/.test(str[opStart])) {
        opStart++;
      }
      
      let parenDepth = 0;
      let opEnd = opStart;
      while (opEnd < str.length) {
        const char = str[opEnd];
        if (char === '(') {
          parenDepth++;
        } else if (char === ')') {
          if (parenDepth === 0) {
            break;
          }
          parenDepth--;
        } else if (parenDepth === 0) {
          const remaining = str.substring(opEnd);
          const prevChar = opEnd > 0 ? str[opEnd - 1] : '';
          const isPrevWordChar = /[a-zA-Z0-9_]/.test(prevChar);
          if (!isPrevWordChar && /^(and\b|or\b)/.test(remaining)) {
            break;
          }
        }
        opEnd++;
      }
      
      const operand = str.substring(opStart, opEnd);
      const translatedOperand = translateNot(operand);
      result += `!(${translatedOperand})`;
      i = opEnd;
    } else {
      result += str[i];
      i++;
    }
  }
  return result;
};

const translateExpression = (expr) => {
  let e = expr;
  
  e = translateNot(e);
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
  e = e.replace(/\bisinstance\(([^,]+),\s*\(int,\s*float\)\)/g, "typeof $1 === 'number'");
  e = e.replace(/\bisinstance\(([^,]+),\s*str\)/g, "typeof $1 === 'string'");
  e = e.replace(/\bisinstance\(([^,]+),\s*list\)/g, "Array.isArray($1)");
  e = e.replace(/\bisinstance\(([^,]+),\s*dict\)/g, "(typeof $1 === 'object' && $1 !== null)");
  e = e.replace(/\bisinstance\(([^,]+),\s*bool\)/g, "typeof $1 === 'boolean'");

  // Generic Python ternary replacement
  let prev;
  do {
    prev = e;
    e = e.replace(/\b([a-zA-Z0-9_.\(\)\[\]'"]+)\s+if\s+([a-zA-Z0-9_.\(\)\[\]!=<>, '"&|!]+)\s+else\s+([a-zA-Z0-9_.\(\)\[\]'"]+)\b/g, '($2 ? $1 : $3)');
  } while (e !== prev);
  
  return e;
};

const transpilePythonToJs = (pythonCode) => {
  const strippedPython = stripCommonIndent(pythonCode);
  let jsCode = '';
  const lines = strippedPython.split('\n');
  const blockStack = [];

  for (let i = 0; i < lines.length; i++) {
    const origLine = lines[i];
    const trimmed = origLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const indent = origLine.length - origLine.trimStart().length;
    while (blockStack.length > 0 && indent <= blockStack[blockStack.length - 1].indent) {
      blockStack.pop();
      jsCode += '}\n';
    }
    
    let translated = trimmed;
    if (translated === 'while True:') {
      translated = 'while (true) {';
      blockStack.push({ type: 'while', indent: indent });
    } else if ((translated.startsWith('while ') || translated.startsWith('while(')) && translated.endsWith(':')) {
      const cond = translated.startsWith('while(') ? translated.substring(5, translated.length - 1) : translated.substring(6, translated.length - 1);
      translated = `while (${translateExpression(cond.trim())}) {`;
      blockStack.push({ type: 'while', indent: indent });
    }
    jsCode += translated + '\n';
  }
  return jsCode;
};

const pythonCode = `
while not _safe_sensor(force_sensor.force, port.E, 0):
  pass
`;

console.log("TRANSPILLED:\n", transpilePythonToJs(pythonCode));
