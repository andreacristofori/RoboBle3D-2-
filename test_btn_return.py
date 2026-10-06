with open("src/components/BlocklyEditor.tsx", "r") as f:
    content = f.read()

old_code = """    _printed_btn = True
    return False"""

new_code = """    
    if not _printed_btn:
        try:
            import button as b3
            print("b3:", type(b3.pressed(b3.LEFT)), b3.pressed(b3.LEFT))
        except Exception as e: print("b3err:", e)
        try:
            from hub import button as hbtn
            print("hbtn.POWER:", type(hbtn.pressed(hbtn.POWER)), hbtn.pressed(hbtn.POWER))
            print("hbtn.LEFT:", type(hbtn.pressed(hbtn.LEFT)), hbtn.pressed(hbtn.LEFT))
        except Exception as e: print("hbtnerr:", e)
    _printed_btn = True
    return False"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open("src/components/BlocklyEditor.tsx", "w") as f:
        f.write(content)
    print("Patched to print return types")
