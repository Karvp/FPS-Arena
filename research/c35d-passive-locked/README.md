# Restoring the immutable C35-D passive collector

C35-D (passive observation) was sealed before C35-D2 (motor actuation) changed
`lab/arena/train-main.mjs`. To reproduce the first study, extract the C35-D2
source ZIP into a **fresh copy**, then replace `lab/arena/train-main.mjs` with
`research/c35d-passive-locked/train-main.mjs`. This restores the study runner's
source hash; never overwrite the C35-D2 active-policy source in place.

Use the frozen `reports/c35d/public-transition-pilot/FROZEN-DESIGN.json` and
`python scripts/run-c35d-passive.py` to check the sealed source and case design.
The raw-evaluation archive contains the original labeled datasets. C35-D2
original source remains unchanged in its own ZIP.
