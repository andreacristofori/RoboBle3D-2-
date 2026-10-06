with open("src/components/BlocklyEditor.tsx", "r") as f:
    content = f.read()

old_code = """    try: motor.run(_LEFT_PORT, left_vel)
    except: pass
    try: motor.run(_RIGHT_PORT, right_vel)
    except: pass"""

new_code = """    try: motor.run(_LEFT_PORT, left_vel)
    except Exception as e:
        print("motor.run error:", e)
        pass
    try: motor.run(_RIGHT_PORT, right_vel)
    except: pass"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open("src/components/BlocklyEditor.tsx", "w") as f:
        f.write(content)
    print("Patched motor.run")
else:
    print("Old code not found")
