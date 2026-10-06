with open("src/components/BlocklyEditor.tsx", "r") as f:
    content = f.read()

old_code = """def _drive_pair(steering, velocity):
    if not _LEFT_INVERTED and not _RIGHT_INVERTED:
        motor_pair.move(motor_pair.PAIR_1, steering, velocity=velocity)
        return

    if _LEFT_INVERTED and _RIGHT_INVERTED:
        motor_pair.move(motor_pair.PAIR_1, -steering, velocity=-velocity)
        return"""

new_code = """def _drive_pair(steering, velocity):
    if not _LEFT_INVERTED and not _RIGHT_INVERTED:
        try:
            motor_pair.move(motor_pair.PAIR_1, steering, velocity=velocity)
            return
        except Exception as e:
            print("Fallback move:", e)
            pass

    if _LEFT_INVERTED and _RIGHT_INVERTED:
        try:
            motor_pair.move(motor_pair.PAIR_1, -steering, velocity=-velocity)
            return
        except Exception as e:
            print("Fallback move:", e)
            pass"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open("src/components/BlocklyEditor.tsx", "w") as f:
        f.write(content)
    print("Patched _drive_pair")
else:
    print("Old code not found")
