export const transpilePythonToJsWrapper = (pythonCode: string) => {
const transpilePythonToJs = (pythonCode: string) => {
    // 1. Rimuove indentazione iniziale comune
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
      if (minIndent === Infinity || minIndent === 0) return codeStr;
      return lines.map(line => {
        if (line.trim().length === 0) return '';
        return line.substring(Math.min(minIndent, line.length - line.trimStart().length));
      }).join('\n');
    };

    const strippedPython = stripCommonIndent(pythonCode);

    // 2. Sostituzioni Espressioni Python Base
    const translateExpression = (expr: string): string => {
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
      
      e = e.replace(/_safe_sensor\(color_sensor\.color,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getColor("$1")');
      e = e.replace(/_safe_sensor\(color_sensor\.reflection,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getReflection("$1")');
      e = e.replace(/_safe_sensor\(distance_sensor\.distance,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getDistance("$1")');
      e = e.replace(/_safe_sensor\(force_sensor\.force,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getForce("$1")');
      e = e.replace(/_safe_sensor\(motion_sensor\.yaw_angle\)/g, 'getYaw()');
      e = e.replace(/_safe_sensor\(motion_sensor\.pitch_angle\)/g, 'getPitch()');
      e = e.replace(/_safe_sensor\(motion_sensor\.roll_angle\)/g, 'getRoll()');
      
      return e;
    };
return transpilePythonToJs(pythonCode);
}