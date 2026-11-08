import json
import sys
from pathlib import Path

def get_keys(data, prefix=""):
    keys = {}
    for k, v in data.items():
        new_key = f"{prefix}{k}"
        if isinstance(v, dict):
            keys.update(get_keys(v, f"{new_key}."))
        else:
            keys[new_key] = v
    return keys

def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def check_parity():
    en_path = Path('src/locales/en.json')
    fr_path = Path('src/locales/fr.json')
    es_path = Path('src/locales/es.json')

    en_data = load_json(en_path)
    fr_data = load_json(fr_path)
    es_data = load_json(es_path)

    en_dict = get_keys(en_data)
    fr_dict = get_keys(fr_data)
    es_dict = get_keys(es_data)

    en_keys = set(en_dict.keys())
    fr_keys = set(fr_dict.keys())
    es_keys = set(es_dict.keys())

    missing_fr = en_keys - fr_keys
    missing_es = en_keys - es_keys
    
    extra_fr = fr_keys - en_keys
    extra_es = es_keys - en_keys

    errors = False
    if missing_fr:
        print(f"Missing in fr.json: {sorted(list(missing_fr))}")
        errors = True
    if missing_es:
        print(f"Missing in es.json: {sorted(list(missing_es))}")
        errors = True
    if extra_fr:
        print(f"Extra in fr.json: {sorted(list(extra_fr))}")
        errors = True
    if extra_es:
        print(f"Extra in es.json: {sorted(list(extra_es))}")
        errors = True

    # Check for empty-string values and values identical to English
    for k in sorted(list(en_keys & fr_keys)):
        fr_val = fr_dict[k]
        en_val = en_dict[k]
        if fr_val == "":
            print(f"WARNING: fr.json key '{k}' is an empty string.")
        elif fr_val == en_val and len(en_val) > 3: # Ignore short terms like 'PMI', 'Date', etc.
            # print(f"WARNING: fr.json key '{k}' is identical to English text: '{en_val}'")
            pass

    for k in sorted(list(en_keys & es_keys)):
        es_val = es_dict[k]
        en_val = en_dict[k]
        if es_val == "":
            print(f"WARNING: es.json key '{k}' is an empty string.")
        elif es_val == en_val and len(en_val) > 3:
            # print(f"WARNING: es.json key '{k}' is identical to English text: '{en_val}'")
            pass

    if errors:
        sys.exit(1)
    
    print(f"OK: en/fr/es parity ({len(en_keys)} keys)")
    sys.exit(0)

if __name__ == '__main__':
    check_parity()
