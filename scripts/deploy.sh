#!/bin/bash

echo "🚀 Deploying to Coolify..."

# Check if required environment variables are set
if [ -z "$MASTER_ENCRYPTION_KEY" ]; then
  echo "❌ Error: MASTER_ENCRYPTION_KEY not set"
  exit 1
fi

if [ -z "$POSTGRES_PASSWORD" ]; then
  echo "❌ Error: POSTGRES_PASSWORD not set"
  exit 1
fi

# Build Docker image
echo "🔨 Building Docker image..."
docker build -t platform:latest .

# Run database migrations
echo "📊 Running database migrations..."
docker-compose run --rm app node core/database/migrate.js

# Start services
echo "▶️  Starting services..."
docker-compose up -d

# Wait for health check
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Test health endpoint
echo "🏥 Testing health endpoint..."
curl -f http://localhost:8000/api/v1/health -H "Host: mediguard-ai.com" || {
  echo "❌ Health check failed"
  docker-compose logs app
  exit 1
}

echo ""
echo "✅ Deployment successful!"
echo ""
echo "Services running:"
docker-compose ps
echo ""
echo "View logs: docker-compose logs -f app"
echo "Stop services: docker-compose down"
echo ""
