const pyCode = `
try:
    print('hello')
`;
const patched = pyCode.replace(/try:/g, 'try:\n    pass\nexcept:\n    pass');
console.log(patched);
