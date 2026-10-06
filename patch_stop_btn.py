with open("src/components/BlocklyEditor.tsx", "r") as f:
    content = f.read()

old_code = """def _is_stop_button_pressed():
    from hub import button
    for name in ['center', 'power']:
        if hasattr(button, name):
            try:
                b = getattr(button, name)
                if hasattr(b, 'is_pressed') and b.is_pressed():
                    return True
            except:
                pass
    for name in ['CENTER', 'POWER']:
        if hasattr(button, name):
            try:
                if hasattr(button, 'pressed') and button.pressed(getattr(button, name)):
                    return True
            except:
                pass
    return False"""

new_code = """def _is_stop_button_pressed():
    try:
        from hub import button
        for name in ['center', 'power']:
            if hasattr(button, name):
                try:
                    b = getattr(button, name)
                    if hasattr(b, 'is_pressed') and b.is_pressed():
                        return True
                    if hasattr(b, 'was_pressed') and b.was_pressed():
                        return True
                    if hasattr(b, 'pressed') and b.pressed():
                        return True
                except:
                    pass
    except Exception as e:
        pass

    try:
        import button
        for name in ['CENTER', 'POWER', 'center', 'power']:
            if hasattr(button, name):
                btn = getattr(button, name)
                try:
                    if hasattr(button, 'pressed') and button.pressed(btn):
                        return True
                except: pass
                try:
                    if hasattr(btn, 'is_pressed') and btn.is_pressed():
                        return True
                except: pass
                try:
                    if hasattr(btn, 'pressed') and btn.pressed():
                        return True
                except: pass
    except Exception as e:
        pass
    return False"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open("src/components/BlocklyEditor.tsx", "w") as f:
        f.write(content)
    print("Patched stop button")
else:
    print("Old code not found")
