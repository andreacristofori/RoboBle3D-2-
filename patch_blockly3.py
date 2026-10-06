with open("src/components/BlocklyEditor.tsx", "r") as f:
    content = f.read()

old_code = """            try: pos_left = abs(motor.relative_position(_LEFT_PORT))
            except: pass
            try: pos_right = abs(motor.relative_position(_RIGHT_PORT))
            except: pass"""

new_code = """            try: pos_left = abs(motor.relative_position(_LEFT_PORT))
            except Exception as e:
                print("relative_position error:", e)
                pass
            try: pos_right = abs(motor.relative_position(_RIGHT_PORT))
            except Exception as e: pass"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open("src/components/BlocklyEditor.tsx", "w") as f:
        f.write(content)
    print("Patched relative_position")
else:
    print("Old code not found")
