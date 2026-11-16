import json, sys

PIDS = sys.argv[1:]
out = []
for pid in PIDS:
    r = __import__('subprocess').run(['true'], capture_output=True)
print(json.dumps(PIDS))
