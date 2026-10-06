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
  
  return e;
};

const tests = [
  "not (not (_safe_sensor(force_sensor.force, port.E, 0) > 0))",
];

for (const t of tests) {
  console.log("INPUT: ", t);
  console.log("OUTPUT:", translateExpression(t));
  console.log("---");
}
