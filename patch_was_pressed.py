with open("src/components/BlocklyEditor.tsx", "r") as f:
    content = f.read()

content = content.replace("if hasattr(b, 'was_pressed') and b.was_pressed():\n                        return True", "")

with open("src/components/BlocklyEditor.tsx", "w") as f:
    f.write(content)
print("Removed was_pressed")
