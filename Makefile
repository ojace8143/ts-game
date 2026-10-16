
.PHONY: all clean serve

# `make serve` defaults. Bind on all interfaces so both "localhost" and
# "127.0.0.1" work; override with e.g. `make serve HOST=127.0.0.1 PORT=3000`.
HOST ?= 0.0.0.0
PORT ?= 8000

all:
	tsc -p tsconfig.json

serve: all
	@if ss -ltn 2>/dev/null | grep -q ":$(PORT) "; then \
		echo "Port $(PORT) is already in use. Try: make serve PORT=3001"; \
		exit 1; \
	fi
	@echo "Serving on http://localhost:$(PORT)  (Ctrl-C to stop)"
	python3 -m http.server $(PORT) --bind $(HOST)

clean:
	rm -rf dist/*
