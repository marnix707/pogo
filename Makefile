SHELL := /bin/bash
export HOST_LAN_IPS := $(shell ./scripts/lan-ips.sh)
RUN := docker compose run --rm --no-deps -w /app server

.DEFAULT_GOAL := help
.PHONY: help env up up-lan down logs ps urls test e2e lint typecheck format migrate db-reset db-shell shell lock clean

help: ## Show this help
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

env: ## Create .env from .env.example if missing (with a random JWT secret)
	@test -f .env || (cp .env.example .env && sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$$(openssl rand -hex 32)|" .env && echo "Created .env from .env.example")

up: env ## Build and start everything (detached), then print URLs
	docker compose up --build --renew-anon-volumes -d --wait
	@$(MAKE) --no-print-directory urls

up-lan: env ## Like `up`, but reachable from your phone on the Wi-Fi (trusted networks only)
	BIND_ADDR=0.0.0.0 DEV_MAILBOX=0 docker compose up --build --renew-anon-volumes -d --wait
	@$(MAKE) --no-print-directory urls

down: ## Stop everything (keeps the database volume)
	docker compose down

logs: ## Follow logs
	docker compose logs -f --tail=100

ps: ## Show service status
	docker compose ps

urls: ## Print the URLs to open (including the one for your phone)
	@echo
	@echo "Pogo is running:"
	@echo "  This machine:  http://localhost:$${WEB_PORT:-5173}"
	@for ip in $$(echo "$(HOST_LAN_IPS)" | tr ',' ' '); do echo "  Phone (Wi-Fi): http://$$ip:$${WEB_PORT:-5173}"; done
	@echo

test: ## Run all unit tests inside the container
	$(RUN) pnpm test

e2e: ## Run the Playwright two-player test (needs `make up`)
	docker compose --profile e2e run --rm e2e

lint: ## ESLint + Prettier check
	$(RUN) sh -c "pnpm lint && pnpm format:check"

typecheck: ## TypeScript check for all packages
	$(RUN) pnpm typecheck

format: ## Auto-format with Prettier
	$(RUN) pnpm format

migrate: ## Apply Prisma migrations
	docker compose exec server pnpm --filter @pogo/server prisma:migrate

db-reset: ## Wipe the database volume and restart (destructive!)
	docker compose down -v
	$(MAKE) up

db-shell: ## psql into the database
	docker compose exec db psql -U $${POSTGRES_USER:-pogo} -d $${POSTGRES_DB:-pogo}

shell: ## Shell inside the server container
	docker compose exec server bash

lock: ## Regenerate pnpm-lock.yaml (after changing any package.json)
	docker run --rm -v "$$PWD":/app -w /app -u "$$(id -u):$$(id -g)" -e COREPACK_HOME=/tmp/corepack -e HOME=/tmp node:20-bookworm-slim \
		sh -c "corepack prepare pnpm@9.15.4 --activate && corepack pnpm install --lockfile-only --ignore-scripts"

clean: ## Remove containers, volumes and images for this project
	docker compose down -v --rmi local
