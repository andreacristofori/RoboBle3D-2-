import { transpilePythonToJsWrapper } from './temp_transpiler.ts';
const pyCode = `
try:
    print('hello')
`;
const js = transpilePythonToJsWrapper(pyCode);
console.log(js);
