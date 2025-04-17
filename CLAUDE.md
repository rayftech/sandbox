# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands
- Build: `yarn build`
- Dev: `yarn dev`, `yarn dev:docker`, `yarn dev:local`
- Lint: `yarn lint`
- Test all: `yarn test`
- Test single file: `yarn test <path_to_test_file>`
- Specific test suites: `yarn test:user-sync`, `yarn test:userSync`, `yarn test:rabbitmq`
- Docker: `yarn docker:dev:up`, `yarn docker:dev:down`

## Code Style Guidelines
- TypeScript: strict mode, noImplicitAny, strictNullChecks
- Structure: MVC pattern (controllers, services, models)
- Classes: PascalCase (UserService, ApiError)
- Variables/functions: camelCase
- Error handling: Use ApiError class for operational errors, asyncHandler for Promise errors
- Imports: Group by external packages first, then internal modules
- Use path aliases (@/*) for internal imports
- Controllers use static methods
- Test files named with pattern: test_*.ts