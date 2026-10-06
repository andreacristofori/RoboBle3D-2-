with open("src/components/BlocklyEditor.tsx", "r") as f:
    content = f.read()
import re
# extract the block where motor_pair.pair is called
match = re.search(r'(try:\s*motor_pair.unpair.*?except:.*?pass)', content, re.DOTALL)
if match:
    print(match.group(1))

