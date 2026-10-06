with open("src/components/BlocklyEditor.tsx", "r") as f:
    content = f.read()

old_code = """def _is_any_button_pressed():
    from hub import button
    for name in ['center', 'left', 'right', 'power']:
        if hasattr(button, name):
            try:
                b = getattr(button, name)
                if hasattr(b, 'is_pressed') and b.is_pressed():
                    return True
            except:
                pass
    for name in ['CENTER', 'LEFT', 'RIGHT', 'POWER']:
        if hasattr(button, name):
            try:
                if hasattr(button, 'pressed') and button.pressed(getattr(button, name)):
                    return True
            except:
                pass
    return False"""

new_code = """def _is_any_button_pressed():
    try:
        from hub import button
        for name in ['center', 'left', 'right', 'power']:
            if hasattr(button, name):
                try:
                    b = getattr(button, name)
                    if hasattr(b, 'is_pressed') and b.is_pressed():
                        return True
                except:
                    pass
        for name in ['CENTER', 'LEFT', 'RIGHT', 'POWER']:
            if hasattr(button, name):
                try:
                    if hasattr(button, 'pressed') and button.pressed(getattr(button, name)):
                        return True
                except:
                    pass
    except Exception as e:
        print("hub.button error:", e)

    try:
        import button
        for name in ['LEFT', 'RIGHT']:
            if hasattr(button, name):
                if button.pressed(getattr(button, name)):
                    return True
    except Exception as e:
        pass
    
    return False"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open("src/components/BlocklyEditor.tsx", "w") as f:
        f.write(content)
    print("Patched button")
else:
    print("Old code not found")
