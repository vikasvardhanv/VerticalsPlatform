#!/bin/bash

echo "🚀 Setting up Multi-Vertical AI Platform..."

# Check if .env exists
if [ ! -f .env ]; then
  echo "📝 Creating .env file..."
  cp .env.example .env

  # Generate encryption key
  ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
  POSTGRES_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
  REDIS_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")

  # Update .env file
  sed -i.bak "s/your-256-bit-key-in-hex-format/$ENCRYPTION_KEY/" .env
  sed -i.bak "s/your-jwt-secret-key/$JWT_SECRET/" .env
  sed -i.bak "s/password/$POSTGRES_PASSWORD/" .env

  echo "REDIS_PASSWORD=$REDIS_PASSWORD" >> .env

  rm .env.bak

  echo "✅ .env file created with secure random keys"
else
  echo "⚠️  .env file already exists, skipping..."
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Review and update .env file with your configuration"
echo "  2. Start development server: npm run dev"
echo "  3. Or start with Docker: docker-compose up -d"
echo ""
