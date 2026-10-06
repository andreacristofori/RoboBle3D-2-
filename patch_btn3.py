with open("src/components/BlocklyEditor.tsx", "r") as f:
    content = f.read()

old_code = """    # Try Spike 2 / hub.button
    try:
        from hub import button"""

new_code = """    # Try Spike 2 / hub.button
    try:
        from hub import buttons
        for name in ['left', 'right', 'center', 'power']:
            if hasattr(buttons, name):
                btn = getattr(buttons, name)
                if hasattr(buttons, 'pressed') and buttons.pressed(btn): return True
                if hasattr(btn, 'is_pressed') and btn.is_pressed(): return True
    except: pass
    
    try:
        from hub import button"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open("src/components/BlocklyEditor.tsx", "w") as f:
        f.write(content)
    print("Patched button again")
else:
    print("Old code not found")
