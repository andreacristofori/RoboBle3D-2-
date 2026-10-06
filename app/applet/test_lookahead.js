
const lines = [
    'try:',
    '    a = 1',
    'except:',
    '    a = 2'
];

// simulate the look-ahead loop
function check(i) {
    let hasExceptFollowing = false;
    for (let j = i; j < lines.length; j++) {
        const nextLine = lines[j].trim();
        console.log(`Checking line ${j}: ${nextLine}`);
        if (nextLine && !nextLine.startsWith('#')) {
            if (nextLine.startsWith('except') || nextLine.startsWith('finally')) {
                hasExceptFollowing = true;
            }
            break;
        }
    }
    return hasExceptFollowing;
}

// simulate `a=1` line, which is at index 1
console.log('Is except following a=1?', check(1)); 
