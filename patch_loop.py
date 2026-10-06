with open("src/components/BlocklyEditor.tsx", "r") as f:
    content = f.read()

old_code = """    target = abs(degrees)
    try:
        while True:
            if globals().get('__stop_flag', False):
                break
            pos_left = 0
            pos_right = 0
            try: pos_left = abs(motor.relative_position(_LEFT_PORT))
            except Exception as e:
                print("relative_position error:", e)
                pass
            try: pos_right = abs(motor.relative_position(_RIGHT_PORT))
            except Exception as e: pass
            
            if pos_left >= target or pos_right >= target:
                break
            await runloop.sleep_ms(10)"""

new_code = """    target = abs(degrees)
    try:
        err_count = 0
        while True:
            if globals().get('__stop_flag', False):
                break
            pos_left = 0
            pos_right = 0
            has_err = False
            try: 
                pos_left = abs(motor.relative_position(_LEFT_PORT))
            except Exception as e:
                has_err = True
                
            try: 
                pos_right = abs(motor.relative_position(_RIGHT_PORT))
            except Exception as e: 
                has_err = True
                
            if has_err:
                err_count += 1
                if err_count > 5:
                    print("Errore lettura motori (forse scollegati). Interrompo per evitare blocco.")
                    break
            else:
                err_count = 0
                
            if pos_left >= target or pos_right >= target:
                break
            await runloop.sleep_ms(10)"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open("src/components/BlocklyEditor.tsx", "w") as f:
        f.write(content)
    print("Patched while loop")
else:
    print("Old code not found")
