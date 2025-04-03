# RabbitMQ Connection Configuration

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

## Troubleshooting Connection Issues

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