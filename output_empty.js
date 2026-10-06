
async function _run_user_code() {
}
async function main() {
    try {
        await _run_user_code()
    }
    catch (e) {
        print("Interruzione o errore:", e)
    }
}
