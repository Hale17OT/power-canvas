# Local experiment evidence

This directory contains machine-local experiment runs and tenant readback artifacts. They are intentionally ignored by Git because they can contain environment-specific identifiers, generated exports, or authentication-adjacent metadata. Durable source fixtures and reproducible examples belong under `examples/` or `tests/fixtures/`; do not commit live tenant state here.

Seven historical flow evidence assertions are opt-in: set `POWERCANVAS_PRIVATE_EVIDENCE=1` when running the tests on a workstation with the original V1/V2/V3 artifacts and local ownership state. Missing evidence then fails the checks. Public clones skip these evidence-only assertions; ordinary compiler and mocked delivery tests still run. The evidence tests read local artifacts and use mocked transports; enabling them does not run tenant operations.
