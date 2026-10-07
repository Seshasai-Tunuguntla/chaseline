.PHONY: setup data test lint web-install web-dev web-build all
PY ?= .venv/bin/python

setup:
	python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

# one command to rebuild every data file the site uses (downloads Cricsheet, checks, trains, exports)
data:
	$(PY) -m chaseline.run
	$(PY) -m pytest -q -m data

test:
	$(PY) -m pytest -q -m "not data"

lint:
	$(PY) -m ruff check .

web-install:
	cd web && npm ci

web-dev:
	cd web && npm run dev

web-build:
	cd web && npm run build

all: data web-build
