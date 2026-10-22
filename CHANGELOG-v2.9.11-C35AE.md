# C35-AE changelog

- New research-only 18-feature factual ADS action-value training using 1,136 C35-AD windows.
- Retrospective setup holdout, logistic and 18-16-8-1 neural candidate models, exact frozen weights and deterministic JS forward pass.
- Completely new 12-setup 24-match prospective dataset (observe/randomized only) preregistered and independently SHA/C21/ADS/ballistic audited; frozen model applied without refit.
- New propensity-based off-policy evaluation, setup-cluster bootstrap and final decision gates; no control/policy promotion.
- +4 JS frozen inference tests, +7 Python retrospective/prospective integrity tests; no production changes.
