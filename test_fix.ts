const indent = 4;
let translated = 'except:';
// The new logic
if (translated.startsWith('except') && translated.endsWith(':')) {
    translated = '} catch (e) {';
}
console.log(translated);
