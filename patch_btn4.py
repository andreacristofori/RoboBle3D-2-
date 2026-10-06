with open("src/components/BlocklyEditor.tsx", "r") as f:
    content = f.read()

old_code = """    except Exception as e:
        pass

    # Try Spike 3 / top level button"""

new_code = """    except Exception as e:
        pass

    try:
        import button
        if hasattr(button, 'any') and button.any(): return True
    except: pass

    # Try Spike 3 / top level button"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open("src/components/BlocklyEditor.tsx", "w") as f:
        f.write(content)
    print("Patched button again 4")
else:
    print("Old code not found")
