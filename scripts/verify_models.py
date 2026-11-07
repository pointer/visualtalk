"""Cross-check the JSDoc CommandMap / typedefs against the Rust command table."""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
LIB = ROOT / 'src-tauri/src/lib.rs'
IPC = ROOT / 'src/lib/ipc.js'
MODELS = ROOT / 'src/models/index.js'


def strip_comments(text):
    return '\n'.join(l for l in text.split('\n') if not l.lstrip().startswith('//'))


# Rust side: the registered command names.
lib = strip_comments(LIB.read_text())
block = lib[lib.index('generate_handler!['):]
block = block[:block.index('])')]
rust_cmds = set()
for line in block.split('\n'):
    s = line.strip().rstrip(',')
    if s and not s.startswith('#['):
        rust_cmds.add(s.split('::')[-1])

# JS side.
ipc = IPC.read_text()
cm_start = ipc.index('@typedef {Object} CommandMap')
cm_end = ipc.index('*/', cm_start)
mapped = set(re.findall(r'@property \{[^}]+\} (\w+)', ipc[cm_start:cm_end]))

models = MODELS.read_text()
declared = set(re.findall(r'@typedef \{[^}]*\} (\w+)', models))

# typedef aliases imported into ipc.js
aliases = set(re.findall(r'@typedef \{import\("\.\./models"\)\.(\w+)\}', ipc))
unknown_aliases = sorted(aliases - declared)

# types referenced by CommandMap properties
used = set()
for t in re.findall(r'@property \{([^}]+)\}', ipc[cm_start:cm_end]):
    used |= set(re.findall(r'\b([A-Z]\w+)\b', t))
local = {'Object'}
unresolved = sorted(used - aliases - local)

print('rust commands registered :', len(rust_cmds))
print('CommandMap entries       :', len(mapped))
print('mapped but not registered:', sorted(mapped - rust_cmds) or 'none')
print('registered but unmapped  :', len(rust_cmds - mapped), sorted(rust_cmds - mapped))
print('models typedefs          :', len(declared))
print('ipc aliases not in models:', unknown_aliases or 'none')
print('CommandMap types unresolved:', unresolved or 'none')
