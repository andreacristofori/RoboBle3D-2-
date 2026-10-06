import fs from 'fs';
import { transpilePythonToJsWrapper } from './temp_transpiler.ts';

const pyCode = `
async def _run_user_code():
    # === START_BLOCKLY_CODE ===
    
    # === END_BLOCKLY_CODE ===

async def main():
    try:
        await _run_user_code()
    except BaseException as e:
        print("Interruzione o errore:", e)
`;

const js = transpilePythonToJsWrapper(pyCode);
fs.writeFileSync('output_empty.js', js);
console.log("Transpilation finished");
