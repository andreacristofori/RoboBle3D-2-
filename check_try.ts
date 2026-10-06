import fs from 'fs';
const jsCode = fs.readFileSync('output.js', 'utf8');

let tryCount = 0;
let catchCount = 0;
let finallyCount = 0;

const lines = jsCode.split('\n');
lines.forEach((line, index) => {
    if (line.includes('try {')) {
        tryCount++;
    }
    if (line.includes('catch (e) {')) {
        catchCount++;
    }
    if (line.includes('finally {')) {
        finallyCount++;
    }
});

console.log(`Try: ${tryCount}, Catch: ${catchCount}, Finally: ${finallyCount}`);
