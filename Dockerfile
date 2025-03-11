FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package.json yarn.lock ./
RUN yarn install

# Copy tsconfig
COPY tsconfig.json ./

# Expose port
EXPOSE 5050

# Development mode with hot-reloading
CMD ["yarn", "dev"]