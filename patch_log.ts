import * as fs from 'fs';
const file = 'src/components/VirtualEnvironment.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('console.log("Transpiled JS code:", jsCode);')) {
    content = content.replace(
        /return jsCode;\n  };/g,
        'console.log("Transpiled JS code:\\n", jsCode);\n    return jsCode;\n  };'
    );
    fs.writeFileSync(file, content);
    console.log("Patched");
}
