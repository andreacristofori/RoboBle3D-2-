with open("src/components/BlocklyEditor.tsx", "r") as f:
    content = f.read()

old_code = """    try: motor.reset_relative_position(_LEFT_PORT, 0)
    except: pass
    try: motor.reset_relative_position(_RIGHT_PORT, 0)
    except: pass"""

new_code = """    try: motor.reset_relative_position(_LEFT_PORT, 0)
    except Exception as e:
        print("reset_relative_position error:", e)
        pass
    try: motor.reset_relative_position(_RIGHT_PORT, 0)
    except: pass"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open("src/components/BlocklyEditor.tsx", "w") as f:
        f.write(content)
    print("Patched reset_relative_position")
else:
    print("Old code not found")
