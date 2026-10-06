with open("src/components/BlocklyEditor.tsx", "r") as f:
    content = f.read()

old_code = """def _is_any_button_pressed():
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

new_code = """_printed_btn = False
def _is_any_button_pressed():
    global _printed_btn
    
    # Try Spike 2 / hub.button
    try:
        from hub import button
        if not _printed_btn:
            print("hub.button:", dir(button))
        for name in ['center', 'left', 'right', 'power']:
            if hasattr(button, name):
                try:
                    b = getattr(button, name)
                    if not _printed_btn: print("hub.button."+name+":", dir(b))
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

    # Try Spike 3 / top level button
    try:
        import button
        if not _printed_btn:
            print("button:", dir(button))
            _printed_btn = True
        
        for name in ['LEFT', 'RIGHT', 'CENTER', 'POWER', 'left', 'right', 'center']:
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
        
    _printed_btn = True
    return False"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open("src/components/BlocklyEditor.tsx", "w") as f:
        f.write(content)
    print("Patched button again")
else:
    print("Old code not found")
