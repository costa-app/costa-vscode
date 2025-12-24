# Default task - show available commands
default:
    @just --list

# Build tasks
build:
    pnpm run build

dev:
    pnpm run dev

# Code quality
lint:
    pnpm run lint

test:
    pnpm run test

typecheck:
    pnpm run typecheck

# Extension metadata
update:
    pnpm run update

# Release tasks
release:
    pnpm run release

release-internal:
    pnpm run release:internal

# Extension publishing
package:
    pnpm run ext:package

publish:
    pnpm run ext:publish

# Combined tasks
check: lint typecheck test
