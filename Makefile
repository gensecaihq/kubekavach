.PHONY: help build up down logs shell clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	pnpm install

build: ## Build all packages
	pnpm build

dev: ## Start development
	pnpm dev

test: ## Run tests
	pnpm test

lint: ## Run linter
	pnpm lint

format: ## Format code
	pnpm format

docker-build: ## Build Docker images
	docker-compose build

docker-up: ## Start Docker services
	docker-compose up -d

docker-down: ## Stop Docker services
	docker-compose down

docker-logs: ## Show Docker logs
	docker-compose logs -f

clean: ## Clean build artifacts
	pnpm clean
	docker-compose down -v
