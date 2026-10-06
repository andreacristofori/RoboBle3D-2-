export const transpilePythonToJsWrapper = (pythonCode: string) => {
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
        let hasExceptFollowing = trimmed.startsWith('except') || trimmed.startsWith('finally');
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
      } else if (translated === 'finally:') {
        translated = 'finally {';
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

    // SAFE ASSIGNMENT CHECK
    // Match only when there is a valid variable name on the LHS, followed by a single '=' which is NOT part of '==', '!=', '>=', '<='
    const assignmentMatch = s.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^=].*)$/);
    if (assignmentMatch) {
      const lhs = assignmentMatch[1].trim();
      const rhs = assignmentMatch[2].trim();
      s = `${lhs} = ${translateExpression(rhs)}`;
    } else {
      s = translateExpression(s);
    }
    
    return s;
  };

  const translateExpression = (expr: string): string => {
    let e = expr;
    e = e.replace(/\bTrue\b/g, 'true');
    e = e.replace(/\bFalse\b/g, 'false');
    e = e.replace(/\band\b/g, '&&');
    e = e.replace(/\bor\b/g, '||');
    e = e.replace(/\bnot\b/g, '!');
    
    e = e.replace(/color_sensor\.color\(\s*port\.([a-zA-Z0-9_]+)\s*\)/g, 'getColor("$1")');
    e = e.replace(/color_sensor\.reflection\(\s*port\.([a-zA-Z0-9_]+)\s*\)/g, 'getReflection("$1")');
    e = e.replace(/distance_sensor\.distance\(\s*port\.([a-zA-Z0-9_]+)\s*\)/g, 'getDistance("$1")');
    e = e.replace(/force_sensor\.force\(\s*port\.([a-zA-Z0-9_]+)\s*\)/g, 'getForce("$1")');
    
    e = e.replace(/_safe_sensor\(color_sensor\.color,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getColor("$1")');
    e = e.replace(/_safe_sensor\(color_sensor\.reflection,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getReflection("$1")');
    e = e.replace(/_safe_sensor\(distance_sensor\.distance,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getDistance("$1")');
    e = e.replace(/_safe_sensor\(force_sensor\.force,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getForce("$1")');
    
    e = e.replace(/motion_sensor\.tilt_angles\(\)\[0\]/g, 'getYaw()');
    e = e.replace(/motion_sensor\.tilt_angles\(\)\[1\]/g, 'getPitch()');
    e = e.replace(/motion_sensor\.tilt_angles\(\)\[2\]/g, 'getRoll()');
    
    e = e.replace(/len\((.*?)\)/g, 'String($1).length');
    e = e.replace(/str\((.*?)\)/g, 'String($1)');
    
    // Replace Python int and float with safe non-reserved JS parameter names
    e = e.replace(/\bint\b/g, 'py_int');
    e = e.replace(/\bfloat\b/g, 'py_float');
    
    return e;
  };

  // Extract user code block between lego templates
  const extractUserCode = (fullCode: string) => {
    const startMarker = '# === START_BLOCKLY_CODE ===';
    const endMarker = '# === END_BLOCKLY_CODE ===';
    const startIndex = fullCode.indexOf(startMarker);
    const endIndex = fullCode.indexOf(endMarker);
    
    if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
      return fullCode.substring(startIndex + startMarker.length, endIndex).trim();
    }
    return fullCode;
  };

  // Run the code in the simulator
  const runSimulationCode = async () => {
    // Clear trail when starting code execution
    if (robotRef.current) {
      robotRef.current.trail = [];
    }

    if (isRunningCode) {
      stopSimulationCode();
      await new Promise(r => setTimeout(r, 150));
    }

    setConsoleLogs([]);
    const userBlock = extractUserCode(code);
    if (!userBlock || userBlock.length === 0) {
      setConsoleLogs(['[Simulatore] Nessun codice utente da eseguire. Crea dei blocchi prima.']);
      return;
    }

    const jsCode = transpilePythonToJs(userBlock);
    console.log("Transpiled JS code:\n", jsCode);
    setConsoleLogs(prev => [...prev, '[Simulatore] Codice caricato e compilato con successo.']);
    
    setIsRunningCode(true);
    setIsPlaying(true);

    const execId = ++activeExecutionId.current;

    // Simulation SDK mapping
    const sleep = (ms: number) => {
      return new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          if (execId !== activeExecutionId.current) {
            reject(new Error('Interrupted'));
          } else {
            resolve();
          }
        }, ms);
      });
    };

    const drivePair = (steering: number, velocity: number) => {
      if (execId !== activeExecutionId.current) return;
      
      // Handle inverse speeds or steering calculations
      let speedL = velocity;
      let speedR = velocity;
      
      if (steering > 0) {
        speedR = Math.round(velocity * (50 - steering) / 50);
      } else if (steering < 0) {
        speedL = Math.round(velocity * (50 + steering) / 50);
      }

      // Scaling down speed values to match virtual pixels/second (using 800/240 pixels per cm, divided by 10)
      const K_speed = (((Math.PI * (wheelDiameter || 5.6)) / 6480) * (800 / 240)) / 10;
      robotRef.current.leftSpeed = speedL * K_speed;
      robotRef.current.rightSpeed = speedR * K_speed;
    };

    const drivePairForDegrees = async (degrees: number, steering: number, velocity: number) => {
      if (execId !== activeExecutionId.current) return;
      drivePair(steering, velocity);
      
      // Calculate delay needed based on wheel specifications
      const avgSpeed = Math.abs(velocity) || 1;
      // Rough estimation: time = degrees / speed scale (multiplied by 10 because speed is divided by 10)
      const durationMs = (Math.abs(degrees) / avgSpeed) * 3000;
      await sleep(durationMs);
      stopPair();
    };

    const stopPair = () => {
      if (execId !== activeExecutionId.current) return;
      robotRef.current.leftSpeed = 0;
      robotRef.current.rightSpeed = 0;
    };

    const runMotor = (port: string, speed: number) => {
      if (execId !== activeExecutionId.current) return;
      // Individual motor control
      const K_speed = (((Math.PI * (wheelDiameter || 5.6)) / 6480) * (800 / 240)) / 10;
      const scaledSpeed = speed * K_speed;
      if (port === 'A' || port === 'C') {
        robotRef.current.leftSpeed = scaledSpeed;
      } else {
        robotRef.current.rightSpeed = scaledSpeed;
      }
    };

    const stopMotor = (port: string) => {
      if (execId !== activeExecutionId.current) return;
      if (port === 'A' || port === 'C') {
        robotRef.current.leftSpeed = 0;
      } else {
        robotRef.current.rightSpeed = 0;
      }
    };

    const runMotorForDegrees = async (port: string, degrees: number, speed: number) => {
      if (execId !== activeExecutionId.current) return;
      runMotor(port, speed);
      const durationMs = (Math.abs(degrees) / (Math.abs(speed) || 1)) * 3000;
      await sleep(durationMs);
      stopMotor(port);
    };

    const writeLightMatrix = (text: any) => {
      if (execId !== activeExecutionId.current) return;
      robotRef.current.matrixText = String(text);
      robotRef.current.matrixImage = '';
      setConsoleLogs(prev => [...prev, `[Schermo] Testo: "${text}"`]);
    };

    const clearLightMatrix = () => {
      if (execId !== activeExecutionId.current) return;
      robotRef.current.matrixText = '';
      robotRef.current.matrixImage = '';
    };

    const showImageLightMatrix = (imageName: string) => {
      if (execId !== activeExecutionId.current) return;
      robotRef.current.matrixText = '';
      robotRef.current.matrixImage = imageName;
      setConsoleLogs(prev => [...prev, `[Schermo] Mostrata immagine: ${imageName}`]);
    };

    const playNote = (note: number, duration: number) => {
      if (execId !== activeExecutionId.current) return;
      triggerBeep(note, duration);
    };

    const beep = () => {
      if (execId !== activeExecutionId.current) return;
      triggerBeep(880, 150);
    };

    const resetYaw = (angle = 0) => {
      if (execId !== activeExecutionId.current) return;
      robotRef.current.yawResetAngle = robotRef.current.angle - angle;
    };

    const getYaw = () => {
      let relative = robotRef.current.angle - robotRef.current.yawResetAngle;
      // normalize -180 to 180 using mathematically correct modulo
      relative = ((((relative + 180) % 360) + 360) % 360) - 180;
      return Math.round(relative);
    };

    const getPitch = () => 0;
    const getRoll = () => 0;

    const getColor = (port: string) => {
      const p = String(port).toUpperCase();
      const reading = sensorReadingsRef.current[p];
      if (reading && reading.type === 'color') {
        return reading.color;
      }
      const fallback = Object.values(sensorReadingsRef.current).find((r: any) => r.type === 'color') as any;
      return fallback ? fallback.color : -1;
    };

    const getReflection = (port: string) => {
      const p = String(port).toUpperCase();
      const reading = sensorReadingsRef.current[p];
      if (reading && reading.type === 'color') {
        return reading.reflection;
      }
      const fallback = Object.values(sensorReadingsRef.current).find((r: any) => r.type === 'color') as any;
      return fallback ? fallback.reflection : 0;
    };

    const getDistance = (port: string) => {
      const p = String(port).toUpperCase();
      const reading = sensorReadingsRef.current[p];
      if (reading && reading.type === 'distance') {
        return Math.round(reading.distance);
      }
      const fallback = Object.values(sensorReadingsRef.current).find((r: any) => r.type === 'distance') as any;
      return fallback ? Math.round(fallback.distance) : 200;
    };

    const getForce = (port: string) => {
      const p = String(port).toUpperCase();
      const reading = sensorReadingsRef.current[p];
      if (reading && reading.type === 'force') {
        return reading.force;
      }
      const fallback = Object.values(sensorReadingsRef.current).find((r: any) => r.type === 'force') as any;
      return fallback ? fallback.force : 0;
    };

    const print = (text: any) => {
      setConsoleLogs(prev => [...prev, `[Print] ${String(text)}`]);
    };

    // Create Async Context Execution
    try {
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      
      const py_int = (val: any) => {
        const num = Number(val);
        return isNaN(num) ? 0 : Math.trunc(num);
      };
      const py_float = (val: any) => {
        const num = Number(val);
        return isNaN(num) ? 0.0 : num;
      };
      const py_str = (val: any) => String(val);
      const py_len = (val: any) => {
        if (val === null || val === undefined) return 0;
        if (typeof val.length === 'number') return val.length;
        if (typeof val.size === 'number') return val.size;
        return String(val).length;
      };
      const py_abs = (val: any) => Math.abs(Number(val));
      const py_round = (val: any, decimals: number = 0) => {
        const factor = Math.pow(10, decimals);
        return Math.round(Number(val) * factor) / factor;
      };
      const py_min = (...args: any[]) => {
        if (args.length === 1 && Array.isArray(args[0])) {
          return Math.min(...args[0].map(Number));
        }
        return Math.min(...args.map(Number));
      };
      const py_max = (...args: any[]) => {
        if (args.length === 1 && Array.isArray(args[0])) {
          return Math.max(...args[0].map(Number));
        }
        return Math.max(...args.map(Number));
      };

      const runnerFn = new AsyncFunction(
        'sleep', 'drivePair', 'drivePairForDegrees', 'stopPair',
        'writeLightMatrix', 'clearLightMatrix', 'showImageLightMatrix',
        'playNote', 'beep', 'runMotor', 'stopMotor', 'runMotorForDegrees',
        'resetYaw', 'getColor', 'getReflection', 'getDistance', 'getForce',
        'getYaw', 'getPitch', 'getRoll', 'print',
        'py_int', 'py_float', 'str', 'len', 'abs', 'round', 'min', 'max',
        `try {
          ${jsCode}
        } catch(e) {
          if (e.message !== 'Interrupted') {
             throw e;
          }
        }`
      );

      await runnerFn(
        sleep, drivePair, drivePairForDegrees, stopPair,
        writeLightMatrix, clearLightMatrix, showImageLightMatrix,
        playNote, beep, runMotor, stopMotor, runMotorForDegrees,
        resetYaw, getColor, getReflection, getDistance, getForce,
        getYaw, getPitch, getRoll, print,
        py_int, py_float, py_str, py_len, py_abs, py_round, py_min, py_max
      );

      setConsoleLogs(prev => [...prev, '[Simulatore] Esecuzione completata.']);
    } catch (err: any) {
      if (err.message !== 'Interrupted') {
        console.error("Simulation run error:", err);
        setConsoleLogs(prev => [...prev, `[Errore Simulazione] ${err.message}\n===JSCODE===\n${jsCode}\n===ENDJSCODE===`]);
      }
    } finally {
      if (execId === activeExecutionId.current) {
        setIsRunningCode(false);
        setIsPlaying(false);
        robotRef.current.leftSpeed = 0;
        robotRef.current.rightSpeed = 0;
      }
    }
  };

  const stopSimulationCode = () => {
    activeExecutionId.current++; // Invalidates active running promise
    setIsRunningCode(false);
    robotRef.current.leftSpeed = 0;
    robotRef.current.rightSpeed = 0;
    setConsoleLogs(prev => [...prev, '[Simulatore] Esecuzione interrotta.']);
  };

  // Helper to draw background paths on offscreen canvas for color reading
  const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number, forReading: boolean) => {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Draw grid if not for sensor reading
    if (!forReading) {
      ctx.strokeStyle = '#F0F0F0';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    if (mapType === 'line') {
      // Draw a line track
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.beginPath();
      // Round loop track
      ctx.moveTo(130, 135);
      ctx.bezierCurveTo(350, 60, 500, 60, 650, 135);
      ctx.bezierCurveTo(750, 200, 750, 280, 650, 315);
      ctx.bezierCurveTo(500, 370, 350, 370, 130, 315);
      ctx.bezierCurveTo(50, 280, 50, 200, 130, 135);
      ctx.stroke();

    } else if (mapType === 'colors') {
      // Draw massive colored areas for reading
      const colors = [
        { hex: '#EF4444', name: 'Rosso', x: 220, y: 70 },
        { hex: '#22C55E', name: 'Verde', x: 380, y: 70 },
        { hex: '#3B82F6', name: 'Blu', x: 540, y: 70 },
        { hex: '#EAB308', name: 'Giallo', x: 220, y: 230 },
        { hex: '#000000', name: 'Nero', x: 380, y: 230 },
        { hex: '#A855F7', name: 'Nessuno/Viola', x: 540, y: 230 },
      ];

      colors.forEach(col => {
        ctx.fillStyle = col.hex;
        ctx.fillRect(col.x, col.y, 110, 110);
        
        if (!forReading) {
          ctx.fillStyle = '#111111';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText(col.name, col.x + 10, col.y + 25);
        }
      });
    } else if (mapType === 'maze') {
      // Draw wall lines of maze
      ctx.fillStyle = '#000000';
      // Outer borders are already handles in boundary check, let's draw inner maze walls
      const walls = [
        { x: 0, y: 150, w: 250, h: 20 },
        { x: 250, y: 150, w: 20, h: 150 },
        { x: 150, y: 250, w: 120, h: 20 },
        { x: 400, y: 0, w: 20, h: 220 },
        { x: 400, y: 220, w: 250, h: 20 },
        { x: 550, y: 120, w: 250, h: 20 },
        { x: 150, y: 320, w: 20, h: 100 },
        { x: 500, y: 300, w: 20, h: 100 },
      ];

      walls.forEach(w => {
        ctx.fillRect(w.x, w.y, w.w, w.h);
      });

      // Target area in green
      ctx.fillStyle = 'rgba(34, 197, 94, 0.6)';
      ctx.fillRect(680, 280, 100, 100);
      if (!forReading) {
        ctx.fillStyle = '#15803D';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('TRAGUARDO', 690, 335);
      }
    } else if (mapType === 'custom') {
      if (customBgImage) {
        ctx.drawImage(customBgImage, 0, 0, width, height);
      } else if (!forReading) {
        ctx.save();
        ctx.strokeStyle = '#3f3f46';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(40, 40, width - 80, height - 80);
        ctx.setLineDash([]);
        
        ctx.fillStyle = '#a1a1aa';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Nessuna immagine di sfondo caricata.', width / 2, height / 2 - 10);
        
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#71717a';
        ctx.fillText('Clicca su "Carica Sfondo" in alto per selezionare un\'immagine dal computer.', width / 2, height / 2 + 15);
        ctx.restore();
      }
    }
  };
return transpilePythonToJs(pythonCode);
}