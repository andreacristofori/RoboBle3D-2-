with open("src/components/BlocklyEditor.tsx", "r") as f:
    content = f.read()

import re

old_code = """    if not _LEFT_INVERTED and not _RIGHT_INVERTED:
        await motor_pair.move_for_degrees(motor_pair.PAIR_1, degrees, steering, velocity=velocity)
        if globals().get('__stop_flag', False):
            raise Exception("Programma Interrotto")
        return

    if _LEFT_INVERTED and _RIGHT_INVERTED:
        await motor_pair.move_for_degrees(motor_pair.PAIR_1, degrees, -steering, velocity=-velocity)
        if globals().get('__stop_flag', False):
            raise Exception("Programma Interrotto")
        return"""

new_code = """    if not _LEFT_INVERTED and not _RIGHT_INVERTED:
        try:
            try: await motor_pair.move_for_degrees(motor_pair.PAIR_1, degrees, steering, velocity=velocity)
            except: motor_pair.move_for_degrees(motor_pair.PAIR_1, degrees, steering, velocity=velocity)
            if globals().get('__stop_flag', False):
                raise Exception("Programma Interrotto")
            return
        except Exception as e:
            print("Fallback move_for_degrees:", e)
            pass

    if _LEFT_INVERTED and _RIGHT_INVERTED:
        try:
            try: await motor_pair.move_for_degrees(motor_pair.PAIR_1, degrees, -steering, velocity=-velocity)
            except: motor_pair.move_for_degrees(motor_pair.PAIR_1, degrees, -steering, velocity=-velocity)
            if globals().get('__stop_flag', False):
                raise Exception("Programma Interrotto")
            return
        except Exception as e:
            print("Fallback move_for_degrees:", e)
            pass"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open("src/components/BlocklyEditor.tsx", "w") as f:
        f.write(content)
    print("Patched _drive_pair_for_degrees")
else:
    print("Old code not found")
