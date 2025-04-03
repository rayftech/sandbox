# Microservice Connection Configuration

This document provides information about how the microservices connect to external services like RabbitMQ and Strapi CMS.

## Environment Setup

This application supports two main development environments:

1. **Local Development**: Application runs on your host machine, RabbitMQ can run locally or in Docker
2. **Docker Development**: Both application and RabbitMQ run in Docker containers

## Environment Configuration Files

- `.env.local`: Settings for local development
- `.env.docker`: Settings for Docker development

## Starting the Application

- For local development: `yarn dev:local`
- For Docker development: `yarn docker:up`

## RabbitMQ Connection

The application connects to RabbitMQ using the following configuration:

- Host: Configurable via `RABBITMQ_HOST` (default: localhost)
- Port: Configurable via `RABBITMQ_PORT` (default: 5672)
- Username: Configurable via `RABBITMQ_USER` (default: guest)
- Password: Configurable via `RABBITMQ_PASS` (default: guest)
- Virtual Host: Configurable via `RABBITMQ_VHOST` (default: /)

### Troubleshooting RabbitMQ Connection Issues

If you encounter "getaddrinfo ENOTFOUND rabbitmq" errors:

1. Check which environment you're running in:
   - When running the app locally, use `.env.local` (DOCKER_ENV=false, RABBITMQ_HOST=localhost)
   - When running the app in Docker, use `.env.docker` (DOCKER_ENV=true, RABBITMQ_HOST=rabbitmq)

2. Verify RabbitMQ is running:
   - For local development: `docker ps | grep rabbitmq`
   - For Docker development: `docker-compose -f docker-compose.dev.yml ps`

3. Check RabbitMQ port accessibility:
   - Try accessing the management UI at: http://localhost:15672
   - Default credentials: admin/password

4. Network troubleshooting:
   - Local development: Ensure ports 5672 and 15672 are exposed
   - Docker development: Ensure both containers are on the same network

## Strapi CMS Connection

The application connects to Strapi CMS using the following configuration:

- Base URL: Configurable via `STRAPI_BASE_URL` (default: http://localhost:1337)
- API Token: Configurable via `STRAPI_API_TOKEN`
- Username: Configurable via `STRAPI_USERNAME` (for JWT auth)
- Password: Configurable via `STRAPI_PASSWORD` (for JWT auth)

### Troubleshooting Strapi Connection Issues

#### Connection to Strapi fails with "connect ECONNREFUSED" or other connection errors

This error occurs when the backend can't connect to the Strapi instance.

**Solution**: 
1. Verify that Strapi is running and accessible on the configured URL
2. Check network configuration and firewall settings
3. Ensure the `STRAPI_BASE_URL` is correctly set in your environment variables

#### Strapi API validation errors with "Inline node must be Text or Link"

This error occurs when sending rich text content to Strapi that doesn't match the expected Lexical editor format.

**Solution**: Ensure all rich text content is properly formatted using the RichTextFormatter utility:

```typescript
import { RichTextFormatter } from '../utils/rich-text-formatter';

// Format text for Strapi
const formattedDescription = RichTextFormatter.toLexical(description);
```

#### Request timed out after 30000ms

This error can occur if Strapi is not running or is unreachable.

**Solution**:
1. Verify Strapi is running and accessible
2. Check the network connectivity between the backend and Strapi
3. Ensure the configuration in the .env file is correct

#### Running Diagnostics

To diagnose Strapi connection issues, use the StrapiDiagnostic utility:

```typescript
import { StrapiDiagnostic } from '../utils/strapi-diagnostic.util';

// Run a comprehensive connection diagnostic
const diagnosticResults = await StrapiDiagnostic.runConnectionDiagnostic();
console.log(diagnosticResults);
```