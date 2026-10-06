const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
const py_int = (val: any) => isNaN(Number(val)) ? 0 : Math.trunc(Number(val));
const py_float = (val: any) => isNaN(Number(val)) ? 0.0 : Number(val);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const drivePairForDegrees = async (deg: number, st: number, vel: number) => {
    console.log("Drive", deg, st, vel);
    await sleep(10);
};

const jsCode = `
while (true) {
    if (0 == 0) {
        await drivePairForDegrees(py_int(py_float(10) * 11.5 / 5.6), py_int(0), py_int(py_int(py_float(50) * 1000 / 100)))
    }
    await sleep(10);
    break; // Break so test terminates
}
`;

const runnerFn = new AsyncFunction('sleep', 'drivePairForDegrees', 'py_int', 'py_float', jsCode);
runnerFn(sleep, drivePairForDegrees, py_int, py_float).then(() => console.log("Done")).catch(console.error);
